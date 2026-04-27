# soaviz studio

AI 영상 제작 OS — 단일 화면에서 스토리·캐릭터·룩북·보이스·음악·영상·비교·회고까지.

## 빠른 시작 (로컬)

```bash
# 1. 의존성
pip install -r requirements.txt
brew install ffmpeg yt-dlp                    # macOS

# 2. 환경 변수
cp .env.example .env
# .env 채우기

# 3. 백엔드
uvicorn main:app --host 127.0.0.1 --port 8787 --reload

# 4. 프론트
python3 -m http.server 5500
# http://localhost:5500/soaviz-studio.html
```

## 프로젝트 구조

```
.
├── soaviz-studio.html         # 단일 SPA
├── signup.html                # 가입·로그인
├── docs/index.html            # 사용자 가이드
├── deployment-roadmap.html    # 배포 체크리스트
├── main.py                    # FastAPI 백엔드
├── requirements.txt           # Python deps
├── Dockerfile                 # 백엔드 이미지
├── fly.toml                   # Fly.io 설정
├── vercel.json                # Vercel 정적 호스팅 + 보안 헤더
├── .github/workflows/ci.yml   # CI/CD
├── supabase/schema.sql        # Postgres 초기 스키마
├── public/robots.txt          # SEO
├── .env.example               # 환경 변수 템플릿
└── README.md
```

## 배포 (Production)

### A. 백엔드 (Fly.io)

```bash
brew install flyctl
fly auth login
fly launch                     # 한 번만
fly secrets set OPENAI_API_KEY=sk-... \
                ALLOWED_ORIGINS=https://soaviz.studio \
                SENTRY_DSN=https://...
fly deploy
```

### B. 프론트 (Vercel)

```bash
npm i -g vercel
vercel link
vercel env add BACKEND_URL production   # https://soaviz-studio-api.fly.dev
vercel --prod
```

### C. DB (Supabase)

```bash
# Dashboard → SQL Editor에서 supabase/schema.sql 실행
```

자세한 단계별 체크리스트는 **[deployment-roadmap.html](./deployment-roadmap.html)** 참조.

## 보안

- 환경 변수: `.env`는 절대 커밋 금지 (.gitignore 차단됨)
- CORS: production은 `ALLOWED_ORIGINS` env로 명시적 origin만
- HTTPS: Vercel/Fly가 자동 + HSTS preload
- Rate Limit: 60 req/min (`RATE_LIMIT_PER_MIN` 조정)
- 보안 헤더: vercel.json + main.py 미들웨어
- BYOK: 사용자 API 키는 클라이언트 Vault(AES-GCM) + 헤더 forwarding
- 취약점 신고: `security@soaviz.studio`

## 운영

- 모니터링: Sentry (`SENTRY_DSN` env)
- 업타임: UptimeRobot 5분 간격 → `/api/healthz`
- 로그: `fly logs` / Vercel dashboard
- 백업: Supabase 자동 (Pro 이상) + R2 별도

## 비용 (1,000 사용자 가정)

| 항목 | 월 |
|---|---|
| Vercel Pro | $20 |
| Fly.io | $25 |
| Supabase Pro | $25 |
| Cloudflare R2 (50GB) | $0.75 |
| Sentry | 무료 |
| **합계** | **~$71** (≈ ₩100K) |

손익분기점: Pro 사용자 6명 (₩114K).

## 라이선스

Proprietary — (주)소아비즈

## 문의

- 일반: support@soaviz.studio
- 결제: billing@soaviz.studio
- 보안: security@soaviz.studio
