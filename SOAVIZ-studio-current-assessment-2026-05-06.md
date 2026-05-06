# SOAVIZ Studio Current Assessment

작성일: 2026-05-06  
분석 기준: OpenAI식 AI 플랫폼/제품 CEO 관점  
대상 파일: `SOAVIZ-progress-dashboard-v4.html`, `soaviz-studio.html`, `index.html`

## 총평: 현재 SOAVIZ Studio 점수

**전체 점수: 72 / 100**

이 리포트는 OpenAI식 AI 플랫폼/제품 CEO 관점, 즉 첫 사용자 가치, 결과물 완성도, 워크플로우 연결성, 수익화 연결성, 신뢰성/안정성을 중심으로 SOAVIZ Studio를 평가한 문서입니다.

현재 SOAVIZ Studio는 "AI 영상 제작 OS"라는 방향성은 좋습니다. 문제는 기능이 부족한 것이 아니라, 핵심 수익 루프가 아직 닫히지 않았고 첫 사용자가 어디서 시작해서 어떤 결과를 얻어야 하는지가 분산되어 있다는 점입니다.

OpenAI 대표 또는 AI 플랫폼 CEO 관점에서 지금 가장 중요한 질문은 하나입니다.

> 사용자가 2분 안에 "이건 돈 낼 만하다"고 느끼는 단일 결과물을 만들 수 있는가?

현재는 Create, Pipeline, Characters, Key Image, Generate, Edit, Voice, Music, Audio, Compare가 모두 존재하지만, 첫 유료 성공 경험이 하나로 압축되어 있지 않습니다. 사이드바와 `NAV_MAP`에는 신규 페이지와 기존 라우트 호환용 alias가 함께 남아 있어 구조가 커졌고, `voice-studio -> studio`, `video-studio -> sync`, `transcript -> extract`처럼 이름과 실제 페이지가 다르게 연결됩니다.

## 대표 관점 최종 판단

현재 SOAVIZ Studio는 아이디어와 화면 밀도는 이미 충분합니다. 부족한 것은 더 많은 기능이 아니라 다음 세 가지입니다.

```text
1. 첫 사용자가 바로 성공하는 단일 루프
2. 결제 가능한 크레딧 기반 수익 구조
3. mock이 아닌 실제 생성 결과에 대한 신뢰
```

가장 강하게 밀어야 할 포지션은 다음과 같습니다.

> **AI 영상 제작자를 위한 결과 중심 Creative OS - 시나리오부터 샷리스트, 키이미지, 영상 편집, Export까지 한 번에 끝내는 제작 루프.**

현재는 **기술 데모 72점**입니다. 결제, 온보딩, mock 제거만 끝내면 **초기 SaaS MVP 기준 82~86점**까지 올라갈 수 있습니다.

## 1순위 보완: 결제와 크레딧 루프 완성

**중요도: 10 / 10**

현재 `soaviz-studio.html`에는 Stripe 결제 구조가 들어가 있지만 `stripeUrls.standard`, `stripeUrls.pro`, `checkoutUrl`이 모두 `null`입니다. 즉, 사용자가 결제 버튼을 눌러도 실제 결제로 이어지지 않습니다.

또한 결제 URL이 없으면 "결제 페이지가 곧 오픈됩니다" 토스트만 뜨도록 되어 있습니다. 결제 모달과 Stripe 이동 구조는 준비되어 있으나, 실제 매출 전환은 막혀 있습니다.

### 바로 해야 할 것

| 우선순위 | 작업 |
| ---: | --- |
| 1 | Stripe Payment Link 실제 URL 입력 |
| 2 | Free / Standard / Pro 플랜별 크레딧 차감 로직 확정 |
| 3 | 결제 성공 후 `soaviz.user.plan` 자동 업데이트 |
| 4 | Generate / Key Image / Compare / Export 버튼에 크레딧 차감 표시 |
| 5 | 결제 실패, 취소, 성공 상태 UI 추가 |

