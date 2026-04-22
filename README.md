# my-voice-extractor

Voice extraction workspace for local video files and URL-based audio processing.

## Projects

- `soaviz-studio.html`: simple frontend page for starting extraction jobs
- `voice-extract/`: CLI tool that extracts vocals from local video files
- `voice-extract-backend/`: FastAPI backend that downloads audio from supported URLs and separates vocals

## Notes

- `voice-extract` uses `ffmpeg` and `demucs`
- `voice-extract-backend` uses `yt-dlp`, `ffmpeg`, and `demucs`
- generated outputs and local audit files are ignored from Git
