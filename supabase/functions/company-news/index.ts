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

// ─── Sentiment scoring ────────────────────────────────────────────────────────
// Scores an article title+description for negative/positive signals
// Returns a value from -1.0 (very negative) to +1.0 (very positive)

const NEGATIVE_KEYWORDS = [
  // Leadership distress
  "fyret", "fratræder", "opsagt", "afskediget", "tvangsafgang", "stopper",
  "resigned", "fired", "dismissed", "steps down", "ousted", "forced out",
  // Financial distress
  "konkurs", "insolvens", "tvangsopløsning", "underskud", "tab", "krise",
  "bankruptcy", "insolvency", "losses", "deficit", "crisis", "debt",
  "gæld", "likvidation", "rekonstruktion", "restructuring",
  // Legal
  "retssag", "anklaget", "svindel", "bedrageri", "undersøgelse", "sigtelse",
  "lawsuit", "fraud", "investigation", "charged", "scandal", "corruption",
  // Layoffs
  "fyringer", "afskedigelser", "nedskæringer", "masseafskedigelse",
  "layoffs", "redundancies", "downsizing", "cutbacks",
  // Negative general
  "problem", "konflikt", "strid", "kritik", "advarsel", "bekymring",
  "trouble", "conflict", "dispute", "warning", "concern", "collapse",
];

const POSITIVE_KEYWORDS = [
  // Growth
  "vækst", "rekord", "overskud", "succes", "expansion", "investering",
  "growth", "record", "profit", "success", "expansion", "investment",
  // Leadership positive
  "ansætter", "ny direktør", "styrker", "fremgang",
  "hires", "appoints", "strengthens", "progress", "promotion",
  // Deal positive
  "opkøb", "fusion", "partnerskab", "kontrakt", "aftale",
  "acquisition", "merger", "partnership", "contract", "deal", "award",
];

function scoreSentiment(title: string, description: string): number {
  const text = `${title} ${description}`.toLowerCase();
  let score = 0;
  for (const kw of NEGATIVE_KEYWORDS) { if (text.includes(kw)) score -= 0.15; }
  for (const kw of POSITIVE_KEYWORDS) { if (text.includes(kw)) score += 0.1; }
  return Math.max(-1, Math.min(1, score));
}

function sentimentLabel(score: number): "very_negative" | "negative" | "neutral" | "positive" | "very_positive" {
  if (score <= -0.5) return "very_negative";
  if (score <= -0.1) return "negative";
  if (score >= 0.5)  return "very_positive";
  if (score >= 0.1)  return "positive";
  return "neutral";
}

// ─── Score impact ─────────────────────────────────────────────────────────────
// How much should this article affect the company risk score?