**대표 관점 판단:**  
지금은 제품이 "써볼 수 있는 앱"에 가깝고, "돈 받는 SaaS"까지는 마지막 20%가 비어 있습니다. 가장 먼저 결제 루프부터 닫아야 합니다.

## 2순위 보완: 첫 진입 루트 하나로 고정

**중요도: 9.5 / 10**

현재 첫 화면은 기본적으로 `today`로 진입하도록 되어 있고, `voice`, `voices`, `transcript`, `audio`, `extract`, `studio`, `landing` 등은 초기 홈으로 들어오지 못하도록 막는 처리도 들어가 있습니다. 동시에 landing에는 "베타 무료로 시작하기", "Pipeline 살펴보기" CTA가 있습니다.

이 구조는 내부 사용자는 편하지만, 신규 사용자는 "무엇부터 해야 하지?"라는 혼란을 느낄 수 있습니다.

### 추천 단일 루트 A: 빠른 PMF 루트

```text
Landing
-> 샘플로 체험하기
-> Video Editor 온보딩
-> 15초 샘플 영상 자동 분석
-> A/B/C 버전 제안
-> Export 시 크레딧 차감
-> Upgrade
```

### 추천 단일 루트 B: SOAVIZ 정체성 강화 루트

```text
Landing
-> 세계관 & 시나리오
-> 샷리스트 자동 생성
-> 키이미지 제작
-> 영상 생성 / 편집
-> Export
-> Upgrade
```

둘 중 하나만 메인 루트로 고정해야 합니다. 현재처럼 Create, Pipeline, Video Editor가 동시에 첫 루트 후보로 보이면 제품 포지셔닝이 흐려집니다.

## 3순위 보완: Mock fallback 정리

**중요도: 9 / 10**

키이미지 제작기는 `/api/character-key-image/generate` 엔드포인트를 호출하고, 실패 시 mock 이미지를 반환하는 fallback 구조가 있습니다. API 오류가 나도 mock 결과를 만들어 보여주는 방식은 개발 중에는 좋지만, 실제 유료 사용자에게는 신뢰를 크게 떨어뜨릴 수 있습니다.

### 바로 해야 할 것

| 현재 | 수정 방향 |
| --- | --- |
| API 실패 시 mock fallback | "Demo Mode"로 명확히 분리 |
| Mock 이미지도 결과 카드에 노출 | 유료/실사용 플로우에서는 차단 |
| 이미지 URL 없으면 다운로드 불가 | 생성 전 API 연결 상태 체크 |
| OpenAI 키 없으면 에러 | Settings에서 바로 키 등록 또는 서버 키 사용 방식 선택 |

**대표 관점 판단:**  
AI 제품에서 가장 중요한 것은 "와, 진짜 된다"입니다. Mock은 사용자가 한 번만 알아차려도 신뢰가 떨어집니다.

## 4순위 보완: 메뉴 수 줄이기

**중요도: 8.8 / 10**

현재 앱은 `page-*` 기준으로 27개 화면이 존재합니다. 실제 사이드바에는 Today, Create, Projects, Pre Production, Characters, Style, Cinema, Generate, Edit, Voice, Music, SFX, Audio, Library, Guide, Settings, Admin 등이 노출됩니다. 라우트 alias도 함께 남아 있습니다.

### 추천 사이드바 구조

```text
Today
Create
Characters
Pre Production
Generate
Edit
Assets
Library
Settings
```

### 흡수할 메뉴

| 현재 메뉴 | 처리 |
| --- | --- |
| Voice | Assets 안으로 이동 |
| Music | Assets 안으로 이동 |
| SFX | Assets 안으로 이동 |
| Audio | Assets 대표 메뉴로 통합 |
| Cinema | Style 안의 Reference 탭으로 이동 |
| Compare | Generate/Edit 내부 기능으로 이동 |
| Memory Graph | Library 내부 고급 기능으로 숨김 |
| Project Archive | Library 내부 Export 탭으로 이동 |
| Admin | 개발자 전용 URL로 분리 |

