import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Watchlist Agent ──────────────────────────────────────────────────────────
//
// An autonomous agent that runs on a schedule and:
//   1. Scans all watched companies and decides which need refreshing
//   2. Fans out to company-news + company-job-signals + company-signal-score
//      in parallel for stale companies
//   3. Detects score velocity (fast-moving scores = urgent)
//   4. Sends each affected user a Claude-written, prioritized alert
//      instead of a dumb threshold notification
//
// Cron: runs every 6 hours via supabase/config.toml or pg_cron
// Can also be triggered manually via POST { dry_run: true } for testing

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STALE_NEWS_HOURS = 12;        // refresh news if older than this
const STALE_JOB_HOURS = 12;         // refresh job signals if older than this
const STALE_SCORE_HOURS = 6;        // refresh score if older than this
const VELOCITY_THRESHOLD = 10;      // score moved by this much = urgent
const ALERT_MIN_SCORE = 30;         // don't alert below this score
const MAX_PARALLEL = 5;             // max companies to refresh at once

// ─── Types ────────────────────────────────────────────────────────────────────

interface WatchedCompany {
  company_id: string;
  company_name: string;
  cvr_number: string;
  industry: string | null;
  last_checked_at: string | null;
  current_score: number | null;
  current_risk_level: string | null;
  score_updated_at: string | null;
  news_fetched_at: string | null;
  job_signals_fetched_at: string | null;
  watchers: Array<{ user_id: string; email: string; full_name: string | null; expo_push_token: string | null }>;
}

interface RefreshResult {
  company_id: string;
  company_name: string;
  cvr_number: string;
  previous_score: number | null;
  new_score: number | null;
  score_delta: number | null;
  risk_level: string | null;
  risk_factors: any[];
  news_refreshed: boolean;
  jobs_refreshed: boolean;
  score_refreshed: boolean;
  error: string | null;
}

interface AlertDecision {
  should_alert: boolean;
  urgency: "critical" | "high" | "normal" | "none";
  headline: string;
  reason: string;
  score_delta: number | null;
}

// ─── Helper: call internal edge functions ─────────────────────────────────────

