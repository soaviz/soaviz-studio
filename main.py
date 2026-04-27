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

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel, Field


# ────────────────────────────────────────────────────────────
# v3 BYOK Header Forwarding
#   프론트의 SoavizVault 키를 X-User-Key-* 헤더로 전달 받음.
#   request 헤더 > .env 환경 변수 우선순위.
#   D2 결정 (BYOK) 일관성: 사용자가 본인 키를 사용해 백엔드 호출 가능.
# ────────────────────────────────────────────────────────────
def _user_key(request: Request | None, kind: str, env_var: str) -> str | None:
    """헤더 X-User-Key-{kind}가 있으면 사용, 없으면 env."""
    if request is not None:
        header_name = f"X-User-Key-{kind}"
        h = request.headers.get(header_name) or request.headers.get(header_name.lower())
        if h and h.strip():
            return h.strip()
    return (os.environ.get(env_var) or "").strip() or None


load_dotenv()

# --------------------------------------------------------------------------
# 설정 (환경 변수 우선)
# --------------------------------------------------------------------------
APP_NAME = "soaviz studio — extractor API"
APP_ENV = os.environ.get("APP_ENV", "development")  # development | staging | production
APP_VERSION = os.environ.get("APP_VERSION", "0.1.0")
MAX_DURATION_SEC = int(os.environ.get("MAX_DURATION_SEC", 60 * 30))
RESULT_TTL_SEC = int(os.environ.get("RESULT_TTL_SEC", 60 * 60 * 24))
RESULTS_DIR = Path(os.environ.get("RESULTS_DIR") or (Path(tempfile.gettempdir()) / "soaviz_results"))
RESULTS_DIR.mkdir(exist_ok=True, parents=True)

# CORS: 운영에서는 명시적 origin만. 환경변수 ALLOWED_ORIGINS=https://soaviz.studio,https://app.soaviz.studio
_env_origins = (os.environ.get("ALLOWED_ORIGINS") or "").strip()
if _env_origins:
    _allow_origins = [o.strip() for o in _env_origins.split(",") if o.strip()]
    _allow_origin_regex = None
else:
    # 개발 기본값 — localhost·127.0.0.1·file://
    _allow_origins = []
    _allow_origin_regex = r"https?://(localhost|127\.0\.0\.1)(:\d+)?|null"

# --------------------------------------------------------------------------
# FastAPI
# --------------------------------------------------------------------------
app = FastAPI(title=APP_NAME, version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_origin_regex=_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-RateLimit-Remaining"],
)


# --------------------------------------------------------------------------
# 보안 헤더 미들웨어 — production 강제
# --------------------------------------------------------------------------
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    # 모든 응답에 적용
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
    if APP_ENV == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return response


# --------------------------------------------------------------------------
# 간단한 in-memory rate limiter (production은 Redis 권장)
# --------------------------------------------------------------------------
_RATE_BUCKETS: dict[str, list[float]] = {}
RATE_LIMIT_PER_MIN = int(os.environ.get("RATE_LIMIT_PER_MIN", 60))


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    # health·docs는 제한 X
    if request.url.path in ("/api/health", "/docs", "/openapi.json", "/redoc"):
        return await call_next(request)
    # /api/* 경로만 제한
    if not request.url.path.startswith("/api/"):
        return await call_next(request)
    client_ip = (request.client.host if request.client else "unknown")
    user_key = request.headers.get("authorization", client_ip)
    bucket_id = f"{client_ip}:{user_key[:32]}"
    now = time.time()
    window = now - 60
    bucket = _RATE_BUCKETS.setdefault(bucket_id, [])
    # 1분 윈도우 밖 제거
    bucket[:] = [t for t in bucket if t > window]
    if len(bucket) >= RATE_LIMIT_PER_MIN:
        return Response(
            content=json.dumps({"detail": f"Rate limit exceeded ({RATE_LIMIT_PER_MIN}/min)"}),
            status_code=429,
            media_type="application/json",
            headers={"Retry-After": "60", "X-RateLimit-Remaining": "0"},
        )
    bucket.append(now)
    response = await call_next(request)
    response.headers["X-RateLimit-Remaining"] = str(max(0, RATE_LIMIT_PER_MIN - len(bucket)))
    return response

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


# stem 이름 → 파일 접미사 매핑
STEM_SUFFIX = {
    "voice": "voice",
    "music": "music",
    "original": "original",
}


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


async def run_demucs(jid: str, wav: Path, work: Path, model: str) -> tuple[Path, Path]:
    """Returns (vocals.wav, no_vocals.wav)"""
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
    no_vocals = work / model / wav.stem / "no_vocals.wav"
    if not vocals.exists():
        raise RuntimeError(f"vocals.wav 를 찾을 수 없어요 ({vocals})")
    if not no_vocals.exists():
        raise RuntimeError(f"no_vocals.wav 를 찾을 수 없어요 ({no_vocals})")
    return vocals, no_vocals


async def run_whisper(jid: str, wav_path: Path) -> list[dict[str, Any]]:
    """Whisper 전사를 수행하고 segment 목록을 반환."""
    # API 키가 없으면 조용히 빈 결과를 반환
    if not os.environ.get("OPENAI_API_KEY"):
        JOBS[jid]["transcript"] = []
        JOBS[jid]["transcript_text"] = ""
        return []

    client = AsyncOpenAI()
    with wav_path.open("rb") as audio_file:
        resp = await client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json",
        )

    # SDK 응답 타입 차이를 방어적으로 처리
    segments_raw = []
    if hasattr(resp, "segments"):
        segments_raw = getattr(resp, "segments") or []
    elif isinstance(resp, dict):
        segments_raw = resp.get("segments", []) or []

    segments: list[dict[str, Any]] = []
    for seg in segments_raw:
        if hasattr(seg, "model_dump"):
            segments.append(seg.model_dump())
        elif isinstance(seg, dict):
            segments.append(seg)
        else:
            segments.append(dict(seg))

    text = ""
    if hasattr(resp, "text"):
        text = getattr(resp, "text") or ""
    elif isinstance(resp, dict):
        text = resp.get("text", "") or ""
    if not text:
        text = " ".join(str(s.get("text", "")).strip() for s in segments if s.get("text")).strip()

    JOBS[jid]["transcript"] = segments
    JOBS[jid]["transcript_text"] = text
    return segments