**대표 관점 판단:**  
초기 SaaS는 메뉴가 많을수록 강해 보이는 것이 아니라, 미완성처럼 보일 위험이 큽니다. 핵심 루프를 방해하는 메뉴는 숨기는 것이 맞습니다.

## 5순위 보완: 데이터 저장 구조 정리

**중요도: 8.5 / 10**

현재 앱은 `localStorage`, IndexedDB, Supabase/R2 health check가 섞여 있습니다. 부팅 시 `checkBackend`, `checkSupabaseHealth`, `checkR2Health`를 주기적으로 실행하는 구조는 좋지만, 실제 사용자 프로젝트가 어디에 저장되는지 제품 신뢰 측면에서는 더 명확해야 합니다.

### 추천 저장 계층

```text
Guest Mode: localStorage / IndexedDB
Signed-in Mode: Supabase projects, assets, outputs
Paid Mode: R2 storage + credit ledger + export history
```

**대표 관점 판단:**  
창작자는 결과물을 잃어버리는 것을 가장 싫어합니다. 저장 안정성은 기능보다 먼저 신뢰를 만듭니다.

## 6순위 보완: 법적, 상업용 안전성 강화

**중요도: 8 / 10**

오디오 에셋 라이브러리에는 권리 확인 체크박스, 출처 정보, 사용 목적, SOAVIZ 책임 제한 확인 로직이 들어가 있습니다. 이는 좋은 방향입니다.

다만 이 구조를 오디오에만 두면 부족합니다. 영상, 이미지, 보이스, 레퍼런스, Cinema Library에도 같은 방식의 **상업용 안전성 기록**이 붙어야 합니다.

### 추가해야 할 기록

| 대상 | 필요한 기록 |
| --- | --- |
| Key Image | 프롬프트, 참조 이미지 출처, 모델명, 생성일 |
| Video | 모델명, 입력 이미지/오디오 출처, 사용권 |
| Voice | 보이스 소유권, 클론 여부, 상업 사용 가능 여부 |
| Cinema Reference | URL, 원작자, 스타일 추출 여부, 저작권 고지 |
| Export | 최종 결과물의 권리 로그 자동 첨부 |

## 페이지별 점수

### 평가 기준

| 기준 | 비중 |
| --- | ---: |
| 첫 사용자 가치 | 30 |
| 결과물 완성도 | 25 |
| 워크플로우 연결성 | 20 |
| 수익화 연결성 | 15 |
| 신뢰성 / 안정성 | 10 |

### 상세 평가

