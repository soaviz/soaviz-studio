# SOAVIZ — Personal / Team 메뉴 분리 액션 플랜

**작성일**: 2026-05-07
**작성자**: Dario (Anthropic CEO 관점에서)
**상태**: Phase 0 완료 (오늘 푸시), Phase 1 진행 중
**목표 독자**: SOAVIZ 1인 창립자 (은교)

---

## 0. 요약 (TL;DR — 1분 안에 읽기)

| 항목 | 내용 |
|---|---|
| **결정** | 1개 제품, 진입점만 분리. 절대 2개 제품으로 가지 마라. |
| **이유** | "Personal → Team 확장"이 SOAVIZ의 정체성. 분리하면 메시지가 죽고 단가 점프(Studio +3배)가 안 일어남. |
| **현재 상태** | 시각적 분리 완료 (사이드바 탭, 색상, 메뉴). 데이터·API 레벨 차단 미완. |
| **다음 한 가지** | `index.html`을 두 갈래 진입점으로 분기 (`/personal` 인디고 / `/team` 오렌지). |
| **결제 연결 전 필수** | 프로젝트 ↔ Vault 1:1 바인딩. 안전장치 없이 결제 붙이면 회사 끝남. |

---

## 1. 핵심 의사결정 4가지

| # | 결정 | 근거 |
|---|---|---|
| **D1** | 1개 제품, 5개 플랜 (Free → Creator → Studio → Business → Enterprise) | Notion·Figma 모델. 사용자가 자연스럽게 위로 올라감 |
| **D2** | 진입점은 분리 (`/personal` vs `/team`) | 마케팅 메시지·타겟·가격이 다름. 컨버전을 위해 분리 |
| **D3** | 색상 컨텍스트 — Personal=인디고 #6366f1, Team=오렌지 #ff6b3f | "혼동 불가능"한 시각 신호. Status `delivered` 보라와 충돌 안 함 |
| **D4** | API 키는 BYOK (Bring Your Own Key) 강제 | SOAVIZ는 마진 없음 → "운영 OS"로 수익화 (Studio 좌석 단가) |

---

## 2. 메뉴 구조 명세

### 2.1 사이드바 — 워크스페이스 탭

```
┌──────────────────────────────────┐
│ ┌─────────┐┌─────────┐           │
│ │● 개인 작업││● 팀 작업 │  ← TAB   │
│ │ 혼자     ││ X Studio │           │
│ └─────────┘└─────────┘           │
├──────────────────────────────────┤
│  탭 활성화 = 인디고 / 오렌지       │
│  좌측 3px 컨텍스트 라인          │
└──────────────────────────────────┘
```

**규칙**: 탭은 항상 사이드바 최상단. 사용자는 페이지 상태와 관계없이 항상 컨텍스트 인지 가능.

### 2.2 메뉴 분리 매트릭스

| 메뉴 항목 | Personal 모드 | Team 모드 | 공통 |
|---|---|---|---|
| 🟣 내 API Vault | ✓ | — | — |
| 🟣 내 프로젝트 | ✓ | — | — |
| 🟣 내 라이브러리 | ✓ | — | — |
| 🟠 Workspace API Vault | — | ✓ | — |
| 🟠 팀 프로젝트 | — | ✓ | — |
| 🟠 팀 멤버 | — | ✓ | — |
| 🟠 Approval History | — | ✓ (Business+) | — |
| Today, Story, 캐릭터, 샷리스트 | ✓ | ✓ | 공통 (데이터 스코프만 다름) |
| Generate, Edit, Voice, Music, SFX | ✓ | ✓ | 공통 |
| Library, Settings, 가이드 | ✓ | ✓ | 공통 |

**구현 방식**: HTML 요소에 `data-ws="personal"` 또는 `data-ws="team"` 속성 부여. CSS로 `body.swb-ctx-personal [data-ws="team"] { display:none }` 처리. 공통 항목은 속성 없음.