def _save_stems(jid: str, *, vocals: Path, no_vocals: Path, original: Path) -> dict[str, str]:
    """3개 스템을 RESULTS_DIR에 jid_<stem>.wav 로 저장하고 경로 dict 반환."""
    saved = {}
    mapping = [("voice", vocals), ("music", no_vocals), ("original", original)]
    for stem_name, src in mapping:
        dst = RESULTS_DIR / f"{jid}_{STEM_SUFFIX[stem_name]}.wav"
        shutil.copy2(src, dst)
        saved[stem_name] = str(dst)
    return saved


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

            # 3) 보컬 분리 (vocals + no_vocals 두 스템)
            vocals, no_vocals = await run_demucs(jid, full_audio, tmp_path, model)

            # 3-1) Whisper 전사
            await run_whisper(jid, vocals)

            # 4) 결과 저장 (3 stem)
            emit(jid, step="master", progress=95, message="마무리하는 중")
            stems = _save_stems(jid, vocals=vocals, no_vocals=no_vocals, original=full_audio)

            emit(jid, step="finalizing", progress=98, message="곧 완료됩니다")
            emit(jid,
                 status="done", step="done", progress=100,
                 message="완료",
                 result_file=stems["voice"],
                 stems=stems)
    except Exception as e:
        emit(jid, status="error", error=str(e),
             message="문제가 생겼어요. 다시 시도해 주세요.")


async def pipeline_file(jid: str, src_path: Path, model: str) -> None:
    """업로드된 파일에서 stem 추출 (URL pipeline의 다운로드 단계만 생략)."""
    try:
        with tempfile.TemporaryDirectory(prefix=f"soaviz_{jid}_") as tmp:
            tmp_path = Path(tmp)
            emit(jid, status="running", step="extract", progress=10,
                 message=f"{src_path.name} 처리 시작",
                 title=src_path.stem[:80])

            # 1) 정규화
            full_audio = tmp_path / "full_audio.wav"
            await run_ffmpeg_normalize(jid, src_path, full_audio)

            # 2) 길이 메타 추출 (ffprobe)
            try:
                proc = await asyncio.create_subprocess_exec(
                    "ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1", str(full_audio),
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                )
                out, _ = await proc.communicate()
                duration = int(float(out.decode().strip()))
                emit(jid, duration=duration,
                     message=f"{src_path.name} · {duration // 60}분 {duration % 60}초")
                if duration > MAX_DURATION_SEC:
                    raise RuntimeError(
                        f"파일이 너무 길어요 ({duration // 60}분). "
                        f"{MAX_DURATION_SEC // 60}분 이하만 지원합니다."
                    )
            except RuntimeError:
                raise
            except Exception:
                pass  # 메타 못 얻어도 진행

            # 3) 분리
            vocals, no_vocals = await run_demucs(jid, full_audio, tmp_path, model)

            # 4) Whisper
            await run_whisper(jid, vocals)

            # 5) 저장
            emit(jid, step="master", progress=95, message="마무리하는 중")
            stems = _save_stems(jid, vocals=vocals, no_vocals=no_vocals, original=full_audio)

            emit(jid, step="finalizing", progress=98, message="곧 완료됩니다")
            emit(jid,
                 status="done", step="done", progress=100,
                 message="완료",
                 result_file=stems["voice"],
                 stems=stems)
    except Exception as e:
        emit(jid, status="error", error=str(e),
             message="문제가 생겼어요. 다시 시도해 주세요.")
    finally:
        # 업로드 임시 파일 정리
        try:
            src_path.unlink(missing_ok=True)
        except Exception:
            pass


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


def _check_yt_dlp() -> bool:
    """binary 또는 python 모듈 둘 다 OK"""
    if shutil.which("yt-dlp") is not None:
        return True
    try:
        import yt_dlp  # noqa: F401
        return True
    except ImportError:
        return False


def _check_demucs() -> bool:
    if shutil.which("demucs") is not None:
        return True
    try:
        import demucs  # noqa: F401
        return True
    except ImportError:
        return False


@app.get("/api/health")
async def health():
    # 의존성 체크 — binary 또는 python 모듈 모두 체크
    checks = {
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "yt_dlp": _check_yt_dlp(),
        "whisper": bool(os.environ.get("OPENAI_API_KEY")),
        "elevenlabs": bool(_eleven_key()),
        "replicate": bool(_replicate_token()),
        "demucs": _check_demucs(),
    }
    # elevenlabs 미설정도 OK 처리 — 부가 기능
    core_ok = all(checks[k] for k in ("ffmpeg", "yt_dlp", "whisper", "demucs"))
    fixes = []
    if not checks["ffmpeg"]:
        fixes.append({"name": "ffmpeg", "cmd": "brew install ffmpeg", "desc": "오디오/영상 인코딩"})
    if not checks["yt_dlp"]:
        fixes.append({"name": "yt-dlp", "cmd": "pip install yt-dlp --break-system-packages", "desc": "URL 다운로드"})
    if not checks["demucs"]:
        fixes.append({"name": "demucs", "cmd": "pip install demucs --break-system-packages", "desc": "보컬 분리"})
    if not checks["whisper"]:
        fixes.append({"name": "OpenAI API Key", "cmd": "Settings → 🔐 보관소 → OpenAI 키 입력", "desc": "Whisper 자막 추출"})
    return {
        "ok": core_ok,
        "version": APP_VERSION,
        "env": APP_ENV,
        "checks": checks,
        "fixes": fixes,
        "limits": { "rate_per_min": RATE_LIMIT_PER_MIN, "max_duration_sec": MAX_DURATION_SEC },
    }


@app.get("/api/healthz")
async def healthz():
    """간단 liveness check (Fly·Vercel·UptimeRobot용)."""
    return {"ok": True, "version": APP_VERSION, "ts": int(time.time())}


@app.post("/api/extract")
async def extract(req: ExtractRequest):
    if not req.url.startswith(("http://", "https://")):
        raise HTTPException(400, "URL은 http(s)://로 시작해야 합니다")
    # Pre-flight: 필수 의존성 체크
    missing = []
    if not _check_yt_dlp():
        missing.append("yt-dlp (pip install yt-dlp --break-system-packages)")
    if shutil.which("ffmpeg") is None:
        missing.append("ffmpeg (brew install ffmpeg)")
    if not _check_demucs():
        missing.append("demucs (pip install demucs --break-system-packages)")
    if missing:
        raise HTTPException(503, f"백엔드 의존성 부족: {' / '.join(missing)}")

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
    payload = {
        k: v for k, v in j.items()
        if k not in ("events",)
    }
    payload["transcript"] = j.get("transcript", [])
    return payload


