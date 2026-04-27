#!/usr/bin/env bash
# soaviz studio — macOS LaunchAgent 설치
# 이 스크립트를 1번만 실행하면 Mac 켤 때마다 백엔드/프론트/OAuth 프론트가 자동 시작됩니다.
# 사용법:  bash ~/Desktop/soaviz-studio/install-autostart.sh

set -e

ROOT="$HOME/Desktop/soaviz-studio"
PLIST="$HOME/Library/LaunchAgents/com.soaviz.studio.plist"
LABEL="com.soaviz.studio"
LOG_DIR="$HOME/Library/Logs/soaviz"

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; C='\033[0;36m'; N='\033[0m'

if [ ! -f "$ROOT/main.py" ]; then
  printf "${R}❌ $ROOT/main.py 가 없습니다 — 경로 확인 필요${N}\n"
  exit 1
fi

mkdir -p "$LOG_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

# 기존 LaunchAgent가 있으면 먼저 언로드
if [ -f "$PLIST" ]; then
  printf "${C}기존 LaunchAgent 언로드…${N}\n"
  launchctl unload "$PLIST" 2>/dev/null || true
fi

# Python 경로 자동 감지 (homebrew / system / pyenv)
PY_BIN="$(command -v python3 || true)"
if [ -z "$PY_BIN" ]; then
  printf "${R}❌ python3 미설치 — brew install python3${N}\n"
  exit 1
fi

# uvicorn 모듈 확인
if ! "$PY_BIN" -c "import uvicorn" 2>/dev/null; then
  printf "${Y}⚠ uvicorn 미설치 → pip install...${N}\n"
  "$PY_BIN" -m pip install --break-system-packages --quiet uvicorn fastapi httpx python-dotenv openai python-multipart 2>&1 | tail -3
fi

# plist 생성
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>cd "${ROOT}" &amp;&amp; "${PY_BIN}" -m uvicorn main:app --host 127.0.0.1 --port 8787 &amp; "${PY_BIN}" -m http.server 5500 --bind 127.0.0.1 &amp; "${PY_BIN}" -m http.server 5501 --bind 127.0.0.1 &amp; wait</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${ROOT}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
    <key>Crashed</key>
    <true/>
  </dict>

  <key>StandardOutPath</key>
  <string>${LOG_DIR}/stdout.log</string>

  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/stderr.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>

  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
EOF

# 권한 + 로드
chmod 644 "$PLIST"

# 이전 인스턴스 종료 (포트 정리)
for port in 5500 5501 8787; do
  pid=$(lsof -ti:$port 2>/dev/null || true)
  [ -n "$pid" ] && kill -9 $pid 2>/dev/null || true
done

# launchctl 로드
launchctl load "$PLIST"

sleep 2

# 헬스 체크
ok=0
for i in 1 2 3 4 5 6; do
  if curl -sf http://127.0.0.1:8787/api/health > /dev/null 2>&1 \
     && curl -sf http://127.0.0.1:5500/signup.html > /dev/null 2>&1; then
    if curl -sf http://127.0.0.1:5501/signup.html > /dev/null 2>&1; then
      ok=1; break
    fi
  fi
  sleep 1
done

echo ""
echo "════════════════════════════════════════════════"
if [ $ok -eq 1 ]; then
  printf "${G} ✅ 자동 실행 설치 완료${N}\n"
  echo ""
  echo "  • Mac 켤 때마다 자동 시작됩니다 (재시작/로그인 시)"
  echo "  • 충돌 시 자동 재시작"
  echo ""
  echo "  지금 바로 사용:"
  echo "    open http://localhost:5501/signup.html"
  echo ""
  echo "  로그 확인:"
  echo "    tail -f $LOG_DIR/stdout.log $LOG_DIR/stderr.log"
  echo ""
  echo "  중지:"
  echo "    launchctl unload $PLIST"
  echo ""
  echo "  완전 제거:"
  echo "    bash $ROOT/uninstall-autostart.sh"
else
  printf "${Y} ⚠ 실행은 등록됐지만 서버 응답 확인 실패${N}\n"
  echo "  로그 확인: cat $LOG_DIR/stderr.log"
  echo "  수동 시작: bash $ROOT/start.sh"
fi
echo "════════════════════════════════════════════════"