### 2.3 진입점 분리

| URL | 페이지 | 톤 | 메인 CTA |
|---|---|---|---|
| `/` | 메인 (선택 입구) | 중립 | "어떻게 시작할까요?" 두 카드 |
| `/personal` | personal-onepager.html | 인디고, 솔로 작업실 | "베타 무료로 시작" |
| `/team` | sales-onepager.html | 오렌지, 협업 OS | "30분 데모 요청" |

---

## 3. 데이터 모델

### 3.1 핵심 엔티티

```typescript
type Project = {
  id: string;
  title: string;
  // 컨텍스트 — 한 번 정해지면 vault 라우팅이 결정됨
  workspaceType: 'personal' | 'team';
  workspaceId: string | null;        // null = personal
  vaultPolicy: 'personal-only' | 'workspace-only';
  // 메타
  createdBy: UserId;
  createdAt: number;
  updatedAt: number;
};

type Vault = {
  id: string;
  type: 'personal' | 'workspace';
  ownerId: UserId | WorkspaceId;
  keys: {
    [provider: 'kling' | 'runway' | 'openai' | 'elevenlabs']: EncryptedKey;
  };
};

type Generation = {
  id: string;
  shotId: string;
  projectId: string;
  // 생성 시점 스냅샷 — 절대 변경되지 않음
  apiSource: 'personal' | 'workspace';
  vaultId: string;
  triggeredBy: UserId;
  triggeredContext: 'personal' | 'team';   // UI 컨텍스트 (감사용)
  cost: number;
  status: 'pending' | 'success' | 'failed';
  createdAt: number;
};
```

### 3.2 핵심 원칙

1. **Project가 Vault를 결정한다.** UI 컨텍스트가 아니라 프로젝트 자체의 `workspaceType`이 라우팅 기준.
2. **Generation은 immutable 스냅샷.** 한 번 만들어진 generation의 `apiSource`는 절대 변경 안 됨.
3. **Personal Vault는 사용자 기기에서 암호화** (AES-GCM 256, PBKDF2 250k). 서버에 평문 저장 금지.
4. **Workspace Vault는 워크스페이스 관리자만 키 등록**. 멤버는 사용만 가능, 키 값 조회 불가.

---

## 4. 실제 구동 아키텍처

### 4.1 API 호출 라우팅

```
[사용자 액션] 샷 S004 생성 클릭
        ↓
[Project lookup] project.workspaceType = 'team'
                 project.workspaceId = 'ws_x_studio'
                 project.vaultPolicy = 'workspace-only'
        ↓
[Vault routing] WorkspaceVault('ws_x_studio')
        ↓
[Key fetch] vault.getKey('kling') → 암호화된 키 가져옴
        ↓
[확인 모달] "이 샷은 Workspace API · X Studio로 생성됩니다. 비용 $0.84"
            [취소] [생성하기]
        ↓
[복호화 + API 호출] 본인 패스프레이즈로 복호화 → Kling API
        ↓
[Generation 레코드 저장]
  apiSource: 'workspace'
  vaultId: 'ws_x_studio_kling'
  triggeredBy: '은교'
  triggeredContext: 'team'    # UI 컨텍스트
  cost: 0.84
        ↓
[샷 업데이트] 결과 영상 URL + 비용 누적
```

**보안 핵심**: UI 컨텍스트(`triggeredContext`)와 실제 vault(`apiSource`)는 별도 기록. 만약 두 값이 달라지면 (예: 사용자가 팀 모드 보면서 개인 키로 호출) 즉시 경고/차단.

### 4.2 컨텍스트 전환 처리

```
[탭 전환: Personal → Team]
        ↓
[검사] 현재 진행 중인 generation 큐 있는가?
        ↓
   YES → 모달: "진행 중 작업 3개. 그대로 끝낼까요?"
          [계속 진행] = 진행 중 작업은 personal 키로 완료, 새 작업만 workspace 키
          [취소] = 탭 전환 안 함
   NO  → 즉시 전환
        ↓
[body class 갱신, 사이드바 탭, 메뉴 표시 업데이트]
[localStorage에 마지막 컨텍스트 저장]
```

