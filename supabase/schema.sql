-- ─────────────────────────────────────────────────────────────
-- soaviz studio — Supabase 초기 스키마 (PostgreSQL)
-- ─────────────────────────────────────────────────────────────
-- Supabase Dashboard → SQL Editor에 붙여넣기
-- 또는: supabase db push
-- ─────────────────────────────────────────────────────────────

-- 확장
create extension if not exists "pgcrypto";
create extension if not exists "vector";  -- Memory Graph 임베딩용

-- ─── 사용자 프로필 (Supabase auth.users 확장) ────────────────
create table if not exists profiles (
  id           uuid references auth.users on delete cascade primary key,
  name         text,
  email        text,
  bio          text,
  website      text,
  handle       text,
  photo_url    text,
  photo_size   int default 300,
  color        text default '#A78BFA',
  plan         text default 'free' check (plan in ('free','standard','pro','team')),
  plan_renews_at timestamptz,
  stripe_customer_id text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ─── 프로젝트 ────────────────────────────────────────────────
create table if not exists projects (
  id            text primary key,           -- ULID 호환
  user_id       uuid references profiles(id) on delete cascade not null,
  title         text not null,
  logline       text,
  color         text default '#A78BFA',
  project_type  text,
  start_date    date,
  deadline_date date,
  aspect_ratio  text default '16:9',
  default_style_id text,
  status        text default 'active' check (status in ('active','completed','archived')),
  archived      boolean default false,
  completed_at  timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index on projects(user_id);
create index on projects(status) where archived = false;

-- ─── Episodes / Scenes / Shots ───────────────────────────────
create table if not exists episodes (
  id          text primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  project_id  text references projects(id) on delete cascade not null,
  number      int not null,
  title       text,
  archived    boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index on episodes(project_id);

create table if not exists scenes (
  id          text primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  project_id  text references projects(id) on delete cascade not null,
  parent_id   text references episodes(id) on delete cascade,
  number      int not null,
  heading     text,
  beat        text,
  style_id    text,
  character_ids text[] default '{}',
  archived    boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index on scenes(project_id);
create index on scenes(parent_id);

create table if not exists shots (
  id              text primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  project_id      text references projects(id) on delete cascade not null,
  parent_id       text references scenes(id) on delete cascade,
  number          int not null,
  type            text default 'medium',
  camera_move     text default 'static',
  duration_sec    int default 4,
  description     text,
  intent          text,
  dialogue        text,
  character_ids   text[] default '{}',
  style_id        text,
  prompt_id       text,
  approved_asset_id text,
  candidate_asset_ids text[] default '{}',
  ref_ids         text[] default '{}',
  notes           jsonb default '[]'::jsonb,
  workflow_id     text,
  current_step_key text,
  status          text default 'draft',
  archived        boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index on shots(project_id);
create index on shots(parent_id);

-- ─── 캐릭터·스타일·시네마 ────────────────────────────────────
create table if not exists characters (
  id          text primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  project_id  text references projects(id) on delete cascade,
  name        text not null,
  archetype   text,
  appearance  text,
  personality text,
  prompt_fragment text,
  voice_id    text,
  color       text default '#22D3EE',
  archived    boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index on characters(user_id);

create table if not exists styles (
  id          text primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  project_id  text references projects(id) on delete cascade,
  name        text not null,
  scope       text default 'project',
  palette     jsonb default '[]'::jsonb,
  prompt_fragment text,
  ref_image_urls text[] default '{}',
  ref_ids     text[] default '{}',
  archived    boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index on styles(user_id);

create table if not exists refs (
  id          text primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  project_id  text references projects(id) on delete cascade,
  source      text,
  url         text,
  title       text,
  timecode    text,
  note        text,
  shot_ids    text[] default '{}',
  archived    boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index on refs(user_id);

-- ─── Asset (생성 결과물) + Decision Library ─────────────────
create table if not exists assets (
  id          text primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  project_id  text references projects(id) on delete cascade,
  shot_id     text,
  prompt_id   text,
  parent_asset_id text,
  type        text not null,                -- voice/music/tts/sfx/video/image/transcript/prompt
  title       text,
  url         text,
  audio_url   text,
  duration    int,
  model       text,
  metrics     jsonb default '{}'::jsonb,    -- { cost, elapsedSec, userScore }
  status      text default 'candidate',
  storage_tier text default 'hot',          -- hot/cold
  -- Decision Library Phase 1
  decision_status text default 'candidate' check (decision_status in ('candidate','approved','rejected','archived')),
  reject_reason   text,
  reject_note     text,
  decision_at     timestamptz,
  prompt_hash     text,                     -- SHA-256(prompt+style+character)
  archived        boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index on assets(user_id);
create index on assets(project_id);
create index on assets(shot_id);
create index on assets(decision_status);
create index on assets(prompt_hash);

-- ─── Compare 세션 ───────────────────────────────────────────
create table if not exists compares (
  id          text primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  project_id  text references projects(id) on delete cascade,
  shot_id     text,
  prompt      text,
  duration    int,
  status      text default 'running',
  candidates  jsonb default '[]'::jsonb,
  winner_asset_id text,
  archived    boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index on compares(user_id);
create index on compares(shot_id);

-- ─── Memory Graph 임베딩 (pgvector) ─────────────────────────
create table if not exists shot_embeddings (
  shot_id           text primary key,
  user_id           uuid references profiles(id) on delete cascade not null,
  project_id        text,
  text              text,
  embedding         vector(1536),
  shot_type         text,
  camera_move       text,
  has_approved      boolean default false,
  approved_asset_id text,
  approved_model    text,
  approved_cost     numeric,
  approved_duration int,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
create index on shot_embeddings(user_id);
create index on shot_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ─── 활동 로그 ──────────────────────────────────────────────
create table if not exists activities (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  project_id  text,
  shot_id     text,
  asset_id    text,
  prompt_id   text,
  scene_id    text,
  date        date default current_date,
  activity_type text,
  title       text,
  detail      text,
  status      text,
  created_at  timestamptz default now()
);
create index on activities(user_id, date desc);
create index on activities(shot_id) where shot_id is not null;

-- ─── 결제·구독 ───────────────────────────────────────────────
create table if not exists subscriptions (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  plan            text not null check (plan in ('standard','pro','team')),
  status          text not null,            -- active/canceled/past_due/trialing
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index on subscriptions(user_id);

create table if not exists payments (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  subscription_id uuid references subscriptions(id),
  stripe_invoice_id text,
  amount          int not null,             -- 단위: 원 (KRW)
  currency        text default 'KRW',
  status          text not null,
  receipt_url     text,
  refunded_at     timestamptz,
  created_at      timestamptz default now()
);
create index on payments(user_id, created_at desc);

-- ─── Workflow 사용자 정의 ────────────────────────────────────
create table if not exists workflows (
  id          text primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  name        text not null,
  description text,
  color       text default '#A78BFA',
  steps       jsonb not null default '[]'::jsonb,
  is_default  boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index on workflows(user_id);

-- ─── Row Level Security ─────────────────────────────────────
alter table profiles       enable row level security;
alter table projects       enable row level security;
alter table episodes       enable row level security;
alter table scenes         enable row level security;
alter table shots          enable row level security;
alter table characters     enable row level security;
alter table styles         enable row level security;
alter table refs           enable row level security;
alter table assets         enable row level security;
alter table compares       enable row level security;
alter table shot_embeddings enable row level security;
alter table activities     enable row level security;
alter table subscriptions  enable row level security;
alter table payments       enable row level security;
alter table workflows      enable row level security;

-- 사용자는 자기 데이터만
create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- 모든 user_id 컬럼 테이블에 동일 정책 일괄 적용
do $$
declare t text;
begin
  for t in select unnest(array[
    'projects','episodes','scenes','shots','characters','styles','refs',
    'assets','compares','shot_embeddings','activities','subscriptions',
    'payments','workflows'
  ]) loop
    execute format('create policy "own %1$s" on %1$s for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ─── updated_at 자동 갱신 트리거 ────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end $$ language plpgsql;

do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles','projects','episodes','scenes','shots','characters','styles',
    'refs','assets','compares','shot_embeddings','subscriptions','workflows'
  ]) loop
    execute format('create trigger set_updated_at_%1$s before update on %1$s for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ─── 새 사용자 가입 시 profile 자동 생성 ─────────────────────
create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, email, name) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end $$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── 끝 ─────────────────────────────────────────────────────
-- 확인:
--   select count(*) from information_schema.tables where table_schema = 'public';
-- → 15개 (profiles + 14 도메인 테이블) 기대
