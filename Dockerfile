# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────
# soaviz studio — Backend Dockerfile (Fly.io / Render / Railway)
# ─────────────────────────────────────────────────────────────
FROM python:3.11-slim AS base

# 시스템 의존성 — yt-dlp·ffmpeg·demucs를 위한 최소 패키지
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      curl \
      ca-certificates \
      tini \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_ENV=production \
    PORT=8787

WORKDIR /app

# Python 의존성 — requirements.txt가 있으면 그것 사용
COPY requirements.txt* ./
RUN if [ -f requirements.txt ]; then \
      pip install --no-cache-dir -r requirements.txt; \
    else \
      pip install --no-cache-dir \
        fastapi==0.115.0 \
        "uvicorn[standard]==0.30.6" \
        httpx==0.27.2 \
        openai==1.51.0 \
        python-dotenv==1.0.1 \
        python-multipart==0.0.9 \
        pydantic==2.9.2 \
        yt-dlp==2024.10.7; \
    fi

# 앱 복사
COPY main.py ./
COPY *.py ./

# 비-root 사용자
RUN useradd -m -u 10001 soaviz && chown -R soaviz:soaviz /app
USER soaviz

EXPOSE 8787

# tini로 PID 1 신호 처리
ENTRYPOINT ["/usr/bin/tini", "--"]

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT}/api/healthz || exit 1

# 실행
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
