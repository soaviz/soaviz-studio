# SOAVIZ Design System

**Version**: 1.0
**Last updated**: 2026-05-07
**Theme**: Dark cinematic only (no light mode in v1)
**Owner**: 은교

---

## 0. 디자인 철학

| 원칙 | 의미 |
|---|---|
| **Cinematic, not corporate** | 영화관 같은 어둠. SaaS 화이트 보드 느낌 X |
| **Context over decoration** | Personal/Team 컨텍스트는 항상 시각적으로 분리 |
| **Quiet precision** | 차분한 색감 + 명확한 위계. 강조는 1개 액센트로만 |
| **One unit, many views** | Shot이라는 한 단위가 보드/테이블/갤러리/리뷰/납품으로 변신 |

---

## 1. Brand Identity

### 1.1 로고 / 워드마크

```
SOAVIZ
```

| 항목 | 값 |
|---|---|
| 폰트 | Inter / Pretendard (extra bold 800) |
| 크기 | 18px |
| 자간 | 1.5px |
| 색상 | `var(--accent)` (컨텍스트에 따라 인디고/오렌지) |

### 1.2 태그라인

| 사용처 | 카피 |
|---|---|
| 메인 (중립) | "AI 영상 제작 OS — 혼자 시작하고, 팀으로 확장하세요." |
| Personal 진입 | "AI 영상, 혼자 시작하세요." |
| Team 진입 | "AI 영상 제작, 팀으로 만드세요." |

---

## 2. 색상 시스템

### 2.1 베이스 (Surface)

| 변수 | HEX | 용도 |
|---|---|---|
| `--bg` | `#0a0a0b` | 페이지 배경 (가장 어두움) |
| `--bg-2` | `#0f0f12` | 섹션 구분 배경 |
| `--surface` | `#15151a` | 카드, 사이드바 |
| `--surface-2` | `#1c1c22` | 카드 내부 (한 단계 위) |
| `--surface-3` | `#25252d` | 버튼 기본, 인풋 배경 |
| `--border` | `#2a2a32` | 기본 보더 |
| `--border-light` | `#35353f` | hover 보더, 강조 보더 |

### 2.2 텍스트

| 변수 | HEX | 대비비 | 용도 |
|---|---|---|---|
| `--text` | `#e8e8ea` | 14:1 | 메인 텍스트 |
| `--text-2` (`--text-dim`) | `#8e8e95` | 5.7:1 | 보조 텍스트 |
| `--text-3` (`--text-faint`) | `#5e5e65` | 3.5:1 | 메타·라벨 |

### 2.3 컨텍스트 색 (★ 핵심)

| 컨텍스트 | HEX | RGB | Soft (10%) | Border (45%) |
|---|---|---|---|---|
| **Personal (인디고)** | `#6366f1` | `99, 102, 241` | `rgba(99,102,241,0.10)` | `rgba(99,102,241,0.45)` |
| **Team (오렌지/브랜드)** | `#ff6b3f` | `255, 107, 63` | `rgba(255,107,63,0.10)` | `rgba(255,107,63,0.45)` |

**규칙**:
- Personal과 Team은 절대 같은 화면에 동시 노출 금지
- 컨텍스트 전환 시 사이드바 좌측 3px 라인 + 배지 + AI Producer 헤더가 동시에 색 변경
- Status 색(아래)과 충돌 없음

### 2.4 Status 색 (Shot 5단계)

| 상태 | HEX | 라벨 | 의미 |
|---|---|---|---|
| Planning | `#6b7280` | 기획 | 회색 (시작 전) |
| Production | `#f0c419` | 제작 중 | 노랑 (진행) |
| In Review | `#3b82f6` | 리뷰 중 | 파랑 (대기) |
| Approved | `#10b981` | 승인 완료 | 초록 (성공) |
| Delivered | `#8b5cf6` | 납품 완료 | 보라 (완결) |

**규칙**: Status 색은 컨텍스트와 무관. Personal/Team 어느 모드에서든 동일.

### 2.5 의미 색 (Semantic)

| 변수 | HEX | 용도 |
|---|---|---|
| `--success` | `#10b981` | 승인, 완료, 성공 |
| `--warning` | `#f59e0b` | 경고, 임박 |
| `--danger` | `#ef4444` | 실패, 삭제, 위험 |
| `--info` | `#3b82f6` | 정보, 알림 |

