from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import modal


MODEL_NAME = "htdemucs_ft"

image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg")
    .pip_install("demucs")
)

app = modal.App("voice-extract")


@app.function(image=image, gpu="T4", timeout=900)
def run_demucs(audio_bytes: bytes, model: str = MODEL_NAME) -> bytes:
    """Separate vocals from WAV bytes and return vocals.wav bytes."""
    with tempfile.TemporaryDirectory() as tmp:
        work_dir = Path(tmp)
        src = work_dir / "input.wav"
        src.write_bytes(audio_bytes)

        subprocess.run(
            [
                "demucs",
                "--two-stems",
                "vocals",
                "-n",
                model,
                "-o",
                str(work_dir),
                str(src),
            ],
            check=True,
            capture_output=True,
            text=True,
        )

        vocals = work_dir / model / src.stem / "vocals.wav"
        if not vocals.exists():
            raise FileNotFoundError(f"vocals.wav not found: {vocals}")

        return vocals.read_bytes()


@app.local_entrypoint()
def main(input_path: str, output_path: str = "voice.wav", model: str = MODEL_NAME) -> None:
    """Upload a local WAV file to Modal and save the separated vocals locally."""
    src = Path(input_path)
    if not src.exists():
        raise FileNotFoundError(f"input file not found: {src}")

    audio_bytes = src.read_bytes()
    result = run_demucs.remote(audio_bytes, model=model)
    Path(output_path).write_bytes(result)
    print(f"saved vocals to {Path(output_path).resolve()}")