async function callEdgeFunction(
  supabaseUrl: string,
  serviceKey: string,
  functionName: string,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${functionName} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ─── Step 1: Decide which companies need refreshing ───────────────────────────

function needsRefresh(company: WatchedCompany): { news: boolean; jobs: boolean; score: boolean } {
  const now = Date.now();
  const staleNewsMs = STALE_NEWS_HOURS * 60 * 60 * 1000;
  const staleJobsMs = STALE_JOB_HOURS * 60 * 60 * 1000;
  const staleScoreMs = STALE_SCORE_HOURS * 60 * 60 * 1000;

  const newsAge = company.news_fetched_at
    ? now - new Date(company.news_fetched_at).getTime()
    : Infinity;

  const jobsAge = company.job_signals_fetched_at
    ? now - new Date(company.job_signals_fetched_at).getTime()
    : Infinity;

  const scoreAge = company.score_updated_at
    ? now - new Date(company.score_updated_at).getTime()
    : Infinity;

  return {
    news: newsAge > staleNewsMs,
    jobs: jobsAge > staleJobsMs,
    score: scoreAge > staleScoreMs,
  };
}

// ─── Step 2: Refresh a single company ────────────────────────────────────────

async function refreshCompany(
  supabaseUrl: string,
  serviceKey: string,
  supabase: any,
  company: WatchedCompany,
  refresh: { news: boolean; jobs: boolean; score: boolean },
): Promise<RefreshResult> {
  const result: RefreshResult = {
    company_id: company.company_id,
    company_name: company.company_name,
    cvr_number: company.cvr_number,
    previous_score: company.current_score,
    new_score: company.current_score,
    score_delta: null,
    risk_level: company.current_risk_level,
    risk_factors: [],
    news_refreshed: false,
    jobs_refreshed: false,
    score_refreshed: false,
    error: null,
  };

  try {
    // Refresh news and job signals in parallel first — score reads from these tables
    const dataTasks: Promise<any>[] = [];

    if (refresh.news) {
      dataTasks.push(
        callEdgeFunction(supabaseUrl, serviceKey, "company-news", {
          company_id: company.company_id,
          force_refresh: true,
        }).then(() => { result.news_refreshed = true; })
         .catch((e) => console.warn(`News refresh failed for ${company.company_name}:`, e.message)),
      );
    }

    if (refresh.jobs) {
      dataTasks.push(
        callEdgeFunction(supabaseUrl, serviceKey, "company-job-signals", {
          company_id: company.company_id,
          cvr_number: company.cvr_number,
          company_name: company.company_name,
        }).then(() => { result.jobs_refreshed = true; })
         .catch((e) => console.warn(`Job signals refresh failed for ${company.company_name}:`, e.message)),
      );
    }

    // Wait for news + jobs before recalculating score so it picks up fresh data
    await Promise.all(dataTasks);

    if (refresh.score) {
      await callEdgeFunction(supabaseUrl, serviceKey, "company-signal-score", {
        cvr: company.cvr_number,
        force_recalculate: true,
      }).then((data) => {
        result.score_refreshed = true;
        const newScore = data?.score ?? data?.risk_score ?? null;
        if (newScore !== null) {
          result.new_score = newScore;
          result.score_delta = company.current_score !== null
            ? Math.round(newScore - company.current_score)
            : null;
          result.risk_level = data?.risk_level ?? result.risk_level;
          result.risk_factors = data?.risk_factors ?? [];
        }
      }).catch((e) => console.warn(`Score refresh failed for ${company.company_name}:`, e.message));
    }

  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

// ─── Step 3: Ask Claude whether to alert and what to say ──────────────────────

async function decideAlert(
  anthropicKey: string,
  company: WatchedCompany,
  result: RefreshResult,
): Promise<AlertDecision> {
  // Fast-path: skip Claude if score is too low or barely moved
  if ((result.new_score ?? 0) < ALERT_MIN_SCORE && Math.abs(result.score_delta ?? 0) < VELOCITY_THRESHOLD) {
    return { should_alert: false, urgency: "none", headline: "", reason: "Score too low", score_delta: result.score_delta };
  }

  const topFactors = (result.risk_factors ?? [])
    .slice(0, 6)
    .map((f: any) => `${f.label} (+${f.points}pts)`)
    .join(", ");

  const prompt = `You are an alert prioritization engine for Boyden, a Danish executive search firm.
Decide whether this company warrants a push notification to the recruiter watching it.

COMPANY: ${company.company_name} (CVR: ${company.cvr_number})
Industry: ${company.industry ?? "Unknown"}
Current signal score: ${result.new_score ?? "unknown"}/100
Previous score: ${result.previous_score ?? "unknown"}/100
Score change: ${result.score_delta !== null ? (result.score_delta > 0 ? `+${result.score_delta}` : result.score_delta) : "unknown"}
Risk level: ${result.risk_level ?? "unknown"}
Top risk factors: ${topFactors || "none"}

Rules:
- Alert if score >= 60 OR score jumped >= ${VELOCITY_THRESHOLD} points since last check
- Critical: score >= 80 or jumped >= 20 points
- High: score 60-79 or jumped 10-19 points
- Normal: score 40-59 with notable factors
- Never alert for score < 40 with delta < 10

Respond ONLY with this JSON (no markdown):
{
  "should_alert": true|false,
  "urgency": "critical"|"high"|"normal"|"none",
  "headline": "One punchy sentence for the push notification, max 80 chars. In English. Be specific — name what changed.",
  "reason": "One sentence explaining why this warrants attention (or why not)"
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // fast + cheap for triage decisions
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Claude API ${res.status}`);
    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    return { ...JSON.parse(clean), score_delta: result.score_delta };
  } catch (err) {
    console.warn("Claude alert decision failed, using fallback rule:", err);
    // Fallback to simple rule if Claude fails
    const score = result.new_score ?? 0;
    const delta = Math.abs(result.score_delta ?? 0);
    const shouldAlert = score >= 60 || delta >= VELOCITY_THRESHOLD;
    return {
      should_alert: shouldAlert,
      urgency: score >= 80 || delta >= 20 ? "critical" : score >= 60 || delta >= 10 ? "high" : "normal",
      headline: `${company.company_name}: signal score ${result.new_score}/100 (${result.risk_level})`,
      reason: "Fallback rule applied",
      score_delta: result.score_delta,
    };
  }
}

// ─── Step 4: Send push notification ──────────────────────────────────────────

async function sendPushNotification(
  supabase: any,
  userId: string,
  pushToken: string | null,
  company: WatchedCompany,
  result: RefreshResult,
  decision: AlertDecision,
) {
  // 1. Store notification in DB (always, even without push token)
  await supabase.from("notifications").insert({
    user_id: userId,
    company_id: company.company_id,
    title: decision.headline,
    body: decision.reason,
    type: "score_alert",
    data: {
      cvr_number: company.cvr_number,
      score: result.new_score,
      risk_level: result.risk_level,
      score_delta: result.score_delta,
      urgency: decision.urgency,
    },
  });

  // 2. Send Expo push notification if token available
  if (!pushToken) return;

  const urgencyEmoji = { critical: "🔴", high: "🟠", normal: "🟡", none: "" }[decision.urgency];

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: pushToken,
      title: `${urgencyEmoji} ${company.company_name}`,
      body: decision.headline,
      data: {
        company_id: company.company_id,
        cvr_number: company.cvr_number,
        screen: "CompanyDetail",
      },
      sound: decision.urgency === "critical" ? "default" : undefined,
      badge: 1,
    }),
  });
}

