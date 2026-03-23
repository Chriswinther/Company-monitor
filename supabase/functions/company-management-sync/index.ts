import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

type RoleGroup = "executive" | "board" | "owner" | "other";
type Source = "cvr.dev" | "cvrapi.dk" | "manual";

interface ManagementRecord {
  company_id: string;
  cvr_number: string;
  person_name: string;
  role_name: string;
  role_group: RoleGroup | null;
  registered_since: string | null;
  registered_until: string | null;
  source: Source;
  source_reference: string | null;
  is_current: boolean;
  is_primary: boolean;
}

interface CvrApiPerson {
  name?: string;
  type?: string;
  period?: {
    start?: string;
    end?: string;
  };
  // cvrapi.dk format
  role?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: corsHeaders,
  });
}

function safeString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function normalizeCvr(value: unknown): string {
  return safeString(value).replace(/\D/g, "");
}

function parseDate(value: unknown): string | null {
  const raw = safeString(value);
  if (!raw) return null;

  // Handle YYYY-MM-DD, YYYY-MM-DDTHH:mm:ssZ, DD-MM-YYYY, YYYYMMDD
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})/, // ISO
    /^(\d{2})-(\d{2})-(\d{4})$/, // DD-MM-YYYY
    /^(\d{8})$/, // YYYYMMDD
  ];

  for (const fmt of formats) {
    const m = raw.match(fmt);
    if (m) {
      try {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
      } catch {
        // continue
      }
    }
  }

  return null;
}

function classifyRoleGroup(roleName: string): RoleGroup {
  const role = roleName.toLowerCase();

  if (
    role.includes("direktør") ||
    role.includes("direktion") ||
    role.includes("ceo") ||
    role.includes("adm.") ||
    role.includes("administrerende")
  ) {
    return "executive";
  }

  if (
    role.includes("bestyrelse") ||
    role.includes("board") ||
    role.includes("chairman") ||
    role.includes("formand")
  ) {
    return "board";
  }

  if (
    role.includes("ejer") ||
    role.includes("owner") ||
    role.includes("anpartshaver") ||
    role.includes("aktionær") ||
    role.includes("deltager")
  ) {
    return "owner";
  }

  return "other";
}

function isPrimaryRole(roleName: string, roleGroup: RoleGroup): boolean {
  const role = roleName.toLowerCase();
  return (
    roleGroup === "executive" &&
    (role.includes("administrerende direktør") ||
      role.includes("adm. direktør") ||
      role.includes("direktør") ||
      role.includes("ceo"))
  );
}

// ─── CVR API fetch ────────────────────────────────────────────────────────────

