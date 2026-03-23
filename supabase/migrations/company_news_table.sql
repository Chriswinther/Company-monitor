-- company_news table
-- Stores NewsAPI articles per company with sentiment scoring

create table if not exists public.company_news (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  cvr_number      text not null,
  title           text not null,
  description     text,
  url             text not null,
  source_name     text,
  published_at    timestamptz not null,
  sentiment_score float,         -- -1.0 (very negative) to +1.0 (very positive)
  sentiment_label text,          -- very_negative | negative | neutral | positive | very_positive
  score_impact    int default 0, -- how many points this adds to risk score
  fetched_at      timestamptz default now(),
  expires_at      timestamptz not null
);

-- Indexes
create index if not exists idx_company_news_company_id on public.company_news(company_id);
create index if not exists idx_company_news_published_at on public.company_news(published_at desc);
create index if not exists idx_company_news_expires_at on public.company_news(expires_at);
create index if not exists idx_company_news_sentiment on public.company_news(sentiment_label);

-- RLS
alter table public.company_news enable row level security;

create policy "Authenticated users can read news"
  on public.company_news for select
  to authenticated
  using (true);

create policy "Service role can manage news"
  on public.company_news for all
  to service_role
  using (true);