| 페이지 | 점수 | 평가 이유 |
| --- | ---: | --- |
| Landing | 74 | 비주얼과 메시지는 좋습니다. "AI가 만든다. 당신이 완성한다"는 카피도 명확합니다. 다만 CTA가 실제 유료 전환 또는 즉시 결과 생성으로 강하게 이어지지 않습니다. |
| Today | 78 | 내부 대시보드로는 좋습니다. 이어서 작업, 새 작품 시작, 스토리보드 열기 흐름이 있습니다. 단, 신규 사용자에게는 빈 상태가 약할 수 있습니다. |
| Create / Personas | 84 | 현재 가장 강한 페이지입니다. 세계관 -> 스토리 -> 시나리오 -> TTS/영상 연결 흐름이 분명합니다. |
| Story View | 63 | 결과 보기, 복사, TTS 연결은 유용하지만 Create 페이지 내부 결과 화면과 역할이 겹칩니다. 별도 페이지로 유지할 필요는 낮습니다. |
| Projects | 68 | 프로젝트 관리 기능은 필요하지만, 첫 프로젝트 생성 전 empty state가 더 강해야 합니다. "샘플 프로젝트로 시작"이 필요합니다. |
| Pre Production / Pipeline | 80 | 샷리스트, Pipeline Board, 스크립트 에디터가 있어 SOAVIZ의 핵심 차별점이 됩니다. 다만 프로젝트 선택 전에는 빈 화면 감각이 강합니다. |
| Characters | 82 | 캐릭터 생성, 준비도, 보이스, 사진, 키이미지 연결이 좋아 IP 제작 플랫폼의 방향성이 잘 보입니다. |
| Key Image Studio | 70 | 기능 방향은 매우 좋습니다. 하지만 API 실패 시 mock fallback이 남아 있어 실제 신뢰 점수가 낮아집니다. |
| Style | 69 | 룩북과 레퍼런스 구조는 필요합니다. 단, 실제 생성 프롬프트에 자동 반영되는 체감이 더 강해야 합니다. |
| Cinema Library | 65 | 참고 영상 -> Style Bible 변환은 신선합니다. 다만 MVP 단계에서는 고급 기능이라 핵심 루프 뒤로 빼는 것이 맞습니다. |
| Generate / Video Studio | 73 | Video Model Router 컨셉은 강합니다. 하지만 실제 모델 접근, 비용, 결과 생성 안정성이 증명되어야 점수가 올라갑니다. |
| Edit / Video Editor | 86 | 현재 가장 유료화 가능성이 높은 화면입니다. 샘플 영상, 자동 분석, 편집, 렌더, export로 이어질 수 있기 때문입니다. 이 페이지를 메인 온보딩으로 끌어올리는 것이 좋습니다. |
| Compare Mode | 77 | A/B/C 동시 생성 후 베스트 채택은 SaaS 차별점이 됩니다. 다만 단독 메뉴보다는 Generate 또는 Edit 내부 기능으로 넣는 편이 좋습니다. |
| Voice / TTS Studio | 75 | 텍스트 입력 -> 보이스 선택 -> 감정/속도 조절 -> 오디오 저장 흐름이 명확합니다. 다만 Voices와 통합하는 것이 좋습니다. |
| Voices Library | 62 | 보이스 탐색 자체는 필요하지만 독립 페이지로는 약합니다. TTS Studio 내부 탭으로 유지하는 편이 맞습니다. |
| Music | 70 | 영상 제작 보조 기능으로 좋습니다. 단, 메인 유료 전환 기능은 아닙니다. Assets 또는 Generate 보조 패널로 이동 가능성이 큽니다. |
| SFX | 67 | 효과음 생성은 useful feature입니다. 하지만 MVP 핵심은 아닙니다. Music과 함께 Assets로 묶는 것이 좋습니다. |
| Audio / Extract | 78 | 오디오 에셋 저장, 출처, 법적 동의 구조가 좋아 신뢰도가 높습니다. 이 페이지는 Assets 대표 메뉴로 통합하는 것이 적절합니다. |
| Clean / Voice Isolator | 60 | 기능은 유용하지만 Audio/Extract와 중복됩니다. 별도 페이지보다 Audio 내부 기능으로 흡수해야 합니다. |
| Library | 66 | 결과 보관은 필수입니다. 다만 결과가 없을 때의 설득력이 낮고, "채택 -> 재사용 -> export" 루프가 더 강해야 합니다. |
| History / Production Log | 64 | 제작 기록은 좋지만, 초기 사용자가 돈 내는 이유는 아닙니다. Today 하위 또는 Library 하위로 넣는 것이 적절합니다. |
| Project Archive | 56 | 완료 프로젝트 보관은 나중 기능입니다. 현재는 Library Export 탭으로 충분합니다. |
| Memory Graph | 60 | 비전은 좋지만 데이터가 쌓이기 전에는 과해 보입니다. 초기에는 숨기고, 채택 데이터가 20개 이상 쌓였을 때 노출하는 것이 좋습니다. |
| Shot Detail | 55 | Pipeline 내부 상세 화면으로는 필요하지만 독립 페이지로는 약합니다. 현재는 비어 보일 위험이 큽니다. |
| Settings | 65 | Account, Workspace, Storage, Billing 구조는 필요합니다. 다만 API Vault가 숨김 처리되어 있고, 보안 모델 설명이 복잡합니다. |
| Credits / Pricing | 58 | 가격표는 있지만 결제 URL이 비어 있어 실제 전환 점수가 낮습니다. 결제 연결 즉시 75점 이상으로 올라갈 수 있습니다. |
| Admin | 45 | 운영 지표 대시보드 방향은 맞지만, 클라이언트 HTML 내부 admin은 실제 서비스 보안 관점에서 위험합니다. 별도 관리자 서버/권한 구조로 분리해야 합니다. |
| Guide / Docs Modal | 70 | 인앱 문서 모달은 좋습니다. 다만 핵심 온보딩이 부족한 상태에서는 문서보다 "샘플 자동 실행"이 더 중요합니다. |

