-- ─────────────────────────────────────────────────────────────
-- soaviz studio — Postgres schema (raw DDL, idempotent)
-- 적용: psql "$DATABASE_URL" -f db/schema.sql
-- 대상: Postgres 16+ (Fly.io Postgres / Supabase / Neon 호환)
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- ── 0) 확장
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- 검색 인덱스
CREATE EXTENSION IF NOT EXISTS "citext";     -- email 대소문자 무시

-- ── 1) updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2) users — 인증 사용자
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           text PRIMARY KEY,                          -- ULID/uuid (클라이언트 또는 OAuth sub)
  email        citext UNIQUE NOT NULL,
  name         text,
  avatar_url   text,
  oauth_sub    text,                                      -- Google/Apple sub
  oauth_provider text CHECK (oauth_provider IN ('google','apple','email','dev')),
  locale       text DEFAULT 'ko',
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_oauth     ON users(oauth_provider, oauth_sub);
DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3) subscriptions — 플랜·결제·한도
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id              text PRIMARY KEY,
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan            text NOT NULL CHECK (plan IN ('free','standard','pro','team')),
  status          text NOT NULL CHECK (status IN ('active','past_due','canceled','trial','paused')),
  -- 한도 (PLAN_FEATURES와 동기화)
  monthly_credits int NOT NULL DEFAULT 0,
  used_credits    int NOT NULL DEFAULT 0,
  character_quota int NOT NULL DEFAULT 20,
  project_quota   int NOT NULL DEFAULT 5,
  -- 빌링
  billing_cycle   text CHECK (billing_cycle IN ('monthly','yearly')),
  current_period_start timestamptz,
  current_period_end   timestamptz,
  trial_ends_at        timestamptz,
  -- 결제 게이트웨이
  provider        text CHECK (provider IN ('stripe','toss','none')),
  provider_customer_id     text,
  provider_subscription_id text,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  canceled_at     timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subs_user_active ON subscriptions(user_id) WHERE status IN ('active','trial');
CREATE INDEX IF NOT EXISTS idx_subs_period_end ON subscriptions(current_period_end);
DROP TRIGGER IF EXISTS trg_subs_updated ON subscriptions;
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4) projects — 최상위 프로젝트
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          text PRIMARY KEY,                            -- 클라이언트 ULID
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  logline     text,
  format      text DEFAULT 'series',                       -- series / film / shortform / ad ...
  genre       text,
  color       text DEFAULT '#A78BFA',                      -- 카드 액센트
  icon        text,                                        -- 이모지 아이콘 (이번 v3에 추가)
  deadline    timestamptz,
  tags        text[] NOT NULL DEFAULT '{}',
  status      text DEFAULT 'active' CHECK (status IN ('active','paused','completed','archived')),
  archived    boolean NOT NULL DEFAULT false,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_user_active ON projects(user_id) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_projects_updated     ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_tags        ON projects USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_projects_title_trgm  ON projects USING GIN (title gin_trgm_ops);
DROP TRIGGER IF EXISTS trg_projects_updated ON projects;
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5) episodes — 에피소드 (parent: project)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS episodes (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number      int  NOT NULL DEFAULT 1,
  title       text,
  synopsis    text,
  status      text DEFAULT 'draft' CHECK (status IN ('draft','outline','script','locked','done')),
  archived    boolean NOT NULL DEFAULT false,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_episodes_project ON episodes(project_id, number) WHERE archived = false;
DROP TRIGGER IF EXISTS trg_episodes_updated ON episodes;
CREATE TRIGGER trg_episodes_updated BEFORE UPDATE ON episodes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 6) scenes — 씬 (parent: episode)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scenes (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode_id  text NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  number      int  NOT NULL DEFAULT 1,
  heading     text,                                        -- "INT. CAFE — DAY"
  beat        text,                                        -- 핵심 비트 한 줄
  description text,
  status      text DEFAULT 'draft' CHECK (status IN ('draft','outline','script','locked','done')),
  archived    boolean NOT NULL DEFAULT false,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scenes_episode ON scenes(episode_id, number) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id);