---

## 3. 타이포그래피

### 3.1 폰트 스택

```css
font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Inter',
             'Segoe UI', sans-serif;
```

### 3.2 타입 스케일

| 토큰 | 크기 | 굵기 | 자간 | 행간 | 용도 |
|---|---|---|---|---|---|
| `.h1` | 56px | 800 | -1.5px | 1.1 | Hero 타이틀 |
| `.h2` | 38px | 800 | -1px | 1.2 | 섹션 타이틀 |
| `.h3` | 24px | 700 | -0.02em | 1.3 | 카드 타이틀, 모달 |
| `.lead` | 19px | 400 | 0 | 1.6 | 섹션 부제 |
| body | 15px | 400 | -0.02em | 1.6 | 본문 |
| meta | 12-13px | 500 | 0 | 1.5 | 보조 텍스트 |
| eyebrow | 11px | 700 | 2px | 1 | 섹션 라벨 (UPPERCASE) |
| micro | 10-11px | 600 | 0.5-0.8px | 1.2 | 컬럼 헤더, 칩 |

### 3.3 모노스페이스 (코드, 샷 코드)

```css
font-family: ui-monospace, 'SF Mono', monospace;
```

**용도**: 샷 코드 (S001, S004), 프롬프트 박스, 키 마스킹.

---

## 4. 레이아웃

### 4.1 그리드 / 사이즈

| 토큰 | 값 | 용도 |
|---|---|---|
| `--max-width` | 1200px | 콘텐츠 최대 너비 |
| `--max-narrow` | 920px | 좁은 섹션 (FAQ, 본문) |
| sidebar | 220px | 데스크톱 사이드바 |
| topbar | 56px | 상단 바 높이 |
| drawer | 480px | 샷 디테일 드로어 |

### 4.2 간격 (Spacing)

| 토큰 | 값 | 용도 |
|---|---|---|
| xs | 4px | 인라인 |
| sm | 8px | 가까운 요소 |
| md | 12px | 카드 내부 |
| lg | 16px | 섹션 내부 |
| xl | 24px | 카드 간격 |
| 2xl | 32px | 섹션 패딩 |
| 3xl | 60-100px | 섹션 간 간격 (랜딩) |

### 4.3 라운딩 (Border Radius)

| 변수 | 값 | 용도 |
|---|---|---|
| `--r-sm` | 4px | 작은 칩, 라벨 |
| `--r-md` | 6-8px | 버튼, 인풋 |
| `--r-lg` | 10-12px | 카드 |
| `--r-xl` | 14-16px | 모달, 큰 카드 |
| `--r-pill` | 12-18px | 칩, 필터 |
| 50% | — | 아바타, dot |

### 4.4 그림자

```css
/* 기본 카드 (떠 있는 느낌만) */
box-shadow: 0 1px 2px rgba(0,0,0,0.25);

/* 모달, 드로어 */
box-shadow: 0 10px 30px rgba(0,0,0,0.4);

/* 강한 강조 (Hero 비주얼) */
box-shadow: 0 30px 80px rgba(0,0,0,0.5);

/* 컨텍스트 라인 (사이드바) */
box-shadow: inset 3px 0 0 0 rgba(99,102,241,0.55); /* Personal */
box-shadow: inset 3px 0 0 0 rgba(255,107,63,0.55); /* Team */
```

---

## 5. 컴포넌트

### 5.1 Button

| 변형 | 배경 | 보더 | 텍스트 | 용도 |
|---|---|---|---|---|
| `.btn` (기본) | `--surface-3` | `--border` | `--text` | 보조 액션 |
| `.btn-primary` | `--accent` | `--accent` | `#0a0a0b` | 메인 액션 (1개만) |
| `.btn-success` | `--success` | `--success` | `#0a0a0b` | 승인 |
| `.btn-warn` | transparent | `--warning` | `--warning` | 재시도, 경고 |
| `.btn-danger` | transparent | `--danger` | `--danger` | 삭제, 거부 |
| `.btn-ghost` | transparent | transparent | `--text-2` | 닫기, 부수 |

**크기**:
- `.btn-sm`: 4-10px padding, 12px font
- 기본: 7-14px padding, 13px font
- `.btn-lg`: 14-28px padding, 15px font

