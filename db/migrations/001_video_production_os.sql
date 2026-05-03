-- ─────────────────────────────────────────────────────────────
-- Migration 001 — Video Production SaaS OS
-- Soaviz Studio PIVOT: 영상 제작 전용 SaaS OS
--
-- 적용: psql "$DATABASE_URL" -f db/migrations/001_video_production_os.sql
-- 순서: base schema.sql 이후 실행
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1) projects — format 고정값 + genre[] 배열 변환
-- ────────────────────────────────────────────────────────────
-- format: short / series / film / mv(뮤직비디오) / ad(광고) / other
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_format_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_format_check
  CHECK (format IN ('short', 'series', 'film', 'mv', 'ad', 'other'));

-- genre: 기존 text → text[] (장르 복수 지정 허용)
ALTER TABLE projects
  DROP COLUMN IF EXISTS genre;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS genre text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_projects_genre ON projects USING GIN (genre);

-- ────────────────────────────────────────────────────────────
-- 2) scenes — character_ids 배열 추가 (등장인물 링크)
-- ────────────────────────────────────────────────────────────
ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS character_ids text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_scenes_character_ids ON scenes USING GIN (character_ids);

-- ────────────────────────────────────────────────────────────
-- 3) shots — approved_asset_id + candidate_asset_ids[]
--   (Auto-archiving 핵심: 한 샷에 여러 후보 에셋, 하나만 approved)
-- ────────────────────────────────────────────────────────────
ALTER TABLE shots
  ADD COLUMN IF NOT EXISTS approved_asset_id text REFERENCES assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS candidate_asset_ids text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_shots_approved_asset ON shots(approved_asset_id) WHERE approved_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shots_candidates ON shots USING GIN (candidate_asset_ids);

-- ────────────────────────────────────────────────────────────
-- 4) assets — status에 candidate/approved/final 추가
--   기존: queued/generating/ready/failed/expired/archived
--   추가: candidate(생성됐지만 미채택), approved(샷에 채택됨), final(export용 확정)
-- ────────────────────────────────────────────────────────────
ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_status_check;

ALTER TABLE assets
  ADD CONSTRAINT assets_status_check
  CHECK (status IN (
    'queued', 'generating', 'ready',
    'candidate', 'approved', 'final',
    'failed', 'expired', 'archived'
  ));

-- compare_group: A/B/C 비교 생성 묶음 ID
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS compare_group text,
  ADD COLUMN IF NOT EXISTS compare_slot  text CHECK (compare_slot IN ('A','B','C','D','E'));

CREATE INDEX IF NOT EXISTS idx_assets_compare_group ON assets(compare_group) WHERE compare_group IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 5) characters — 영상 제작용 필드 보강
--   appearance_notes: 외형 자연어 설명 (AI 이미지 프롬프트 소스)
--   visual_prompt: 완성된 이미지 프롬프트 (fal.ai용)
--   voice_settings: ElevenLabs 전체 설정 jsonb
-- ────────────────────────────────────────────────────────────
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS appearance_notes text,
  ADD COLUMN IF NOT EXISTS visual_prompt    text,
  ADD COLUMN IF NOT EXISTS voice_settings   jsonb NOT NULL DEFAULT '{}'::jsonb;

-- voice_id는 이미 존재 — voice_settings에 stability/similarity 등 저장
COMMENT ON COLUMN characters.voice_settings IS
  '{"voice_id": "...", "stability": 0.5, "similarity_boost": 0.75, "style": 0.2}';

-- ────────────────────────────────────────────────────────────
-- 6) styles — cinema_references (레퍼런스 영화/작품 목록)
-- ────────────────────────────────────────────────────────────
ALTER TABLE styles
  ADD COLUMN IF NOT EXISTS cinema_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN styles.cinema_refs IS
  '[{"title": "Blade Runner 2049", "year": 2017, "aspect": "color palette"}]';

-- ────────────────────────────────────────────────────────────
-- 7) exports — 프로젝트 패키지 ZIP 내보내기 기록
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exports (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id   text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  format       text NOT NULL CHECK (format IN ('zip', 'folder', 'xml', 'fcpxml', 'edl')),
  include_types text[] NOT NULL DEFAULT '{"image","video","audio","text"}',
  status       text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','packing','ready','failed','expired')),
  url          text,
  blob_key     text,
  size_bytes   bigint,
  expires_at   timestamptz,
  error        text,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exports_project ON exports(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exports_status  ON exports(status) WHERE status IN ('pending','packing');
DROP TRIGGER IF EXISTS trg_exports_updated ON exports;
CREATE TRIGGER trg_exports_updated BEFORE UPDATE ON exports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: exports 테이블도 user 격리
ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exports_isolate ON exports;
CREATE POLICY exports_isolate ON exports
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

-- ────────────────────────────────────────────────────────────
-- 8) credits_history — 크레딧 사용 이력 (SaaS)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credits_history (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id     text REFERENCES assets(id) ON DELETE SET NULL,
  export_id    text REFERENCES exports(id) ON DELETE SET NULL,
  delta        int  NOT NULL,                    -- 음수: 차감 / 양수: 충전
  balance_after int NOT NULL,
  reason       text NOT NULL,                    -- 'generation', 'export', 'topup', 'refund', 'bonus'
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credits_user_ts ON credits_history(user_id, created_at DESC);
-- append-only — 업데이트 없음

ALTER TABLE credits_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credits_isolate ON credits_history;
CREATE POLICY credits_isolate ON credits_history
  USING (user_id = current_setting('app.user_id', true));

-- ────────────────────────────────────────────────────────────
-- 9) stripe_events — Stripe Webhook 수신 기록
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_events (
  id           text PRIMARY KEY,                 -- Stripe event id (evt_*)
  type         text NOT NULL,
  livemode     boolean NOT NULL DEFAULT false,
  processed    boolean NOT NULL DEFAULT false,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  error        text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_stripe_unprocessed ON stripe_events(received_at) WHERE processed = false;
-- public table — no RLS (webhook processor uses service role)

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 📋 변경 요약 (Migration 001)
-- ─────────────────────────────────────────────────────────────
-- projects       : format CHECK(short/series/film/mv/ad/other), genre text[]
-- scenes         : character_ids text[]
-- shots          : approved_asset_id FK, candidate_asset_ids text[]
-- assets         : status + candidate/approved/final, compare_group/slot
-- characters     : appearance_notes, visual_prompt, voice_settings jsonb
-- styles         : cinema_refs jsonb
-- NEW: exports   (ZIP 패키지 내보내기)
-- NEW: credits_history (크레딧 차감/충전 이력)
-- NEW: stripe_events (Webhook 수신 기록)
-- ─────────────────────────────────────────────────────────────