@app.get("/api/job/{jid}/transcript")
async def job_transcript(jid: str):
    if jid not in JOBS:
        raise HTTPException(404)
    job = JOBS[jid]
    segments = job.get("transcript", []) or []
    text = (job.get("transcript_text") or "").strip()
    if not text:
        text = " ".join(str(s.get("text", "")).strip() for s in segments if s.get("text")).strip()
    return {"segments": segments, "text": text}


class SummarizeRequest(BaseModel):
    text: str = Field("", description="전체 자막 텍스트")
    segments: list[dict[str, Any]] | None = Field(None, description="optional: Whisper segments")
    title: str | None = None
    language: str = Field("ko", description="요약 언어 (ko/en)")


SUMMARY_FALLBACK = {
    "tldr": "요약을 생성할 수 없었어요. 잠시 후 다시 시도해 주세요.",
    "points": [],
    "actions": [],
    "keywords": [],
}


@app.post("/api/summarize")
async def summarize(req: SummarizeRequest):
    """자막/텍스트를 GPT로 요약. 응답 형식 고정."""
    text = (req.text or "").strip()
    if not text and req.segments:
        text = " ".join(
            str(s.get("text", "")).strip()
            for s in req.segments
            if isinstance(s, dict) and s.get("text")
        ).strip()

    if not text:
        raise HTTPException(400, "요약할 텍스트가 없어요")

    if not os.environ.get("OPENAI_API_KEY"):
        return {**SUMMARY_FALLBACK, "tldr": "OpenAI API 키가 설정되지 않았어요."}

    # 토큰 비용 보호 — 너무 길면 자름
    if len(text) > 8000:
        text = text[:8000] + " ..."

    sys_prompt = (
        "너는 영상 자막을 한국어로 정리하는 편집자야. "
        "사용자가 자막 전문을 주면 정확하고 간결한 JSON으로 요약해. "
        "핵심만 남기고 추측·홍보·과장은 금지. "
        "출력은 반드시 다음 JSON 스키마 하나만:\n"
        '{"tldr": "한 줄 요약 (60자 이내, 마침표로 끝남)",\n'
        ' "points": ["핵심 포인트 3~5개 (각 한 문장)"],\n'
        ' "actions": ["바로 할 수 있는 액션 아이템 2~4개"],\n'
        ' "keywords": ["주요 키워드 4~7개 (한 단어씩)"]}'
    )
    user_prompt = (
        (f"[제목] {req.title}\n\n" if req.title else "")
        + f"[자막 전문]\n{text}"
    )

    client = AsyncOpenAI()
    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            temperature=0.3,
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        raw = resp.choices[0].message.content or "{}"
        data = json.loads(raw)
    except Exception as e:
        return {**SUMMARY_FALLBACK, "tldr": f"요약 생성 실패: {type(e).__name__}"}

    return {
        "tldr": str(data.get("tldr", "")).strip() or SUMMARY_FALLBACK["tldr"],
        "points": [str(p).strip() for p in (data.get("points") or []) if str(p).strip()][:5],
        "actions": [str(a).strip() for a in (data.get("actions") or []) if str(a).strip()][:4],
        "keywords": [str(k).strip() for k in (data.get("keywords") or []) if str(k).strip()][:7],
    }


@app.post("/api/transcribe-blob")
async def transcribe_blob(file: UploadFile = File(...)):
    # 업로드 크기 제한(25MB)
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "파일 크기는 25MB 이하여야 합니다")

    # API 키가 없으면 조용히 빈 결과 반환
    if not os.environ.get("OPENAI_API_KEY"):
        return {"segments": [], "text": ""}

    client = AsyncOpenAI()
    from io import BytesIO
    audio_buffer = BytesIO(data)
    audio_buffer.name = file.filename or "audio.wav"

    resp = await client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_buffer,
        response_format="verbose_json",
    )

    segments_raw = []
    if hasattr(resp, "segments"):
        segments_raw = getattr(resp, "segments") or []
    elif isinstance(resp, dict):
        segments_raw = resp.get("segments", []) or []

    segments: list[dict[str, Any]] = []
    for seg in segments_raw:
        if hasattr(seg, "model_dump"):
            segments.append(seg.model_dump())
        elif isinstance(seg, dict):
            segments.append(seg)
        else:
            segments.append(dict(seg))

    text = ""
    if hasattr(resp, "text"):
        text = getattr(resp, "text") or ""
    elif isinstance(resp, dict):
        text = resp.get("text", "") or ""
    if not text:
        text = " ".join(str(s.get("text", "")).strip() for s in segments if s.get("text")).strip()

    return {"segments": segments, "text": text}


# ============================================================
#  ElevenLabs (TTS / Voices / Music)
# ============================================================
ELEVEN_BASE = "https://api.elevenlabs.io/v1"
DEFAULT_TTS_MODEL = "eleven_multilingual_v2"
DEFAULT_MUSIC_MODEL = "music_v1"
# 한국어 자연스러운 기본 보이스(공용 라이브러리)
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel — 멀티링귀얼 안정


def _eleven_key(request: Request | None = None) -> str | None:
    """v3: X-User-Key-Elevenlabs 헤더 우선, 없으면 .env"""
    return _user_key(request, "Elevenlabs", "ELEVENLABS_API_KEY")


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice_id: str = Field(DEFAULT_VOICE_ID)
    model_id: str = Field(DEFAULT_TTS_MODEL)
    stability: float = Field(0.5, ge=0, le=1)
    similarity_boost: float = Field(0.75, ge=0, le=1)
    style: float = Field(0.0, ge=0, le=1)
    speed: float = Field(1.0, ge=0.5, le=2.0)


