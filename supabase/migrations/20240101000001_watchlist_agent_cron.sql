-- ─── Schedule watchlist-agent via pg_cron ────────────────────────────────────
--
-- Run this in your Supabase SQL editor (or as a migration).
-- Requires pg_cron extension — enable it in Supabase Dashboard:
--   Database → Extensions → pg_cron → Enable
--
-- The agent runs every 6 hours: 00:00, 06:00, 12:00, 18:00 UTC

-- Enable extension (if not already enabled)
create extension if not exists pg_cron;

-- Remove any existing schedule with this name first
select cron.unschedule('watchlist-agent')
  where exists (
    select 1 from cron.job where jobname = 'watchlist-agent'
  );

-- Schedule: every 6 hours
select cron.schedule(
  'watchlist-agent',
  '0 */6 * * *',  -- every 6 hours
  $$
  select
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/watchlist-agent',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{}'::jsonb
    )
  $$
);

-- Verify the schedule was created
select jobname, schedule, command
from cron.job
where jobname = 'watchlist-agent';

-- ─── Alternative: if you prefer config.toml ──────────────────────────────────
-- Add this to supabase/config.toml instead of using pg_cron:
--
-- [functions.watchlist-agent]
-- verify_jwt = false
--
-- [functions.watchlist-agent.cron]
-- schedule = "0 */6 * * *"
