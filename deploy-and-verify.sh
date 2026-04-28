#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# soaviz studio — 한 번 실행하면 백엔드+프론트 모두 살리는 스크립트
# 사용: bash ~/Desktop/soaviz-studio/deploy-and-verify.sh
# ─────────────────────────────────────────────────────────────
set -uo pipefail

cd "$(dirname "$0")"
WS_URL="https://www.soaviz.com"
FLY_APP="soaviz-studio-api"
FLY_URL="https://${FLY_APP}.fly.dev"

c_ok()   { printf "\033[32m✓\033[0m %s\n" "$*"; }
c_bad()  { printf "\033[31m✗\033[0m %s\n" "$*"; }
c_step() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
c_warn() { printf "\033[33m!\033[0m %s\n" "$*"; }

# ─── STEP 0: CLI 도구 점검 ────────────────────────────────
c_step "STEP 0 — CLI 도구 점검"
need_install=()
command -v vercel >/dev/null || need_install+=("vercel  → npm i -g vercel")
command -v fly    >/dev/null || command -v flyctl >/dev/null || need_install+=("flyctl  → brew install flyctl")
command -v jq     >/dev/null || need_install+=("jq      → brew install jq")
command -v curl   >/dev/null || need_install+=("curl    → 이미 있어야 함")