@app.post("/api/tts")
async def tts(req: TTSRequest, request: Request):
    """ElevenLabs TTS 호출 → audio/mpeg 반환. v3: BYOK 헤더 자동 사용."""
    key = _eleven_key(request)
    if not key:
        raise HTTPException(503, "ELEVENLABS_API_KEY가 설정되지 않았어요. .env 또는 보관소(Vault)에 추가하세요.")

    url = f"{ELEVEN_BASE}/text-to-speech/{req.voice_id}"
    payload = {
        "text": req.text,
        "model_id": req.model_id,
        "voice_settings": {
            "stability": req.stability,
            "similarity_boost": req.similarity_boost,
            "style": req.style,
            "use_speaker_boost": True,
            "speed": req.speed,
        },
    }
    headers = {
        "xi-api-key": key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(url, json=payload, headers=headers)
        if r.status_code != 200:
            detail = r.text[:300]
            raise HTTPException(r.status_code, f"ElevenLabs TTS 실패: {detail}")
        return Response(content=r.content, media_type="audio/mpeg",
                        headers={"Content-Disposition": "inline; filename=tts.mp3"})
    except httpx.HTTPError as e:
        raise HTTPException(502, f"ElevenLabs 네트워크 에러: {e}")


@app.get("/api/keys/test")
async def test_keys(request: Request):
    """v3: BYOK 키 즉시 유효성 검사. 각 제공자별 가벼운 호출로 ok/fail 반환."""
    results = {}
    # ElevenLabs — voices 엔드포인트 (가벼움)
    el = _eleven_key(request)
    if not el:
        results["elevenlabs"] = {"ok": False, "msg": "키 없음"}
    else:
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(f"{ELEVEN_BASE}/user", headers={"xi-api-key": el})
            if r.status_code == 200:
                d = r.json()
                results["elevenlabs"] = {"ok": True, "msg": f"OK · {d.get('subscription', {}).get('tier', 'free')}"}
            else:
                results["elevenlabs"] = {"ok": False, "msg": f"HTTP {r.status_code}"}
        except Exception as e:
            results["elevenlabs"] = {"ok": False, "msg": str(e)[:80]}
    # OpenAI — models 리스트 (가벼움)
    op = _user_key(request, "Openai", "OPENAI_API_KEY")
    if not op:
        results["openai"] = {"ok": False, "msg": "키 없음"}
    else:
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {op}"})
            results["openai"] = {"ok": r.status_code == 200, "msg": f"HTTP {r.status_code}" if r.status_code != 200 else "OK"}
        except Exception as e:
            results["openai"] = {"ok": False, "msg": str(e)[:80]}
    # Anthropic — messages count (가벼움 — 1토큰)
    an = _user_key(request, "Anthropic", "ANTHROPIC_API_KEY")
    if not an:
        results["anthropic"] = {"ok": False, "msg": "키 없음"}
    else:
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": an, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={"model": "claude-haiku-4-5-20251001", "max_tokens": 1, "messages": [{"role": "user", "content": "hi"}]},
                )
            results["anthropic"] = {"ok": r.status_code == 200, "msg": "OK" if r.status_code == 200 else f"HTTP {r.status_code}"}
        except Exception as e:
            results["anthropic"] = {"ok": False, "msg": str(e)[:80]}
    # Replicate — account 조회
    rp = _replicate_token(request)
    if not rp:
        results["replicate"] = {"ok": False, "msg": "키 없음"}
    else:
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(f"{REPLICATE_BASE}/account", headers={"Authorization": f"Bearer {rp}"})
            if r.status_code == 200:
                d = r.json()
                results["replicate"] = {"ok": True, "msg": f"OK · {d.get('username', '')}"}
            else:
                results["replicate"] = {"ok": False, "msg": f"HTTP {r.status_code}"}
        except Exception as e:
            results["replicate"] = {"ok": False, "msg": str(e)[:80]}
    return results


@app.get("/api/voices")
async def list_voices(request: Request):
    """ElevenLabs 사용 가능한 보이스 목록. v3: BYOK 헤더 자동 사용."""
    key = _eleven_key(request)
    if not key:
        return {"voices": [], "error": "ELEVENLABS_API_KEY 미설정"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(f"{ELEVEN_BASE}/voices", headers={"xi-api-key": key})
        if r.status_code != 200:
            return {"voices": [], "error": f"HTTP {r.status_code}"}
        data = r.json()
        voices = []
        for v in data.get("voices", []):
            voices.append({
                "voice_id": v.get("voice_id"),
                "name": v.get("name"),
                "labels": v.get("labels", {}),
                "preview_url": v.get("preview_url"),
                "category": v.get("category"),
                "description": v.get("description"),
            })
        return {"voices": voices}
    except httpx.HTTPError as e:
        return {"voices": [], "error": str(e)}


class MusicRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)
    music_length_ms: int = Field(20000, ge=5000, le=300000)  # 5초~5분
    model_id: str = Field(DEFAULT_MUSIC_MODEL)