**상태**:
- hover: `--surface-2` 배경
- active: 선택된 색
- disabled: opacity 0.5, cursor not-allowed

### 5.2 Card

```css
background: var(--surface);
border: 1px solid var(--border);
border-radius: 10-14px;
padding: 16-28px;
transition: 0.2s;
```

**hover (interactive cards)**:
- `border-color: var(--accent)`
- `transform: translateY(-2px)`

**variants**:
- 기본 카드 — 평범한 콘텐츠 묶음
- 추천 카드 (`recommended`) — 액센트 보더 + scale(1.04) + ★ 배지
- 점선 카드 — `border-style: dashed; opacity: 0.7` (새로 만들기 등)

### 5.3 Tab

**워크스페이스 탭 (Personal/Team)**:
```css
.swb-ws-list {
  display: flex;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 3px;
  gap: 3px;
}
.swb-ws-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 9px 6px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
}
.swb-ws-item.active[data-swb-ws="personal"] {
  background: rgba(99,102,241,0.12);
  border: 1px solid rgba(99,102,241,0.45);
}
.swb-ws-item.active[data-swb-ws="team"] {
  background: rgba(255,107,63,0.12);
  border: 1px solid rgba(255,107,63,0.45);
}
```

**일반 탭 (Workbench 내부 — Shot Board / DB / Review / Delivery)**:
```css
.swb-tab {
  padding: 10px 16px;
  border-bottom: 2px solid transparent;
  color: var(--text-faint);
}
.swb-tab.active {
  color: var(--text);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
```

### 5.4 Pill / Badge

| 종류 | 배경 | 보더 | 용도 |
|---|---|---|---|
| Status pill | `--surface-3` + `dot` | none | Shot 상태 표시 |
| Filter chip | `--surface` | `--border` | 필터 (active 시 accent) |
| Plan tag | `--surface-3` | none | "Studio+", "Biz+" 표시 |
| Context badge | accent-soft + accent border | — | Personal/Team 배지 |

**상태 dot**:
```css
.swb-dot { width: 8px; height: 8px; border-radius: 50%; }
```

크기 변형: 6px (테이블), 7px (워크스페이스 탭), 8px (보드 헤더), 9px (워크스페이스 항목).

### 5.5 Drawer (샷 디테일)

```
┌────────────────────────┐
│ S004 · 클로즈업    [✕] │ ← Header (16px padding)
├────────────────────────┤
│                        │
│   Body (스크롤 가능)    │
│   섹션별 24px 간격      │
│                        │
├────────────────────────┤
│ [재생성][승인][납품]    │ ← Footer (sticky, 12px padding)
└────────────────────────┘
```

| 항목 | 값 |
|---|---|
| 너비 | 480px (모바일: 100vw) |
| 슬라이드 인 | `transform: translateX(0)` 0.25s ease-out |
| 백드롭 | `rgba(0,0,0,0.5)` 0.2s opacity |
| 닫기 | ESC, 백드롭 클릭, X 버튼 |

### 5.6 Modal

```css
.swb-modal {
  width: 460px (wide: 600px);
  max-width: 100%;
  max-height: 90vh;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6);
}
.swb-modal-icon {
  height: 80px;
  background: linear-gradient(135deg, var(--accent-soft), var(--bg-elev));
  font-size: 32px;
}
```

**구조**: Icon (80px) → Title (18px bold) → Text (13px text-2) → List (선택) → Actions (오른쪽 정렬)

### 5.7 Form

```css
input, select, textarea {
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
}
input:focus { border-color: var(--accent); }
```

**라벨**:
```css
.field-label {
  font-size: 11px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  margin-bottom: 4px;
}
```

### 5.8 Toast

```css
.toast {
  position: fixed;
  top: 60px;
  right: 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  min-width: 240px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  animation: toast-in 0.2s ease-out;
}
.toast.success { border-left-color: var(--success); }
.toast.warn    { border-left-color: var(--warning); }
.toast.danger  { border-left-color: var(--danger); }
.toast.info    { border-left-color: var(--info); }
```

**자동 닫힘**: 2.2초 (커스터마이저블)

---

## 6. Shot Card (전용 컴포넌트)

