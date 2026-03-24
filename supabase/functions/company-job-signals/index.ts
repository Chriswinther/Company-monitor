import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Types ────────────────────────────────────────────────────────────────────

type JobSignalType =
  | "EXECUTIVE_ROLE_POSTED"     // CEO/direktør/CFO explicitly advertised
  | "BOARD_ROLE_POSTED"         // Board member / chairman being recruited
  | "MASS_HIRING"               // 5+ job postings in 30 days — rapid headcount growth
  | "SENIOR_HIRING"             // Multiple senior/manager roles open
  | "RESTRUCTURE_SIGNAL";       // Roles suggest org restructure (new division heads etc.)

type JobPosting = {
  title: string;
  company: string;
  url: string;
  published_at: string;
  description: string;
  signal_type: JobSignalType | null;
  signal_score: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Executive/director title keywords (Danish + English)
// A job posting matching these against a watched company is a direct leadership signal
const EXECUTIVE_TITLES = [
  // Danish
  "administrerende direktør", "adm. direktør", "adm direktør",
  "ceo", "chief executive",
  "finansdirektør", "økonomidirektør",
  "cfo", "chief financial officer",
  "salgsdirektør", "marketingdirektør", "driftsdirektør",
  "coo", "cmo", "cso", "cto", "cpo",
  "vicedirektør", "vp ", "vice president",
  "country manager", "general manager",
  "direktør",  // broad catch — scored lower than specific titles
];

const BOARD_TITLES = [
  "bestyrelsesformand", "bestyrelsesmedlem", "bestyrelse",
  "chairman", "board member", "board director", "non-executive",
  "tilsynsråd", "advisory board",
];

const SENIOR_TITLES = [
  "chef", "leder", "head of", "director of",
  "afdelingsleder", "afdelingschef",
  "regional manager", "divisional head",
  "partner", "managing director",
];

// Score each signal type
const SIGNAL_SCORES: Record<JobSignalType, number> = {
  EXECUTIVE_ROLE_POSTED: 25,   // CEO/CFO vacancy = direct evidence of leadership change
  BOARD_ROLE_POSTED: 15,       // Board recruitment often precedes executive change
  MASS_HIRING: 12,             // 5+ postings = rapid growth, consistent with growth-stress signals
  SENIOR_HIRING: 8,            // Multiple senior roles = org expanding or restructuring
  RESTRUCTURE_SIGNAL: 10,      // New division heads = structural change underway
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: corsHeaders });
}

function cleanCompanyName(name: string): string {
  return name
    .replace(/\s+(A\/S|ApS|I\/S|K\/S|P\/S|IVS|SE|A\.S\.|APS|AS)$/i, "")
    .replace(/[^\wæøåÆØÅ\s-]/g, "")
    .trim();
}

