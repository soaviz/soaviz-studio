from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import replicate


MODEL_REF = "ryan5453/demucs"


def _as_url(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value

    url_attr = getattr(value, "url", None)
    if isinstance(url_attr, str):
        return url_attr
    if callable(url_attr):
        try:
            return url_attr()
        except TypeError:
            pass

    return str(value)


def separate_vocals(audio: str | Path) -> str:
    """Run Demucs on Replicate and return the vocals file URL."""
    if not os.environ.get("REPLICATE_API_TOKEN"):
        raise RuntimeError("REPLICATE_API_TOKEN is not set")

    audio_input: str | Any
    if isinstance(audio, Path) or (isinstance(audio, str) and not audio.startswith(("http://", "https://"))):
        audio_path = Path(audio)
        if not audio_path.exists():
            raise FileNotFoundError(f"audio file not found: {audio_path}")
        audio_input = audio_path.open("rb")
    else:
        audio_input = str(audio)

    try:
        output = replicate.run(
            MODEL_REF,
            input={
                "audio": audio_input,
                "model": "htdemucs_ft",
                "two_stems": "vocals",
                "output_format": "wav",
            },
        )
    finally:
        if hasattr(audio_input, "close"):
            audio_input.close()

    if isinstance(output, dict):
        direct = _as_url(output.get("vocals"))
        if direct:
            return direct

        stems = output.get("stems")
        if isinstance(stems, list):
            for item in stems:
                if isinstance(item, dict) and item.get("name") == "vocals":
                    stem_url = _as_url(item.get("audio"))
                    if stem_url:
                        return stem_url

    if isinstance(output, list):
        for item in output:
            if isinstance(item, dict) and item.get("name") == "vocals":
                stem_url = _as_url(item.get("audio"))
                if stem_url:
                    return stem_url
        if len(output) == 1:
            single = _as_url(output[0])
            if single:
                return single

    raise RuntimeError(f"could not find vocals output in Replicate response: {output!r}")
