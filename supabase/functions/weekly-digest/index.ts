import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DigestedCompany {
  company_id: string;
  company_name: string;
  cvr_number: string;
  industry: string | null;
  risk_score: number;
  risk_level: string;
  latest_event_description: string | null;
  latest_event_type: string | null;
  latest_event_at: string | null;
}

interface UserDigest {
  user_id: string;
  email: string;
  full_name: string | null;
  companies: DigestedCompany[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "Boyden Monitor <onboarding@resend.dev>";
const TOP_N = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRiskEmoji(level: string): string {
  switch (level.toLowerCase()) {
    case "critical": return "🔴";
    case "high":     return "🟠";
    case "moderate": return "🟡";
    case "low":      return "🟢";
    default:         return "⚪";
  }
}

function getEventIcon(eventType: string | null): string {
  const icons: Record<string, string> = {
    CEO_CHANGED: "👔", MANAGEMENT_CHANGED: "👥", BOARD_MEMBER_ADDED: "➕",
    BOARD_MEMBER_REMOVED: "➖", ADDRESS_CHANGED: "📍", STATUS_CHANGED: "⚠️",
    NAME_CHANGED: "✏️", OWNERSHIP_CHANGED: "🔄", FINANCIAL_REPORT_FILED: "📊",
    INDUSTRY_CHANGED: "🏢", EMPLOYEE_COUNT_CHANGED: "👥",
  };
  return eventType ? (icons[eventType] ?? "📰") : "";
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("da-DK", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function getScoreBarColor(score: number): string {
  if (score >= 70) return "#DC2626";
  if (score >= 40) return "#EA580C";
  if (score >= 20) return "#D97706";
  return "#16A34A";
}

function getMondayDate(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ─── Email HTML ───────────────────────────────────────────────────────────────

function buildEmailHtml(digest: UserDigest): string {
  const firstName = digest.full_name?.split(" ")[0] ?? "there";
  const weekDate = getMondayDate();

  const companyRows = digest.companies.map((c, i) => {
    const scoreColor = getScoreBarColor(c.risk_score);
    const riskEmoji = getRiskEmoji(c.risk_level);
    const eventHtml = c.latest_event_description
      ? `<tr>
          <td style="padding: 8px 24px 16px; color: #6B7280; font-size: 13px; line-height: 1.5;">
            ${getEventIcon(c.latest_event_type)} ${c.latest_event_description}
            <span style="color: #9CA3AF; font-size: 11px; margin-left: 8px;">${formatDate(c.latest_event_at)}</span>
          </td>
        </tr>`
      : "";

    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 12px; background: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden;">
        <tr>
          <td style="padding: 16px 24px 8px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color: #9CA3AF; font-size: 11px; font-weight: 700;">#${i + 1}</span>
                  <span style="display: block; color: #1C2B3A; font-size: 16px; font-weight: 700; margin-top: 2px;">${c.company_name}</span>
                  <span style="color: #9CA3AF; font-size: 12px;">${c.cvr_number}${c.industry ? `  ·  ${c.industry}` : ""}</span>
                </td>
                <td style="text-align: right; vertical-align: top;">
                  <span style="display: inline-block; background: ${scoreColor}; color: #FFFFFF; font-size: 22px; font-weight: 900; padding: 6px 14px; border-radius: 8px; line-height: 1;">${Math.round(c.risk_score)}</span>
                  <span style="display: block; color: #9CA3AF; font-size: 10px; margin-top: 4px; text-align: center;">${riskEmoji} ${c.risk_level.toUpperCase()}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${eventHtml}
      </table>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weekly Signal Digest</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F4F6F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F4F6F9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 580px;">

          <!-- Header -->
          <tr>
            <td style="background: #FFFFFF; border-radius: 16px 16px 0 0; padding: 28px 32px 24px; border-bottom: 1px solid #E2E8F0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size: 28px; font-weight: 900; color: #1C2B3A;">boy</span><span style="font-size: 28px; font-weight: 900; color: #4A90D9;">d</span><span style="font-size: 28px; font-weight: 900; color: #1C2B3A;">en</span>
                    <span style="display: block; color: #9CA3AF; font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px;">Company Intelligence</span>
                  </td>
                  <td style="text-align: right;">
                    <span style="background: #F0FDF4; border: 1px solid #BBF7D0; color: #16A34A; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px;">Weekly Digest</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="background: #FFFFFF; padding: 24px 32px 8px;">
              <p style="margin: 0; color: #1C2B3A; font-size: 18px; font-weight: 700;">Good morning, ${firstName} 👋</p>
              <p style="margin: 8px 0 0; color: #6B7280; font-size: 14px; line-height: 1.6;">
                Here are your top ${digest.companies.length} company signals for the week of <strong>${weekDate}</strong>.
                ${digest.companies.length === 0 ? "No signal activity this week." : ""}
              </p>
            </td>
          </tr>

          <!-- Companies -->
          <tr>
            <td style="background: #FFFFFF; padding: 16px 32px 24px;">
              ${companyRows}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="background: #FFFFFF; padding: 0 32px 28px; text-align: center;">
              <a href="http://localhost:8081" style="display: inline-block; background: #4A90D9; color: #FFFFFF; font-size: 14px; font-weight: 700; padding: 12px 28px; border-radius: 8px; text-decoration: none;">
                Open Boyden Monitor →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #F4F6F9; border-radius: 0 0 16px 16px; padding: 20px 32px; text-align: center;">
              <p style="margin: 0; color: #9CA3AF; font-size: 11px; line-height: 1.6;">
                You're receiving this because you have companies on your Boyden Monitor watchlist.<br/>
                Danish Company Intelligence Platform
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Send email via Resend ────────────────────────────────────────────────────

async function sendDigestEmail(digest: UserDigest): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set");
    return false;
  }

  const subject = `📊 Your Weekly Signal Digest — ${getMondayDate()}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [digest.email],
      subject,
      html: buildEmailHtml(digest),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to send to ${digest.email}:`, error);
    return false;
  }

  console.log(`Sent digest to ${digest.email}`);
  return true;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing env vars" }), { status: 500, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Allow manual trigger with specific user_id for testing
    const body = await req.json().catch(() => ({}));
    const targetUserId = body?.user_id ?? null;

    // ── 1. Get all users with notifications enabled ────────────────────────

    let usersQuery = supabase
      .from("users")
      .select("id, email, full_name, notifications_enabled");

    if (targetUserId) {
      usersQuery = usersQuery.eq("id", targetUserId);
    } else {
      usersQuery = usersQuery.eq("notifications_enabled", true);
    }

    const { data: users, error: usersError } = await usersQuery;
    if (usersError) throw usersError;
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ message: "No users to digest" }), { status: 200, headers: corsHeaders });
    }

