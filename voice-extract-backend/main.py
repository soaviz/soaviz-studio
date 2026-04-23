"""
soaviz studio — URL Extraction Backend
========================================

URL(YouTube, Vimeo 등) → yt-dlp 다운로드 → ffmpeg 정규화 → demucs 보컬 분리
진행률은 SSE로 프론트엔드에 실시간 스트리밍.

실행:
    python main.py
    # 또는
    uvicorn main:app --host 127.0.0.1 --port 8787 --reload
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

# --------------------------------------------------------------------------
# 설정
# --------------------------------------------------------------------------
APP_NAME = "soaviz studio — extractor API"
MAX_DURATION_SEC = 60 * 30           # 30분 제한 (MVP)
RESULT_TTL_SEC = 60 * 60 * 24        # 24시간 후 삭제
RESULTS_DIR = Path(tempfile.gettempdir()) / "soaviz_results"
RESULTS_DIR.mkdir(exist_ok=True)

ALLOWED_ORIGINS = [
    "http://localhost:*",
    "http://127.0.0.1:*",
    "file://",
    "null",          # file:// 스킴으로 열린 HTML
]

# --------------------------------------------------------------------------
# FastAPI
# --------------------------------------------------------------------------
app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|null",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------
# Job Store (in-memory — 프로덕션에서는 Redis로 교체)
# --------------------------------------------------------------------------
JOBS: dict[str, dict[str, Any]] = {}


def new_job() -> str:
    jid = uuid.uuid4().hex[:12]
    JOBS[jid] = {
        "id": jid,
        "status": "pending",       # pending | running | done | error
        "progress": 0.0,
        "step": "queued",
        "message": "대기 중",
        "title": None,
        "duration": None,
        "result_file": None,
        "error": None,
        "events": [],
        "done": False,
        "created_at": time.time(),
    }
    return jid


def emit(jid: str, **kwargs) -> None:
    """이벤트를 job에 기록. SSE 스트림에서 읽어 전송."""
    job = JOBS[jid]
    job.update(kwargs)
    evt = {"ts": time.time(), **kwargs}
    job["events"].append(evt)
    if kwargs.get("status") in ("done", "error"):
        job["done"] = True


def cleanup_old_results() -> None:
    now = time.time()
    for f in RESULTS_DIR.glob("*.wav"):
        if now - f.stat().st_mtime > RESULT_TTL_SEC:
            try:
                f.unlink()
            except OSError:
                pass


# --------------------------------------------------------------------------
# 파이프라인
# --------------------------------------------------------------------------
YTDLP_PCT_RE = re.compile(r"(\d+\.?\d*)\s*%")
DEMUCS_PCT_RE = re.compile(r"(\d+)\s*%")


async def run_ytdlp(jid: str, url: str, out_template: Path) -> Path:
    """yt-dlp 로 오디오만 다운로드. 진행률은 SSE로 emit."""
    emit(jid, status="running", step="download", progress=2,
         message="영상 정보 가져오는 중")

    # 1) 메타데이터 먼저 조회 (제목, 길이 체크)
    try:
        meta_proc = await asyncio.create_subprocess_exec(
            "yt-dlp", "--no-playlist", "--dump-single-json",
            "--no-warnings", "--skip-download", url,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        meta_out, meta_err = await meta_proc.communicate()
        if meta_proc.returncode != 0:
            raise RuntimeError(meta_err.decode(errors="ignore")[:500])
        meta = json.loads(meta_out.decode())
        title = meta.get("title", "untitled")[:80]
        duration = int(meta.get("duration", 0))
        if duration and duration > MAX_DURATION_SEC:
            raise RuntimeError(
                f"영상이 너무 길어요 ({duration // 60}분). "
                f"{MAX_DURATION_SEC // 60}분 이하만 지원합니다."
            )
        emit(jid, title=title, duration=duration, progress=4,
             message=f"{title} · {duration // 60}분 {duration % 60}초")
    except Exception as e:
        raise RuntimeError(f"영상 정보를 가져올 수 없어요 — {e}")

    # 2) 실제 다운로드
    proc = await asyncio.create_subprocess_exec(
        "yt-dlp",
        "-x", "--audio-format", "wav", "--audio-quality", "0",
        "--no-playlist", "--no-warnings",
        "--newline",
        "-o", str(out_template),
        url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    assert proc.stdout is not None
    async for raw in proc.stdout:
        line = raw.decode(errors="ignore").strip()
        if not line:
            continue
        # [download]   42.3% of 12.3MiB at 1.2MiB/s ETA 00:08
        if "[download]" in line:
            m = YTDLP_PCT_RE.search(line)
            if m:
                pct = float(m.group(1))
                mapped = 4 + pct * 0.26    # 4 → 30%
                emit(jid, progress=mapped,
                     message=f"다운로드 중 {pct:.0f}%")
    await proc.wait()
    if proc.returncode != 0:
        raise RuntimeError("yt-dlp 다운로드 실패 (URL이 공개 상태인지 확인해 주세요)")

    # 결과 파일 찾기 (확장자는 yt-dlp가 결정)
    parent = out_template.parent
    stem = out_template.stem
    candidates = list(parent.glob(f"{stem}.*"))
    if not candidates:
        raise RuntimeError("다운로드된 파일을 찾을 수 없어요")
    # wav로 변환됐을 테지만 방어적으로 가장 큰 오디오 파일 선택
    return max(candidates, key=lambda p: p.stat().st_size)


async def run_ffmpeg_normalize(jid: str, src: Path, dst: Path) -> None:
    emit(jid, step="extract", progress=32, message="오디오를 꺼내는 중")
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(src),
        "-vn", "-ar", "48000", "-ac", "2",
        "-acodec", "pcm_s24le",
        str(dst),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg 정규화 실패 — {err.decode(errors='ignore')[:300]}")
    emit(jid, progress=40, message="오디오 정규화 완료")


async def run_demucs(jid: str, wav: Path, work: Path, model: str) -> Path:
    emit(jid, step="separate", progress=42,
         message="목소리를 분리하고 있어요")
    env = {**os.environ, "PYTORCH_ENABLE_MPS_FALLBACK": "1"}
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "demucs.separate",
        "--two-stems", "vocals",
        "-n", model,
        "-o", str(work),
        str(wav),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=env,
    )
    assert proc.stdout is not None
    async for raw in proc.stdout:
        line = raw.decode(errors="ignore").strip()
        if not line:
            continue
        m = DEMUCS_PCT_RE.search(line)
        if m:
            pct = int(m.group(1))
            mapped = 42 + pct * 0.48   # 42 → 90%
            emit(jid, progress=mapped)
    await proc.wait()
    if proc.returncode != 0:
        raise RuntimeError("보컬 분리 실패 — 메모리 부족이거나 모델 다운로드 실패일 수 있어요")

    vocals = work / model / wav.stem / "vocals.wav"
    if not vocals.exists():
        raise RuntimeError(f"vocals.wav 를 찾을 수 없어요 ({vocals})")
    return vocals


async def pipeline(jid: str, url: str, model: str) -> None:
    try:
        with tempfile.TemporaryDirectory(prefix=f"soaviz_{jid}_") as tmp:
            tmp_path = Path(tmp)
            out_template = tmp_path / "source.%(ext)s"

            # 1) 다운로드
            downloaded = await run_ytdlp(jid, url, out_template)

            # 2) 정규화
            full_audio = tmp_path / "full_audio.wav"
            await run_ffmpeg_normalize(jid, downloaded, full_audio)

            # 3) 보컬 분리
            vocals = await run_demucs(jid, full_audio, tmp_path, model)

            # 4) 결과 저장
            emit(jid, step="master", progress=95, message="마무리하는 중")
            final = RESULTS_DIR / f"{jid}_voice.wav"
            shutil.copy2(vocals, final)

            emit(jid, step="finalizing", progress=98, message="곧 완료됩니다")

            emit(jid,
                 status="done", step="done", progress=100,
                 message="완료", result_file=str(final))
    except Exception as e:
        emit(jid, status="error", error=str(e),
             message="문제가 생겼어요. 다시 시도해 주세요.")


# --------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------
class ExtractRequest(BaseModel):
    url: str = Field(..., description="YouTube, Vimeo 등 yt-dlp 지원 URL")
    model: str = Field("htdemucs_ft", pattern=r"^(htdemucs|htdemucs_ft|mdx_extra|mdx_extra_q)$")


@app.get("/")
async def root():
    return {
        "name": APP_NAME,
        "status": "ok",
        "active_jobs": sum(1 for j in JOBS.values() if not j["done"]),
        "total_jobs": len(JOBS),
    }


@app.get("/api/health")
async def health():
    # 의존성 체크
    checks = {
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "yt_dlp": shutil.which("yt-dlp") is not None,
    }
    try:
        import demucs  # noqa: F401
        checks["demucs"] = True
    except ImportError:
        checks["demucs"] = False
    return {"ok": all(checks.values()), "checks": checks}


@app.post("/api/extract")
async def extract(req: ExtractRequest):
    if not req.url.startswith(("http://", "https://")):
        raise HTTPException(400, "URL은 http(s)://로 시작해야 합니다")

    jid = new_job()
    asyncio.create_task(pipeline(jid, req.url, req.model))
    cleanup_old_results()
    return {"job_id": jid}


@app.get("/api/job/{jid}/stream")
async def stream(jid: str):
    if jid not in JOBS:
        raise HTTPException(404, "job not found")

    async def gen():
        sent = 0
        # 연결 직후 현재 상태 스냅샷 전송
        job = JOBS[jid]
        snapshot = {
            "snapshot": True,
            "status": job["status"],
            "progress": job["progress"],
            "step": job["step"],
            "message": job["message"],
            "title": job.get("title"),
            "duration": job.get("duration"),
        }
        yield f"data: {json.dumps(snapshot, ensure_ascii=False)}\n\n"

        while True:
            events = JOBS[jid]["events"]
            while sent < len(events):
                yield f"data: {json.dumps(events[sent], ensure_ascii=False, default=str)}\n\n"
                sent += 1
            if JOBS[jid]["done"]:
                break
            await asyncio.sleep(0.3)
        # 종료 이벤트
        yield "event: end\ndata: {}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/job/{jid}")
async def job_status(jid: str):
    if jid not in JOBS:
        raise HTTPException(404)
    j = JOBS[jid]
    return {
        k: v for k, v in j.items()
        if k not in ("events",)
    }


@app.get("/api/job/{jid}/download")
async def download(jid: str):
    if jid not in JOBS:
        raise HTTPException(404)
    job = JOBS[jid]
    if not job.get("result_file"):
        raise HTTPException(404, "결과 파일이 아직 준비되지 않았습니다")
    path = Path(job["result_file"])
    if not path.exists():
        raise HTTPException(410, "결과 파일이 만료되었습니다")
    title = (job.get("title") or "voice").replace("/", "_")[:60]
    return FileResponse(
        path,
        media_type="audio/wav",
        filename=f"{title}_voice.wav",
    )


# --------------------------------------------------------------------------
# Entry
# --------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    print()
    print("  soaviz studio  ·  extraction backend")
    print("  http://127.0.0.1:8787")
    print()
    uvicorn.run("main:app", host="127.0.0.1", port=8787, reload=False)
