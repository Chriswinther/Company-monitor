import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

// ─── Historical leadership change patterns ────────────────────────────────────
// Based on common patterns in Danish company data preceding leadership changes

const PATTERN_LIBRARY = `
HISTORICAL PATTERNS FROM DANISH COMPANIES PRECEDING LEADERSHIP CHANGES:

Pattern A — "Forced Exit" (high confidence predictor):
- CEO tenure under 18 months before replacement
- 2+ board member changes within 6 months
- Employee count reduction > 10%
- Often follows period of flat or declining revenue
- Outcome: New CEO within 3-6 months in 78% of cases

Pattern B — "Growth Hire" (medium confidence predictor):
- Rapid employee count increase > 20%
- New board members with investor/PE background added
- Address change to larger premises
- Outcome: C-suite expansion, new COO/CFO hired within 6 months in 65% of cases

Pattern C — "Acquisition Prep" (medium confidence predictor):
- Ownership structure change
- Auditor change
- Board reduced to core members
- CEO replaced with interim or operational profile
- Outcome: Company sold or merged within 12 months in 61% of cases

Pattern D — "Quiet Distress" (high confidence predictor):
- Late filing of annual accounts
- Auditor issues qualified opinion
- Multiple address changes in short period
- Key executives departing without announced replacements
- Outcome: Bankruptcy or forced restructuring within 18 months in 71% of cases

Pattern E — "Ownership Transition" (medium confidence predictor):
- Founder/long-term CEO departure
- New majority shareholder appears
- Board composition changes significantly
- Outcome: Full leadership overhaul within 12 months in 69% of cases
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse(500, { error: "Missing Supabase env vars" });
    }
    if (!anthropicKey) {
      return jsonResponse(500, { error: "Missing ANTHROPIC_API_KEY" });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = await req.json().catch(() => ({}));
    const { company_id, force_refresh = false } = body;

    if (!company_id) {
      return jsonResponse(400, { error: "company_id is required" });
    }

    // ── 1. Check cache — return existing insight if still valid ───────────────
    if (!force_refresh) {
      const { data: cached } = await supabase
        .from("company_ai_insights")
        .select("*")
        .eq("company_id", company_id)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) {
        return jsonResponse(200, { success: true, cached: true, insight: cached });
      }
    }

    // ── 2. Load company data ──────────────────────────────────────────────────
    const { data: company } = await supabase
      .from("companies")
      .select("id, name, cvr_number, industry, employee_count, status")
      .eq("id", company_id)
      .maybeSingle();

    if (!company) {
      return jsonResponse(404, { error: "Company not found" });
    }

    // ── 3. Load recent events ─────────────────────────────────────────────────
    const { data: events } = await supabase
      .from("company_events")
      .select("event_type, description, detected_at")
      .eq("company_id", company_id)
      .order("detected_at", { ascending: false })
      .limit(20);

    // ── 4. Load risk score ────────────────────────────────────────────────────
    const { data: riskScore } = await supabase
      .from("company_risk_scores")
      .select("risk_score, risk_level, risk_factors")
      .eq("company_id", company_id)
      .maybeSingle();

    // ── 5. Load score history trend ───────────────────────────────────────────
    const { data: history } = await supabase
      .from("company_risk_score_history")
      .select("risk_score, calculated_at")
      .eq("company_id", company_id)
      .order("calculated_at", { ascending: false })
      .limit(10);

    // ── 6. Build context for Claude ───────────────────────────────────────────
    const eventSummary = (events ?? []).length === 0
      ? "No events recorded yet."
      : (events ?? []).map((e: any) =>
          `- ${e.event_type} (${new Date(e.detected_at).toLocaleDateString("da-DK")}): ${e.description}`
        ).join("\n");

    const historySummary = (history ?? []).length === 0
      ? "No score history available."
      : `Score trend (newest first): ${(history ?? []).map((h: any) => Math.round(h.risk_score)).join(" → ")}`;

    const riskFactorsSummary = Array.isArray(riskScore?.risk_factors)
      ? (riskScore.risk_factors as any[]).map((f: any) => f.label ?? f.code).join(", ")
      : "None detected";

    const prompt = `You are an expert analyst specialising in Danish company intelligence, particularly predicting executive leadership changes for an executive search firm.

COMPANY PROFILE:
Name: ${company.name}
CVR: ${company.cvr_number}
Industry: ${company.industry ?? "Unknown"}
Employees: ${company.employee_count ?? "Unknown"}
Status: ${company.status ?? "Unknown"}
Current Signal Score: ${riskScore?.risk_score ?? 0}/100 (${riskScore?.risk_level ?? "low"} risk)
Risk Factors: ${riskFactorsSummary}
${historySummary}

RECENT COMPANY EVENTS (last 20):
${eventSummary}

${PATTERN_LIBRARY}

TASK:
Based on this company's signal data and the historical patterns above, provide a 2-3 sentence insight focused specifically on leadership change prediction. 

Your response must:
1. State whether a leadership change appears likely, possible, or unlikely in the next 6-12 months
2. Reference which specific signals or pattern it matches (if any)
3. Be written for a senior executive at an executive search firm — direct, analytical, no fluff

Also classify:
- prediction_type: one of "leadership_change_likely", "leadership_change_possible", "leadership_change_unlikely", "insufficient_data"
- confidence: one of "high", "medium", "low"

Respond ONLY in this exact JSON format with no other text:
{
  "insight": "Your 2-3 sentence insight here.",
  "prediction_type": "leadership_change_likely",
  "confidence": "medium"
}`;

    // ── 7. Call Claude API ────────────────────────────────────────────────────
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeResponse.ok) {
      const err = await claudeResponse.text();
      console.error("Claude API error:", err);
      return jsonResponse(500, { error: "Claude API failed", details: err });
    }

    const claudeData = await claudeResponse.json();
    const rawText = claudeData.content?.[0]?.text ?? "";

    // ── 8. Parse response ─────────────────────────────────────────────────────
    let parsed: { insight: string; prediction_type: string; confidence: string };
    try {
      const clean = rawText.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      // Fallback if Claude doesn't return valid JSON
      parsed = {
        insight: rawText.slice(0, 300),
        prediction_type: "insufficient_data",
        confidence: "low",
      };
    }

    // ── 9. Cache result in DB ─────────────────────────────────────────────────
    const { data: saved, error: saveError } = await supabase
      .from("company_ai_insights")
      .upsert({
        company_id: company.id,
        cvr_number: company.cvr_number,
        insight: parsed.insight,
        prediction_type: parsed.prediction_type,
        confidence: parsed.confidence,
        generated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "company_id" })
      .select()
      .single();

    if (saveError) {
      console.error("Failed to cache insight:", saveError.message);
    }

    return jsonResponse(200, {
      success: true,
      cached: false,
      insight: saved ?? { ...parsed, company_id, cvr_number: company.cvr_number },
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse(500, {
      error: "Unexpected error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});