@app.post("/api/music")
async def music(req: MusicRequest, request: Request):
    """ElevenLabs Music API → 음악 생성 (audio/mpeg). v3: BYOK 헤더 자동 사용."""
    key = _eleven_key(request)
    if not key:
        raise HTTPException(503, "ELEVENLABS_API_KEY가 설정되지 않았어요. .env 또는 보관소(Vault)에 추가하세요.")

    url = f"{ELEVEN_BASE}/music"
    payload = {
        "prompt": req.prompt,
        "music_length_ms": req.music_length_ms,
        "model_id": req.model_id,
    }
    headers = {
        "xi-api-key": key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            r = await client.post(url, json=payload, headers=headers)
        if r.status_code != 200:
            detail = r.text[:400]
            raise HTTPException(r.status_code, f"ElevenLabs Music 실패: {detail}")
        return Response(
            content=r.content,
            media_type="audio/mpeg",
            headers={"Content-Disposition": f'attachment; filename="music.mp3"'},
        )
    except httpx.HTTPError as e:
        raise HTTPException(502, f"ElevenLabs 네트워크 에러: {e}")


class SFXRequest(BaseModel):
    text: str = Field(..., min_length=2, max_length=500)
    duration_seconds: float | None = Field(None, ge=0.5, le=22.0)
    prompt_influence: float = Field(0.3, ge=0, le=1)


@app.post("/api/sfx")
async def sound_effect(req: SFXRequest, request: Request):
    """ElevenLabs Sound Effects API. v3: BYOK 헤더 자동 사용."""
    key = _eleven_key(request)
    if not key:
        raise HTTPException(503, "ELEVENLABS_API_KEY가 설정되지 않았어요.")
    payload: dict[str, Any] = {
        "text": req.text,
        "prompt_influence": req.prompt_influence,
    }
    if req.duration_seconds is not None:
        payload["duration_seconds"] = req.duration_seconds
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(
                f"{ELEVEN_BASE}/sound-generation",
                json=payload,
                headers={"xi-api-key": key, "Content-Type": "application/json"},
            )
        if r.status_code != 200:
            raise HTTPException(r.status_code, f"ElevenLabs SFX 실패: {r.text[:300]}")
        return Response(content=r.content, media_type="audio/mpeg")
    except httpx.HTTPError as e:
        raise HTTPException(502, f"ElevenLabs 네트워크 에러: {e}")


# ============================================================
#  Video Generation (2026-04-27 model router)
#  Replicate remains the current execution adapter; the catalog keeps
#  provider metadata so the front-end can show a current model page.
# ============================================================
REPLICATE_BASE = "https://api.replicate.com/v1"

# 프런트 모델 키 → Replicate 모델 path 매핑
# 각 모델의 input 스키마가 다르므로 builder 함수도 함께
def _b_kling21_pro(prompt: str, image_url: str | None, duration: int, aspect: str) -> dict:
    inp: dict[str, Any] = {"prompt": prompt, "duration": min(max(duration, 5), 10),
                           "aspect_ratio": aspect or "16:9", "negative_prompt": ""}
    if image_url:
        inp["start_image"] = image_url
    return inp

def _b_kling21_master(prompt: str, image_url: str | None, duration: int, aspect: str) -> dict:
    inp: dict[str, Any] = {"prompt": prompt, "duration": min(max(duration, 5), 10),
                           "aspect_ratio": aspect or "16:9"}
    if image_url:
        inp["start_image"] = image_url
    return inp

def _b_hailuo(prompt: str, image_url: str | None, duration: int, aspect: str) -> dict:
    inp: dict[str, Any] = {"prompt": prompt}
    if image_url:
        inp["first_frame_image"] = image_url
    return inp

def _b_seedance_lite(prompt: str, image_url: str | None, duration: int, aspect: str) -> dict:
    inp: dict[str, Any] = {"prompt": prompt, "duration": min(max(duration, 5), 10),
                           "aspect_ratio": aspect or "16:9", "resolution": "720p"}
    if image_url:
        inp["image"] = image_url
    return inp

def _b_seedance_pro(prompt: str, image_url: str | None, duration: int, aspect: str) -> dict:
    inp: dict[str, Any] = {"prompt": prompt, "duration": min(max(duration, 5), 10),
                           "aspect_ratio": aspect or "16:9", "resolution": "1080p"}
    if image_url:
        inp["image"] = image_url
    return inp

def _b_wan_t2v(prompt: str, image_url: str | None, duration: int, aspect: str) -> dict:
    return {"prompt": prompt, "aspect_ratio": aspect or "16:9"}

def _b_wan_i2v(prompt: str, image_url: str | None, duration: int, aspect: str) -> dict:
    if not image_url:
        raise HTTPException(400, "Wan I2V는 이미지 업로드가 필요해요")
    return {"prompt": prompt, "image": image_url}

def _b_veo3(prompt: str, image_url: str | None, duration: int, aspect: str) -> dict:
    inp: dict[str, Any] = {"prompt": prompt}
    if image_url:
        inp["image"] = image_url
    return inp

def _b_veo3_fast(prompt: str, image_url: str | None, duration: int, aspect: str) -> dict:
    inp: dict[str, Any] = {"prompt": prompt}
    if image_url:
        inp["image"] = image_url
    return inp


# ════════════════════════════════════════════════════════════
# VIDEO_MODELS — verified/curated for 2026-04-27
#  is_new: 2026년에 새로 출시·업데이트된 모델 (UI에 NEW 배지)
#  release: 출시 연월 (YYYY-MM) — UI 정렬·툴팁용
#  route: 현재 실행 어댑터. "replicate"만 이 백엔드에서 직접 실행.
# ════════════════════════════════════════════════════════════
VIDEO_MODELS: dict[str, dict[str, Any]] = {
    # ─── 2026 / latest frontier line ───
    "sora-2-pro": {
        "label": "OpenAI Sora 2 Pro", "ref": "openai/sora-2-pro", "route": "provider",
        "build": _b_veo3, "needs_image": False, "duration_choices": [4, 8, 12, 20],
        "max_seconds": 20, "tier": "exclusive", "category": "T2V/I2V", "provider": "OpenAI",
        "is_new": True, "release": "2026-02", "audio": True, "resolution": "1080p",
        "desc": "고해상도 Sora 2 라인. 긴 비트와 디테일한 장면 전개용.",
        "source": "https://developers.openai.com/api/docs/guides/video-generation",
    },
    "veo-3.1": {
        "label": "Google Veo 3.1", "ref": "google/veo-3.1", "route": "provider",
        "build": _b_veo3, "needs_image": False, "duration_choices": [8],
        "max_seconds": 8, "tier": "exclusive", "category": "T2V/I2V/Vertical", "provider": "Google",
        "is_new": True, "release": "2026-01", "audio": True, "resolution": "1080p/4K",
        "desc": "자연스러운 모션, 세로 영상, Ingredients-to-Video 워크플로우 중심.",
        "source": "https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/",
    },
    "runway-gen-4.5": {
        "label": "Runway Gen-4.5", "ref": "runway/gen-4.5", "route": "provider",
        "build": _b_veo3, "needs_image": False, "duration_choices": [5, 10],
        "max_seconds": 10, "tier": "exclusive", "category": "T2V/I2V/V2V", "provider": "Runway",
        "is_new": True, "release": "2025-12", "audio": False, "resolution": "1080p",
        "desc": "동작 제어, 시간 일관성, 물리감이 강한 프로덕션용 모델.",
        "source": "https://runwayml.com/research/introducing-runway-gen-4.5",
    },
    "minimax-hailuo-2.3": {
        "label": "MiniMax Hailuo 2.3", "ref": "minimax/hailuo-2.3", "route": "replicate",
        "build": _b_hailuo, "needs_image": False, "duration_choices": [6, 10],
        "max_seconds": 10, "tier": "premium", "category": "T2V/I2V", "provider": "MiniMax",
        "is_new": True, "release": "2026-04", "audio": False, "resolution": "1080p",
        "desc": "인체 움직임, 표정, 물리감, 프롬프트 준수 개선 라인.",
        "source": "https://platform.minimax.io/docs/api-reference/video-generation-intro",
    },
    "luma-ray-2": {
        "label": "Luma Ray 2", "ref": "luma/ray-2", "route": "provider",
        "build": _b_veo3, "needs_image": False, "duration_choices": [5, 9],
        "max_seconds": 9, "tier": "premium", "category": "T2V/I2V/Keyframes", "provider": "Luma",
        "is_new": True, "release": "2025-01", "audio": False, "resolution": "720p/1080p",
        "desc": "카메라 무브와 키프레임 기반 샷 컨트롤에 강한 모델.",
        "source": "https://docs.lumalabs.ai/docs/video-generation",
    },
    "kling-2.5-turbo": {
        "label": "Kling 2.5 Turbo", "ref": "kwaivgi/kling-v2.5-turbo", "route": "replicate",
        "build": _b_kling21_pro, "needs_image": False, "duration_choices": [5, 10],
        "max_seconds": 10, "tier": "premium", "category": "T2V/I2V", "provider": "Kuaishou",
        "is_new": True, "release": "2025-09", "audio": False, "resolution": "1080p",
        "desc": "속도와 품질 균형. 인물/제품/움직임이 많은 샷에 적합.",
        "source": "https://ir.kuaishou.com/node/10961/pdf",
    },

    # ─── stable / commercially safer / fast lanes ───
    "adobe-firefly-video": {
        "label": "Adobe Firefly Video", "ref": "adobe/firefly-video", "route": "provider",
        "build": _b_veo3, "needs_image": False, "duration_choices": [5],
        "max_seconds": 5, "tier": "safe", "category": "T2V/I2V/Extend", "provider": "Adobe",
        "is_new": False, "release": "2025-02", "audio": False, "resolution": "1080p",
        "desc": "상업 안전/IP-friendly 포지션. 브랜드·광고 시안에 적합.",
        "source": "https://blog.adobe.com/en/publish/2025/02/12/meet-firefly-video-model-ai-powered-creation-with-unparalleled-creative-control",
    },
    "veo-3": {
        "label": "Google Veo 3", "ref": "google/veo-3", "route": "replicate",
        "build": _b_veo3, "needs_image": False, "duration_choices": [8],
        "max_seconds": 8, "tier": "premium", "category": "T2V/Audio", "provider": "Google",
        "release": "2025-05", "audio": True, "resolution": "1080p",
        "desc": "텍스트 기반 영상 + 사운드 생성 지원 라인.",
        "source": "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-0-generate",
    },
    "veo-3-fast": {
        "label": "Google Veo 3 Fast", "ref": "google/veo-3-fast", "route": "replicate",
        "build": _b_veo3_fast, "needs_image": False, "duration_choices": [8],
        "max_seconds": 8, "tier": "fast", "category": "T2V/Audio", "provider": "Google",
        "release": "2025-07", "audio": True, "resolution": "1080p",
        "desc": "빠른 반복용 Veo 3 라인.",
        "source": "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-0-generate",
    },
    "seedance-2-pro": {
        "label": "Seedance 2.0 Pro", "ref": "bytedance/seedance-2-pro", "route": "replicate",
        "build": _b_seedance_pro, "needs_image": False, "duration_choices": [5, 6, 8, 10, 12],
        "max_seconds": 12, "tier": "premium", "category": "T2V/I2V", "provider": "ByteDance",
        "is_new": True, "release": "2026-02", "audio": False, "resolution": "1080p",
        "desc": "빠른 시안과 소셜 숏폼 컷 변주용.",
        "source": "",
    },
    "seedance-2-fast": {
        "label": "Seedance 2.0 Fast", "ref": "bytedance/seedance-2-fast", "route": "replicate",
        "build": _b_seedance_lite, "needs_image": False, "duration_choices": [5, 6, 8, 10],
        "max_seconds": 10, "tier": "fast", "category": "T2V/I2V", "provider": "ByteDance",
        "is_new": True, "release": "2026-02", "audio": False, "resolution": "720p",
        "desc": "저비용/고속 반복용.",
        "source": "",
    },
    "wan-2.2-t2v-fast": {
        "label": "Wan 2.2 T2V Fast", "ref": "wan-video/wan-2.2-t2v-fast", "route": "replicate",
        "build": _b_wan_t2v, "needs_image": False, "duration_choices": [5],
        "max_seconds": 5, "tier": "fast", "category": "T2V/Open", "provider": "Wan",
        "release": "2025-09", "audio": False, "resolution": "720p",
        "desc": "가벼운 오픈/패스트 계열 테스트용.",
        "source": "",
    },
    "wan-2.2-i2v-fast": {
        "label": "Wan 2.2 I2V Fast", "ref": "wan-video/wan-2.2-i2v-fast", "route": "replicate",
        "build": _b_wan_i2v, "needs_image": True, "duration_choices": [5],
        "max_seconds": 5, "tier": "fast", "category": "I2V/Open", "provider": "Wan",
        "release": "2025-09", "audio": False, "resolution": "720p",
        "desc": "첫 프레임 기반 저비용 애니메이션.",
        "source": "",
    },
}


# 비디오 페이지 "Features" — 모델 외 별도 워크플로우
VIDEO_FEATURES = [
    {"id": "create",  "label": "Text to Video",       "desc": "프롬프트로 장면 생성",              "mode": "t2v",     "ready": True},
    {"id": "i2v",     "label": "Image / Keyframes",   "desc": "첫 프레임·키프레임으로 모션 제어", "mode": "i2v",     "ready": True},
    {"id": "lipsync", "label": "Lipsync / Dialogue",  "desc": "인물 컷에 음성·립싱크 연결",       "mode": "lipsync", "ready": True},
    {"id": "upscale", "label": "Upscale / Extend",    "desc": "해상도 보강·컷 길이 확장",         "mode": "upscale", "ready": True},
]


def _replicate_token(request: Request | None = None) -> str | None:
    """v3: X-User-Key-Replicate 헤더 우선, 없으면 .env"""
    return _user_key(request, "Replicate", "REPLICATE_API_TOKEN")


@app.get("/api/video/models")
async def video_models():
    """사용 가능한 비디오 모델 + 기능 목록 (프런트 mega menu).
    2026-04 라인업. is_new 플래그로 NEW 배지 표시."""
    has_key = bool(_replicate_token())
    out = []
    for k, m in VIDEO_MODELS.items():
        out.append({
            "id": k,
            "label": m["label"],
            "needs_image": m["needs_image"],
            "duration_choices": m["duration_choices"],
            "max_seconds": m["max_seconds"],
            "tier": m["tier"],
            "category": m.get("category", "T2V"),
            "is_new": m.get("is_new", False),
            "release": m.get("release"),
            "provider": m.get("provider"),
            "route": m.get("route", "replicate"),
            "audio": m.get("audio", False),
            "resolution": m.get("resolution"),
            "desc": m.get("desc", ""),
            "source": m.get("source", ""),
        })
    return {"models": out, "features": VIDEO_FEATURES, "ready": has_key}


class VideoGenRequest(BaseModel):
    model: str = Field(..., description="VIDEO_MODELS의 키")
    prompt: str = Field(..., min_length=2, max_length=2000)
    image_url: str | None = Field(None, description="image-to-video 시 시작 이미지 URL")
    duration: int = Field(5, ge=3, le=30)
    aspect_ratio: str = Field("16:9", pattern=r"^(16:9|9:16|1:1|4:3|3:4|21:9)$")


@app.post("/api/video/generate")
async def video_generate(req: VideoGenRequest, request: Request):
    """Replicate prediction 생성. id 반환 → 프런트가 폴링. v3: BYOK 헤더 자동 사용."""
    token = _replicate_token(request)
    if not token:
        raise HTTPException(503, "REPLICATE_API_TOKEN이 설정되지 않았어요. .env 또는 보관소(Vault)에 추가하세요.")

    if req.model not in VIDEO_MODELS:
        raise HTTPException(400, f"unknown model: {req.model}")
    spec = VIDEO_MODELS[req.model]
    if spec["needs_image"] and not req.image_url:
        raise HTTPException(400, f"{spec['label']}는 이미지 업로드가 필요해요")
    if spec.get("route", "replicate") != "replicate":
        raise HTTPException(501, f"{spec['label']}는 현재 카탈로그/외부 커넥터 모델입니다. 이 로컬 백엔드에서는 Replicate 라우트 모델을 선택해 주세요.")

    inp = spec["build"](req.prompt, req.image_url, req.duration, req.aspect_ratio)

    # 모델 ref가 owner/name 형식이므로 latest version을 사용하기 위해 모델 자체를 호출
    # Replicate "Run a model" endpoint: POST https://api.replicate.com/v1/models/{owner}/{name}/predictions
    owner, name = spec["ref"].split("/", 1)
    url = f"{REPLICATE_BASE}/models/{owner}/{name}/predictions"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "wait=0",
    }
    body = {"input": inp}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json=body, headers=headers)
        if r.status_code not in (200, 201):
            raise HTTPException(r.status_code, f"Replicate 시작 실패: {r.text[:300]}")
        data = r.json()
        return {
            "id": data.get("id"),
            "status": data.get("status"),
            "model": req.model,
            "label": spec["label"],
        }
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Replicate 네트워크 에러: {e}")


