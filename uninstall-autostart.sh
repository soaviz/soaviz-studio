#!/usr/bin/env bash
# soaviz studio — 자동 실행 제거
# 사용법:  bash ~/Desktop/soaviz-studio/uninstall-autostart.sh

PLIST="$HOME/Library/LaunchAgents/com.soaviz.studio.plist"

G='\033[0;32m'; Y='\033[1;33m'; N='\033[0m'

if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  printf "${G}✅ 자동 실행 제거됨${N}\n"
else
  printf "${Y}⚠ 자동 실행이 설치되지 않은 상태${N}\n"
fi

# 포트 정리
for port in 5500 8787; do
  pid=$(lsof -ti:$port 2>/dev/null || true)
  [ -n "$pid" ] && kill -9 $pid 2>/dev/null && echo "  · port $port 종료" || true
done

echo ""
echo "필요시 수동 실행: bash ~/Desktop/soaviz-studio/start.sh"