```
┌──────────────────────┐
│ [썸네일 80px height] │ ← 컬러 그라데이션 또는 영상
├──────────────────────┤
│ S004      [지]       │ ← code + assignee 아바타 16px
│ 클로즈업              │ ← 13px 500
│ Kling 1.6 · v3       │ ← 모델 + 버전 (11px text-2)
│ ⚠ 실패 💬3 ⏰ 임박    │ ← 배지들
│ ─────────────────    │
│ › 다음: 생성          │ ← Next Action pill (11px accent)
└──────────────────────┘
```

**썸네일 그라데이션 (컬러 키)**:
- thumb-empty: 줄무늬 (Planning)
- thumb-blue: `linear-gradient(135deg, #1a2540, #2a3a5a)` (city, water)
- thumb-warm: `linear-gradient(135deg, #2a1f15, #3a2a1f)` (interview, indoor)
- thumb-purple: `linear-gradient(135deg, #2a1a3a, #3a2540)` (ending, dream)
- thumb-green: `linear-gradient(135deg, #1a2a1f, #2a3a25)` (nature)
- thumb-red: `linear-gradient(135deg, #2a1518, #3a2025)` (failed, dramatic)

---

## 7. 사이드바

```
┌──────────────────────┐
│ [Personal][Team] TAB │ ← 워크스페이스 탭 (12px padding)
│ ─────────────        │
│ 🟣 PERSONAL [내 API] │ ← 컨텍스트 섹션 (data-ws="personal")
│   • 내 API Vault     │
│   • 내 프로젝트       │
│   • 내 라이브러리      │
│ 🟠 TEAM   [Workspace]│ ← 다른 컨텍스트면 숨김 (display:none)
│   • Workspace Vault  │
│   • 팀 멤버           │
│ ─────────────        │
│ MAIN                 │ ← 공통 섹션 (라벨 11px text-3)
│   Today              │
│ 기획                 │
│   Story              │
│ ...                  │
└──────────────────────┘
```

**규칙**:
- 항상 220px 폭
- 좌측 3px inset shadow (컨텍스트 색)
- 800px 이하에서 숨김 → 모바일 햄버거 사이드바

---

## 8. 모션 / 애니메이션

| 동작 | 시간 | Easing | 용도 |
|---|---|---|---|
| 페이지 전환 | 0s (즉시) | — | 깜빡임 방지 |
| Drawer slide | 0.25s | ease-out | 우측에서 슬라이드 |
| Modal fade | 0.2s | linear | backdrop opacity |
| Tab transition | 0.15s | linear | 색·배경 변경 |
| Card hover | 0.2s | linear | translateY + border |
| Toast in | 0.2s | ease-out | 우측에서 슬라이드 |
| Drag-drop hover | 0.15s | linear | 컬럼 배경 강조 |
| Pulse (api 연결) | 2s | infinite | dot 그림자 확장/축소 |

**금기**:
- 0.5초 넘는 애니메이션 (사용자 답답함)
- 회전/플립 같은 큰 모션 (시네마틱 톤과 안 맞음)

---

## 9. 반응형 (Responsive)

### 9.1 브레이크포인트

| 이름 | 폭 | 특징 |
|---|---|---|
| Desktop | ≥ 1100px | 5컬럼 칸반, 사이드바 표시, 풀 레이아웃 |
| Tablet | 800px ~ 1100px | 3컬럼 칸반, 사이드바 표시 |
| Mobile | < 800px | 1컬럼, 사이드바 숨김, 하단 5탭, drawer 100vw |

### 9.2 모바일 전용

- 하단 5탭 nav: 오늘 / 프로젝트 / 샷 / 리뷰 / 납품
- 사이드바 워크스페이스 탭 숨김 (모바일은 단순화)
- Producer 패널 위치: 하단 탭 위로 (`bottom: 76px`)

---

## 10. 컨텍스트 분리 규칙 (★)

### 10.1 Visual Hierarchy

```
사용자가 화면을 보는 순간 인지해야 할 것:
1. 어느 컨텍스트인가? (Personal/Team) — 사이드바 탭 + 좌측 라인
2. 어느 페이지인가? — 브레드크럼
3. 어느 프로젝트인가? — 워크벤치 헤더
4. 어느 샷인가? — 카드/드로어
```

### 10.2 컨텍스트별 동기화

