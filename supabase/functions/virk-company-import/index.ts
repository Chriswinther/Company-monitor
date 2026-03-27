import { createClient } from "@supabase/supabase-js";

// ─── Constants ────────────────────────────────────────────────────────────────

const VIRK_BASE = "http://distribution.virk.dk";
const DEFAULT_MIN_EMPLOYEES = 50;
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1000;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: corsHeaders });
}

function parseCvr(raw: unknown): string | null {
  const s = String(raw ?? "").replace(/\D/g, "").padStart(8, "0");
  return s.length >= 8 ? s : null;
}

// ─── Virk field extraction ────────────────────────────────────────────────────

function extractStatus(v: any): string | null {
  const arr: any[] = Array.isArray(v.virksomhedsstatus) ? v.virksomhedsstatus : [];
  const current = arr.find((s: any) => !s.periode?.gyldigTil) ?? arr[0];
  return current?.status?.toLowerCase() ?? null;
}

function extractIndustry(v: any): string | null {
  const arr: any[] = Array.isArray(v.hovedbranche) ? v.hovedbranche : [];
  const current = arr.find((b: any) => !b.periode?.gyldigTil) ?? arr[0];
  return current?.branchetekst ?? null;
}

function extractEmployeeCount(v: any): number | null {
  const arr: any[] = Array.isArray(v.aarsbeskaeftigelse) ? v.aarsbeskaeftigelse : [];
  if (!arr.length) return null;
  const latest = arr.sort((a: any, b: any) => (b.aar ?? 0) - (a.aar ?? 0))[0];
  const n = latest?.antalAnsatte;
  return typeof n === "number" ? n : null;
}

function extractAddress(v: any): Record<string, string | null> | null {
  const arr: any[] = Array.isArray(v.beliggenhedsadresse) ? v.beliggenhedsadresse : [];
  const addr = arr.find((a: any) => !a.periode?.gyldigTil) ?? arr[0];
  if (!addr) return null;
  return {
    street: addr.vejnavn ?? null,
    city: addr.postdistrikt ?? null,
    zipcode: addr.postnummer ? String(addr.postnummer) : null,
  };
}

function extractFoundedYear(v: any): number | null {
  if (!v.stiftelsesdato) return null;
  const y = new Date(v.stiftelsesdato).getFullYear();
  return isNaN(y) ? null : y;
}

function extractName(v: any): string | null {
  // Try nyesteNavn first (most up-to-date), then navne array
  const newest = v.virksomhedMetadata?.nyesteNavn?.navn;
  if (newest) return String(newest).trim();
  const navne: any[] = Array.isArray(v.navne) ? v.navne : [];
  const current = navne.find((n: any) => !n.periode?.gyldigTil) ?? navne[0];
  return current?.navn ? String(current.navn).trim() : null;
}

// ─── Build Elasticsearch query ────────────────────────────────────────────────

