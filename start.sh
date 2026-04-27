#!/usr/bin/env bash
# soaviz studio — 한 줄 실행 (백엔드 + 프론트 2개 + 브라우저)
# 사용법:  bash ~/Desktop/soaviz-studio/start.sh
#         또는  ./start.sh   (chmod +x 후)

set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"

echo "════════════════════════════════════════════════"
echo " soaviz studio — 시작 중…"
echo " 작업 폴더: $ROOT"
echo "════════════════════════════════════════════════"

# ── 색상 ──
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; C='\033[0;36m'; N='\033[0m'

# ── 의존성 체크 ──
need_pip=()
python3 -c "import uvicorn" 2>/dev/null    || need_pip+=("uvicorn[standard]")
python3 -c "import fastapi" 2>/dev/null    || need_pip+=("fastapi")
python3 -c "import httpx" 2>/dev/null      || need_pip+=("httpx")
python3 -c "import dotenv" 2>/dev/null     || need_pip+=("python-dotenv")
python3 -c "import openai" 2>/dev/null     || need_pip+=("openai")
python3 -c "import multipart" 2>/dev/null  || need_pip+=("python-multipart")
python3 -c "import yt_dlp" 2>/dev/null     || need_pip+=("yt-dlp")
python3 -c "import demucs" 2>/dev/null     || need_pip+=("demucs")

if [ ${#need_pip[@]} -ne 0 ]; then
  printf "${Y}⚠ 누락된 패키지 설치 중...${N}\n"
  pip install --break-system-packages --quiet "${need_pip[@]}" || {
    printf "${R}패키지 설치 실패 — 수동으로 실행: pip install ${need_pip[*]} --break-system-packages${N}\n"
  }
fi

if ! command -v ffmpeg > /dev/null; then
  printf "${Y}⚠ ffmpeg 누락 — 영상 추출 기능 제한됨. brew install ffmpeg 으로 설치 권장${N}\n"
fi

# ── 포트 정리 (이전 프로세스 종료) ──
for port in 8787 5500 5501; do
  pid=$(lsof -ti:$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    printf "${C}이전 프로세스 종료 (port $port, PID $pid)${N}\n"
    kill -9 $pid 2>/dev/null || true
  fi
done

# ── 백엔드 실행 (백그라운드) ──
printf "${G}▶ 백엔드 시작 (port 8787)...${N}\n"
uvicorn main:app --host 127.0.0.1 --port 8787 --log-level warning > /tmp/soaviz-back.log 2>&1 &
BACK_PID=$!

# ── 프론트 실행 (백그라운드) ──
printf "${G}▶ 프론트 시작 (port 5500)...${N}\n"
python3 -m http.server 5500 --bind 127.0.0.1 > /tmp/soaviz-front.log 2>&1 &
FRONT_PID=$!

printf "${G}▶ OAuth 프론트 시작 (port 5501)...${N}\n"
python3 -m http.server 5501 --bind 127.0.0.1 > /tmp/soaviz-front-5501.log 2>&1 &
OAUTH_FRONT_PID=$!

# ── 시작 대기 (헬스 체크) ──
sleep 1
for i in 1 2 3 4 5; do
  if curl -sf http://127.0.0.1:8787/api/health > /dev/null; then break; fi
  sleep 0.5
done

# ── 브라우저 자동 오픈 ──
URL="http://localhost:5501/signup.html"
printf "${G}▶ 브라우저 열기: ${URL}${N}\n"
if command -v open > /dev/null; then
  open "$URL"  # macOS
elif command -v xdg-open > /dev/null; then
  xdg-open "$URL"  # Linux
elif command -v start > /dev/null; then
  start "$URL"  # Windows Git Bash
fi

# ── 안내 ──
echo ""
echo "════════════════════════════════════════════════"
printf "${G} ✅ soaviz studio 실행 중${N}\n"
echo "  • 프론트:  http://localhost:5500/signup.html"
echo "  • OAuth:   http://localhost:5501/signup.html"
echo "  • 백엔드:  http://127.0.0.1:8787/api/health"
echo "  • 로그:    tail -f /tmp/soaviz-back.log /tmp/soaviz-front.log /tmp/soaviz-front-5501.log"
echo ""
printf "${C}  종료: 이 터미널에서 Ctrl+C${N}\n"
echo "════════════════════════════════════════════════"

# ── 종료 시 정리 ──
trap "echo ''; echo '🛑 종료 중...'; kill $BACK_PID $FRONT_PID $OAUTH_FRONT_PID 2>/dev/null; exit 0" INT TERM

# ── 두 프로세스 대기 ──
wait $BACK_PID $FRONT_PID $OAUTH_FRONT_PID
