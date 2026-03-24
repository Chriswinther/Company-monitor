-- ─── leadership_pattern_insights ─────────────────────────────────────────────
-- Stores Claude's analysis of what signals precede leadership changes.
-- Populated by the leadership-pattern-analysis edge function.
-- One row per analysis run (can be cross-company or scoped to a single company).

create table if not exists leadership_pattern_insights (
  id              uuid primary key default gen_random_uuid(),

  -- When and what was analyzed
  analyzed_at     timestamptz not null default now(),
  since_date      timestamptz not null,          -- how far back data was pulled
  snapshots_analyzed int not null default 0,     -- number of leadership-change events examined

  -- Scope: null = cross-company (global pattern), set = company-specific
  company_id      uuid references companies(id) on delete set null,

  -- Claude's structured insight (JSON)
  insight         jsonb not null default '{}',

  -- Raw Claude response (for debugging / re-parsing)
  raw_claude_response text,

  -- Metadata
  model_used      text not null default 'claude-opus-4-6',
  data_sources    text[] not null default '{}',

  created_at      timestamptz not null default now()
);

-- Index for fast lookup of latest global analysis
create index if not exists idx_lpi_analyzed_at
  on leadership_pattern_insights (analyzed_at desc);

-- Index for company-scoped lookups
create index if not exists idx_lpi_company_id
  on leadership_pattern_insights (company_id)
  where company_id is not null;

-- Enable RLS — service role can write, authenticated users can read
alter table leadership_pattern_insights enable row level security;

create policy "Service role full access"
  on leadership_pattern_insights for all
  using (auth.role() = 'service_role');

create policy "Authenticated users can read insights"
  on leadership_pattern_insights for select
  using (auth.role() = 'authenticated');

comment on table leadership_pattern_insights is
  'AI-generated analysis of which signals reliably precede leadership changes in Danish companies. Run the leadership-pattern-analysis edge function to populate.';