### 4.3 BYOK 키 저장 구조

```
사용자 기기 (브라우저)
├── localStorage
│   ├── soaviz.vault.personal.{userId}     ← 암호화 (PBKDF2 + AES-GCM)
│   │   {
│   │     "kling": "ciphertext...",
│   │     "runway": "ciphertext...",
│   │     ...
│   │   }
│   └── soaviz.vault.workspace.{workspaceId} ← 워크스페이스 키 (관리자만)
│
SOAVIZ 서버
├── 키 저장 X (절대 평문 보지 않음)
└── 메타데이터만:
    {
      "userId": "u_은교",
      "vaults": ["personal", "ws_x_studio"],
      "lastUsed": { "kling": 1715000000 }
    }
```

**키 입력 흐름**: 사용자가 키 등록 → 패스프레이즈로 암호화 → localStorage 저장 → 사용 시 패스프레이즈 입력 → 메모리 복호화 → API 호출 → 메모리 즉시 클리어.

---

## 5. 구축 로드맵

### Phase 0 — 완료 (오늘, 5월 7일)

| 작업 | 상태 |
|---|---|
| 사이드바 워크스페이스 탭 + 메뉴 분리 | ✅ |
| Personal 인디고 / Team 오렌지 컨텍스트 색 | ✅ |
| Workbench 통합 + 5탭 (Overview / Shot Board / Shot DB / Review / Delivery) | ✅ |
| 로그인 팝업 mobile redirect 픽스 | ✅ |
| sales-onepager.html (팀용) | ✅ |
| personal-onepager.html (개인용) | ✅ |
| Push to origin/main | ✅ (commit `6b00e8e`) |

### Phase 1 — 이번주 (5월 8일~12일)

| # | 작업 | 시간 | 파일 |
|---|---|---|---|
| 1 | `index.html`을 두 갈래 진입점으로 분기 | 2시간 | `index.html` |
| 2 | `vercel.json` rewrite 추가 (`/personal`, `/team`) | 30분 | `vercel.json` |
| 3 | personal-onepager 푸시 (이미 작업) | 5분 | git |
| 4 | Phase 1 통합 push | 5분 | git |

**완료 기준**: `soaviz.studio/personal` 클릭 시 인디고 onepager / `/team` 클릭 시 오렌지 onepager가 라이브에서 보임.

### Phase 2 — 다음주 (5월 13일~19일) — 핵심

| # | 작업 | 시간 | 위험도 |
|---|---|---|---|
| 1 | `Project` 스키마에 `workspaceType`, `workspaceId`, `vaultPolicy` 필드 추가 | 1일 | 중간 (마이그레이션 필요) |
| 2 | 기존 프로젝트 마이그레이션 스크립트 (모두 `personal` 기본값) | 0.5일 | 낮음 |
| 3 | `Vault` 엔티티 분리 — Personal / Workspace 2개 클래스 | 2일 | 중간 |
| 4 | `callModel(shotId)` 라우팅 함수 작성 + 단위 테스트 | 1.5일 | 높음 (보안 핵심) |
| 5 | 잘못된 매칭 시 throw하는 가드 추가 (예: 팀 프로젝트가 개인 키로 호출 시도) | 0.5일 | 높음 |

**완료 기준**: "팀 프로젝트가 개인 키로 호출되면 throw" 테스트 통과. 7가지 사고 시나리오 중 5개 자동 차단.

### Phase 3 — 결제 연결 직전 (5월 20일~26일)

| # | 작업 | 시간 |
|---|---|---|
| 1 | 생성 직전 확인 모달 UI (모델 + API 출처 + 비용) | 1일 |
| 2 | Generation 레코드 DB 테이블 + 스냅샷 저장 | 1일 |
| 3 | Audit Log Export (PDF, Business 플랜용) | 1.5일 |
| 4 | 컨텍스트 lock during generation | 0.5일 |
| 5 | 통합 E2E 테스트 (personal/team 모든 시나리오) | 1일 |

