-- ============================================================
--  사과 요구서 · 진정성 심사원 — 스키마
--  Supabase SQL Editor 에 그대로 붙여넣고 실행하면 됩니다.
--  읽기/쓰기는 전부 서버 라우트(service_role)를 통합니다.
--  그래서 anon 키로는 아무것도 못 하도록 RLS 를 켜고 정책은 두지 않습니다.
-- ============================================================

-- ── 사건 ────────────────────────────────────────────────
create table if not exists public.cases (
  id          text primary key,                    -- 8자 코드. 링크에 실린다
  keeper      text not null,                       -- 사건철 키의 sha256. 원본은 서버에 남지 않는다
  to_name     text not null,
  from_name   text,
  what        text not null,
  anger       smallint not null default 5 check (anger between 1 and 10),
  terms       smallint[] not null default '{}',   -- TERMS 배열의 인덱스
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '90 days'
);

create index if not exists cases_keeper_idx on public.cases (keeper, created_at desc);

-- ── 심사 결과 (한 사건에 여러 번 = 재심) ────────────────
create table if not exists public.verdicts (
  id          bigint generated always as identity primary key,
  case_id     text not null references public.cases(id) on delete cascade,
  score       smallint not null check (score between 0 and 100),
  bow         smallint,
  dict        smallint,
  cat         smallint,                            -- catch. 예약어를 피했다
  penalty     smallint not null default 0,
  grade       text not null,
  created_at  timestamptz not null default now()
);

create index if not exists verdicts_case_idx on public.verdicts (case_id, created_at desc);

-- ── 수리 (도장) ─────────────────────────────────────────
create table if not exists public.settlements (
  id          bigint generated always as identity primary key,
  verdict_id  bigint not null unique references public.verdicts(id) on delete cascade,
  word        text,
  sealed_at   timestamptz not null default now(),
  voided_at   timestamptz,                         -- 재발하면 여기 찍힌다
  void_reason text
);

-- ── 잠금 ────────────────────────────────────────────────
-- service_role 은 RLS 를 우회한다. anon/authenticated 는 정책이 없으므로 전부 막힌다.
alter table public.cases       enable row level security;
alter table public.verdicts    enable row level security;
alter table public.settlements enable row level security;

-- ── 만료 청소 ───────────────────────────────────────────
-- 남의 험담을 영구 보관할 이유가 없다. 조회할 때도 expires_at 로 한 번 더 거른다.
create or replace function public.purge_expired_cases()
returns void language sql security definer as $$
  delete from public.cases where expires_at < now();
$$;

-- pg_cron 을 켰다면 (Database → Extensions → pg_cron):
--   select cron.schedule('sagwa-purge', '0 4 * * *', $$select public.purge_expired_cases()$$);
