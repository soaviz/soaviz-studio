# soaviz studio — Voice Extractor

영상(MP4)에서 목소리만 깔끔하게 뽑아내는 macOS용 CLI 스크립트.
`ffmpeg`로 오디오를 추출하고 `demucs`로 보컬을 분리해 `output/voice.wav`로 저장합니다.

---

## 파이프라인

```
input.mp4
   │   ffmpeg (오디오만 추출 · 48kHz/24bit/stereo)
   ▼
full_audio.wav  (임시)
   │   demucs htdemucs_ft (보컬 분리)
   ▼
output/voice.wav
```

---

## 요구사항 (macOS)

- macOS 12 Monterey 이상 (Apple Silicon 권장)
- Python 3.10 이상
- Homebrew
- 여유 공간 3GB 이상 (모델 가중치 포함)

---

## 1. 설치

```bash
# 1) ffmpeg 설치
brew install ffmpeg

# 2) 가상환경 생성 + 활성화
python3 -m venv .venv
source .venv/bin/activate

# 3) 파이썬 패키지 설치
pip install -r requirements.txt
```

> 처음 실행하면 `demucs`가 모델 가중치를 자동 다운로드합니다 (~2GB).
> Wi-Fi 환경에서 첫 실행을 권장.

---

## 2. 실행

```bash
# 기본
python extract_voice.py input.mp4

# 출력 폴더 지정
python extract_voice.py input.mp4 -o my_output

# 빠른 모델 (속도 우선)
python extract_voice.py input.mp4 -m htdemucs

# full_audio.wav(원본 오디오)도 함께 보관
python extract_voice.py input.mp4 --keep-full
```

결과: `output/voice.wav` (48kHz, 24bit, stereo)

---

## 3. 모델 옵션

| 모델 | 속도 | 품질 | 추천 용도 |
|---|---|---|---|
| `htdemucs_ft` ⭐ | 느림 | **최상** | 최종 납품물 (기본) |
| `htdemucs` | 보통 | 좋음 | 빠른 프리뷰 |
| `mdx_extra` | 느림 | 좋음 | 음악 비중이 큰 영상 |
| `mdx_extra_q` | 빠름 | 보통 | 길이가 긴 영상 배치 |

---

## 4. 지원 입력 포맷

`.mp4`, `.mov`, `.webm`, `.mkv`, `.m4v`, `.avi`
(ffmpeg가 디코딩할 수 있는 대부분의 영상)

---

## 5. 자주 나오는 에러와 해결법

| 메시지 | 원인 | 해결 |
|---|---|---|
| `ffmpeg를 찾을 수 없어요` | Homebrew 미설치 | `brew install ffmpeg` |
| `demucs 패키지를 찾을 수 없어요` | 가상환경 비활성 | `source .venv/bin/activate` 후 재시도 |
| `MPS backend out of memory` | Apple Silicon GPU 메모리 초과 | 환경변수로 CPU 실행: `DEVICE=cpu python extract_voice.py input.mp4` |
| `모델 다운로드 실패` | 네트워크 끊김 | 재시도 또는 `~/.cache/torch/hub/checkpoints` 에서 수동 다운로드 |
| 처리가 너무 느림 | CPU 실행 | Apple Silicon에서 MPS가 활성인지 확인, Intel Mac이면 `htdemucs` 권장 |
| `vocals.wav 파일을 찾을 수 없어요` | demucs 출력 구조 이슈 | 스크립트 업데이트 또는 demucs 재설치 (`pip install -U demucs`) |

---

## 6. 폴더 구조

```
voice-extract/
├── extract_voice.py     # 메인 스크립트
├── requirements.txt     # 파이썬 의존성
├── README.md            # 이 문서
└── output/              # 실행 후 생성됨
    └── voice.wav
```

---

## 7. 옵션 요약

```
python extract_voice.py [-h] [-o OUTPUT] [-m MODEL] [--keep-full] input

인자:
  input                입력 영상 파일 (mp4, mov, webm, mkv, m4v, avi)

옵션:
  -o, --output  OUTPUT 출력 폴더 (기본: ./output)
  -m, --model   MODEL  보컬 분리 모델
                       {htdemucs_ft, htdemucs, mdx_extra, mdx_extra_q}
  --keep-full          full_audio.wav 도 output 폴더에 함께 저장
  -h, --help           도움말 표시
```

---

## 8. 참고

- 48kHz/24bit/stereo로 저장하는 이유: 후속 DAW(Logic, Premiere, DaVinci) 작업 여유 확보.
- 유튜브에서 받은 영상은 이미 압축된 오디오이므로, 보컬 분리 결과도 그 한계에 갇혀 있어요. 원본 영상일수록 결과가 깨끗합니다.
- 저작권은 본인 소유 또는 사용권이 확보된 콘텐츠에만 사용해 주세요.
