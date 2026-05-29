# soaviz studio

AI 영상 제작 OS — 단일 화면에서 스토리·캐릭터·룩북·보이스·음악·영상·비교·회고까지.

## 빠른 시작 (로컬)

```bash
# 1. 프로젝트 이동
cd ~/Desktop/soaviz-studio

# 2. Node 의존성
npm install

# 3. FFmpeg 설치 (렌더링 필수)
brew install ffmpeg

# 4. Node/Express 백엔드 + 정적 프론트 실행
npm run dev

# 5. 접속
# http://localhost:8787/soaviz-studio.html
```

프론트만 별도 정적 서버로 열 때는 `localStorage.SOAVIZ_API_BASE_URL` 또는 `window.__SOAVIZ_CONFIG__.backendUrl`이
`http://localhost:8787`을 가리키면 됩니다.

## 프로젝트 구조

```
.
├── soaviz-studio.html         # 단일 SPA
├── signup.html                # 가입·로그인
├── docs/index.html            # 사용자 가이드
├── deployment-roadmap.html    # 배포 체크리스트
├── server.js                  # Node/Express + FFmpeg render backend
├── services/                  # 분석·버전 생성·렌더링 서비스
├── main.py                    # legacy FastAPI extractor backend
├── requirements.txt           # Python deps (legacy extractor)
├── Dockerfile                 # 백엔드 이미지
├── fly.toml                   # Fly.io 설정
├── vercel.json                # Vercel 정적 호스팅 + 보안 헤더
├── .github/workflows/ci.yml   # CI/CD
├── supabase/schema.sql        # Postgres 초기 스키마
├── public/robots.txt          # SEO
├── .env.example               # 환경 변수 템플릿
└── README.md
```

## 클라우드 배포 (Production)

### A. 백엔드 (Railway 또는 Render)

1. GitHub repo를 Railway 또는 Render에 연결합니다.
2. Runtime은 Node.js를 선택합니다.
3. Start command는 `npm start`를 사용합니다.
4. Health check path는 `/health`를 사용합니다.
5. Railway는 `railway.json` + `nixpacks.toml`로 Node/Nixpacks 빌드를 강제합니다.
6. `nixpacks.toml`에서 `nodejs_20`과 `ffmpeg`를 설치합니다.
7. 환경 변수는 서비스 Dashboard에서 설정합니다. `.env.local`은 커밋하지 않습니다.

현재 프로덕션 백엔드는 로컬에서 검증된 Node/Express `server.js`를 기준으로 배포합니다.
프론트가 기대하는 필수 API는 다음과 같습니다.

```text
GET  /health
GET  /api/health
POST /api/analyze-video
POST /api/render-video
```

#### Legacy / extractor backend files

이 repo에는 이전 실험용 FastAPI extractor backend 파일도 남아 있습니다.
다음 파일은 이번 Railway Node 백엔드 배포 대상이 아닙니다.

```text
main.py
requirements.txt
voice-extract-backend/
modal_app.py
modal_remote.py
Dockerfile
fly.toml
```

삭제하지 않고 보관하되, Railway 서비스에서는 `railway.json`의 Nixpacks builder와
`nixpacks.toml`의 `providers = ["node"]`, `start.cmd = "npm start"` 설정으로
Node `server.js`가 실행되도록 고정합니다. Docker 기반 배포가 필요할 때만 Dockerfile을 별도 서비스에서 사용하세요.

백엔드가 배포되면 예시는 다음 형태가 됩니다.

```text
https://YOUR-BACKEND-URL.railway.app
https://YOUR-BACKEND-URL.onrender.com
```

### B. 프론트 (Vercel)

1. Vercel에 GitHub repo를 연결합니다.
2. `soaviz.com`, `www.soaviz.com` 도메인을 연결합니다.
3. `index.html`과 `soaviz-studio.html` 상단의 `window.__SOAVIZ_CONFIG__.backendUrl`을 Railway/Render URL로 교체합니다.
4. 필요하면 브라우저 콘솔에서 임시로 아래 값을 설정해 백엔드 URL을 오버라이드할 수 있습니다.

```js
localStorage.setItem("SOAVIZ_API_BASE_URL", "https://YOUR-BACKEND-URL.railway.app");
```

현재 프론트 API 설정 구조:

```js
const API_BASE_URL =
  window.__SOAVIZ_CONFIG__?.backendUrl ||
  localStorage.getItem("SOAVIZ_API_BASE_URL") ||
  "http://localhost:8787";

const ANALYZE_API = `${API_BASE_URL}/api/analyze-video`;
const RENDER_API = `${API_BASE_URL}/api/render-video`;
```

### C. 배포 후 확인

```bash
curl https://YOUR-BACKEND-URL.railway.app/health
curl https://YOUR-BACKEND-URL.railway.app/api/health
```

프론트에서는 `https://www.soaviz.com` 접속 후 영상 편집 업로드 → 분석 → 렌더링까지 확인합니다.

### D. DB (Supabase)

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
- 취약점 신고: `ai@soaviz.com`

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

## Saving Storyboard Outputs

`/storyboard` 실행 후 결과물은 아래 경로에 마크다운 파일로 저장합니다.

**파일명 규칙**

```
/outputs/YYYY-MM-DD_project-name_storyboard.md
```

**저장 방법 — CLI 스크립트 사용 (권장)**

```bash
npm run save:storyboard -- <project-name>
# 예시
npm run save:storyboard -- soaviz-launch
```

실행하면 `outputs/YYYY-MM-DD_soaviz-launch_storyboard.md` 가 오늘 날짜로 자동 생성됩니다.
`Project name`과 `Date` 필드는 자동으로 채워집니다.
같은 이름의 파일이 이미 존재하면 덮어쓰지 않고 에러를 출력합니다.

**저장 방법 — 수동**

1. `outputs/_storyboard-output-template.md` 복사
2. 파일명을 위 규칙에 맞게 변경
3. BLOCK A / BLOCK B에 생성된 프롬프트 붙여넣기
4. Meta 항목 및 Production Status 채우기 후 저장

**포함 항목**

| 섹션 | 내용 |
|---|---|
| Project | 프로젝트명, Brand URL, 날짜, 작성자 |
| Goal | 캠페인 또는 콘텐츠 목표 |
| Target Audience | 타겟 설명 |
| Visual Direction | 색감, 스타일, 분위기 |
| Strategic Notes | 기획 메모 |
| BLOCK A | GPT Image 스토리보드 프롬프트 |
| BLOCK B | Seedance / Kling 세로형 영상 프롬프트 |
| Notes | 수정 이력, 피드백 |
| Reuse Tags | 검색·분류용 태그 |
| Production Status | planning → in-production → in-review → approved → delivered |

> `outputs/` 폴더는 Git에서 추적됩니다. API 키나 시크릿은 포함하지 않습니다.

---

## 라이선스

Proprietary — (주)소아비즈

## 문의

- 일반: ai@soaviz.com
- 결제: ai@soaviz.com
- 보안: ai@soaviz.com