@app.get("/api/video/status/{prediction_id}")
async def video_status(prediction_id: str, request: Request):
    """Replicate prediction 상태 조회. v3: BYOK 헤더 자동 사용."""
    token = _replicate_token(request)
    if not token:
        raise HTTPException(503, "REPLICATE_API_TOKEN 미설정")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{REPLICATE_BASE}/predictions/{prediction_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
        if r.status_code != 200:
            raise HTTPException(r.status_code, f"상태 조회 실패: {r.text[:200]}")
        d = r.json()
        # output이 list일 수도, str일 수도, dict일 수도
        out = d.get("output")
        video_url: str | None = None
        if isinstance(out, str):
            video_url = out
        elif isinstance(out, list) and out:
            first = out[0]
            video_url = first if isinstance(first, str) else None
        elif isinstance(out, dict):
            for key in ("video", "url", "output"):
                v = out.get(key)
                if isinstance(v, str):
                    video_url = v
                    break
        return {
            "id": d.get("id"),
            "status": d.get("status"),  # starting | processing | succeeded | failed | canceled
            "video_url": video_url,
            "error": d.get("error"),
            "logs_tail": (d.get("logs") or "")[-400:],
            "created_at": d.get("created_at"),
        }
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Replicate 네트워크 에러: {e}")


# ── Lipsync (sadtalker) — 이미지 + 오디오 → talking head video ──
class LipsyncRequest(BaseModel):
    image_url: str = Field(..., description="얼굴 이미지 URL (Replicate 업로드)")
    audio_url: str = Field(..., description="음성 오디오 URL")
    enhancer: str | None = Field(None, description="gfpgan 등")


@app.post("/api/video/lipsync")
async def video_lipsync(req: LipsyncRequest, request: Request):
    """SadTalker (cjwbw/sadtalker) 호출 — 얼굴이 말하게 함. v3: BYOK 헤더 자동 사용."""
    token = _replicate_token(request)
    if not token:
        raise HTTPException(503, "REPLICATE_API_TOKEN 미설정")
    inp = {"source_image": req.image_url, "driven_audio": req.audio_url, "preprocess": "full"}
    if req.enhancer:
        inp["enhancer"] = req.enhancer
    url = f"{REPLICATE_BASE}/models/cjwbw/sadtalker/predictions"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                url,
                json={"input": inp},
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
        if r.status_code not in (200, 201):
            raise HTTPException(r.status_code, f"Lipsync 실패: {r.text[:300]}")
        d = r.json()
        return {"id": d.get("id"), "status": d.get("status"), "model": "sadtalker", "label": "Lipsync (SadTalker)"}
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Replicate 네트워크 에러: {e}")


# ── Upscale (real-esrgan video) ──
class UpscaleRequest(BaseModel):
    video_url: str = Field(..., description="원본 영상 URL")
    scale: int = Field(2, ge=2, le=4)


@app.post("/api/video/upscale")
async def video_upscale(req: UpscaleRequest, request: Request):
    """Real-ESRGAN video upscaler. v3: BYOK 헤더 자동 사용."""
    token = _replicate_token(request)
    if not token:
        raise HTTPException(503, "REPLICATE_API_TOKEN 미설정")
    inp = {"video": req.video_url, "scale": req.scale}
    url = f"{REPLICATE_BASE}/models/lucataco/real-esrgan-video/predictions"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                url,
                json={"input": inp},
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
        if r.status_code not in (200, 201):
            raise HTTPException(r.status_code, f"Upscale 실패: {r.text[:300]}")
        d = r.json()
        return {"id": d.get("id"), "status": d.get("status"), "model": "real-esrgan", "label": f"Upscale x{req.scale}"}
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Replicate 네트워크 에러: {e}")


# ── 일반 텍스트 생성 (세계관·스토리텔링 등) ──
class TextGenRequest(BaseModel):
    system: str = Field("", description="system prompt (역할 지정)")
    user: str = Field(..., min_length=1, max_length=4000, description="user prompt")
    model: str = Field("gpt-4o-mini")
    temperature: float = Field(0.8, ge=0, le=2)
    max_tokens: int = Field(1500, ge=64, le=16000)  # GPT-4o supports up to 16K output
    json_mode: bool = Field(False)


@app.post("/api/text/generate")
async def text_generate(req: TextGenRequest, request: Request):
    """범용 GPT 텍스트 생성. v3: BYOK 헤더 자동 사용."""
    openai_key = _user_key(request, "Openai", "OPENAI_API_KEY")
    if not openai_key:
        raise HTTPException(503, "OPENAI_API_KEY 미설정 — .env 또는 보관소(Vault)에 추가하세요")
    client = AsyncOpenAI(api_key=openai_key)
    msgs = []
    if req.system:
        msgs.append({"role": "system", "content": req.system})
    msgs.append({"role": "user", "content": req.user})

    kwargs: dict[str, Any] = {
        "model": req.model,
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
        "messages": msgs,
    }
    if req.json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    try:
        resp = await client.chat.completions.create(**kwargs)
        text = resp.choices[0].message.content or ""
        usage = resp.usage
        return {
            "text": text,
            "model": req.model,
            "tokens": {
                "prompt": getattr(usage, "prompt_tokens", 0),
                "completion": getattr(usage, "completion_tokens", 0),
            },
        }
    except Exception as e:
        raise HTTPException(502, f"GPT 호출 실패: {type(e).__name__}: {e}")


# ── 임베딩 (Memory Graph용) ─────────────────────────────────
class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=100)
    model: str = Field("text-embedding-3-small")  # 1536d, $0.02/1M tokens