async function fetchFromCvrApi(cvr: string): Promise<ManagementRecord[]> {
  const url = `https://cvrapi.dk/api?search=${encodeURIComponent(cvr)}&country=dk`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "CompanyMonitor/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`CVR API returned ${response.status} for CVR ${cvr}`);
  }

  const data = await response.json();

  if (!data || data.error) {
    throw new Error(data?.error || "Invalid response from CVR API");
  }

  const records: ManagementRecord[] = [];

  // cvrapi.dk returns owners, management separately
  const owners: CvrApiPerson[] = Array.isArray(data.owners) ? data.owners : [];
  const management: CvrApiPerson[] = Array.isArray(data.management)
    ? data.management
    : [];
  const auditors: CvrApiPerson[] = Array.isArray(data.auditors)
    ? data.auditors
    : [];

  const allPeople = [
    ...owners.map((p) => ({ ...p, _section: "owner" })),
    ...management.map((p) => ({ ...p, _section: "management" })),
    ...auditors.map((p) => ({ ...p, _section: "auditor" })),
  ];

  for (const person of allPeople) {
    const name = safeString(person.name);
    if (!name) continue;

    // cvrapi.dk uses `type` for role name
    const roleName = safeString(person.type || person.role || person._section);
    if (!roleName) continue;

    const roleGroup = classifyRoleGroup(roleName);
    const registeredSince = parseDate(person.period?.start);
    const registeredUntil = parseDate(person.period?.end);
    const isCurrent = !registeredUntil;

    records.push({
      company_id: "", // filled in after DB lookup
      cvr_number: cvr,
      person_name: name,
      role_name: roleName,
      role_group: roleGroup,
      registered_since: registeredSince,
      registered_until: registeredUntil,
      source: "cvrapi.dk",
      source_reference: null,
      is_current: isCurrent,
      is_primary: isPrimaryRole(roleName, roleGroup),
    });
  }

  return records;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse(500, {
        success: false,
        error: "Missing Supabase environment variables",
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const body = await req.json().catch(() => ({}));
    const rawCvr = safeString(body?.cvr);
    const cvr = normalizeCvr(rawCvr);

    if (!cvr || cvr.length < 8) {
      return jsonResponse(400, {
        success: false,
        error: "Missing or invalid cvr in request body",
      });
    }

    // ── 1. Resolve company from DB ──────────────────────────────────────────

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, cvr_number, name")
      .eq("cvr_number", cvr)
      .maybeSingle();

    if (companyError) {
      return jsonResponse(500, {
        success: false,
        error: "Failed to query companies",
        details: companyError.message,
      });
    }

    if (!company) {
      return jsonResponse(404, {
        success: false,
        error: `Company with CVR ${cvr} not found in database`,
      });
    }

    // ── 2. Fetch management from CVR API ────────────────────────────────────

    let managementRecords: ManagementRecord[] = [];

    try {
      managementRecords = await fetchFromCvrApi(cvr);
    } catch (fetchError) {
      console.error("CVR API fetch failed:", fetchError);
      return jsonResponse(502, {
        success: false,
        error: "Failed to fetch management data from CVR API",
        details:
          fetchError instanceof Error ? fetchError.message : String(fetchError),
      });
    }

    if (managementRecords.length === 0) {
      // Update sync timestamp even if no records found
      await supabase
        .from("companies")
        .update({ management_last_synced_at: new Date().toISOString() })
        .eq("id", company.id);

      return jsonResponse(200, {
        success: true,
        cvr,
        company_id: company.id,
        company_name: company.name,
        synced_count: 0,
        management: [],
        message: "No management records found for this company",
      });
    }

    // Attach company_id to all records
    const recordsWithId = managementRecords.map((r) => ({
      ...r,
      company_id: company.id,
      cvr_number: company.cvr_number,
    }));

    // ── 3. Mark existing records as not current ─────────────────────────────

    await supabase
      .from("company_management")
      .update({ is_current: false })
      .eq("company_id", company.id);

    // ── 4. Upsert new records ───────────────────────────────────────────────

    const { data: upserted, error: upsertError } = await supabase
      .from("company_management")
      .upsert(recordsWithId, {
        onConflict: "company_id,person_name,role_name,registered_since",
        ignoreDuplicates: false,
      })
      .select("id, person_name, role_name, is_current, is_primary");

    if (upsertError) {
      console.error("Upsert error:", upsertError);

      // Fallback: insert one by one, skipping duplicates
      let insertedCount = 0;
      for (const record of recordsWithId) {
        const { error: insertError } = await supabase
          .from("company_management")
          .upsert(record, {
            onConflict:
              "company_id,person_name,role_name,registered_since",
          });

        if (!insertError) insertedCount++;
      }

      // Update sync timestamp
      await supabase
        .from("companies")
        .update({ management_last_synced_at: new Date().toISOString() })
        .eq("id", company.id);

      return jsonResponse(200, {
        success: true,
        cvr,
        company_id: company.id,
        company_name: company.name,
        synced_count: insertedCount,
        management: recordsWithId.map((r) => ({
          person_name: r.person_name,
          role_name: r.role_name,
          is_current: r.is_current,
          is_primary: r.is_primary,
        })),
        message: `Synced ${insertedCount} management records (fallback mode)`,
      });
    }

    // ── 5. Update company sync timestamp ────────────────────────────────────

    await supabase
      .from("companies")
      .update({ management_last_synced_at: new Date().toISOString() })
      .eq("id", company.id);

    const syncedCount = upserted?.length ?? recordsWithId.length;

    return jsonResponse(200, {
      success: true,
      cvr,
      company_id: company.id,
      company_name: company.name,
      synced_count: syncedCount,
      management: (upserted ?? recordsWithId).map((r) => ({
        person_name: r.person_name,
        role_name: r.role_name,
        is_current: r.is_current,
        is_primary: r.is_primary,
      })),
      message: `Successfully synced ${syncedCount} management records`,
    });
  } catch (error) {
    console.error("Unexpected error in company-management-sync:", error);
    return jsonResponse(500, {
      success: false,
      error: "Unexpected error in company-management-sync",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});