## 가장 빠른 보완 순서

이번에 바로 고칠 순서는 다음과 같습니다.

```text
1. Stripe 결제 URL 실제 연결
2. Landing CTA 하나로 통일
3. 첫 진입을 Video Editor 온보딩 또는 Create -> Shotlist 루프로 고정
4. Mock fallback을 Demo Mode로 분리
5. 사이드바 9개 이하로 축소
6. Generate / Key Image / Export에 크레딧 차감 표시
7. Guest / Signed-in / Paid 저장 구조 분리
8. Admin 페이지 숨김 또는 별도 관리자 URL로 분리
9. Audio의 법적 동의 구조를 Video / Image / Voice에도 확장
10. index.html과 soaviz-studio.html 중 배포 기준 파일 하나로 통일
```

## 실행 로드맵

### P0: 매출 루프 닫기

1. Stripe Payment Link를 `standard`, `pro` 플랜에 연결합니다.
2. 결제 성공, 실패, 취소 상태를 UI에 표시합니다.
3. Export, Generate, Key Image, Compare에 예상 크레딧 차감량을 표시합니다.
4. 크레딧 부족 시 Upgrade 모달로 연결합니다.

### P1: 첫 성공 경험 고정

1. Landing CTA를 하나의 메인 행동으로 통일합니다.
2. 신규 사용자의 첫 루트를 Video Editor 온보딩 또는 Create -> Shotlist 루프로 고정합니다.
3. 샘플 프로젝트 또는 샘플 영상으로 2분 내 결과물을 만들 수 있게 합니다.

### P2: 신뢰성 정리

1. Mock fallback을 Demo Mode로 분리합니다.
2. 실제 생성 실패는 명확한 에러와 재시도 UI로 처리합니다.
3. Guest, Signed-in, Paid 저장 정책을 UI와 데이터 구조에 반영합니다.
4. 이미지, 영상, 보이스, 레퍼런스, Export에 상업용 권리 로그를 붙입니다.

### P3: 제품 구조 단순화

1. 사이드바를 9개 이하로 줄입니다.
2. Voice, Music, SFX, Audio를 Assets로 통합합니다.
3. Compare는 Generate/Edit 내부 기능으로 흡수합니다.
4. Admin은 클라이언트 앱에서 숨기고 별도 관리자 URL 또는 권한 구조로 분리합니다.

## 결론

SOAVIZ Studio는 이미 화면의 양과 아이디어의 밀도는 충분합니다. 다음 단계의 핵심은 기능 추가가 아니라, 사용자가 처음 들어와서 결과물을 만들고, 저장하고, 결제까지 가는 단일 루프를 닫는 것입니다.

가장 큰 기회는 **Edit / Video Editor를 첫 온보딩 경험으로 끌어올리는 것**입니다. 이 화면은 샘플 영상, 자동 분석, 버전 제안, 편집, export, upgrade까지 이어질 수 있어 현재 제품 안에서 가장 빠르게 유료 전환을 증명할 수 있는 지점입니다.