function titleMatches(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function detectSignalType(title: string, description: string): { type: JobSignalType | null; score: number } {
  const text = `${title} ${description}`.toLowerCase();

  if (titleMatches(text, EXECUTIVE_TITLES.slice(0, 12))) {
    // Specific executive titles (CEO, CFO, COO etc.) — high confidence
    return { type: "EXECUTIVE_ROLE_POSTED", score: SIGNAL_SCORES.EXECUTIVE_ROLE_POSTED };
  }
  if (titleMatches(text, BOARD_TITLES)) {
    return { type: "BOARD_ROLE_POSTED", score: SIGNAL_SCORES.BOARD_ROLE_POSTED };
  }
  if (titleMatches(text, EXECUTIVE_TITLES.slice(12))) {
    // Broad "direktør" catch — lower confidence but still significant
    return { type: "EXECUTIVE_ROLE_POSTED", score: 15 };
  }
  if (titleMatches(text, SENIOR_TITLES)) {
    return { type: "SENIOR_HIRING", score: SIGNAL_SCORES.SENIOR_HIRING };
  }
  return { type: null, score: 0 };
}

// ─── Jobindex RSS Fetch ────────────────────────────────────────────────────────
//
// Jobindex exposes RSS feeds mirroring their job search results.
// URL pattern: https://www.jobindex.dk/jobsoegning.rss?q=QUERY&area=0&lang=da
//
// We run two queries per company:
//   1. Company name alone        → catches ALL job postings from that employer
//   2. Company name + title kws  → targeted executive search
//
// Both results are merged and deduplicated by URL.

async function fetchJobindexRSS(query: string): Promise<JobPosting[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.jobindex.dk/jobsoegning.rss?q=${encodedQuery}&area=0&lang=da`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Vantage/1.0 (company monitoring; contact@vantage.dk)",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`Jobindex RSS ${res.status} for query: ${query}`);
      return [];
    }

    const xml = await res.text();
    return parseRSS(xml);
  } catch (err) {
    console.warn("Jobindex fetch error:", err);
    return [];
  }
}

function parseRSS(xml: string): JobPosting[] {
  const items: JobPosting[] = [];

  // Extract <item> blocks
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title       = extractTag(block, "title");
    const link        = extractTag(block, "link");
    const description = extractTag(block, "description");
    const pubDate     = extractTag(block, "pubDate");
    const company     = extractTag(block, "jobindex:company") ||
                        extractTag(block, "source") || "";

    if (!title || !link) continue;

    const published_at = pubDate ? new Date(pubDate).toISOString() : new Date().toISOString();
    const { type, score } = detectSignalType(title, description);

    items.push({
      title: stripCdata(title),
      company: stripCdata(company),
      url: stripCdata(link),
      published_at,
      description: stripCdata(description).slice(0, 500),
      signal_type: type,
      signal_score: score,
    });
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  return re.exec(xml)?.[1]?.trim() ?? "";
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    const { company_id, cvr_number, company_name } = await req.json();
    if (!company_id || !company_name) {
      return jsonResponse(400, { error: "company_id and company_name required" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cleanName = cleanCompanyName(company_name);

    // ── Fetch from Jobindex ───────────────────────────────────────────────────
    // Query 1: all postings from this company (broad)
    // Query 2: executive titles specifically
    const [broadPostings, execPostings] = await Promise.all([
      fetchJobindexRSS(cleanName),
      fetchJobindexRSS(`${cleanName} direktør OR CEO OR CFO OR formand`),
    ]);

    // Merge + deduplicate by URL
    const seenUrls = new Set<string>();
    const allPostings: JobPosting[] = [];
    for (const p of [...execPostings, ...broadPostings]) {
      if (!seenUrls.has(p.url)) {
        seenUrls.add(p.url);
        allPostings.push(p);
      }
    }

    // ── Classify MASS_HIRING if 5+ postings found ─────────────────────────────
    if (allPostings.length >= 5) {
      // Tag non-exec postings as mass-hiring signal
      for (const p of allPostings) {
        if (!p.signal_type) {
          p.signal_type = "MASS_HIRING";
          p.signal_score = SIGNAL_SCORES.MASS_HIRING;
        }
      }
    }

    // ── Classify RESTRUCTURE_SIGNAL ───────────────────────────────────────────
    // If 3+ different senior division-head roles are posted simultaneously
    const seniorCount = allPostings.filter(
      (p) => p.signal_type === "SENIOR_HIRING" || p.signal_type === "EXECUTIVE_ROLE_POSTED"
    ).length;
    if (seniorCount >= 3) {
      for (const p of allPostings) {
        if (p.signal_type === "SENIOR_HIRING") {
          p.signal_type = "RESTRUCTURE_SIGNAL";
          p.signal_score = SIGNAL_SCORES.RESTRUCTURE_SIGNAL;
        }
      }
    }

    // ── Total signal score from job postings ──────────────────────────────────
    // Use highest single signal + diminishing returns for additional signals
    const signalPostings = allPostings.filter((p) => p.signal_score > 0);
    signalPostings.sort((a, b) => b.signal_score - a.signal_score);

    let totalScore = 0;
    signalPostings.forEach((p, i) => {
      // First signal: full points. Additional signals: halving returns (max 3 signals counted)
      if (i === 0) totalScore += p.signal_score;
      else if (i === 1) totalScore += Math.round(p.signal_score * 0.5);
      else if (i === 2) totalScore += Math.round(p.signal_score * 0.25);
    });
    totalScore = Math.min(totalScore, 35); // cap contribution at 35 pts

    // ── Upsert to job_signals table ───────────────────────────────────────────
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // refresh daily

    // Clear old postings for this company first
    await supabase
      .from("job_signals")
      .delete()
      .eq("company_id", company_id);

    if (allPostings.length > 0) {
      const rows = allPostings.map((p) => ({
        company_id,
        cvr_number: cvr_number ?? null,
        title: p.title,
        company_name: p.company || company_name,
        url: p.url,
        published_at: p.published_at,
        description: p.description,
        signal_type: p.signal_type,
        signal_score: p.signal_score,
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      }));

      const { error } = await supabase.from("job_signals").insert(rows);
      if (error) console.warn("Insert job_signals error:", error.message);
    }

    // ── Summary signals for scoring engine ────────────────────────────────────
    const executivePostings = allPostings.filter(
      (p) => p.signal_type === "EXECUTIVE_ROLE_POSTED"
    );
    const boardPostings = allPostings.filter(
      (p) => p.signal_type === "BOARD_ROLE_POSTED"
    );

    return jsonResponse(200, {
      company_id,
      company_name,
      postings_found: allPostings.length,
      signal_postings: signalPostings.length,
      total_score_contribution: totalScore,
      signals: {
        executive_role_posted: executivePostings.length > 0,
        board_role_posted: boardPostings.length > 0,
        mass_hiring: allPostings.length >= 5,
        restructure_signal: seniorCount >= 3,
      },
      top_postings: allPostings.slice(0, 5).map((p) => ({
        title: p.title,
        signal_type: p.signal_type,
        signal_score: p.signal_score,
        published_at: p.published_at,
        url: p.url,
      })),
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("company-job-signals error:", err);
    return jsonResponse(500, { error: String(err) });
  }
});
