-- ─── agent_runs ──────────────────────────────────────────────────────────────
-- Tracks every watchlist-agent execution for observability + debugging.
-- Lets you see how long runs take, how many alerts fired, and spot errors.

create table if not exists agent_runs (
  id                  uuid primary key default gen_random_uuid(),
  agent_name          text not null,
  ran_at              timestamptz not null default now(),

  -- What happened
  companies_scanned   int not null default 0,
  companies_refreshed int not null default 0,
  alerts_sent         int not null default 0,
  critical_alerts     int not null default 0,
  errors              int not null default 0,
  duration_ms         int not null default 0,
  dry_run             boolean not null default false,

  created_at          timestamptz not null default now()
);

-- Index for fast recency queries
create index if not exists idx_agent_runs_ran_at
  on agent_runs (agent_name, ran_at desc);

-- RLS: service role writes, authenticated users can read their own platform stats
alter table agent_runs enable row level security;

create policy "Service role full access"
  on agent_runs for all
  using (auth.role() = 'service_role');

create policy "Authenticated users can read agent runs"
  on agent_runs for select
  using (auth.role() = 'authenticated');

comment on table agent_runs is
  'Execution log for autonomous agents (watchlist-agent, etc). Used for monitoring and debugging.';

-- ─── Add news timestamp column to company_news if missing ────────────────────
-- The agent uses this to decide if news is stale. Add it if your company_news
-- table doesn''t already have a fetched_at column at the row level.

alter table company_news
  add column if not exists fetched_at timestamptz not null default now();

-- Index so the agent can quickly find the latest fetch per company
create index if not exists idx_company_news_fetched_at
  on company_news (company_id, fetched_at desc);
