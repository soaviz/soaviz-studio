-- ─────────────────────────────────────────────────────────────
-- soaviz studio — 개인 SaaS 크레딧 시스템 마이그레이션
-- 2026-06-10 · 개인 = 크레딧 / BYOK = Team OS 전용 개편
-- ─────────────────────────────────────────────────────────────
-- 적용: Supabase Dashboard → SQL Editor에 붙여넣기 → Run
-- 전제: schema.sql의 profiles 테이블 존재 (plan: free|standard|pro|team)
--       내부 plan id 매핑: standard = Creator, pro = Pro Creator
-- ─────────────────────────────────────────────────────────────

-- ─── 플랜 엔타이틀먼트 (서버 기준값 — 클라이언트 PLAN_FEATURES와 동기 유지) ──
create table if not exists plan_entitlements (
  plan_id                 text primary key,           -- free | standard(Creator) | pro(Pro Creator) | team
  display_name            text not null,
  price_krw_month         int,                        -- null = 도입 문의
  max_projects            int not null,
  monthly_credits         int not null,
  storage_limit_gb        int not null,
  project_memory_level    text not null check (project_memory_level in ('basic','standard','advanced')),
  prompt_storage_limit    int,                        -- null = 무제한
  version_history_level   text not null check (version_history_level in ('none','basic','advanced')),
  asset_lineage_enabled   boolean not null default false,
  watermark_free_export   boolean not null default false,
  priority_queue          boolean not null default false,
  high_quality_export     boolean not null default false,
  api_key_vault_enabled   boolean not null default false,  -- BYOK — Team OS 전용
  team_workspace_enabled  boolean not null default false,
  updated_at              timestamptz default now()
);

insert into plan_entitlements
  (plan_id, display_name, price_krw_month, max_projects, monthly_credits, storage_limit_gb,
   project_memory_level, prompt_storage_limit, version_history_level, asset_lineage_enabled,
   watermark_free_export, priority_queue, high_quality_export, api_key_vault_enabled, team_workspace_enabled)
values
  ('free',     'Free',        0,     3,   100,  1,  'basic',    30,   'none',     false, false, false, false, false, false),
  ('standard', 'Creator',     19900, 20,  1000, 10, 'standard', null, 'basic',    false, true,  false, false, false, false),
  ('pro',      'Pro Creator', 49900, 100, 3000, 50, 'advanced', null, 'advanced', true,  true,  true,  true,  false, false),
  ('team',     'Team OS',     null,  9999,30000,2048,'advanced',null, 'advanced', true,  true,  true,  true,  true,  true)
on conflict (plan_id) do update set
  display_name = excluded.display_name,
  price_krw_month = excluded.price_krw_month,
  max_projects = excluded.max_projects,
  monthly_credits = excluded.monthly_credits,
  storage_limit_gb = excluded.storage_limit_gb,
  project_memory_level = excluded.project_memory_level,
  prompt_storage_limit = excluded.prompt_storage_limit,
  version_history_level = excluded.version_history_level,
  asset_lineage_enabled = excluded.asset_lineage_enabled,
  watermark_free_export = excluded.watermark_free_export,
  priority_queue = excluded.priority_queue,
  high_quality_export = excluded.high_quality_export,
  api_key_vault_enabled = excluded.api_key_vault_enabled,
  team_workspace_enabled = excluded.team_workspace_enabled,
  updated_at = now();