    const results: { email: string; success: boolean; companies: number }[] = [];

    for (const user of users) {
      try {
        // ── 2. Get watchlist companies ───────────────────────────────────

        const { data: watchlistRows } = await supabase
          .from("watchlists")
          .select("company_id, companies(id, name, cvr_number, industry)")
          .eq("user_id", user.id);

        if (!watchlistRows || watchlistRows.length === 0) continue;

        const companyIds = watchlistRows.map((r: any) => r.company_id);

        // ── 3. Get risk scores ───────────────────────────────────────────

        const { data: scores } = await supabase
          .from("company_risk_scores")
          .select("company_id, risk_score, risk_level")
          .in("company_id", companyIds)
          .order("risk_score", { ascending: false })
          .limit(TOP_N);

        if (!scores || scores.length === 0) continue;

        // ── 4. Get latest event per company ──────────────────────────────

        const topCompanyIds = scores.map((s: any) => s.company_id);

        const { data: events } = await supabase
          .from("company_events")
          .select("company_id, event_type, description, detected_at")
          .in("company_id", topCompanyIds)
          .order("detected_at", { ascending: false });

        // Build latest event map
        const latestEventMap = new Map<string, { event_type: string; description: string; detected_at: string }>();
        for (const event of events ?? []) {
          if (!latestEventMap.has(event.company_id)) {
            latestEventMap.set(event.company_id, event);
          }
        }

        // ── 5. Build company map ─────────────────────────────────────────

        const companyMap = new Map<string, any>();
        for (const row of watchlistRows) {
          const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
          if (company) companyMap.set(row.company_id, company);
        }

        // ── 6. Assemble digest ───────────────────────────────────────────

        const digestCompanies: DigestedCompany[] = scores
          .map((score: any): DigestedCompany | null => {
            const company = companyMap.get(score.company_id);
            if (!company) return null;
            const latestEvent = latestEventMap.get(score.company_id) ?? null;
            return {
              company_id: score.company_id,
              company_name: company.name ?? "Unknown",
              cvr_number: company.cvr_number ?? "",
              industry: company.industry ?? null,
              risk_score: score.risk_score,
              risk_level: score.risk_level ?? "low",
              latest_event_description: latestEvent?.description ?? null,
              latest_event_type: latestEvent?.event_type ?? null,
              latest_event_at: latestEvent?.detected_at ?? null,
            };
          })
          .filter((c): c is DigestedCompany => c !== null);

        if (digestCompanies.length === 0) continue;

        const digest: UserDigest = {
          user_id: user.id,
          email: user.email,
          full_name: user.full_name,
          companies: digestCompanies,
        };

        // ── 7. Send email ────────────────────────────────────────────────

        const success = await sendDigestEmail(digest);
        results.push({ email: user.email, success, companies: digestCompanies.length });

      } catch (userErr) {
        console.error(`Failed for user ${user.id}:`, userErr);
        results.push({ email: user.email, success: false, companies: 0 });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      sent: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    }), { status: 200, headers: corsHeaders });

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({
      error: "Unexpected error",
      details: error instanceof Error ? error.message : String(error),
    }), { status: 500, headers: corsHeaders });
  }
});