워크스페이스 전환 시 동시에 갱신되는 요소:

```
[탭 전환: Personal → Team]
  ↓
1. body.swb-ctx-personal → body.swb-ctx-team
2. 사이드바 좌측 3px 라인: 인디고 → 오렌지
3. 워크스페이스 탭 active: Personal → Team
4. PERSONAL 메뉴 → display:none
5. TEAM 메뉴 → display:flex
6. AI Producer 헤더 그라데이션: 인디고 → 오렌지
7. API Vault mode 라벨: "Personal API" → "Workspace API"
8. 토스트 left-border: 인디고 → 오렌지
9. 워크벤치 헤더 (있으면): 배지/멤버/API 모드 갱신
10. localStorage: soaviz_workspace_ctx 저장
```

### 10.3 절대 금기

- ❌ Personal 메뉴와 Team 메뉴를 한 화면에 동시 노출
- ❌ Status delivered (보라 #8b5cf6)와 Personal context (인디고 #6366f1) 같은 그라데이션에 사용
- ❌ Personal 컨텍스트에서 오렌지 강조, Team 컨텍스트에서 인디고 강조 (혼동 유발)
- ❌ 컨텍스트 전환 애니메이션 (즉시 변경, 깜빡임 0)

---

## 11. 접근성

| 항목 | 기준 |
|---|---|
| 텍스트 대비 | WCAG AA — 4.5:1 이상 (본문), 3:1 이상 (큰 텍스트) |
| Focus indicator | `outline: 2px solid var(--accent)` (모든 인터랙티브 요소) |
| Keyboard nav | ESC = 모달/드로어 닫기, Tab = 정상 흐름 |
| ARIA | `role="tab"` + `aria-selected`, `role="dialog"` + `aria-modal` |
| Touch target | 최소 44x44px (모바일 버튼) |
| Reduced motion | `@media (prefers-reduced-motion)` — 추후 추가 예정 |

---

## 12. 코드 스니펫

### 12.1 컨텍스트 적용 (CSS)

```css
:root {
  --ctx-personal: #6366f1;
  --ctx-personal-soft: rgba(99, 102, 241, 0.10);
  --ctx-team: #ff6b3f;
  --ctx-team-soft: rgba(255, 107, 63, 0.10);
}

body.swb-ctx-personal .sidebar { box-shadow: inset 3px 0 0 0 rgba(99,102,241,0.55); }
body.swb-ctx-team .sidebar     { box-shadow: inset 3px 0 0 0 rgba(255,107,63,0.55); }

body.swb-ctx-personal [data-ws="team"]     { display: none !important; }
body.swb-ctx-team     [data-ws="personal"] { display: none !important; }
```

### 12.2 Status pill (HTML + CSS)

```html
<span class="swb-pill swb-st-approved">
  <span class="swb-dot"></span>Approved
</span>
```

```css
.swb-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  background: var(--surface-3);
}
.swb-pill .swb-dot { width: 6px; height: 6px; border-radius: 50%; }
.swb-st-approved .swb-dot { background: #10b981; }
```

### 12.3 Toast 호출 (JS)

```js
swbToast('S004 → 승인 완료', 'success', 2000);
swbToast('Workspace API 연결됨', 'info');
swbToast('생성 실패 — 재시도하세요', 'danger', 3000);
```

---

## 13. DO / DON'T

### Color
- ✅ DO: 한 페이지에 액센트 색 하나만 (인디고 OR 오렌지)
- ✅ DO: Status 색은 컨텍스트와 무관하게 일관 유지
- ❌ DON'T: Personal 페이지에 오렌지 액센트 사용
- ❌ DON'T: 보라색을 Personal context 액센트로 (Status delivered와 충돌)

### Typography
- ✅ DO: 한국어는 자간 -0.02em 적용 (Pretendard 가독성)
- ✅ DO: 영문은 자간 0 또는 micro-positive
- ❌ DON'T: h1과 h2가 같은 크기 (위계 무너짐)
- ❌ DON'T: 13px 미만의 본문 (모바일 가독성 X)

### Layout
- ✅ DO: 카드 내부 패딩은 16-24px 일관
- ✅ DO: 섹션 간 60-100px (랜딩) / 24-32px (앱 내부)
- ❌ DON'T: 임의의 magic number 사용 (디자인 토큰 없는 px)

### Motion
- ✅ DO: hover 0.15-0.2초로 즉각 반응
- ✅ DO: 페이지 전환은 즉시 (깜빡임 0)
- ❌ DON'T: 0.5초 넘는 transition
- ❌ DON'T: 회전/플립 애니메이션

### Context (★ 가장 중요)
- ✅ DO: 컨텍스트 전환 시 4중 시각 신호 (탭, 라인, 라벨, 메뉴)
- ✅ DO: 모든 컨텍스트 의존 UI를 `body.swb-ctx-*` 클래스로 묶기
- ❌ DON'T: Personal/Team 메뉴 동시 노출
- ❌ DON'T: 컨텍스트 전환 애니메이션 (혼동 유발)

---

## 14. 자주 쓰는 색 조합 (즉시 복붙용)

### Personal 컨텍스트 카드
```css
background: rgba(99, 102, 241, 0.10);
border: 1px solid rgba(99, 102, 241, 0.45);
color: #6366f1;
```

### Team 컨텍스트 카드
```css
background: rgba(255, 107, 63, 0.10);
border: 1px solid rgba(255, 107, 63, 0.45);
color: #ff6b3f;
```

### 위험 액션 (삭제, 거부)
```css
background: transparent;
border: 1px solid #ef4444;
color: #ef4444;
```

### 성공 액션 (승인)
```css
background: #10b981;
border: 1px solid #10b981;
color: #0a0a0b;
font-weight: 600;
```

### 메인 액션 (페이지당 1개)
```css
background: var(--accent);  /* 컨텍스트 색 */
border: 1px solid var(--accent);
color: #0a0a0b;
font-weight: 600;
```

---

## 15. 컴포넌트 우선순위 매트릭스

빈도 vs 중요도로 본 우선순위 (개선 순서):

| 컴포넌트 | 빈도 | 중요도 | 우선순위 |
|---|---|---|---|
| **Shot Card** | 🔥🔥🔥 | 🔥🔥🔥 | P0 (가장 자주 봄) |
| **Sidebar Tab** | 🔥🔥🔥 | 🔥🔥🔥 | P0 |
| **Drawer** | 🔥🔥 | 🔥🔥🔥 | P0 |
| **Button** | 🔥🔥🔥 | 🔥🔥 | P0 |
| **Modal** | 🔥🔥 | 🔥🔥 | P1 |
| **Toast** | 🔥🔥 | 🔥 | P1 |
| **Pricing Card** | 🔥 | 🔥🔥🔥 | P1 (전환 결정 요소) |
| **Status Pill** | 🔥🔥🔥 | 🔥 | P2 |
| **Form Input** | 🔥 | 🔥 | P2 |
| **Footer** | 🔥 | 🔥 | P3 |

---

## 16. 다음 디자인 작업

### 즉시 (Phase 1)
- [ ] index.html 메인 페이지 — 두 카드 (Personal/Team) 진입 디자인
- [ ] personal-onepager 푸시 후 라이브 검증

### 다음주 (Phase 2)
- [ ] 생성 직전 확인 모달 (모델 + API 출처 + 비용 카드)
- [ ] BYOK 키 등록 마법사 (3-step wizard)
- [ ] 컨텍스트 mismatch 경고 배너

### 결제 직전 (Phase 3)
- [ ] Audit Log 화면 (테이블 + 필터)
- [ ] Stripe 결제 흐름 디자인
- [ ] 베타 → 정식 전환 모달

---

## 17. Reference

### 영감 (참고 디자인)
- Linear — 어두운 정밀함
- Notion — 컨텍스트 전환 (workspace switcher)
- Figma — 협업 + 권한 분리
- Stripe — 진입점 분리, 백엔드 통합
- Frame.io — 영상 리뷰 워크플로우

### 안 쓸 것 (의도적 회피)
- Slack — 너무 화려한 색
- Adobe — 너무 도구 중심 (창의 부족)
- Material Design — 카드 elevation 위계 (시네마틱 X)

---

**문서 버전**: v1.0
**다음 갱신**: Phase 2 시작 시 (5월 13일경) → 안전장치 컴포넌트 추가
**책임자**: 은교 (디자인 결정) · 디자인 시스템 가이드 (모든 협업자)
