import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = "low" | "moderate" | "high" | "critical";
type OpportunityType = "stable" | "transition" | "growth" | "turnaround";

type CompanyRow = { id: string; cvr_number: string; name?: string | null; status?: string | null };
type CompanyEventRow = { id?: string; company_id: string; event_type: string; detected_at: string; old_value?: Record<string, unknown> | null; new_value?: Record<string, unknown> | null };
type SignalFactor = { code: string; label: string; points: number; event_count: number; last_seen_at: string | null };

type FinancialYear = {
  year: number;
  revenue: number | null;
  gross_profit: number | null;
  profit_before_tax: number | null;
  net_result: number | null;
  equity: number | null;
  total_assets: number | null;
  short_term_debt: number | null;
  long_term_debt: number | null;
  period_start: string | null;
  period_end: string | null;
};

type FinancialData = {
  years: FinancialYear[];
  latest: FinancialYear | null;
  revenue_trend: "growing" | "declining" | "stable" | "unknown";
  equity_negative: boolean;
  consecutive_losses: number;
  debt_ratio: number | null;
} | null;

type VirkData = {
  status: string | null;
  industry: string | null;
  employeeCount: number | null;
  foundedYear: number | null;
  address: { street: string | null; city: string | null; zipcode: string | null } | null;
} | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ANALYSIS_WINDOW_DAYS = 180;
const WINDOW_30_DAYS = 30;
const WINDOW_60_DAYS = 60;
const WINDOW_90_DAYS = 90;
const VIRK_BASE = "http://distribution.virk.dk";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: corsHeaders });
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function safeStr(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}

function extractNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") { const n = Number(value.replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : null; }
  if (value && typeof value === "object") {
    for (const k of ["employee_count","employees","count","value","new_count","old_count"]) {
      const n = extractNum((value as Record<string, unknown>)[k]);
      if (n !== null) return n;
    }
  }
  return null;
}

function normalizeStatus(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "object") {
    for (const k of ["status","name","value","label"]) { const s = safeStr((value as Record<string, unknown>)[k]).toLowerCase(); if (s) return s; }
  }
  return safeStr(value).toLowerCase();
}

function buildEventCounts(events: CompanyEventRow[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const e of events) c[e.event_type] = (c[e.event_type] || 0) + 1;
  return c;
}

function latestAt(events: CompanyEventRow[]): string | null {
  if (!events.length) return null;
  return [...events].sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime())[0]?.detected_at ?? null;
}

function addFactor(factors: SignalFactor[], code: string, label: string, points: number, events: CompanyEventRow[]) {
  if (points <= 0 || !events.length) return;
  factors.push({ code, label, points, event_count: events.length, last_seen_at: latestAt(events) });
}

function withinDays(a: string, b: string, days: number): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000 <= days;
}

function toRiskLevel(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 40) return "high";
  if (score >= 20) return "moderate";
  return "low";
}

function toOpportunity(args: { leadership: number; drop25: number; empGrowth: number; statusChange: boolean; finDistress: boolean; finGrowth: boolean }): OpportunityType {
  if (args.finDistress || args.drop25 > 0 || (args.statusChange && args.leadership >= 2)) return "turnaround";
  if (args.finGrowth && args.leadership <= 1 && !args.statusChange) return "growth";
  if (args.leadership > 0 || args.statusChange || args.empGrowth > 0) return "transition";
  return "stable";
}

function extractXbrl(facts: any[], ...fields: string[]): number | null {
  for (const field of fields) {
    const f = facts.find((x: any) => (x?.elementName ?? x?.field ?? "").toLowerCase().includes(field.toLowerCase()));
    if (f?.value !== undefined && f?.value !== null) { const n = Number(f.value); if (!isNaN(n)) return n; }
  }
  return null;
}

// ─── Virk company data ────────────────────────────────────────────────────────

