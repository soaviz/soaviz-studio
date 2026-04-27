#!/usr/bin/env python3
"""
soaviz studio — Voice Extractor
================================

MP4 영상 → full_audio.wav 추출 → 보컬 분리 → output/voice.wav 저장

Usage:
    python extract_voice.py input.mp4
    python extract_voice.py input.mp4 -o my_output
    python extract_voice.py input.mp4 -m htdemucs        # 빠른 모델
    python extract_voice.py input.mp4 --keep-full        # 원본 오디오도 보관
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# --------------------------------------------------------------------------
# 예쁜 로그 출력
# --------------------------------------------------------------------------
USE_COLOR = sys.stdout.isatty() and os.environ.get("NO_COLOR") is None


class C:
    RESET = "\033[0m" if USE_COLOR else ""
    BOLD = "\033[1m" if USE_COLOR else ""
    DIM = "\033[2m" if USE_COLOR else ""
    RED = "\033[31m" if USE_COLOR else ""
    GREEN = "\033[32m" if USE_COLOR else ""
    YELLOW = "\033[33m" if USE_COLOR else ""
    CYAN = "\033[36m" if USE_COLOR else ""
    MAGENTA = "\033[35m" if USE_COLOR else ""


def banner() -> None:
    print()
    print(f"{C.MAGENTA}{C.BOLD}soaviz studio{C.RESET} {C.DIM}· voice extractor{C.RESET}")
    print(f"{C.DIM}{'─' * 42}{C.RESET}")


def step(msg: str) -> None:
    print(f"{C.CYAN}▸{C.RESET} {msg}")


def ok(msg: str) -> None:
    print(f"{C.GREEN}✓{C.RESET} {msg}")


def warn(msg: str) -> None:
    print(f"{C.YELLOW}!{C.RESET} {msg}")


def fail(title: str, detail: str = "", hint: str = "") -> None:
    print()
    print(f"{C.RED}{C.BOLD}✗ {title}{C.RESET}")
    if detail:
        print(f"{C.DIM}  ─ 상세 ─{C.RESET}")
        for line in detail.strip().splitlines()[-12:]:
            print(f"  {C.DIM}{line}{C.RESET}")
    if hint:
        print()
        print(f"{C.YELLOW}{C.BOLD}해결 방법{C.RESET}")
        for line in hint.strip().splitlines():
            print(f"  {line}")
    print()
    sys.exit(1)


# --------------------------------------------------------------------------
# 환경 체크
# --------------------------------------------------------------------------
def check_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        fail(
            "ffmpeg를 찾을 수 없어요",
            detail="오디오 추출에 ffmpeg가 필요합니다.",
            hint=(
                "Homebrew로 설치하세요:\n"
                "  brew install ffmpeg\n\n"
                "Homebrew가 없다면:\n"
                '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
            ),
        )


def check_demucs() -> None:
    try:
        import demucs  # noqa: F401
    except ImportError:
        fail(
            "demucs 패키지를 찾을 수 없어요",
            detail="보컬 분리에 demucs가 필요합니다.",
            hint=(
                "가상환경을 만들고 패키지를 설치하세요:\n"
                "  python3 -m venv .venv\n"
                "  source .venv/bin/activate\n"
                "  pip install -r requirements.txt"
            ),
        )


# --------------------------------------------------------------------------
# 파이프라인
# --------------------------------------------------------------------------
def extract_audio(src: Path | str, dst: Path | str) -> None:
    src = Path(src)
    dst = Path(dst)
    step(f"오디오 추출 중 — {src.name}")
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(src),
        "-vn",                          # 비디오 제거
        "-acodec", "pcm_s24le",         # 24bit PCM
        "-ar", "48000",                 # 48kHz
        "-ac", "2",                     # stereo
        str(dst),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        fail(
            "오디오 추출에 실패했어요",
            detail=e.stderr,
            hint=(
                "확인 사항:\n"
                "  • 입력 파일이 손상되지 않았는지 ( `ffmpeg -i <file>` 로 메타 확인 )\n"
                "  • 지원 포맷인지 (mp4, mov, webm, mkv, m4v)\n"
                "  • 디스크 여유 공간이 충분한지"
            ),
        )
    mb = dst.stat().st_size / 1024 / 1024
    ok(f"추출 완료 — {dst.name} ({mb:.1f} MB · 48kHz/24bit/stereo)")


def separate_vocals(src_wav: Path, work_dir: Path, model: str) -> Path:
    step(f"보컬 분리 중 — 모델: {C.BOLD}{model}{C.RESET}")
    print(f"  {C.DIM}처음 실행 시 모델 다운로드로 수 분 걸릴 수 있어요 (~2GB){C.RESET}")

    cmd = [
        sys.executable, "-m", "demucs.separate",
        "--two-stems", "vocals",
        "-n", model,
        "-o", str(work_dir),
        str(src_wav),
    ]
    try:
        # demucs는 진행률을 stderr로 출력하므로 실시간 스트리밍
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
            env={**os.environ, "PYTORCH_ENABLE_MPS_FALLBACK": "1"},
        )
        last_line = ""
        assert proc.stdout is not None
        for line in proc.stdout:
            line = line.rstrip()
            if not line:
                continue
            last_line = line
            # 진행률만 한 줄로 갱신해 콘솔 깔끔하게
            if "%" in line or "Separating" in line or "Selected model" in line:
                print(f"  {C.DIM}{line}{C.RESET}")
        proc.wait()
        if proc.returncode != 0:
            raise subprocess.CalledProcessError(proc.returncode, cmd, output=last_line)
    except subprocess.CalledProcessError as e:
        fail(
            "보컬 분리에 실패했어요",
            detail=str(e.output or "")[-1500:],
            hint=(
                "가능한 원인:\n"
                "  • 메모리 부족 → 더 짧은 영상으로 시도 또는 `-m htdemucs` 로 경량 모델 사용\n"
                "  • Apple Silicon MPS 이슈 → `DEVICE=cpu` 환경변수로 CPU 실행\n"
                "     예: DEVICE=cpu python extract_voice.py input.mp4\n"
                "  • 모델 다운로드 실패 → 네트워크 확인 후 재시도"
            ),
        )

    vocals = work_dir / model / src_wav.stem / "vocals.wav"
    if not vocals.exists():
        fail(
            "vocals.wav 파일을 찾을 수 없어요",
            detail=f"예상 경로: {vocals}\n"
                   f"작업 폴더에 실제로 생성된 파일:\n" +
                   "\n".join(str(p) for p in work_dir.rglob("*.wav")),
        )
    ok("보컬 분리 완료")
    return vocals


# --------------------------------------------------------------------------
# Entry
# --------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="MP4 영상에서 목소리만 추출합니다 (macOS)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "예시:\n"
            "  python extract_voice.py interview.mp4\n"
            "  python extract_voice.py interview.mp4 -o out -m htdemucs_ft\n"
            "  DEVICE=cpu python extract_voice.py interview.mp4  # CPU 강제"
        ),
    )
    parser.add_argument("input", type=Path, help="입력 영상 파일")
    parser.add_argument("-o", "--output", type=Path, default=Path("output"),
                        help="출력 폴더 (기본: ./output)")
    parser.add_argument("-m", "--model", default="htdemucs_ft",
                        choices=["htdemucs", "htdemucs_ft", "mdx_extra", "mdx_extra_q"],
                        help="보컬 분리 모델 (기본: htdemucs_ft)")
    parser.add_argument("--keep-full", action="store_true",
                        help="full_audio.wav도 output 폴더에 보관")
    args = parser.parse_args()

    banner()

    # 1. 입력 검증
    if not args.input.exists():
        fail("입력 파일을 찾을 수 없어요", detail=f"경로: {args.input.resolve()}")
    if args.input.is_dir():
        fail("입력이 폴더예요", detail=f"파일을 지정해 주세요: {args.input}")

    allowed = {".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"}
    if args.input.suffix.lower() not in allowed:
        warn(f"예상치 못한 확장자: {args.input.suffix} — 그대로 진행합니다")

    # 2. 의존성 체크
    check_ffmpeg()
    check_demucs()

    # 3. 출력 폴더 준비
    args.output.mkdir(parents=True, exist_ok=True)

    # 4. 작업
    with tempfile.TemporaryDirectory(prefix="soaviz_") as tmp:
        work = Path(tmp)

        full_audio = work / "full_audio.wav"
        extract_audio(args.input, full_audio)

        if args.keep_full:
            kept = args.output / "full_audio.wav"
            shutil.copy2(full_audio, kept)
            ok(f"원본 오디오 저장 — {kept}")

        vocals = separate_vocals(full_audio, work, args.model)

        final = args.output / "voice.wav"
        shutil.copy2(vocals, final)
        size_mb = final.stat().st_size / 1024 / 1024

    # 5. 요약
    print()
    print(f"{C.GREEN}{C.BOLD}완료{C.RESET}  {C.DIM}voice extracted{C.RESET}")
    print(f"  {C.DIM}→{C.RESET} {C.BOLD}{final.resolve()}{C.RESET}")
    print(f"  {C.DIM}   {size_mb:.1f} MB · 48kHz · stereo{C.RESET}")
    print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
        warn("사용자가 중단했어요.")
        sys.exit(130)
    except Exception as e:  # 마지막 안전망
        fail(
            "예상치 못한 오류가 발생했어요",
            detail=f"{type(e).__name__}: {e}",
            hint="스택 트레이스를 보려면 `PYTHONTRACEBACK=1 python extract_voice.py ...` 로 실행하세요.",
        )