**완료 기준**: Stripe 연동 가능 상태. 사고 발생 가능성 0%.

### Phase 4 — Stripe 연결 (5월 27일~)

| # | 작업 | 시간 |
|---|---|---|
| 1 | Creator $19 / Studio $59 / Business $199 Stripe 결제 흐름 | 3일 |
| 2 | `onSwbStartTeam()` → 실제 결제 페이지 연결 | 0.5일 |
| 3 | 결제 완료 후 워크스페이스 자동 생성 | 0.5일 |
| 4 | 베타 사용자 50% 할인 코드 발급 | 0.5일 |

---

## 6. 운영 안전장치 (Phase 2-3에서 구현)

### 6.1 7가지 사고 시나리오 vs Mitigation

| # | 시나리오 | Mitigation | Phase |
|---|---|---|---|
| 1 | 팀 모드에서 개인 키 등록 | 워크스페이스 vault에는 워크스페이스 키만 저장 가능 | 2 |
| 2 | 생성 중 컨텍스트 전환 → race condition | Generation 시작 시 컨텍스트 스냅샷 + lock | 3 |
| 3 | 팀원이 워크스페이스 키 본인 라이브러리에 복사 | 키 복호화 권한은 본인 패스프레이즈만 | 2 |
| 4 | 팀 키 미연결 → 폴백 시도 | `vaultPolicy: 'workspace-only'` 위반 시 throw | 2 |
| 5 | 같은 모델 양쪽 등록 | 프로젝트의 `vaultPolicy`로 강제 라우팅 | 2 |
| 6 | 외주 후 컨텍스트 전환 시 권리 모호 | Generation 레코드에 `triggeredContext` 영구 기록 | 3 |
| 7 | 납품 직전 컨텍스트 변경 | Approved 샷은 컨텍스트 변경 시 경고 모달 | 3 |

### 6.2 사용자 경험 보호

- **모든 생성 직전 확인 모달** — 모델 / 키 출처 / 비용 / 청구 대상 명시
- **Audit Log 실시간** — 사이드바에서 "최근 생성" 빠르게 확인 가능
- **컨텍스트 mismatch 경고 배너** — 팀 모드에서 개인 프로젝트를 보면 "현재 컨텍스트와 다른 프로젝트입니다" 표시

---

## 7. 의사결정 매트릭스

| 질문 | 결정 | 이유 |
|---|---|---|
| 메인 도메인을 두 개로 분리? | ❌ NO. `soaviz.studio` 한 도메인 + 경로 분기 | 운영 부담, SEO 분산 |
| Personal과 Team의 데이터를 완전히 별도 DB? | ✅ YES (논리적 분리). 같은 DB지만 `workspaceType`으로 strict 격리 | 마이그레이션 부담 vs 보안 |
| 공통 메뉴(Today, Story 등)도 분리? | ❌ NO. 도구는 공통, 데이터 스코프만 다름 | 코드 중복 방지 |
| Generation 레코드를 컨텍스트별로 분리? | ❌ NO. 한 테이블 + `apiSource` 컬럼 | 통계·감사 편의성 |
| 결제는 Personal과 Team 별도? | ✅ YES. Stripe Customer 별도 + 청구 분리 | 회계상 깔끔 |
| 베타 사용자가 Personal/Team 둘 다 무료? | ✅ YES (베타 한정). 정식 출시 후 Studio 50% 할인 | 베타 가치 명확 |

---

