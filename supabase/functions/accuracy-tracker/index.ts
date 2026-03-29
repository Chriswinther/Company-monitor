import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Accuracy Tracker ─────────────────────────────────────────────────────────
//
// Two jobs in one function:
//
//   JOB 1 — SNAPSHOT (runs daily via watchlist agent)
//   For every watched company that has an AI insight, record a prediction
//   snapshot if one hasn't been taken in the last 24 hours.
//   This builds up a historical record automatically without any manual work.
//
//   JOB 2 — OUTCOME DETECTION (runs daily)
//   Checks pending predictions whose window hasn't expired. If a leadership
//   change event has been detected for that company since the prediction was
//   made, mark it as confirmed + correct/incorrect.
//   Also marks predictions as 'no_change' once the 90-day window expires.
//
// POST body:
//   {}                     — run both jobs for all companies
//   { job: "snapshot" }    — only snapshot job
//   { job: "outcomes" }    — only outcome detection job
//   { cvr: "12345678" }    — run for a single company

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

// Leadership change event types — if any of these fire after a prediction,
// the prediction is confirmed as correct (if it predicted a change)
const LEADERSHIP_EVENT_TYPES = [
  "CEO_CHANGED",
  "MANAGEMENT_CHANGED",
  "BOARD_MEMBER_ADDED",
  "BOARD_MEMBER_REMOVED",
  "EXECUTIVE_ADDED",
  "EXECUTIVE_REMOVED",
];

// ─── Job 1: Snapshot predictions ─────────────────────────────────────────────

async function snapshotPredictions(supabase: any, targetCvr?: string) {
  const stats = { snapshotted: 0, skipped: 0, errors: 0 };

  // Load watched companies with their current AI insights and scores
  let query = supabase
    .from("watchlists")
    .select(`
      company_id,
      companies!inner (
        id, name, cvr_number, industry
      )
    `);

  if (targetCvr) {
    query = query.eq("companies.cvr_number", targetCvr);
  }

  const { data: watchlistRows, error } = await query;
  if (error || !watchlistRows) return stats;

  // Deduplicate by company
  const seen = new Set<string>();
  const companies = watchlistRows
    .map((r: any) => Array.isArray(r.companies) ? r.companies[0] : r.companies)
    .filter((c: any) => c && !seen.has(c.id) && seen.add(c.id));

  for (const company of companies) {
    try {
      // Check if we already snapshotted this company in the last 24 hours
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("prediction_outcomes")
        .select("id")
        .eq("company_id", company.id)
        .gte("predicted_at", yesterday)
        .limit(1);

      if (recent && recent.length > 0) {
        stats.skipped++;
        continue;
      }

      // Load current signal score
      const { data: score } = await supabase
        .from("company_risk_scores")
        .select("risk_score, risk_level, risk_factors")
        .eq("company_id", company.id)
        .maybeSingle();

      // Load current AI insight
      const { data: insight } = await supabase
        .from("company_ai_insights")
        .select("prediction_type, confidence, insight")
        .eq("company_id", company.id)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      // Skip if no score yet — nothing meaningful to snapshot
      if (!score || score.risk_score === null) {
        stats.skipped++;
        continue;
      }

      // Default prediction type if no AI insight yet
      const predictionType = insight?.prediction_type ?? (
        score.risk_score >= 60 ? "leadership_change_likely" :
        score.risk_score >= 30 ? "leadership_change_possible" :
        "leadership_change_unlikely"
      );

      const confidence = insight?.confidence ?? (
        score.risk_score >= 70 ? "high" :
        score.risk_score >= 40 ? "medium" : "low"
      );

      // Top 5 factors for context
      const topFactors = Array.isArray(score.risk_factors)
        ? score.risk_factors.slice(0, 5).map((f: any) => ({
            code: f.code,
            label: f.label,
            points: f.points,
          }))
        : [];

      await supabase.from("prediction_outcomes").insert({
        company_id: company.id,
        cvr_number: company.cvr_number,
        company_name: company.name,
        industry: company.industry ?? null,
        signal_score: Math.round(score.risk_score),
        risk_level: score.risk_level ?? "low",
        prediction_type: predictionType,
        confidence,
        top_factors: topFactors,
        ai_insight: insight?.insight ?? null,
        outcome_type: "pending",
        window_days: 90,
      });

      stats.snapshotted++;
      console.log(`[accuracy] Snapshotted: ${company.name} — score=${score.risk_score} prediction=${predictionType}`);

    } catch (err) {
      console.error(`[accuracy] Snapshot error for ${company.name}:`, err);
      stats.errors++;
    }
  }

  return stats;
}