function buildQuery(opts: {
  minEmployees: number;
  activeOnly: boolean;
  industryCodes?: string[];
}) {
  const filters: any[] = [];

  if (opts.activeOnly) {
    filters.push({
      nested: {
        path: "Vrvirksomhed.virksomhedsstatus",
        query: {
          bool: {
            must: [{ term: { "Vrvirksomhed.virksomhedsstatus.status": "NORMAL" } }],
            must_not: [{ exists: { field: "Vrvirksomhed.virksomhedsstatus.periode.gyldigTil" } }],
          },
        },
      },
    });
  }

  if (opts.minEmployees > 0) {
    filters.push({
      nested: {
        path: "Vrvirksomhed.aarsbeskaeftigelse",
        query: {
          bool: {
            must: [
              { range: { "Vrvirksomhed.aarsbeskaeftigelse.antalAnsatte": { gte: opts.minEmployees } } },
            ],
            must_not: [{ exists: { field: "Vrvirksomhed.aarsbeskaeftigelse.aar" } }],
          },
        },
      },
    });
  }

  // Optionally restrict to specific industry codes (DB07-codes)
  if (opts.industryCodes?.length) {
    filters.push({
      nested: {
        path: "Vrvirksomhed.hovedbranche",
        query: {
          bool: {
            must: [{ terms: { "Vrvirksomhed.hovedbranche.branchekode": opts.industryCodes } }],
            must_not: [{ exists: { field: "Vrvirksomhed.hovedbranche.periode.gyldigTil" } }],
          },
        },
      },
    });
  }

  return filters.length ? { bool: { filter: filters } } : { match_all: {} };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "POST only" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const virkUser = Deno.env.get("VIRK_CVR_USERNAME");
  const virkPass = Deno.env.get("VIRK_CVR_PASSWORD");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }
  if (!virkUser || !virkPass) {
    return jsonResponse(503, {
      error: "VIRK_CVR_USERNAME and VIRK_CVR_PASSWORD not configured",
      hint: "Get credentials at https://datacvr.virk.dk — it's free",
    });
  }

  const body = await req.json().catch(() => ({}));

  // Params
  const minEmployees: number = body.min_employees ?? DEFAULT_MIN_EMPLOYEES;
  const from: number = body.from ?? 0;
  const size: number = Math.min(body.size ?? DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
  const activeOnly: boolean = body.active_only ?? true;
  const industryCodes: string[] | undefined = Array.isArray(body.industry_codes) ? body.industry_codes : undefined;
  const dryRun: boolean = body.dry_run ?? false;

  const auth = "Basic " + btoa(`${virkUser}:${virkPass}`);

  // Build and fire Elasticsearch query
  const esBody = {
    query: buildQuery({ minEmployees, activeOnly, industryCodes }),
    size,
    from,
    _source: [
      "Vrvirksomhed.cvrNummer",
      "Vrvirksomhed.virksomhedMetadata.nyesteNavn",
      "Vrvirksomhed.navne",
      "Vrvirksomhed.virksomhedsstatus",
      "Vrvirksomhed.hovedbranche",
      "Vrvirksomhed.aarsbeskaeftigelse",
      "Vrvirksomhed.stiftelsesdato",
      "Vrvirksomhed.beliggenhedsadresse",
    ],
    sort: [
      // Sort by employee count descending — biggest companies first
      {
        "Vrvirksomhed.aarsbeskaeftigelse.antalAnsatte": {
          order: "desc",
          nested: { path: "Vrvirksomhed.aarsbeskaeftigelse" },
          missing: "_last",
        },
      },
    ],
  };

  let virkRes: Response;
  try {
    virkRes = await fetch(`${VIRK_BASE}/cvr-permanent/virksomhed/_search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(esBody),
    });
  } catch (err) {
    return jsonResponse(502, { error: "Failed to reach Virk API", detail: String(err) });
  }

  if (!virkRes.ok) {
    const text = await virkRes.text().catch(() => "");
    return jsonResponse(virkRes.status, {
      error: `Virk API returned ${virkRes.status}`,
      detail: text.slice(0, 500),
    });
  }

  const virkData = await virkRes.json();
  const hits: any[] = virkData?.hits?.hits ?? [];
  const totalAvailable: number = virkData?.hits?.total?.value ?? virkData?.hits?.total ?? 0;

  // Map hits to company rows
  const now = new Date().toISOString();
  const companies: Record<string, unknown>[] = [];
  const skipped: string[] = [];

  for (const hit of hits) {
    const v = hit._source?.Vrvirksomhed;
    if (!v) continue;

    const cvr = parseCvr(v.cvrNummer);
    const name = extractName(v);

    if (!cvr || !name) {
      skipped.push(String(v?.cvrNummer ?? "unknown"));
      continue;
    }

    companies.push({
      cvr_number: cvr,
      name,
      status: extractStatus(v),
      industry: extractIndustry(v),
      employee_count: extractEmployeeCount(v),
      address: extractAddress(v),
      founded_year: extractFoundedYear(v),
      last_checked_at: now,
    });
  }

  if (dryRun) {
    return jsonResponse(200, {
      dry_run: true,
      would_upsert: companies.length,
      skipped: skipped.length,
      total_available: totalAvailable,
      from,
      next_from: from + size,
      has_more: from + size < totalAvailable,
      sample: companies.slice(0, 5),
    });
  }

  // Upsert into Supabase companies table
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const { error: upsertError } = await supabase
    .from("companies")
    .upsert(companies, { onConflict: "cvr_number" });

  if (upsertError) {
    return jsonResponse(500, { error: "Upsert failed", detail: upsertError.message });
  }

  return jsonResponse(200, {
    success: true,
    upserted: companies.length,
    skipped: skipped.length,
    total_available: totalAvailable,
    from,
    next_from: from + size,
    has_more: from + size < totalAvailable,
    params: { min_employees: minEmployees, active_only: activeOnly, size, from },
  });
});