## 8. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| Phase 2 마이그레이션 실패 (기존 프로젝트 손실) | 🔥 사용자 데이터 손실 | 백업 → 마이그레이션 → 검증 → 롤아웃. 베타 사용자에게 1주일 전 공지 |
| BYOK 키 유출 (사용자 기기 해킹) | 🔥 사용자 API 비용 폭증 | 패스프레이즈 강제 + 자동 만료 옵션. 보안 가이드 문서화 |
| 컨텍스트 전환 race condition | 중간 | Generation 큐가 비었을 때만 즉시 전환. 큐 있으면 lock 모달 |
| Personal → Team 전환 시 데이터 불일치 | 중간 | 전환 시 atomic transaction. 실패 시 롤백 |
| 사용자가 BYOK 설정을 못 함 (UX 진입 장벽) | 높음 | 가이드 영상 + step-by-step 마법사. Demo 크레딧으로 첫 사용 유도 |

---

## 9. 다음 액션 (지금 결정)

### Phase 1 시작 — 첫 한 가지

**`index.html`을 두 갈래 진입점으로 분기.** 작업량 2시간, 즉각적 마케팅 효과.

작업 명세:
1. 메인 Hero 아래 **두 카드** 추가 (`/personal` / `/team`)
2. 각 카드에 인디고 / 오렌지 색조
3. 스크롤 시 두 카드가 더 강조되게 sticky 효과
4. 카드 클릭 → 해당 onepager로 라우팅

완료 후 → Phase 1 통합 push → Phase 2 (데이터 모델) 시작.

### 동시 진행 (병렬 가능)

- **베타 사용자에게 새 사이드바 안내 메일** (선택)
- **personal-onepager 정확성 검토** (1인 크리에이터 5명에게 보여주고 피드백)

---

## 10. 한 줄 결론 (CEO로서)

> **하나의 제품, 두 개의 입구, 강력한 안전장치. 이 세 가지만 지키면 SOAVIZ는 1인 크리에이터부터 글로벌 스튜디오까지 같은 OS에서 작동한다.**

분리하지 마. 안전장치 잘 만들어. 결제 붙이기 전에 Phase 2 끝내. 그게 다야.

---

## 부록 A — 현재 파일 구조

```
soaviz-studio/
├── index.html                 ← 메인 (Phase 1에서 두 카드 분기)
├── personal-onepager.html     ← 개인 onepager (인디고)
├── sales-onepager.html        ← 팀 onepager (오렌지)
├── soaviz-studio.html         ← 본 앱 (Workbench 통합 완료)
├── signup.html                ← 로그인 (popup mobile redirect 픽스 완료)
├── mobile.html                ← 모바일 앱
├── mockup-shot-board.html     ← Shot Board 디자인 목업
├── server.js                  ← 백엔드 (CORS Vercel 도메인 추가됨)
├── vercel.json                ← Phase 1에서 rewrite 추가 예정
└── ACTION_PLAN_2026-05-07.md  ← 본 문서
```

## 부록 B — 핵심 색상 코드

```css
/* Personal (인디고) */
--ctx-personal: #6366f1;
--ctx-personal-soft: rgba(99, 102, 241, 0.10);
--ctx-personal-border: rgba(99, 102, 241, 0.45);

/* Team (오렌지 = 브랜드) */
--ctx-team: #ff6b3f;
--ctx-team-soft: rgba(255, 107, 63, 0.10);
--ctx-team-border: rgba(255, 107, 63, 0.45);

/* Status (변경 금지 — 컨텍스트와 무관) */
--status-planning: #6b7280;
--status-production: #f0c419;
--status-review: #3b82f6;
--status-approved: #10b981;
--status-delivered: #8b5cf6;   /* 보라 — 인디고와 충돌 안 함 */
```

## 부록 C — 푸시 명령어 템플릿

```bash
cd ~/Desktop/soaviz-studio && \
  rm -f .git/index.lock && \
  git add -A && \
  git commit -m "feat(<scope>): <message>" && \
  git push origin main
```

---

**문서 버전**: v1.0
**다음 갱신 예정**: Phase 1 완료 시 (5월 12일경) → v1.1
**책임자**: 은교 (의사결정) · CEO Dario (전략 검토)