-- ─── 크레딧 지갑 (사용자당 1개) ──────────────────────────────
create table if not exists credit_wallet (
  user_id                  uuid references profiles(id) on delete cascade primary key,
  plan_id                  text not null default 'free' references plan_entitlements(plan_id),
  subscription_status      text not null default 'active'
                           check (subscription_status in ('active','past_due','canceled','trialing')),
  monthly_credit_allowance int not null default 100,
  credit_balance           int not null default 100 check (credit_balance >= 0),
  topup_balance            int not null default 0 check (topup_balance >= 0),  -- 추가 충전분 (이월됨)
  credit_reset_date        date not null default (date_trunc('month', now()) + interval '1 month')::date,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

-- ─── 크레딧 거래 원장 (append-only) ──────────────────────────
create table if not exists credit_transactions (
  id              bigint generated always as identity primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  amount          int not null,                -- 음수 = 소비, 양수 = 충전/리셋
  balance_after   int not null,
  kind            text not null check (kind in ('generation','monthly_reset','topup','adjustment','refund')),
  generation_cost int,                         -- kind='generation'일 때 원가 기록
  label           text,                        -- 예: 'video: Runway Gen-4.5 5s'
  engine          text,                        -- 외부 엔진명 (runway/kling/sora/elevenlabs/...)
  project_id      text,
  created_at      timestamptz default now()
);
create index if not exists idx_credit_tx_user_time on credit_transactions(user_id, created_at desc);

-- ─── 신규 가입 시 지갑 자동 생성 ─────────────────────────────
create or replace function handle_new_wallet()
returns trigger language plpgsql security definer as $$
begin
  insert into credit_wallet (user_id, plan_id, monthly_credit_allowance, credit_balance)
  values (new.id, 'free', 100, 100)
  on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_profile_created_wallet on profiles;
create trigger on_profile_created_wallet
  after insert on profiles
  for each row execute function handle_new_wallet();

-- ─── 크레딧 소비 (원자적 차감 — 잔액 부족 시 예외) ───────────
create or replace function spend_credits(
  p_user_id uuid, p_amount int, p_label text default null,
  p_engine text default null, p_project_id text default null
) returns int language plpgsql security definer as $$
declare v_balance int;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  update credit_wallet
     set credit_balance = credit_balance - least(p_amount, credit_balance),
         topup_balance  = topup_balance - greatest(0, p_amount - credit_balance),
         updated_at = now()
   where user_id = p_user_id
     and (credit_balance + topup_balance) >= p_amount
  returning (credit_balance + topup_balance) into v_balance;

  if v_balance is null then
    raise exception 'INSUFFICIENT_CREDITS';   -- 클라이언트: 업그레이드/충전 모달 표시
  end if;

  insert into credit_transactions (user_id, amount, balance_after, kind, generation_cost, label, engine, project_id)
  values (p_user_id, -p_amount, v_balance, 'generation', p_amount, p_label, p_engine, p_project_id);

  return v_balance;
end; $$;

-- ─── 월간 리셋 (cron: 매월 1일 00:05 KST → pg_cron 또는 GitHub Actions) ──
create or replace function reset_monthly_credits()
returns int language plpgsql security definer as $$
declare v_count int;
begin
  with reset as (
    update credit_wallet w
       set credit_balance = e.monthly_credits,
           monthly_credit_allowance = e.monthly_credits,
           credit_reset_date = (date_trunc('month', now()) + interval '1 month')::date,
           updated_at = now()
      from plan_entitlements e
     where e.plan_id = w.plan_id
       and w.credit_reset_date <= current_date
       and w.subscription_status in ('active','trialing')
    returning w.user_id, e.monthly_credits
  )
  insert into credit_transactions (user_id, amount, balance_after, kind, label)
  select user_id, monthly_credits, monthly_credits, 'monthly_reset', '월간 크레딧 리셋'
    from reset;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- ─── RLS ─────────────────────────────────────────────────────
alter table plan_entitlements  enable row level security;
alter table credit_wallet      enable row level security;
alter table credit_transactions enable row level security;

drop policy if exists "entitlements readable by all" on plan_entitlements;
create policy "entitlements readable by all" on plan_entitlements for select using (true);

drop policy if exists "own wallet read" on credit_wallet;
create policy "own wallet read" on credit_wallet for select using (auth.uid() = user_id);
-- 쓰기는 service_role / RPC(spend_credits)로만 — 클라이언트 직접 update 금지

drop policy if exists "own tx read" on credit_transactions;
create policy "own tx read" on credit_transactions for select using (auth.uid() = user_id);

-- ─── 함수 실행 권한 잠금 — 리셋/차감은 service_role 전용 ────
revoke execute on function reset_monthly_credits() from anon, authenticated;
revoke execute on function spend_credits(uuid, int, text, text, text) from anon;
-- spend_credits는 authenticated 유지 (로그인 유저 본인 차감) — 서버 경유로 바꾸려면 authenticated도 revoke

-- ─── 끝. 검증 쿼리 ──────────────────────────────────────────
-- select * from plan_entitlements order by coalesce(price_krw_month, 999999);
-- select spend_credits(auth.uid(), 12, 'video: Kling 1.6 5s', 'kling', null);