async function fetchVirkData(cvr: string, auth: string): Promise<VirkData> {
  try {
    const res = await fetch(`${VIRK_BASE}/cvr-permanent/virksomhed/_search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ query: { term: { "Vrvirksomhed.cvrNummer": parseInt(cvr, 10) } }, size: 1 }),
    });
    if (!res.ok) return null;
    const v = (await res.json())?.hits?.hits?.[0]?._source?.Vrvirksomhed;
    if (!v) return null;

    const statuses: any[] = Array.isArray(v.virksomhedsstatus) ? v.virksomhedsstatus : [];
    const status = (statuses.find((s: any) => !s.periode?.gyldigTil) ?? statuses[0])?.status ?? null;
    const branches: any[] = Array.isArray(v.hovedbranche) ? v.hovedbranche : [];
    const industry = (branches.find((b: any) => !b.periode?.gyldigTil) ?? branches[0])?.branchetekst ?? null;
    const emps: any[] = Array.isArray(v.aarsbeskaeftigelse) ? v.aarsbeskaeftigelse : [];
    const empCount = emps.sort((a: any, b: any) => (b.aar ?? 0) - (a.aar ?? 0))[0]?.antalAnsatte ?? null;
    const addrs: any[] = Array.isArray(v.beliggenhedsadresse) ? v.beliggenhedsadresse : [];
    const addr = addrs.find((a: any) => !a.periode?.gyldigTil) ?? addrs[0];
    const founded = v.stiftelsesdato ? new Date(v.stiftelsesdato).getFullYear() : null;

    return {
      status,
      industry,
      employeeCount: empCount,
      foundedYear: founded,
      address: addr ? { street: addr.vejnavn ?? null, city: addr.postdistrikt ?? null, zipcode: addr.postnummer ? String(addr.postnummer) : null } : null,
    };
  } catch { return null; }
}

// ─── Regnskabsdata ────────────────────────────────────────────────────────────

async function fetchFinancials(cvr: string, auth: string): Promise<FinancialData> {
  try {
    const res = await fetch(`${VIRK_BASE}/offentliggoerelser/_search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({
        query: {
          bool: {
            must: [
              { term: { cvrNummer: parseInt(cvr, 10) } },
              { term: { "offentliggoerelse.dokumenter.dokumentType": "AARSRAPPORT" } },
            ],
          },
        },
        sort: [{ "offentliggoerelse.offentliggoerelsesTidspunkt": { order: "desc" } }],
        size: 5,
      }),
    });

    if (!res.ok) { console.warn("Regnskab API:", res.status); return null; }

    const hits: any[] = (await res.json())?.hits?.hits ?? [];
    if (!hits.length) return null;

    const years: FinancialYear[] = hits.map((hit: any): FinancialYear | null => {
      const doc = hit?._source;
      if (!doc) return null;
      const xbrl = doc?.xbrlData ?? doc?.regnskabsData ?? {};
      const facts: any[] = Array.isArray(xbrl?.facts) ? xbrl.facts : Object.entries(xbrl).map(([k, v]) => ({ elementName: k, value: v }));
      const period = doc?.regnskabsperiode ?? doc?.offentliggoerelse?.regnskabsperiode ?? {};
      const year = period?.slutDato ? new Date(period.slutDato).getFullYear() : new Date().getFullYear();

      return {
        year,
        revenue: extractXbrl(facts, "nettoomsaetning", "NetRevenue", "GrossRevenue"),
        gross_profit: extractXbrl(facts, "bruttofortjeneste", "GrossProfit"),
        profit_before_tax: extractXbrl(facts, "ResultatFoerSkat", "ProfitLossBeforeTax"),
        net_result: extractXbrl(facts, "AaretResultat", "ProfitLoss", "NetProfitLoss"),
        equity: extractXbrl(facts, "Egenkapital", "Equity", "OwnersEquity"),
        total_assets: extractXbrl(facts, "AktivErIAlt", "Assets", "TotalAssets"),
        short_term_debt: extractXbrl(facts, "KortfristetGaeld", "ShorttermDebt"),
        long_term_debt: extractXbrl(facts, "LangfristetGaeld", "LongtermDebt"),
        period_start: period?.startDato ?? null,
        period_end: period?.slutDato ?? null,
      };
    }).filter((y): y is FinancialYear => y !== null).sort((a, b) => b.year - a.year);

    if (!years.length) return null;

    const latest = years[0];
    let revenue_trend: "growing" | "declining" | "stable" | "unknown" = "unknown";
    if (years.length >= 2 && years[0].revenue !== null && years[1].revenue !== null && years[1].revenue !== 0) {
      const pct = ((years[0].revenue - years[1].revenue) / Math.abs(years[1].revenue)) * 100;
      revenue_trend = pct > 5 ? "growing" : pct < -5 ? "declining" : "stable";
    }

    let consecutive_losses = 0;
    for (const y of years) {
      if (y.net_result !== null && y.net_result < 0) consecutive_losses++;
      else break;
    }

    const totalDebt = (latest.short_term_debt ?? 0) + (latest.long_term_debt ?? 0);
    const debt_ratio = latest.total_assets && latest.total_assets > 0 ? totalDebt / latest.total_assets : null;

    return { years, latest, revenue_trend, equity_negative: (latest.equity ?? 0) < 0, consecutive_losses, debt_ratio };
  } catch (err) { console.warn("Financials error:", err); return null; }
}

