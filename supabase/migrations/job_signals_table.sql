-- job_signals table
-- Stores job postings from Jobindex that match watched companies.
-- Executive/director roles posted = direct evidence of leadership change in progress.

create table if not exists public.job_signals (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  cvr_number    text,
  title         text not null,
  company_name  text,
  url           text not null,
  published_at  timestamptz not null,
  description   text,

  -- Signal classification
  signal_type   text,
  -- EXECUTIVE_ROLE_POSTED | BOARD_ROLE_POSTED | MASS_HIRING | SENIOR_HIRING | RESTRUCTURE_SIGNAL

  signal_score  int default 0,
  -- Points this posting contributes to overall company risk score

  fetched_at    timestamptz default now(),
  expires_at    timestamptz not null
);

-- Indexes
create index if not exists idx_job_signals_company_id   on public.job_signals(company_id);
create index if not exists idx_job_signals_published_at on public.job_signals(published_at desc);
create index if not exists idx_job_signals_signal_type  on public.job_signals(signal_type);
create index if not exists idx_job_signals_expires_at   on public.job_signals(expires_at);

-- RLS
alter table public.job_signals enable row level security;

create policy "Authenticated users can read job signals"
  on public.job_signals for select
  to authenticated
  using (true);

create policy "Service role can manage job signals"
  on public.job_signals for all
  to service_role
  using (true);
