from __future__ import annotations

import os
from pathlib import Path

import modal


DEFAULT_APP_NAME = os.environ.get("MODAL_APP_NAME", "voice-extract")
DEFAULT_FUNCTION_NAME = os.environ.get("MODAL_FUNCTION_NAME", "run_demucs")


def separate_vocals_via_modal(
    input_wav: str | Path,
    output_wav: str | Path | None = None,
    *,
    app_name: str = DEFAULT_APP_NAME,
    function_name: str = DEFAULT_FUNCTION_NAME,
    model: str = "htdemucs_ft",
) -> bytes | Path:
    """Send WAV bytes to a deployed Modal function and return/save vocals.wav."""
    src = Path(input_wav)
    if not src.exists():
        raise FileNotFoundError(f"input WAV not found: {src}")

    fn = modal.Function.from_name(app_name, function_name)
    result_bytes = fn.remote(src.read_bytes(), model=model)

    if output_wav is None:
        return result_bytes

    out = Path(output_wav)
    out.write_bytes(result_bytes)
    return out