// ─── Job 2: Detect outcomes ───────────────────────────────────────────────────

async function detectOutcomes(supabase: any, targetCvr?: string) {
  const stats = { confirmed: 0, expired: 0, errors: 0 };
  const now = new Date().toISOString();

  // Load all pending predictions
  let query = supabase
    .from("prediction_outcomes")
    .select("*")
    .eq("outcome_type", "pending");

  if (targetCvr) {
    query = query.eq("cvr_number", targetCvr);
  }

  const { data: pending, error } = await query;
  if (error || !pending) return stats;

  console.log(`[accuracy] Checking ${pending.length} pending predictions`);

  for (const prediction of pending) {
    try {
      // Check if a leadership change event happened after the prediction was made
      const { data: events } = await supabase
        .from("company_events")
        .select("id, event_type, detected_at, description")
        .eq("company_id", prediction.company_id)
        .in("event_type", LEADERSHIP_EVENT_TYPES)
        .gte("detected_at", prediction.predicted_at)
        .order("detected_at", { ascending: true })
        .limit(1);

      const confirmedEvent = events?.[0] ?? null;

      if (confirmedEvent) {
        // Leadership change happened — was prediction correct?
        const predictedChange = [
          "leadership_change_likely",
          "leadership_change_possible",
        ].includes(prediction.prediction_type);

        const daysToOutcome = Math.round(
          (new Date(confirmedEvent.detected_at).getTime() - new Date(prediction.predicted_at).getTime())
          / (1000 * 60 * 60 * 24)
        );

        await supabase
          .from("prediction_outcomes")
          .update({
            outcome_type: "leadership_change_confirmed",
            outcome_detected_at: confirmedEvent.detected_at,
            outcome_notes: confirmedEvent.description,
            outcome_source: "auto",
            correct: predictedChange,
            days_to_outcome: daysToOutcome,
            updated_at: now,
          })
          .eq("id", prediction.id);

        console.log(
          `[accuracy] CONFIRMED: ${prediction.company_name} — ` +
          `${confirmedEvent.event_type} after ${daysToOutcome} days — ` +
          `correct=${predictedChange}`
        );
        stats.confirmed++;

      } else if (new Date(prediction.window_expires_at) < new Date()) {
        // Window expired, no change happened — was prediction correct?
        const predictedStable = prediction.prediction_type === "leadership_change_unlikely";

        await supabase
          .from("prediction_outcomes")
          .update({
            outcome_type: "no_change",
            outcome_detected_at: now,
            outcome_notes: `90-day window elapsed with no leadership change detected`,
            outcome_source: "auto",
            correct: predictedStable,
            days_to_outcome: prediction.window_days,
            updated_at: now,
          })
          .eq("id", prediction.id);

        console.log(
          `[accuracy] EXPIRED: ${prediction.company_name} — no change in 90 days — ` +
          `correct=${predictedStable}`
        );
        stats.expired++;
      }

    } catch (err) {
      console.error(`[accuracy] Outcome error for ${prediction.company_name}:`, err);
      stats.errors++;
    }
  }

  return stats;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return jsonResponse(500, { error: "Missing env vars" });

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const job: string = body?.job ?? "both";
    const targetCvr: string | null = body?.cvr ?? null;

    console.log(`[accuracy-tracker] Starting. job=${job} target=${targetCvr ?? "all"}`);

    let snapshotStats = { snapshotted: 0, skipped: 0, errors: 0 };
    let outcomeStats = { confirmed: 0, expired: 0, errors: 0 };

    if (job === "both" || job === "snapshot") {
      snapshotStats = await snapshotPredictions(supabase, targetCvr ?? undefined);
    }

    if (job === "both" || job === "outcomes") {
      outcomeStats = await detectOutcomes(supabase, targetCvr ?? undefined);
    }

    return jsonResponse(200, {
      success: true,
      snapshot: snapshotStats,
      outcomes: outcomeStats,
    });

  } catch (err) {
    console.error("[accuracy-tracker] Fatal error:", err);
    return jsonResponse(500, {
      error: "Unexpected error",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});