if [ ${#need_install[@]} -gt 0 ]; then
  c_bad "다음 도구가 없어요. 먼저 설치:"
  printf '  - %s\n' "${need_install[@]}"
  exit 1
fi
c_ok "vercel / fly / jq / curl OK"

FLY_BIN="$(command -v fly || command -v flyctl)"

# ─── STEP 1: vercel.json에 /api 프록시 들어 있는지 ─────────
c_step "STEP 1 — vercel.json /api 프록시 확인"
if grep -q "soaviz-studio-api.fly.dev" vercel.json; then
  c_ok "vercel.json에 /api 프록시 OK"
else
  c_bad "vercel.json에 /api 프록시 없음 → 추가합니다"
  python3 -c "
import json, pathlib
p = pathlib.Path('vercel.json')
d = json.loads(p.read_text())
proxy = {'source': '/api/:path*', 'destination': 'https://soaviz-studio-api.fly.dev/api/:path*'}
rewrites = d.setdefault('rewrites', [])
if not any(r.get('source') == '/api/:path*' for r in rewrites):
    rewrites.insert(0, proxy)
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
print('  ✓ vercel.json 업데이트')
  "
fi

# ─── STEP 2: Fly 앱이 존재하는지 ──────────────────────────
c_step "STEP 2 — Fly.io 앱 존재 확인"
if "$FLY_BIN" apps list 2>/dev/null | grep -q "$FLY_APP"; then
  c_ok "Fly 앱 '$FLY_APP' 존재"
else
  c_warn "Fly 앱 없음 → 생성합니다"
  "$FLY_BIN" auth whoami 2>/dev/null || { c_bad "fly auth login 먼저 실행하세요"; exit 1; }
  "$FLY_BIN" apps create "$FLY_APP" --org personal || c_warn "이미 있을 수 있음 (계속 진행)"
fi

# ─── STEP 3: Fly secrets 점검 ──────────────────────────────
c_step "STEP 3 — Fly secrets (API 키) 점검"
SECRETS_JSON=$("$FLY_BIN" secrets list -a "$FLY_APP" --json 2>/dev/null || echo '[]')
have_secret() {
  echo "$SECRETS_JSON" | jq -e ".[] | select(.Name==\"$1\")" >/dev/null 2>&1
}

missing_secrets=()
for k in OPENAI_API_KEY ELEVENLABS_API_KEY REPLICATE_API_TOKEN; do
  if have_secret "$k"; then
    c_ok "secret 있음: $k"
  else
    c_bad "secret 없음: $k"
    missing_secrets+=("$k")
  fi
done

if [ ${#missing_secrets[@]} -gt 0 ]; then
  echo ""
  c_warn "누락된 키를 입력해 주세요. 빈 값으로 두면 해당 기능만 비활성화됩니다."
  for k in "${missing_secrets[@]}"; do
    printf "  %s = " "$k"
    read -rs val; echo
    if [ -n "$val" ]; then
      "$FLY_BIN" secrets set "$k=$val" -a "$FLY_APP" --stage
      c_ok "  → $k 등록"
    else
      c_warn "  → $k 건너뜀"
    fi
  done
  # ALLOWED_ORIGINS 도 함께 등록 (CORS 안전판)
  "$FLY_BIN" secrets set "ALLOWED_ORIGINS=https://www.soaviz.com,https://soaviz.com" -a "$FLY_APP" --stage
  "$FLY_BIN" secrets deploy -a "$FLY_APP" 2>/dev/null || true
fi

# ─── STEP 4: Fly deploy ──────────────────────────────────
c_step "STEP 4 — Fly.io에 백엔드 배포 (소요 1~3분)"
"$FLY_BIN" deploy -a "$FLY_APP" --remote-only

# ─── STEP 5: Fly 헬스 체크 ────────────────────────────────
c_step "STEP 5 — Fly 헬스 체크"
sleep 5
for i in 1 2 3 4 5; do
  CODE=$(curl -s -o /tmp/_h.json -w '%{http_code}' "$FLY_URL/api/healthz" || echo "000")
  if [ "$CODE" = "200" ]; then
    c_ok "Fly 백엔드 LIVE (HTTP 200): $(cat /tmp/_h.json)"
    break
  fi
  c_warn "  시도 $i/5 — HTTP $CODE, 5초 대기"
  sleep 5
done
[ "$CODE" = "200" ] || { c_bad "Fly 백엔드가 응답하지 않습니다. 'fly logs -a $FLY_APP' 확인 필요"; exit 1; }

# ─── STEP 6: Vercel 재배포 (vercel.json 반영) ─────────────
c_step "STEP 6 — Vercel 재배포"
DEP_URL=$(vercel --prod --yes 2>&1 | tee /tmp/_v.log | grep -Eo 'https://[^[:space:]]+\.vercel\.app' | tail -1)
if [ -n "${DEP_URL:-}" ]; then
  c_ok "deployment URL: $DEP_URL"
  vercel alias set "$DEP_URL" www.soaviz.com >/dev/null
  vercel alias set "$DEP_URL" soaviz.com     >/dev/null
  c_ok "alias 갱신: www.soaviz.com / soaviz.com"
else
  c_warn "deployment URL 추출 실패 — 수동 확인 필요"
fi

# ─── STEP 7: End-to-End 테스트 (실제 생성하기 호출) ────
c_step "STEP 7 — End-to-End 테스트 (텍스트 생성 실제 호출)"
sleep 5

echo "  · /api/healthz via www.soaviz.com:"
curl -s -w "    HTTP %{http_code}\n" -o /tmp/_e2e_h.json "$WS_URL/api/healthz"
cat /tmp/_e2e_h.json | head -c 200; echo

echo ""
echo "  · /api/text/generate 실제 호출 (3토큰 생성):"
RESP=$(curl -s -X POST "$WS_URL/api/text/generate" \
  -H 'Content-Type: application/json' \
  -d '{"system":"한 단어로 답하세요.","user":"고양이의 영어 단어는?","max_tokens":10,"temperature":0.1}')
echo "    응답: $RESP"

if echo "$RESP" | jq -e '.text' >/dev/null 2>&1; then
  c_ok "텍스트 생성 정상 동작!"
else
  c_bad "텍스트 생성 실패 — 응답 본문에 .text 없음"
  exit 1
fi

# ─── 완료 ───────────────────────────────────────────────
c_step "✅ 모든 생성하기 버튼 작동 가능 상태"
echo "  · Frontend: $WS_URL"
echo "  · Backend:  $FLY_URL"
echo ""
echo "이제 브라우저에서 ⌘+Shift+R 강력 새로고침 후 대본/스토리/SFX/TTS 생성 테스트해 보세요."