@app.post("/api/embeddings")
async def create_embeddings(req: EmbedRequest, request: Request):
    """OpenAI embeddings forward. BYOK 헤더 사용. Memory Graph 인덱싱·검색용."""
    openai_key = _user_key(request, "Openai", "OPENAI_API_KEY")
    if not openai_key:
        raise HTTPException(503, "OPENAI_API_KEY 미설정 — Settings → AI 서비스 연결에서 OpenAI 키를 등록하세요")
    # 입력 길이 제한
    texts = [(t or "").strip()[:8000] for t in req.texts]
    texts = [t for t in texts if t]
    if not texts:
        raise HTTPException(400, "빈 텍스트만 들어왔습니다")
    client = AsyncOpenAI(api_key=openai_key)
    try:
        resp = await client.embeddings.create(model=req.model, input=texts)
        vectors = [d.embedding for d in resp.data]
        usage = resp.usage
        return {
            "vectors": vectors,
            "model": req.model,
            "dim": len(vectors[0]) if vectors else 0,
            "tokens": getattr(usage, "total_tokens", 0),
        }
    except Exception as e:
        raise HTTPException(502, f"임베딩 생성 실패: {type(e).__name__}: {e}")


@app.post("/api/video/upload")
async def video_upload(request: Request, file: UploadFile = File(...)):
    """이미지를 Replicate Files API로 업로드 → URL 반환. v3: BYOK 헤더 자동 사용."""
    token = _replicate_token(request)
    if not token:
        raise HTTPException(503, "REPLICATE_API_TOKEN 미설정")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "이미지는 10MB 이하여야 합니다")
    if not (file.content_type and file.content_type.startswith("image/")):
        raise HTTPException(400, "이미지 파일만 업로드할 수 있어요")
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"{REPLICATE_BASE}/files",
                headers={"Authorization": f"Bearer {token}"},
                files={"content": (file.filename or "image.png", data, file.content_type)},
            )
        if r.status_code not in (200, 201):
            raise HTTPException(r.status_code, f"업로드 실패: {r.text[:200]}")
        d = r.json()
        url = d.get("urls", {}).get("get") or d.get("url")
        if not url:
            raise HTTPException(500, "업로드 URL을 받을 수 없어요")
        return {"url": url, "id": d.get("id")}
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Replicate 네트워크 에러: {e}")