// ─── Step 5: Log the agent run ────────────────────────────────────────────────

async function logAgentRun(
  supabase: any,
  stats: {
    companies_scanned: number;
    companies_refreshed: number;
    alerts_sent: number;
    critical_alerts: number;
    errors: number;
    duration_ms: number;
    dry_run: boolean;
  },
) {
  await supabase.from("agent_runs").insert({
    agent_name: "watchlist-agent",
    ran_at: new Date().toISOString(),
    ...stats,
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  const startMs = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!supabaseUrl || !serviceKey) return jsonResponse(500, { error: "Missing Supabase env vars" });
    if (!anthropicKey) return jsonResponse(500, { error: "Missing ANTHROPIC_API_KEY" });

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body?.dry_run ?? false;
    const targetCvr: string | null = body?.cvr ?? null; // for testing a single company

    console.log(`[watchlist-agent] Starting. dry_run=${dryRun}, target=${targetCvr ?? "all"}`);

    // ── 1. Load all watched companies with their current scores + watchers ───

    let query = supabase
      .from("watchlists")
      .select(`
        company_id,
        companies!inner (
          id, name, cvr_number, industry,
          last_checked_at
        ),
        users!inner (
          id, email, full_name, expo_push_token, notifications_enabled
        )
      `)
      .eq("users.notifications_enabled", true);

    if (targetCvr) {
      query = query.eq("companies.cvr_number", targetCvr);
    }

    const { data: watchlistRows, error: wlError } = await query;
    if (wlError) throw wlError;
    if (!watchlistRows || watchlistRows.length === 0) {
      return jsonResponse(200, { message: "No watched companies" });
    }

    // Group by company_id so each company is processed once
    const companyMap = new Map<string, WatchedCompany>();

    for (const row of watchlistRows) {
      const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      if (!company || !user) continue;

      if (!companyMap.has(row.company_id)) {
        companyMap.set(row.company_id, {
          company_id: row.company_id,
          company_name: company.name,
          cvr_number: company.cvr_number,
          industry: company.industry ?? null,
          last_checked_at: company.last_checked_at ?? null,
          current_score: null,
          current_risk_level: null,
          score_updated_at: null,
          news_fetched_at: null,
          job_signals_fetched_at: null,
          watchers: [],
        });
      }

      companyMap.get(row.company_id)!.watchers.push({
        user_id: user.id,
        email: user.email,
        full_name: user.full_name ?? null,
        expo_push_token: user.expo_push_token ?? null,
      });
    }

    // Enrich with current scores + news + job signal timestamps
    const companyIds = [...companyMap.keys()];

    const [scoresRes, newsRes, jobsRes] = await Promise.all([
      supabase
        .from("company_risk_scores")
        .select("company_id, risk_score, risk_level, updated_at")
        .in("company_id", companyIds),
      supabase
        .from("company_news")
        .select("company_id, fetched_at")
        .in("company_id", companyIds)
        .order("fetched_at", { ascending: false }),
      supabase
        .from("job_signals")
        .select("company_id, fetched_at")
        .in("company_id", companyIds)
        .order("fetched_at", { ascending: false }),
    ]);

    for (const score of scoresRes.data ?? []) {
      const c = companyMap.get(score.company_id);
      if (c) {
        c.current_score = score.risk_score;
        c.current_risk_level = score.risk_level;
        c.score_updated_at = score.updated_at;
      }
    }

    // Take latest news timestamp per company
    const seenNews = new Set<string>();
    for (const article of newsRes.data ?? []) {
      if (!seenNews.has(article.company_id)) {
        seenNews.add(article.company_id);
        const c = companyMap.get(article.company_id);
        if (c) c.news_fetched_at = article.fetched_at;
      }
    }

    // Take latest job signal timestamp per company
    const seenJobs = new Set<string>();
    for (const job of jobsRes.data ?? []) {
      if (!seenJobs.has(job.company_id)) {
        seenJobs.add(job.company_id);
        const c = companyMap.get(job.company_id);
        if (c) c.job_signals_fetched_at = job.fetched_at;
      }
    }

    const companies = [...companyMap.values()];
    console.log(`[watchlist-agent] ${companies.length} unique companies to evaluate`);

    // ── 2. Triage: decide which companies need refreshing ────────────────────

    const toRefresh = companies
      .map((c) => ({ company: c, refresh: needsRefresh(c) }))
      .filter(({ refresh }) => refresh.news || refresh.jobs || refresh.score);

    console.log(`[watchlist-agent] ${toRefresh.length} companies need refreshing`);

    if (dryRun) {
      return jsonResponse(200, {
        dry_run: true,
        companies_scanned: companies.length,
        would_refresh: toRefresh.map(({ company, refresh }) => ({
          name: company.company_name,
          cvr: company.cvr_number,
          refresh_news: refresh.news,
          refresh_jobs: refresh.jobs,
          refresh_score: refresh.score,
          current_score: company.current_score,
        })),
      });
    }

    // ── 3. Refresh in batches (respect rate limits) ──────────────────────────

    const results: RefreshResult[] = [];
    for (let i = 0; i < toRefresh.length; i += MAX_PARALLEL) {
      const batch = toRefresh.slice(i, i + MAX_PARALLEL);
      const batchResults = await Promise.all(
        batch.map(({ company, refresh }) =>
          refreshCompany(supabaseUrl, serviceKey, supabase, company, refresh)
        ),
      );
      results.push(...batchResults);
      // Small delay between batches to avoid hammering downstream APIs
      if (i + MAX_PARALLEL < toRefresh.length) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // ── 4. Decide alerts + notify watchers ───────────────────────────────────

    let alertsSent = 0;
    let criticalAlerts = 0;
    let errors = 0;

    for (const result of results) {
      if (result.error) { errors++; continue; }

      const company = companyMap.get(result.company_id)!;

      // Ask Claude whether this warrants an alert
      const decision = await decideAlert(anthropicKey, company, result);

      console.log(
        `[watchlist-agent] ${company.company_name}: score=${result.new_score} delta=${result.score_delta} alert=${decision.should_alert} urgency=${decision.urgency}`
      );

      if (!decision.should_alert) continue;

      // Notify every watcher of this company
      for (const watcher of company.watchers) {
        try {
          await sendPushNotification(supabase, watcher.user_id, watcher.expo_push_token, company, result, decision);
          alertsSent++;
          if (decision.urgency === "critical") criticalAlerts++;
        } catch (notifErr) {
          console.error(`Failed to notify ${watcher.email}:`, notifErr);
          errors++;
        }
      }
    }

    // ── 5. Log the run ───────────────────────────────────────────────────────

    const durationMs = Date.now() - startMs;
    await logAgentRun(supabase, {
      companies_scanned: companies.length,
      companies_refreshed: results.length,
      alerts_sent: alertsSent,
      critical_alerts: criticalAlerts,
      errors,
      duration_ms: durationMs,
      dry_run: dryRun,
    });

    // ── 6. Trigger accuracy tracker (snapshot + outcome detection) ───────────
    // Fire and forget — don't block the agent response
    callEdgeFunction(supabaseUrl, serviceKey, "accuracy-tracker", {})
      .catch((e) => console.warn("[watchlist-agent] accuracy-tracker call failed:", e.message));

    console.log(`[watchlist-agent] Done in ${durationMs}ms. Refreshed=${results.length} Alerts=${alertsSent} Errors=${errors}`);

    return jsonResponse(200, {
      success: true,
      companies_scanned: companies.length,
      companies_refreshed: results.length,
      alerts_sent: alertsSent,
      critical_alerts: criticalAlerts,
      errors,
      duration_ms: durationMs,
    });

  } catch (err) {
    console.error("[watchlist-agent] Fatal error:", err);
    return jsonResponse(500, {
      error: "Unexpected error",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});