// ─── News sentiment type ──────────────────────────────────────────────────────

type NewsArticleRow = {
  sentiment_score: number | null;
  score_impact: number | null;
  sentiment_label: string | null;
  published_at: string;
};

// ─── Score ────────────────────────────────────────────────────────────────────

function calculateScore(company: CompanyRow, events: CompanyEventRow[], virk: VirkData, fin: FinancialData, news: NewsArticleRow[] = []) {
  const now = new Date().toISOString();
  const factors: SignalFactor[] = [];
  const eventCounts = buildEventCounts(events);
  let score = 0;
  let finDistress = false, finGrowth = false;

  const ceoEvts = events.filter((e) => e.event_type === "CEO_CHANGED");
  const mgmtEvts = events.filter((e) => ["MANAGEMENT_CHANGED","BOARD_MEMBER_ADDED","BOARD_MEMBER_REMOVED","EXECUTIVE_ADDED","EXECUTIVE_REMOVED"].includes(e.event_type));
  const statusEvts = events.filter((e) => e.event_type === "STATUS_CHANGED");
  const empEvts = events.filter((e) => e.event_type === "EMPLOYEE_COUNT_CHANGED");
  const addrEvts = events.filter((e) => e.event_type === "ADDRESS_CHANGED");
  const leaderEvts = [...ceoEvts, ...mgmtEvts];

  // ── Financial signals ────────────────────────────────────────────────────────
  if (fin) {
    if (fin.equity_negative) {
      score += 25; finDistress = true;
      factors.push({ code: "NEGATIVE_EQUITY", label: "Negative equity — teknisk insolvens", points: 25, event_count: 1, last_seen_at: now });
    }
    if (fin.consecutive_losses >= 3) {
      score += 20; finDistress = true;
      factors.push({ code: "CONSECUTIVE_LOSSES_3", label: `${fin.consecutive_losses} consecutive years of losses`, points: 20, event_count: fin.consecutive_losses, last_seen_at: now });
    } else if (fin.consecutive_losses === 2) {
      score += 12;
      factors.push({ code: "CONSECUTIVE_LOSSES_2", label: "2 consecutive years of losses", points: 12, event_count: 2, last_seen_at: now });
    } else if (fin.consecutive_losses === 1) {
      score += 6;
      factors.push({ code: "NET_LOSS", label: "Net loss in latest financial year", points: 6, event_count: 1, last_seen_at: now });
    }
    if (fin.revenue_trend === "declining") {
      score += 10;
      factors.push({ code: "DECLINING_REVENUE", label: "Revenue declining year-over-year", points: 10, event_count: 1, last_seen_at: now });
    }
    if (fin.revenue_trend === "growing") {
      score -= 5; finGrowth = true;
      factors.push({ code: "GROWING_REVENUE", label: "Revenue growing year-over-year", points: -5, event_count: 1, last_seen_at: now });
    }
    if (fin.debt_ratio !== null) {
      if (fin.debt_ratio > 0.9) {
        score += 20; finDistress = true;
        factors.push({ code: "CRITICAL_DEBT_RATIO", label: `Debt ratio ${(fin.debt_ratio * 100).toFixed(0)}% of assets`, points: 20, event_count: 1, last_seen_at: now });
      } else if (fin.debt_ratio > 0.7) {
        score += 10;
        factors.push({ code: "HIGH_DEBT_RATIO", label: `High debt ratio ${(fin.debt_ratio * 100).toFixed(0)}% of assets`, points: 10, event_count: 1, last_seen_at: now });
      }
    }
    if (finDistress && leaderEvts.length > 0) {
      score += 15;
      factors.push({ code: "FINANCIAL_DISTRESS_LEADERSHIP", label: "Financial distress + leadership change", points: 15, event_count: leaderEvts.length, last_seen_at: latestAt(leaderEvts) });
    }
  }

  // ── Virk signals ─────────────────────────────────────────────────────────────
  if (virk) {
    if (virk.status && ["konkurs","tvangsopløsning","opløst","ophørt"].some((k) => virk.status!.toLowerCase().includes(k))) {
      score += 40;
      factors.push({ code: "VIRK_CRITICAL_STATUS", label: `Critical status: ${virk.status}`, points: 40, event_count: 1, last_seen_at: now });
    }
    if (virk.foundedYear && (new Date().getFullYear() - virk.foundedYear) < 2 && leaderEvts.length > 0) {
      score += 10;
      factors.push({ code: "YOUNG_COMPANY_LEADERSHIP", label: "Young company with leadership changes", points: 10, event_count: leaderEvts.length, last_seen_at: latestAt(leaderEvts) });
    }
    if (virk.employeeCount !== null && virk.employeeCount < 10 && leaderEvts.length >= 2) {
      score += 12;
      factors.push({ code: "SMALL_COMPANY_TURNOVER", label: "Small company with multiple leadership changes", points: 12, event_count: leaderEvts.length, last_seen_at: latestAt(leaderEvts) });
    }
  }

  // ── Event signals ─────────────────────────────────────────────────────────────
  if (ceoEvts.length) { const p = ceoEvts.length * 15; score += p; addFactor(factors, "CEO_CHANGED", "CEO changed", p, ceoEvts); }
  if (mgmtEvts.length) { const p = mgmtEvts.length * 8; score += p; addFactor(factors, "MANAGEMENT_CHANGED", "Management changed", p, mgmtEvts); }
  if (leaderEvts.length >= 2) { score += 10; addFactor(factors, "MULTIPLE_LEADERSHIP_CHANGES", "Multiple leadership changes", 10, leaderEvts); }

  if (statusEvts.length) {
    const p = statusEvts.length * 20; score += p;
    addFactor(factors, "STATUS_CHANGED", "Company status changed", p, statusEvts);
    const crit = statusEvts.filter((e) => ["bankrupt","liquidation","dissolved","tvangsopløsning","opløsning"].some((t) => normalizeStatus(e.new_value).includes(t)));
    if (crit.length) { score += 35; addFactor(factors, "CRITICAL_STATUS_CHANGE", "Critical company status", 35, crit); }
  }

  const drop10: CompanyEventRow[] = [], drop25: CompanyEventRow[] = [], drop50: CompanyEventRow[] = [], empGrowth: CompanyEventRow[] = [];
  for (const e of empEvts) {
    const { percentDrop, percentIncrease } = (() => {
      const old = extractNum(e.old_value), nw = extractNum(e.new_value);
      if (old === null || nw === null || old <= 0) return { percentDrop: 0, percentIncrease: 0 };
      return { percentDrop: nw < old ? ((old - nw) / old) * 100 : 0, percentIncrease: nw > old ? ((nw - old) / old) * 100 : 0 };
    })();
    if (percentDrop > 10) drop10.push(e);
    if (percentDrop > 25) drop25.push(e);
    if (percentDrop > 50) drop50.push(e);
    if (percentIncrease > 10) empGrowth.push(e);
  }
  if (drop10.length) { score += 8; addFactor(factors, "EMPLOYEE_DROP_10", "Employee count dropped >10%", 8, drop10); }
  if (drop25.length) { score += 15; addFactor(factors, "EMPLOYEE_DROP_25", "Employee count dropped >25%", 15, drop25); }
  if (drop50.length) { score += 25; addFactor(factors, "EMPLOYEE_DROP_50", "Employee count dropped >50%", 25, drop50); }
  if (empGrowth.length) { score += 5; addFactor(factors, "EMPLOYEE_GROWTH", "Employee count increased", 5, empGrowth); }

  if (addrEvts.length) { const p = addrEvts.length * 5; score += p; addFactor(factors, "ADDRESS_CHANGED", "Address changed", p, addrEvts); }
  if (addrEvts.length >= 2) { score += 10; addFactor(factors, "MULTIPLE_ADDRESS_CHANGES", "Multiple address changes", 10, addrEvts); }

  const s30 = new Date(daysAgoIso(WINDOW_30_DAYS)).getTime(), s90 = new Date(daysAgoIso(WINDOW_90_DAYS)).getTime();
  const last30 = events.filter((e) => new Date(e.detected_at).getTime() >= s30);
  const last90 = events.filter((e) => new Date(e.detected_at).getTime() >= s90);
  if (last30.length >= 3) { score += 10; addFactor(factors, "HIGH_FREQ_30D", "Multiple changes in 30 days", 10, last30); }
  if (last90.length >= 5) { score += 15; addFactor(factors, "HIGH_FREQ_90D", "High frequency in 90 days", 15, last90); }
  if (events.length >= 8) { score += 20; addFactor(factors, "HIGH_FREQ_180D", "High frequency in 180 days", 20, events); }

  if (ceoEvts.some((c) => statusEvts.some((s) => withinDays(c.detected_at, s.detected_at, WINDOW_90_DAYS)))) {
    score += 15; factors.push({ code: "CEO_STATUS_COMBO", label: "CEO + status change within 90d", points: 15, event_count: 2, last_seen_at: latestAt([...ceoEvts, ...statusEvts]) });
  }
  if (ceoEvts.some((c) => drop25.some((e) => withinDays(c.detected_at, e.detected_at, WINDOW_90_DAYS)))) {
    score += 15; factors.push({ code: "CEO_EMPLOYEE_DROP_COMBO", label: "CEO change + employee drop within 90d", points: 15, event_count: 2, last_seen_at: latestAt([...ceoEvts, ...drop25]) });
  }
  if (statusEvts.some((s) => addrEvts.some((a) => withinDays(s.detected_at, a.detected_at, WINDOW_60_DAYS)))) {
    score += 10; factors.push({ code: "STATUS_ADDR_COMBO", label: "Status + address change within 60d", points: 10, event_count: 2, last_seen_at: latestAt([...statusEvts, ...addrEvts]) });
  }
  if (new Set(last90.map((e) => e.event_type)).size >= 3) {
    score += 12; factors.push({ code: "MULTI_SIGNAL_PATTERN", label: "3+ signal types in 90 days", points: 12, event_count: new Set(last90.map((e) => e.event_type)).size, last_seen_at: latestAt(last90) });
  }

  // ── News sentiment ───────────────────────────────────────────────────────────
  if (news.length > 0) {
    const totalNewsImpact = news.reduce((sum, a) => sum + (a.score_impact ?? 0), 0);
    const clampedNewsImpact = Math.max(-10, Math.min(25, totalNewsImpact));

    if (clampedNewsImpact !== 0) {
      score += clampedNewsImpact;
      const negCount = news.filter((a) => (a.sentiment_score ?? 0) < -0.1).length;
      const posCount = news.filter((a) => (a.sentiment_score ?? 0) > 0.1).length;
      const latestArticle = [...news].sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())[0];

      if (clampedNewsImpact > 0 && negCount > 0) {
        factors.push({
          code: "NEWS_SENTIMENT",
          label: `Negative news coverage (${negCount} article${negCount > 1 ? "s" : ""})`,
          points: clampedNewsImpact,
          event_count: negCount,
          last_seen_at: latestArticle?.published_at ?? now,
        });
      } else if (clampedNewsImpact < 0 && posCount > 0) {
        factors.push({
          code: "NEWS_SENTIMENT_POSITIVE",
          label: `Positive news coverage (${posCount} article${posCount > 1 ? "s" : ""})`,
          points: clampedNewsImpact,
          event_count: posCount,
          last_seen_at: latestArticle?.published_at ?? now,
        });
      }
    }
  }

  score = Math.max(0, Math.min(100, score));
  factors.sort((a, b) => b.points - a.points);

  return {
    score,
    risk_level: toRiskLevel(score),
    opportunity_type: toOpportunity({ leadership: leaderEvts.length, drop25: drop25.length, empGrowth: empGrowth.length, statusChange: statusEvts.length > 0, finDistress, finGrowth }),
    risk_factors: factors,
    event_counts: eventCounts,
    summary: {
      company_id: company.id,
      cvr_number: company.cvr_number,
      company_name: company.name ?? null,
      analyzed_events: events.length,
      analyzed_window_days: ANALYSIS_WINDOW_DAYS,
      calculated_at: now,
      data_sources: { events: true, virk: !!virk, financials: !!fin, financial_years: fin?.years.length ?? 0, news: news.length },
    },
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { success: false, error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const virkUser = Deno.env.get("VIRK_CVR_USERNAME");
    const virkPass = Deno.env.get("VIRK_CVR_PASSWORD");
    if (!supabaseUrl || !supabaseServiceRoleKey) return jsonResponse(500, { success: false, error: "Missing env vars" });

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = await req.json().catch(() => ({}));
    const companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";
    const cvr = typeof body.cvr === "string" ? body.cvr.trim() : "";
    if (!companyId && !cvr) return jsonResponse(400, { success: false, error: "Provide company_id or cvr" });

    let q = supabase.from("companies").select("id, cvr_number, name, status").limit(1);
    q = companyId ? q.eq("id", companyId) : q.eq("cvr_number", cvr.replace(/\D/g, ""));
    const { data: company, error: companyError } = await q.single();
    if (companyError || !company) return jsonResponse(404, { success: false, error: "Company not found", details: companyError?.message });

    const { data: eventsData, error: eventsError } = await supabase
      .from("company_events")
      .select("id, company_id, event_type, detected_at, old_value, new_value")
      .eq("company_id", company.id)
      .gte("detected_at", daysAgoIso(ANALYSIS_WINDOW_DAYS))
      .order("detected_at", { ascending: false });
    if (eventsError) return jsonResponse(500, { success: false, error: "Failed to fetch events", details: eventsError.message });

    const auth = virkUser && virkPass ? "Basic " + btoa(`${virkUser}:${virkPass}`) : null;

    // Fetch Virk, financials, and cached news in parallel
    const [virkData, finData, newsResult] = await Promise.all([
      auth ? fetchVirkData(company.cvr_number, auth) : Promise.resolve(null),
      auth ? fetchFinancials(company.cvr_number, auth) : Promise.resolve(null),
      supabase
        .from("company_news")
        .select("sentiment_score, score_impact, sentiment_label, published_at")
        .eq("company_id", company.id)
        .gt("expires_at", new Date().toISOString())
        .order("published_at", { ascending: false })
        .limit(15),
    ]);

    const newsArticles: NewsArticleRow[] = newsResult.data ?? [];

    // Update company record with fresh data
    if (virkData) {
      const update: Record<string, unknown> = { last_checked_at: new Date().toISOString() };
      if (virkData.status) update.status = virkData.status;
      if (virkData.employeeCount !== null) update.employee_count = virkData.employeeCount;
      if (virkData.industry) update.industry = virkData.industry;
      if (virkData.address) update.address = virkData.address;
      await supabase.from("companies").update(update).eq("id", company.id);
    }

    const result = calculateScore(company as CompanyRow, (eventsData ?? []) as CompanyEventRow[], virkData, finData, newsArticles);

    const { error: upsertError } = await supabase
      .from("company_risk_scores")
      .upsert({
        company_id: company.id,
        cvr_number: company.cvr_number,
        risk_score: result.score,
        risk_level: result.risk_level,
        risk_factors: result.risk_factors,
        event_counts: result.event_counts,
        calculated_at: result.summary.calculated_at,
        updated_at: result.summary.calculated_at,
      }, { onConflict: "company_id" });

    if (upsertError) return jsonResponse(500, { success: false, error: "Failed to store score", details: upsertError.message });

    // Write score history row (ignore errors — history is non-critical)
    await supabase.from("company_risk_score_history").insert({
      company_id: company.id,
      cvr_number: company.cvr_number,
      risk_score: result.score,
      risk_level: result.risk_level,
      calculated_at: result.summary.calculated_at,
    }).then(({ error }) => {
      if (error) console.warn("Score history insert failed:", error.message);
    });

    return jsonResponse(200, { success: true, company: { id: company.id, cvr_number: company.cvr_number, name: company.name }, data_sources: result.summary.data_sources, result });
  } catch (error) {
    return jsonResponse(500, { success: false, error: "Unexpected error", details: error instanceof Error ? error.message : String(error) });
  }
});