@app.get("/api/elevenlabs/health")
async def elevenlabs_health():
    """ElevenLabs 키 + user info 확인."""
    key = _eleven_key()
    if not key:
        return {"ok": False, "reason": "ELEVENLABS_API_KEY 미설정"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{ELEVEN_BASE}/user", headers={"xi-api-key": key})
        if r.status_code == 200:
            data = r.json()
            sub = data.get("subscription", {})
            return {
                "ok": True,
                "tier": sub.get("tier"),
                "character_count": sub.get("character_count"),
                "character_limit": sub.get("character_limit"),
            }
        return {"ok": False, "status": r.status_code, "detail": r.text[:200]}
    except httpx.HTTPError as e:
        return {"ok": False, "error": str(e)}


# ============================================================
#  Download
# ============================================================
@app.get("/api/job/{jid}/download")
async def download(jid: str, stem: str = "voice"):
    """stem = voice | music | original"""
    if jid not in JOBS:
        raise HTTPException(404)
    if stem not in STEM_SUFFIX:
        raise HTTPException(400, f"stem must be one of {list(STEM_SUFFIX)}")
    job = JOBS[jid]

    stems = job.get("stems") or {}
    path_str = stems.get(stem) or (job.get("result_file") if stem == "voice" else None)
    if not path_str:
        raise HTTPException(404, f"{stem} 결과가 아직 준비되지 않았습니다")

    path = Path(path_str)
    if not path.exists():
        raise HTTPException(410, "결과 파일이 만료되었습니다")
    title = (job.get("title") or "audio").replace("/", "_")[:60]
    return FileResponse(
        path,
        media_type="audio/wav",
        filename=f"{title}_{STEM_SUFFIX[stem]}.wav",
    )


@app.post("/api/extract-file")
async def extract_file(file: UploadFile = File(...), model: str = "htdemucs_ft"):
    if model not in {"htdemucs", "htdemucs_ft", "mdx_extra", "mdx_extra_q"}:
        raise HTTPException(400, "지원하지 않는 모델")
    if not file.filename:
        raise HTTPException(400, "파일명이 없어요")

    # 500MB 한도
    MAX_UPLOAD = 500 * 1024 * 1024
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "파일 크기는 500MB 이하여야 합니다")

    jid = new_job()
    # 업로드 파일을 임시 경로에 저장 (pipeline_file이 처리 후 삭제)
    safe_name = re.sub(r"[^\w.\-]+", "_", file.filename)[:80] or "upload"
    src_path = Path(tempfile.gettempdir()) / f"soaviz_upload_{jid}_{safe_name}"
    src_path.write_bytes(data)

    asyncio.create_task(pipeline_file(jid, src_path, model))
    cleanup_old_results()
    return {"job_id": jid, "filename": file.filename}


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