function scoreImpact(sentiment: number, relevanceScore: number): number {
  // Negative news increases risk score, positive news slightly decreases it
  if (sentiment <= -0.5) return Math.round(15 * relevanceScore);
  if (sentiment <= -0.1) return Math.round(8 * relevanceScore);
  if (sentiment >= 0.1)  return Math.round(-3 * relevanceScore);
  return 0;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const newsApiKey = Deno.env.get("NEWS_API_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse(500, { error: "Missing Supabase env vars" });
    }
    if (!newsApiKey) {
      return jsonResponse(500, { error: "Missing NEWS_API_KEY" });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = await req.json().catch(() => ({}));
    const { company_id, force_refresh = false } = body;

    if (!company_id) return jsonResponse(400, { error: "company_id is required" });

    // ── 1. Check cache (24h) ──────────────────────────────────────────────────
    if (!force_refresh) {
      const { data: cached } = await supabase
        .from("company_news")
        .select("*")
        .eq("company_id", company_id)
        .gt("expires_at", new Date().toISOString())
        .order("published_at", { ascending: false })
        .limit(10);

      if (cached && cached.length > 0) {
        return jsonResponse(200, { success: true, cached: true, articles: cached });
      }
    }

    // ── 2. Load company ───────────────────────────────────────────────────────
    const { data: company } = await supabase
      .from("companies")
      .select("id, name, cvr_number")
      .eq("id", company_id)
      .maybeSingle();

    if (!company) return jsonResponse(404, { error: "Company not found" });

    // ── 3. Build search queries ───────────────────────────────────────────────
    // Strip legal suffixes for cleaner queries
    const cleanName = company.name
      .replace(/\b(A\/S|ApS|I\/S|K\/S|P\/S|IVS|SE|SMBA)\b/gi, "")
      .trim();

    // NewsAPI free tier only supports ~28 days lookback
    const fromDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // We do NOT lock to language=da — NewsAPI indexes very few Danish-language sources.
    // Instead we anchor each query with "Denmark" or "Danmark" to stay geographically
    // relevant while picking up both English and Danish coverage.
    const queries: { q: string; pageSize: number }[] = [
      { q: `"${cleanName}" Denmark`,  pageSize: 10 }, // exact name + English country
      { q: `"${cleanName}" Danmark`,  pageSize: 10 }, // exact name + Danish country
      { q: `${cleanName} Denmark`,    pageSize: 5  }, // broader fallback
    ];

    const allArticles: any[] = [];
    const seenUrls = new Set<string>();

    for (const { q, pageSize } of queries) {
      const url = new URL("https://newsapi.org/v2/everything");
      url.searchParams.set("q", q);
      url.searchParams.set("sortBy", "publishedAt");
      url.searchParams.set("pageSize", String(pageSize));
      url.searchParams.set("from", fromDate);

      const res = await fetch(url.toString(), {
        headers: { "X-Api-Key": newsApiKey },
      });

      if (!res.ok) {
        console.warn(`NewsAPI error for query "${q}":`, res.status, await res.text());
        continue;
      }

      const data = await res.json();
      for (const article of data.articles ?? []) {
        if (!seenUrls.has(article.url)) {
          seenUrls.add(article.url);
          allArticles.push(article);
        }
      }
    }

    if (allArticles.length === 0) {
      return jsonResponse(200, { success: true, cached: false, articles: [], message: "No news found" });
    }

    // ── 4. Score and store articles ───────────────────────────────────────────
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const scored = allArticles
      .filter((a) => a.title && a.url && a.title !== "[Removed]")
      .map((a) => {
        const sentiment = scoreSentiment(a.title ?? "", a.description ?? "");
        const relevance = a.title?.toLowerCase().includes(cleanName.toLowerCase()) ? 1.0 : 0.6;
        return {
          company_id: company.id,
          cvr_number: company.cvr_number,
          title: a.title,
          description: a.description ?? null,
          url: a.url,
          source_name: a.source?.name ?? null,
          published_at: a.publishedAt ?? now,
          sentiment_score: sentiment,
          sentiment_label: sentimentLabel(sentiment),
          score_impact: scoreImpact(sentiment, relevance),
          fetched_at: now,
          expires_at,
        };
      })
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
      .slice(0, 15); // keep top 15

    // Delete old articles for this company before inserting fresh ones
    await supabase.from("company_news").delete().eq("company_id", company.id);

    if (scored.length > 0) {
      const { error: insertError } = await supabase.from("company_news").insert(scored);
      if (insertError) {
        console.error("Failed to store news:", insertError.message);
      }
    }

    // ── 5. Update news signal in risk score ───────────────────────────────────
    const totalImpact = scored.reduce((sum, a) => sum + (a.score_impact ?? 0), 0);
    const clampedImpact = Math.max(-10, Math.min(25, totalImpact)); // cap contribution

    if (clampedImpact !== 0) {
      const { data: existingScore } = await supabase
        .from("company_risk_scores")
        .select("risk_score, risk_factors")
        .eq("company_id", company.id)
        .maybeSingle();

      if (existingScore) {
        const newScore = Math.max(0, Math.min(100, (existingScore.risk_score ?? 0) + clampedImpact));
        const existingFactors = Array.isArray(existingScore.risk_factors) ? existingScore.risk_factors : [];

        // Remove old news factor if present
        const filteredFactors = existingFactors.filter((f: any) => f.code !== "NEWS_SENTIMENT");

        if (clampedImpact > 0) {
          filteredFactors.push({
            code: "NEWS_SENTIMENT",
            label: `Negative news coverage (${scored.filter(a => a.sentiment_score < -0.1).length} articles)`,
            points: clampedImpact,
            event_count: scored.filter(a => a.sentiment_score < -0.1).length,
            last_seen_at: now,
          });
        }

        await supabase.from("company_risk_scores").update({
          risk_score: newScore,
          risk_factors: filteredFactors,
          updated_at: now,
        }).eq("company_id", company.id);
      }
    }

    return jsonResponse(200, {
      success: true,
      cached: false,
      articles: scored,
      news_score_impact: clampedImpact,
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse(500, {
      error: "Unexpected error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});
