# C-P0-08: '준비 중' 10곳 매핑표

생성 시각: 2026-05-04 17:03:22
원본 파일: 분석 대상 HTML
총 발견: **10곳**

## 카테고리별 분류

| 카테고리 | 개수 | 처리 방침 |
|---|---|---|
| `progress-text` | 1 | ✅ KEEP (정상) |
| `plan-upgrade` | 3 | ⚠️  IMPLEMENT (Stripe 연결 시) |
| `nav-fallback` | 2 | ✅ KEEP (정상) |
| `skeleton-aria` | 1 | ✅ KEEP (정상) |
| `server-retry` | 2 | ✅ KEEP (정상) |
| `unknown` | 1 | 🔍 REVIEW |

## 상세 매핑

| # | 라인 | 카테고리 | 처리 방침 |
|---|---|---|---|
| 1 | L21634 | `progress-text` | KEEP (정상 진행률 메시지) |
| 2 | L25122 | `plan-upgrade` | IMPLEMENT (Stripe checkoutUrl 연결 후 실제 결제로) — P2-06 |
| 3 | L25143 | `plan-upgrade` | IMPLEMENT (Stripe checkoutUrl 연결 후 실제 결제로) — P2-06 |
| 4 | L25163 | `plan-upgrade` | IMPLEMENT (메일 또는 Slack 링크 연결) |
| 5 | L30834 | `nav-fallback` | KEEP (NAV_MAP 미매핑 fallback 주석 — 정상) |
| 6 | L30957 | `nav-fallback` | KEEP (사용자에게 표시되는 알림 — 정상) |
| 7 | L54471 | `skeleton-aria` | KEEP (스켈레톤 로딩 접근성 라벨 — 정상) |
| 8 | L54475 | `unknown` | REVIEW (수동 확인 필요) |
| 9 | L55937 | `server-retry` | KEEP (서버 재시도 사용자 메시지 — 정상) |
| 10 | L55938 | `server-retry` | KEEP (서버 재시도 사용자 메시지 — 정상) |

## 컨텍스트 스니펫

### [1] L21634 — progress-text

**처리**: KEEP (정상 진행률 메시지)

```
...el">준비 중</div> <div class="proc-eta" id="proc-eta">잠시만요</div> </div> <div c...
```

### [2] L25122 — plan-upgrade

**처리**: IMPLEMENT (Stripe checkoutUrl 연결 후 실제 결제로) — P2-06

```
...준비 중입니다. 곧 오픈됩니다!','info')">업그레이드</button> </div> <!-- PRO --> <div class="cred...
```

### [3] L25143 — plan-upgrade

**처리**: IMPLEMENT (Stripe checkoutUrl 연결 후 실제 결제로) — P2-06

```
...비 중입니다. 곧 오픈됩니다!','info')">업그레이드</button> </div> <!-- TEAM --> <div class="cre...
```

### [4] L25163 — plan-upgrade

**처리**: IMPLEMENT (메일 또는 Slack 링크 연결)

```
...준비 중입니다. 곧 오픈됩니다!','info')">문의하기</button> </div> </div> <div class="credits-notice...
```

### [5] L30834 — nav-fallback

**처리**: KEEP (NAV_MAP 미매핑 fallback 주석 — 정상)

```
...rom video // 나머지는 준비 중 토스트 const NAV_MAP = { // ═══ 신규 페이지 ═══ landing: { page: 'landing', label: 'Landing' }, tod...
```

### [6] L30957 — nav-fallback

**처리**: KEEP (사용자에게 표시되는 알림 — 정상)

```
...비 중이에요`, 'warn'); } }); }); $('#nav-upgrade-btn')?.addEventListener('click', () => { showPage('...
```

### [7] L54471 — skeleton-aria

**처리**: KEEP (스켈레톤 로딩 접근성 라벨 — 정상)

```
...-label="컷 프리뷰 준비 중 ${idx + 1}"> <div class="aive-scene-thumb aive-skeleton"></div> <div class="aive-sc...
```

### [8] L54475 — unknown

**처리**: REVIEW (수동 확인 필요)

```
...준비 중</span> </div> </article> `).join(''); } function onboardingProjectId() {...
```

### [9] L55937 — server-retry

**처리**: KEEP (서버 재시도 사용자 메시지 — 정상)

```
... 중 메시지 표시 후 재시도 showToast?.('서버 준비 중… 잠시만 기다려 주세요.', 'info'); await new Promise(r => s...
```

### [10] L55938 — server-retry

**처리**: KEEP (서버 재시도 사용자 메시지 — 정상)

```
...잠시만 기다려 주세요.', 'info'); await new Promise(r => setTimeout(r, 5000)); return fetch(...
```


## 결론 / Conclusion

- **즉시 작업 불필요**: progress-text / nav-fallback / skeleton-aria / server-retry 카테고리(7-8개)는
  모두 정상 동작 메시지. 그대로 유지.
- **P2-06 작업 시 함께 처리**: plan-upgrade 카테고리(3개)는 Stripe checkoutUrl 연결 시
  실제 결제 페이지로 변경.
- **수동 검토**: unknown 카테고리(있다면) 만 직접 확인 필요.

따라서 **C-P0-08은 매핑 완료로 종결**, 실제 코드 변경은 P2-06에서 결제 인프라와 함께 진행.