DROP TRIGGER IF EXISTS trg_scenes_updated ON scenes;
CREATE TRIGGER trg_scenes_updated BEFORE UPDATE ON scenes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 7) shots — 샷 (parent: scene)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shots (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id   text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id     text NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  number       int  NOT NULL DEFAULT 1,
  shot_type    text,                                       -- WS/MS/CU/ECU/OTS/POV
  camera_move  text,                                       -- static / pan / dolly / handheld ...
  duration_ms  int,
  prompt       text,                                       -- 이미지·영상 프롬프트 본문
  negative_prompt text,
  model        text,                                       -- 사용 모델 (e.g., kling-2.1, runway-gen3)
  preset_ref   jsonb,                                      -- PromptGraph snapshot
  status       text DEFAULT 'draft' CHECK (status IN ('draft','generated','approved','rejected','archived')),
  storage_tier text DEFAULT 'hot' CHECK (storage_tier IN ('hot','warm','cold','frozen')),
  archived     boolean NOT NULL DEFAULT false,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shots_scene   ON shots(scene_id, number) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_shots_project ON shots(project_id);
CREATE INDEX IF NOT EXISTS idx_shots_status  ON shots(status) WHERE archived = false;
DROP TRIGGER IF EXISTS trg_shots_updated ON shots;
CREATE TRIGGER trg_shots_updated BEFORE UPDATE ON shots FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 8) characters — 캐릭터 페르소나
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS characters (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  text REFERENCES projects(id) ON DELETE SET NULL,
  name        text NOT NULL,
  role        text,                                        -- 주인공 / 조연 / 빌런 ...
  age         text,                                        -- "20s", "8세"
  gender      text,
  bio         text,
  personality text,                                        -- 성격 (50개 프리셋)
  speech_tone text,                                        -- 말투 톤 (50개 프리셋)
  tags        text[] NOT NULL DEFAULT '{}',
  -- 사진 4분할 (정면/측면/후면/전신)
  photo_front  text,                                       -- URL
  photo_side   text,
  photo_back   text,
  photo_full   text,
  voice_id     text,                                       -- ElevenLabs voice id
  archived     boolean NOT NULL DEFAULT false,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chars_user_active ON characters(user_id) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_chars_project    ON characters(project_id);
CREATE INDEX IF NOT EXISTS idx_chars_name_trgm  ON characters USING GIN (name gin_trgm_ops);
DROP TRIGGER IF EXISTS trg_chars_updated ON characters;
CREATE TRIGGER trg_chars_updated BEFORE UPDATE ON characters FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 9) styles — 룩북·스타일 (팔레트·라이팅·카메라·음악 등)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS styles (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  text REFERENCES projects(id) ON DELETE SET NULL,
  name        text NOT NULL,
  scope       text NOT NULL CHECK (scope IN ('palette','lighting','camera','music','wardrobe','overall')),
  -- 팔레트
  colors       text[],                                     -- ['#FFB7C5', ...]
  -- 라이팅·카메라·음악 등 자유 필드
  description  text,
  reference_url text,
  archived     boolean NOT NULL DEFAULT false,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_styles_project ON styles(project_id, scope) WHERE archived = false;
DROP TRIGGER IF EXISTS trg_styles_updated ON styles;
CREATE TRIGGER trg_styles_updated BEFORE UPDATE ON styles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 10) assets — 결과물 (이미지·영상·오디오·텍스트 등)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id              text PRIMARY KEY,
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id      text REFERENCES projects(id) ON DELETE CASCADE,
  shot_id         text REFERENCES shots(id) ON DELETE SET NULL,
  prompt_id       text,                                    -- prompts 테이블 (별도) FK는 phase 2
  parent_asset_id text REFERENCES assets(id) ON DELETE SET NULL,  -- 변형 chain
  type            text NOT NULL CHECK (type IN ('image','video','audio','text','sfx','music','tts','lipsync','upscale','model3d','other')),
  -- 저장
  url             text,                                    -- public URL or s3://
  storage_tier    text DEFAULT 'hot' CHECK (storage_tier IN ('hot','warm','cold','frozen')),
  blob_key        text,                                    -- S3/R2 key
  size_bytes      bigint,
  duration_ms     int,
  width           int,
  height          int,
  mime            text,
  -- 생성 컨텍스트
  model           text,                                    -- e.g., gpt-4o-mini, kling-2.1
  source_prompt   text,
  cost_credits    int DEFAULT 0,                           -- 사용자 차감 크레딧
  cost_usd_micro  bigint,                                  -- 실제 원가 (마이크로달러: 1USD = 1_000_000)
  -- 상태
  status          text DEFAULT 'queued' CHECK (status IN ('queued','generating','ready','failed','expired','archived')),
  error           text,
  archived        boolean NOT NULL DEFAULT false,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  ready_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_assets_project_type ON assets(project_id, type) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_assets_shot         ON assets(shot_id);
CREATE INDEX IF NOT EXISTS idx_assets_status_q     ON assets(status) WHERE status IN ('queued','generating');
CREATE INDEX IF NOT EXISTS idx_assets_user_recent  ON assets(user_id, created_at DESC);
DROP TRIGGER IF EXISTS trg_assets_updated ON assets;
CREATE TRIGGER trg_assets_updated BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 11) activities — 활동 로그 (Memory Graph용)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
  id            text PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id    text REFERENCES projects(id) ON DELETE CASCADE,
  asset_id      text REFERENCES assets(id) ON DELETE SET NULL,
  shot_id       text REFERENCES shots(id) ON DELETE SET NULL,
  activity_type text NOT NULL,                             -- 'shot.generate','script.create','asset.export', ...
  date          date NOT NULL DEFAULT CURRENT_DATE,
  ts            timestamptz NOT NULL DEFAULT now(),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_act_user_ts    ON activities(user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_act_project_ts ON activities(project_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_act_type_date  ON activities(activity_type, date);
-- 활동 로그는 append-only — updated_at·트리거 없음

-- ─────────────────────────────────────────────────────────────
-- 12) Row-Level Security — multi-tenant 격리 (옵션, 권장)
-- ─────────────────────────────────────────────────────────────
-- 적용 전 app role을 정한 후, 아래 한 번에 ENABLE.
-- 사용 시 컨텍스트: SET app.user_id = '<user_id>'  (각 요청 진입 시 main.py에서 주입)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects','episodes','scenes','shots','characters','styles','assets','activities','subscriptions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_isolate ON %I; '
      'CREATE POLICY %I_isolate ON %I '
      'USING (user_id = current_setting(''app.user_id'', true)) '
      'WITH CHECK (user_id = current_setting(''app.user_id'', true))',
      t, t, t, t
    );
  END LOOP;
END $$;

COMMIT;
