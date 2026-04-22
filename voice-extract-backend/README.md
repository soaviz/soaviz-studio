# soaviz studio — URL Extraction Backend

YouTube, Vimeo 등의 영상 URL을 받아 **오디오 다운로드 → 정규화 → 보컬 분리** 까지 수행하는 로컬 FastAPI 서버.
진행률은 Server-Sent Events(SSE)로 `soaviz-studio.html` 에 실시간 스트리밍됩니다.

---

## 아키텍처

```
[soaviz-studio.html]
       │  ① POST /api/extract {url}
       ▼
[FastAPI @ 127.0.0.1:8787]
       │  ② asyncio.create_task( pipeline )
       ▼
 yt-dlp (다운로드)  →  ffmpeg (WAV 48k/24b)  →  demucs (보컬 분리)
       │                                              │
       └──────  SSE  /api/job/{id}/stream  ───────────┘
                     progress · step · message
                                │
                                ▼
                 ③ GET /api/job/{id}/download → voice.wav
```

---

## 요구사항 (macOS)

- macOS 12 이상 (Apple Silicon 권장)
- Python 3.10+
- Homebrew
- 여유 공간 3GB 이상 (demucs 모델 포함)

---

## 설치

```bash
# 1) ffmpeg
brew install ffmpeg

# 2) 가상환경
python3 -m venv .venv
source .venv/bin/activate

# 3) 파이썬 패키지
pip install -r requirements.txt

# 4) 의존성 확인
yt-dlp --version
ffmpeg -version | head -1
python -c "import demucs; print('demucs ok')"
```

---

## 실행

```bash
python main.py
# → http://127.0.0.1:8787
```

또는 hot reload:

```bash
uvicorn main:app --host 127.0.0.1 --port 8787 --reload
```

헬스체크:

```bash
curl http://127.0.0.1:8787/api/health
# {"ok": true, "checks": {"ffmpeg": true, "yt_dlp": true, "demucs": true}}
```

---

## API

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/health` | 의존성 체크 |
| `POST` | `/api/extract` | 추출 작업 시작 (body: `{url, model?}`) |
| `GET` | `/api/job/{id}` | 현재 상태 (JSON) |
| `GET` | `/api/job/{id}/stream` | **SSE 스트림** (진행률) |
| `GET` | `/api/job/{id}/download` | 결과 WAV 다운로드 |

### POST /api/extract

```json
// Request
{ "url": "https://www.youtube.com/watch?v=XXXXXX", "model": "htdemucs_ft" }

// Response
{ "job_id": "a3f2c8b1e9d4" }
```

### SSE 이벤트 예시

```
data: {"snapshot": true, "status": "running", "progress": 12, "step": "download", "message": "다운로드 중 42%"}

data: {"progress": 42, "message": "다운로드 중 42%"}

data: {"step": "extract", "progress": 32, "message": "오디오를 꺼내는 중"}

data: {"step": "separate", "progress": 65}

data: {"status": "done", "step": "done", "progress": 100, "result_file": "/tmp/..."}
```

---

## CURL 테스트

```bash
# 1) 작업 시작
JOB=$(curl -sX POST http://127.0.0.1:8787/api/extract \
     -H 'Content-Type: application/json' \
     -d '{"url":"https://www.youtube.com/watch?v=YOUR_ID"}' \
  | python -c 'import sys,json;print(json.load(sys.stdin)["job_id"])')

# 2) 진행률 관찰
curl -N http://127.0.0.1:8787/api/job/$JOB/stream

# 3) 다운로드
curl -o voice.wav http://127.0.0.1:8787/api/job/$JOB/download
```

---

## 프론트엔드 연결

`soaviz-studio.html` 상단 스크립트에서 `BACKEND_URL`을 확인하세요:

```js
const BACKEND_URL = 'http://127.0.0.1:8787';
```

HTML 파일은 `file://` 로 열어도 됩니다. CORS는 localhost/127.0.0.1/null origin을 허용하도록 설정되어 있습니다.

---

## 제한 · 설정

| 항목 | 기본값 | 변경 위치 |
|---|---|---|
| 최대 영상 길이 | 30분 | `MAX_DURATION_SEC` |
| 결과 보관 | 24시간 | `RESULT_TTL_SEC` |
| 포트 | 8787 | `main.py` 하단 |
| 모델 | htdemucs_ft | 요청마다 지정 가능 |

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `yt-dlp: command not found` | 설치 누락 | `pip install yt-dlp` 또는 `brew install yt-dlp` |
| `Sign in to confirm you're not a bot` | YouTube 봇 감지 | `yt-dlp --cookies-from-browser chrome` 옵션 추가 필요 (코드 수정) |
| `HTTP 403: Forbidden` | 지역/연령 제한 | 공개 영상으로 시도 |
| demucs 첫 실행 매우 느림 | 모델(~2GB) 다운로드 | Wi-Fi 환경에서 한 번만 수행, 이후 캐시 사용 |
| MPS 에러 (Apple Silicon) | PyTorch MPS 이슈 | 코드에 `PYTORCH_ENABLE_MPS_FALLBACK=1` 기본 설정됨 |
| CORS 블록 | 프론트 origin 미등록 | `main.py`의 `allow_origin_regex` 확인 |
| 결과가 금방 없어짐 | TTL 만료 | `RESULT_TTL_SEC` 늘리기 |

---

## 법적 · 윤리 고지

- **본인 소유 콘텐츠, 공개 라이선스(CC 등), 사용권이 확보된 콘텐츠에만 사용**
- YouTube 이용약관은 일반 사용자의 다운로드를 제한합니다. 상업 서비스로 배포할 경우:
  - 사용자 약관에 "본인 권리 있는 콘텐츠만 업로드 가능" 명시
  - DMCA/저작권 신고 창구 제공
  - 생성물에 워터마크 삽입
- 이 MVP는 로컬 개인 작업용입니다. 프로덕션 배포 전 법률 검토 권장.

---

## 다음 단계 (프로덕션 전환)

1. **Redis + RQ/Celery** 로 Job 큐 분리 (현재는 in-memory)
2. **Cloudflare R2 / S3** 로 결과 저장, 서명 URL 발급
3. **Rate limiting** (slowapi) — URL당 1회, IP당 시간제한
4. **사용자 인증** (Clerk / Supabase)
5. **도메인/HTTPS** — fly.io · Railway · Modal 등
6. **Sentry** 에러 모니터링
