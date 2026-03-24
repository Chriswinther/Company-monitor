import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Leadership Pattern Analysis ──────────────────────────────────────────────
//
// This function uses Claude to analyse historical company data and surface the
// signals that reliably precede leadership changes in Danish companies.
//
// How it works:
//   1. Pull every company_event where event_type is a leadership change
//   2. For each affected company gather context: financials (Virk), news
//      sentiment, risk score trajectory, and other events that occurred in
//      the 6 months BEFORE the change
//   3. Send the dataset to Claude with a structured prompt asking it to
//      identify common precursor patterns
//   4. Store the insight in leadership_pattern_insights so it can be surfaced
//      in the app and used to tune the signal-score weights
//
// Run manually via POST, or schedule it to run monthly once Virk data flows.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanySnapshot {
  company_id: string;
  company_name: string;
  cvr_number: string;
  leadership_change_date: string;
  leadership_change_type: string;
  change_detail: Record<string, unknown>;

  // Signals in the 180 days before the change
  precursor_signals: {
    risk_score_at_change: number | null;
    risk_score_90d_before: number | null;
    risk_score_trend: "rising" | "falling" | "stable" | "unknown";

    financial: {
      revenue_trend: string | null;
      equity_negative: boolean | null;
      consecutive_losses: number | null;
      debt_ratio: number | null;
      latest_revenue: number | null;
      latest_net_result: number | null;
    };

    news: {
      negative_articles_30d: number;
      positive_articles_30d: number;
      total_articles_90d: number;
      avg_sentiment_90d: number | null;
      top_negative_headlines: string[];
    };

    events_before_change: Array<{
      event_type: string;
      detected_at: string;
      days_before_change: number;
    }>;

    virk_status: string | null;
    employee_count: string | null;
    industry: string | null;
    company_age_years: number | null;
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse(500, { error: "Missing Supabase env vars" });
    }
    if (!anthropicApiKey) {
      return jsonResponse(500, { error: "Missing ANTHROPIC_API_KEY" });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = await req.json().catch(() => ({}));

    // Optional: limit analysis to a specific company or time window
    const { company_id, since_days = 730 } = body; // default: look back 2 years

    const sinceDate = new Date(Date.now() - since_days * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. Find all leadership change events ─────────────────────────────────
    const LEADERSHIP_EVENT_TYPES = [
      "CEO_CHANGE",
      "BOARD_CHANGE",
      "MANAGEMENT_CHANGE",
      "LEADERSHIP_CHANGE",
      "DIRECTOR_CHANGE",
      "EXECUTIVE_CHANGE",
      "ceo_change",
      "board_change",
      "management_change",
      "leadership_change",
    ];

    let query = supabase
      .from("company_events")
      .select("id, company_id, event_type, detected_at, old_value, new_value")
      .in("event_type", LEADERSHIP_EVENT_TYPES)
      .gte("detected_at", sinceDate)
      .order("detected_at", { ascending: false })
      .limit(50); // cap at 50 to avoid huge Claude payloads

    if (company_id) query = query.eq("company_id", company_id);

    const { data: leadershipEvents, error: eventsError } = await query;

    if (eventsError) {
      return jsonResponse(500, { error: "Failed to query events", details: eventsError.message });
    }

    if (!leadershipEvents || leadershipEvents.length === 0) {
      return jsonResponse(200, {
        success: true,
        message: "No leadership change events found in the specified window. Once Virk API delivers data and events are detected, re-run this analysis.",
        snapshots_analyzed: 0,
      });
    }

    // ── 2. For each event, build a rich snapshot of precursor signals ─────────
    const snapshots: CompanySnapshot[] = [];
    const PRECURSOR_WINDOW_MS = 180 * 24 * 60 * 60 * 1000; // 180 days before change

    for (const event of leadershipEvents) {
      const changeDate = new Date(event.detected_at);
      const windowStart = new Date(changeDate.getTime() - PRECURSOR_WINDOW_MS).toISOString();

      // Load company info
      const { data: company } = await supabase
        .from("companies")
        .select("id, name, cvr_number, status, industry, employee_count, founded_year")
        .eq("id", event.company_id)
        .maybeSingle();

      if (!company) continue;

      // Load current risk score
      const { data: riskScore } = await supabase
        .from("company_risk_scores")
        .select("risk_score, risk_factors, updated_at")
        .eq("company_id", event.company_id)
        .maybeSingle();

      // Load news in 90 days before change
      const news90Start = new Date(changeDate.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const news30Start = new Date(changeDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: newsArticles } = await supabase
        .from("company_news")
        .select("title, sentiment_score, sentiment_label, published_at")
        .eq("company_id", event.company_id)
        .gte("published_at", news90Start)
        .lte("published_at", event.detected_at)
        .order("sentiment_score", { ascending: true });

      const articles90 = newsArticles ?? [];
      const articles30 = articles90.filter((a) => a.published_at >= news30Start);
      const negativeArticles30 = articles30.filter((a) => (a.sentiment_score ?? 0) < -0.1);
      const positiveArticles30 = articles30.filter((a) => (a.sentiment_score ?? 0) > 0.1);
      const avgSentiment = articles90.length > 0
        ? articles90.reduce((s, a) => s + (a.sentiment_score ?? 0), 0) / articles90.length
        : null;
      const topNegativeHeadlines = articles90
        .filter((a) => (a.sentiment_score ?? 0) < -0.1)
        .slice(0, 3)
        .map((a) => a.title ?? "");

      // Load other events in the 180-day precursor window (excluding the change itself)
      const { data: precursorEvents } = await supabase
        .from("company_events")
        .select("event_type, detected_at")
        .eq("company_id", event.company_id)
        .gte("detected_at", windowStart)
        .lt("detected_at", event.detected_at)
        .not("event_type", "in", `(${LEADERSHIP_EVENT_TYPES.map((t) => `"${t}"`).join(",")})`)
        .order("detected_at", { ascending: false });

      const precursorEventsList = (precursorEvents ?? []).map((e) => ({
        event_type: e.event_type,
        detected_at: e.detected_at,
        days_before_change: Math.round(
          (changeDate.getTime() - new Date(e.detected_at).getTime()) / (24 * 60 * 60 * 1000)
        ),
      }));

      // Extract financial signals from risk_factors if Virk data populated them
      const riskFactors: Array<{ code: string; label: string; points: number }> =
        Array.isArray(riskScore?.risk_factors) ? riskScore!.risk_factors : [];

      const financialFromFactors = {
        revenue_trend: riskFactors.find((f) => f.code === "REVENUE_DECLINING")
          ? "declining"
          : riskFactors.find((f) => f.code === "REVENUE_GROWING")
          ? "growing"
          : null,
        equity_negative: riskFactors.some((f) => f.code === "NEGATIVE_EQUITY"),
        consecutive_losses: riskFactors.find((f) => f.code?.startsWith("CONSECUTIVE_LOSSES"))
          ? parseInt(riskFactors.find((f) => f.code?.startsWith("CONSECUTIVE_LOSSES"))!.code.replace(/\D/g, "")) || null
          : null,
        debt_ratio: null, // populated from Virk once connected
        latest_revenue: null,
        latest_net_result: null,
      };

      // Company age
      const companyAge = (company as any).founded_year
        ? new Date().getFullYear() - (company as any).founded_year
        : null;

      snapshots.push({
        company_id: company.id,
        company_name: (company as any).name ?? "Unknown",
        cvr_number: (company as any).cvr_number,
        leadership_change_date: event.detected_at,
        leadership_change_type: event.event_type,
        change_detail: (event.new_value as Record<string, unknown>) ?? {},

        precursor_signals: {
          risk_score_at_change: riskScore?.risk_score ?? null,
          risk_score_90d_before: null, // will be populated from score_history table once it exists
          risk_score_trend: "unknown",

          financial: financialFromFactors,

          news: {
            negative_articles_30d: negativeArticles30.length,
            positive_articles_30d: positiveArticles30.length,
            total_articles_90d: articles90.length,
            avg_sentiment_90d: avgSentiment,
            top_negative_headlines: topNegativeHeadlines,
          },

          events_before_change: precursorEventsList,
          virk_status: (company as any).status ?? null,
          employee_count: (company as any).employee_count != null ? String((company as any).employee_count) : null,
          industry: (company as any).industry ?? null,
          company_age_years: companyAge,
        },
      });
    }

    if (snapshots.length === 0) {
      return jsonResponse(200, { success: true, message: "Events found but no matching companies in DB.", snapshots_analyzed: 0 });
    }

    // ── 3. Send to Claude for pattern analysis ────────────────────────────────
    const systemPrompt = `Du er en ekspert i dansk erhvervsliv og organisationsanalyse med dyb viden om, hvad der forudsiger lederskiftei danske virksomheder. Du analyserer strukturerede datasæt om virksomhedshændelser og identificerer mønstre.

Respond in English. Be precise, data-driven, and actionable.`;

    const userPrompt = `I am building a Danish company leadership-change prediction tool. Below is a dataset of ${snapshots.length} Danish companies that experienced leadership changes, along with signals observed in the 180 days BEFORE each change.

Analyse this dataset and identify:

1. **Financial precursors** — Which financial patterns (negative equity, consecutive losses, revenue decline, high debt) most reliably preceded leadership changes? What thresholds matter?

2. **News sentiment precursors** — How many negative articles, and how negative, before a change typically occurred? Were there specific topics/keywords in headlines?

3. **Event sequence patterns** — Were there other company events (employee drops, status changes, auditor changes) that appeared before leadership changes? What was the typical sequence and timing?

4. **Company characteristics** — Did age, industry, size, or Virk status correlate with the likelihood or type of leadership change?

5. **Scoring recommendations** — Based on these patterns, what specific signal weights would you recommend for a 0–100 risk score to best predict leadership change risk? List each factor with a recommended point value.

6. **Confidence assessment** — How confident are you in these patterns given the data quality and sample size? What additional Virk data fields, once available, would most improve prediction accuracy?

---

DATASET:
${JSON.stringify(snapshots, null, 2)}

---

Structure your response as JSON with this shape:
{
  "summary": "2-3 sentence executive summary",
  "top_precursor_patterns": [
    { "pattern": "name", "description": "...", "observed_in_pct": 0-100, "avg_days_before_change": number }
  ],
  "financial_signals": { "findings": "...", "recommended_weight_adjustments": { "NEGATIVE_EQUITY": number, "CONSECUTIVE_LOSSES": number, "REVENUE_DECLINING": number, "HIGH_DEBT_RATIO": number } },
  "news_signals": { "findings": "...", "recommended_weight_adjustments": { "negative_article_threshold": number, "sentiment_score_threshold": number } },
  "event_sequence_signals": { "findings": "...", "typical_sequence": [...], "recommended_weight_adjustments": {} },
  "company_characteristics": { "findings": "..." },
  "recommended_score_weights": [ { "factor_code": "...", "factor_label": "...", "recommended_points": number, "rationale": "..." } ],
  "data_gaps": [ "gap1", "gap2" ],
  "confidence": "low|medium|high",
  "confidence_rationale": "...",
  "sample_size": ${snapshots.length}
}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return jsonResponse(500, { error: "Claude API failed", details: errText });
    }

    const claudeData = await claudeRes.json();
    const rawInsight = claudeData.content?.[0]?.text ?? "";

    // Parse JSON from Claude's response (it may be wrapped in markdown)
    let insight: Record<string, unknown> = {};
    try {
      const jsonMatch = rawInsight.match(/```json\n?([\s\S]*?)\n?```/) ?? rawInsight.match(/(\{[\s\S]*\})/);
      insight = JSON.parse(jsonMatch ? jsonMatch[1] : rawInsight);
    } catch {
      // If Claude didn't return pure JSON, store the raw text
      insight = { raw_analysis: rawInsight };
    }

    // ── 4. Store insight in leadership_pattern_insights ───────────────────────
    const now = new Date().toISOString();
    const { error: storeError } = await supabase
      .from("leadership_pattern_insights")
      .insert({
        analyzed_at: now,
        snapshots_analyzed: snapshots.length,
        since_date: sinceDate,
        company_id: company_id ?? null, // null = cross-company analysis
        insight,
        raw_claude_response: rawInsight,
        model_used: "claude-opus-4-6",
        data_sources: ["company_events", "company_news", "company_risk_scores", "companies"],
      });

    if (storeError) {
      console.warn("Could not store insight:", storeError.message);
    }

    return jsonResponse(200, {
      success: true,
      snapshots_analyzed: snapshots.length,
      insight,
      stored: !storeError,
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse(500, {
      error: "Unexpected error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});
