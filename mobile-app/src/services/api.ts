import { supabase } from './supabase';

// Type-safe database types
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          created_at: string;
          updated_at: string;
          subscription_tier: 'free' | 'premium';
          subscription_expires_at: string | null;
          max_companies: number;
          notifications_enabled: boolean;
          expo_push_token: string | null;
          last_active_at: string | null;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          subscription_tier?: 'free' | 'premium';
          max_companies?: number;
          notifications_enabled?: boolean;
          expo_push_token?: string | null;
        };
        Update: {
          full_name?: string | null;
          subscription_tier?: 'free' | 'premium';
          max_companies?: number;
          notifications_enabled?: boolean;
          expo_push_token?: string | null;
        };
      };
      companies: {
        Row: {
          id: string;
          cvr_number: string;
          name: string;
          status: string | null;
          address: Record<string, any> | null;
          industry: string | null;
          employee_count: number | null;
          created_at: string;
          updated_at: string;
          last_checked_at: string | null;
          management_last_synced_at: string | null;
          data_snapshot: Record<string, any> | null;
        };
        Insert: {
          cvr_number: string;
          name: string;
          status?: string | null;
          address?: Record<string, any> | null;
          industry?: string | null;
          employee_count?: number | null;
          last_checked_at?: string | null;
          management_last_synced_at?: string | null;
          data_snapshot?: Record<string, any> | null;
        };
        Update: {
          name?: string;
          status?: string | null;
          address?: Record<string, any> | null;
          industry?: string | null;
          employee_count?: number | null;
          last_checked_at?: string | null;
          management_last_synced_at?: string | null;
          data_snapshot?: Record<string, any> | null;
        };
      };
      watchlists: {
        Row: {
          id: string;
          user_id: string;
          company_id: string;
          created_at: string;
          notification_enabled: boolean;
        };
        Insert: {
          user_id: string;
          company_id: string;
          notification_enabled?: boolean;
        };
        Update: {
          notification_enabled?: boolean;
        };
      };
      company_management: {
        Row: {
          id: string;
          company_id: string;
          cvr_number: string;
          person_name: string;
          role_name: string;
          role_group: 'executive' | 'board' | 'owner' | 'other' | null;
          registered_since: string | null;
          registered_until: string | null;
          source: 'cvr.dev' | 'datafordeler' | 'cvrapi.dk' | 'manual';
          source_reference: string | null;
          is_current: boolean;
          is_primary: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          cvr_number: string;
          person_name: string;
          role_name: string;
          role_group?: 'executive' | 'board' | 'owner' | 'other' | null;
          registered_since?: string | null;
          registered_until?: string | null;
          source?: 'cvr.dev' | 'datafordeler' | 'cvrapi.dk' | 'manual';
          source_reference?: string | null;
          is_current?: boolean;
          is_primary?: boolean;
        };
        Update: {
          person_name?: string;
          role_name?: string;
          role_group?: 'executive' | 'board' | 'owner' | 'other' | null;
          registered_since?: string | null;
          registered_until?: string | null;
          source?: 'cvr.dev' | 'datafordeler' | 'cvrapi.dk' | 'manual';
          source_reference?: string | null;
          is_current?: boolean;
          is_primary?: boolean;
        };
      };
      company_events: {
        Row: {
          id: string;
          company_id: string;
          event_type: EventType;
          old_value: Record<string, any> | null;
          new_value: Record<string, any> | null;
          detected_at: string;
          description: string;
          metadata: Record<string, any> | null;
        };
        Insert: {
          company_id: string;
          event_type: EventType;
          old_value?: Record<string, any> | null;
          new_value?: Record<string, any> | null;
          description: string;
          metadata?: Record<string, any> | null;
        };
      };
      company_risk_scores: {
        Row: {
          id: string;
          company_id: string;
          cvr_number: string;
          risk_score: number;
          risk_level: 'low' | 'moderate' | 'high' | 'critical';
          risk_factors: SignalFactor[];
          event_counts: Record<string, number>;
          calculated_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          cvr_number: string;
          risk_score?: number;
          risk_level?: 'low' | 'moderate' | 'high' | 'critical';
          risk_factors?: SignalFactor[];
          event_counts?: Record<string, number>;
          calculated_at?: string;
        };
        Update: {
          risk_score?: number;
          risk_level?: 'low' | 'moderate' | 'high' | 'critical';
          risk_factors?: SignalFactor[];
          event_counts?: Record<string, number>;
          calculated_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          event_id: string;
          title: string;
          body: string;
          read: boolean;
          created_at: string;
          sent_at: string | null;
          delivered_at: string | null;
          expo_receipt_id: string | null;
        };
        Insert: {
          user_id: string;
          event_id: string;
          title: string;
          body: string;
          read?: boolean;
        };
        Update: {
          read?: boolean;
        };
      };
    };
    Functions: {
      get_user_event_feed: {
        Args: {
          user_uuid: string;
          limit_count?: number;
          offset_count?: number;
        };
        Returns: Array<{
          event_id: string;
          company_id: string;
          company_name: string;
          cvr_number: string;
          event_type: EventType;
          description: string;
          detected_at: string;
          old_value: Record<string, any> | null;
          new_value: Record<string, any> | null;
        }>;
      };
      search_companies: {
        Args: {
          search_query: string;
          limit_count?: number;
        };
        Returns: Array<{
          id: string;
          cvr_number: string;
          name: string;
          status: string | null;
          industry: string | null;
        }>;
      };
      get_company_management_by_cvr: {
        Args: {
          cvr_query: string;
        };
        Returns: Array<{
          id: string;
          company_id: string;
          cvr_number: string;
          person_name: string;
          role_name: string;
          role_group: 'executive' | 'board' | 'owner' | 'other' | null;
          registered_since: string | null;
          registered_until: string | null;
          source: 'cvr.dev' | 'datafordeler' | 'cvrapi.dk' | 'manual';
          source_reference: string | null;
          is_current: boolean;
          is_primary: boolean;
          created_at: string;
          updated_at: string;
        }>;
      };
    };
  };
};

export type EventType =
  | 'CEO_CHANGED'
  | 'MANAGEMENT_CHANGED'
  | 'BOARD_MEMBER_ADDED'
  | 'BOARD_MEMBER_REMOVED'
  | 'EXECUTIVE_ADDED'
  | 'EXECUTIVE_REMOVED'
  | 'ADDRESS_CHANGED'
  | 'STATUS_CHANGED'
  | 'NAME_CHANGED'
  | 'OWNERSHIP_CHANGED'
  | 'FINANCIAL_REPORT_FILED'
  | 'INDUSTRY_CHANGED'
  | 'EMPLOYEE_COUNT_CHANGED';

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';
export type OpportunityType = 'stable' | 'transition' | 'growth' | 'turnaround';

export type SignalFactor = {
  code: string;
  label: string;
  points: number;
  event_count: number;
  last_seen_at: string | null;
};

export type CompanySignalScore = {
  score: number;
  risk_level: RiskLevel;
  opportunity_type: OpportunityType;
  risk_factors: SignalFactor[];
  event_counts: Record<string, number>;
  summary: {
    company_id: string;
    cvr_number: string;
    company_name: string | null;
    analyzed_events: number;
    analyzed_window_days: number;
    calculated_at: string;
  };
};

export type CompanySignalScoreResponse = {
  success: boolean;
  message?: string;
  company?: {
    id: string;
    cvr_number: string;
    name: string | null;
  };
  result?: CompanySignalScore;
  error?: string;
  details?: string | null;
};

export type SignalScoreV2RiskLevel = 'low' | 'medium' | 'high';
export type SignalScoreV2OpportunityType =
  | 'growth'
  | 'turnaround'
  | 'transition'
  | 'stable';
export type SignalScoreVolatilityClassification =
  | 'stable'
  | 'watch'
  | 'active'
  | 'volatile';

export type CompanyTopSignal = {
  key?: string;
  label?: string;
  category?:
    | 'leadership'
    | 'velocity'
    | 'employees'
    | 'status'
    | 'financial'
    | 'growth'
    | 'stability'
    | 'combo';
  impact?: number;
  direction?: 'positive' | 'negative' | 'mixed';
  reason?: string;
};

export type CompanySignalScoreV2 = {
  company_id: string;
  company_name: string;
  score_version: string;
  score: number;
  risk_level: SignalScoreV2RiskLevel;
  opportunity_type: SignalScoreV2OpportunityType;
  volatility_classification: SignalScoreVolatilityClassification;
  risk_factors: string[];
  top_signals: CompanyTopSignal[];
  all_signals?: CompanyTopSignal[];
  score_breakdown?: {
    leadership: number;
    velocity: number;
    employees: number;
    status: number;
    financial: number;
    growth: number;
    combo: number;
    total_before_clamp: number;
    total: number;
  };
  insight_summary: string;
  explanation: string;
  metrics?: Record<string, any>;
  analyzed_event_count: number;
  analyzed_from: string;
  analyzed_to: string;
};

export type CompanySignalScoreV2Response = {
  success: boolean;
  result?: CompanySignalScoreV2;
  error?: string;
  details?: string | null;
};

export type StoredCompanyRiskScore =
  Database['public']['Tables']['company_risk_scores']['Row'];

export type CompanySearchResult = {
  id: string;
  cvr_number: string;
  name: string;
  status: string | null;
  industry: string | null;
};

export type RankedCompany = {
  id: string;
  company_id: string;
  cvr_number: string;
  name: string;
  status: string | null;
  industry: string | null;
  employee_count: number | null;
  risk_score: number;
  risk_level: RiskLevel;
  calculated_at: string | null;
};

export type CompanyManagement =
  Database['public']['Tables']['company_management']['Row'];

export type CompanyDetailsWithManagement = {
  company: CompanyRow;
  management: CompanyManagement[];
};

type CompanyRow = Database['public']['Tables']['companies']['Row'];
type CompanyInsert = Database['public']['Tables']['companies']['Insert'];
type CompanyUpdate = Database['public']['Tables']['companies']['Update'];
type CompanyEventInsert = Database['public']['Tables']['company_events']['Insert'];

type CvrApiResponse = Record<string, any>;

// --------------------
// Helpers
// --------------------

async function requireUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error('Not authenticated');

  return user;
}

function isNumericString(value: string) {
  return /^\d+$/.test(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

function valuesDiffer(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function normalizeCvrNumber(value: unknown): string {
  const raw = firstNonEmptyString(value) ?? '';
  return raw.replace(/\D/g, '');
}

function normalizeAddress(cvrData: CvrApiResponse): Record<string, any> | null {
  const fullAddress = firstNonEmptyString(
    cvrData.address,
    cvrData.adresse,
    cvrData.addressString,
    cvrData.location?.address
  );

  const city = firstNonEmptyString(cvrData.city, cvrData.by, cvrData.location?.city);

  const zipcode = firstNonEmptyString(
    cvrData.zipcode,
    cvrData.postcode,
    cvrData.postnr,
    cvrData.location?.zipcode
  );

  const municipality = firstNonEmptyString(cvrData.municipality, cvrData.kommune);

  const country = firstNonEmptyString(cvrData.country, cvrData.land);

  const street = firstNonEmptyString(cvrData.street, cvrData.vejnavn);

  if (!fullAddress && !city && !zipcode && !municipality && !country && !street) {
    return null;
  }

  return {
    full_address: fullAddress,
    street,
    city,
    zipcode,
    municipality,
    country,
  };
}

function mapCvrToCompanyInsert(cvrData: CvrApiResponse, fallbackCVR: string): CompanyInsert {
  const cvrNumber = normalizeCvrNumber(
    cvrData.vat ??
      cvrData.cvr ??
      cvrData.cvr_number ??
      cvrData.cvrNumber ??
      fallbackCVR
  );

  const name = firstNonEmptyString(
    cvrData.name,
    cvrData.companyName,
    cvrData.navn,
    'Unknown company'
  )!;

  const status = firstNonEmptyString(cvrData.status, cvrData.companyStatus);

  const industry = firstNonEmptyString(
    cvrData.industrydesc,
    cvrData.industry,
    cvrData.branch,
    cvrData.primaryIndustry
  );

  const employeeCount = firstNumber(
    cvrData.employees,
    cvrData.employee_count,
    cvrData.employeeCount
  );

  return {
    cvr_number: cvrNumber,
    name,
    status,
    address: normalizeAddress(cvrData),
    industry,
    employee_count: employeeCount,
    last_checked_at: new Date().toISOString(),
    data_snapshot: cvrData,
  };
}

function mapToCompanySearchResult(raw: any): CompanySearchResult | null {
  const cvrNumber = normalizeCvrNumber(
    raw?.cvr_number ?? raw?.vat ?? raw?.cvr ?? raw?.cvrNumber
  );

  const name = firstNonEmptyString(raw?.name, raw?.companyName, raw?.navn);

  if (!cvrNumber || !name) {
    return null;
  }

  return {
    id: String(raw?.id ?? cvrNumber),
    cvr_number: cvrNumber,
    name,
    status: firstNonEmptyString(raw?.status, raw?.companyStatus),
    industry: firstNonEmptyString(
      raw?.industrydesc,
      raw?.industry,
      raw?.branch,
      raw?.primaryIndustry
    ),
  };
}

function assertValidCvrNumber(value: string): string {
  const cleanCVR = normalizeCvrNumber(value);
  if (!/^\d{8}$/.test(cleanCVR)) {
    throw new Error('Invalid CVR number');
  }
  return cleanCVR;
}

function normalizeRoleName(roleName: string | null): string {
  return (roleName ?? '').trim().toLowerCase();
}

function getRolePriority(roleName: string | null): number {
  const role = normalizeRoleName(roleName);

  if (
    role.includes('administrerende direktør') ||
    role.includes('adm. direktør') ||
    role.includes('direktør') ||
    role.includes('direktion')
  ) {
    return 100;
  }

  if (role.includes('bestyrelsesformand')) return 90;
  if (role.includes('bestyrelse')) return 80;
  if (role.includes('ejer')) return 70;

  return 10;
}

function isExecutiveRole(roleName: string | null): boolean {
  const role = normalizeRoleName(roleName);
  return (
    role.includes('direktør') ||
    role.includes('direktion') ||
    role.includes('administrerende direktør') ||
    role.includes('adm. direktør')
  );
}

async function fetchEdgeFunctionJson<TResponse>(
  functionName: string,
  payload?: Record<string, any>
): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payload ?? {},
  });

  if (error) {
    console.error(`${functionName} INVOKE ERROR:`, error);
    throw new Error(error.message || `Failed to invoke ${functionName}`);
  }

  if (data == null) {
    throw new Error('Edge Function returned no data');
  }

  return data as TResponse;
}

async function fetchCompanyFromVirkdata(cvr: string): Promise<CvrApiResponse> {
  const apiKey = (process.env as any).EXPO_PUBLIC_VIRKDATA_API_KEY;
  if (!apiKey) throw new Error('Virkdata API key not configured');

  const response = await fetch(
    `https://virkdata.dk/api/?search=${encodeURIComponent(cvr)}&format=json&country=dk`,
    { headers: { Authorization: `Token ${apiKey}` } }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Virkdata API error ${response.status}: ${body}`);
  }

  const data = await response.json();

  if (!data || data.error) {
    throw new Error(data?.error || 'Invalid Virkdata API response');
  }

  // Virkdata may return an array (paginated) or a single object
  const record = Array.isArray(data) ? data[0] : (data.results ? data.results[0] : data);
  if (!record) throw new Error('No company found in Virkdata response');

  return record;
}

async function fetchCompanyFromCvrApi(cvr: string): Promise<CvrApiResponse> {
  const cleanCVR = normalizeCvrNumber(cvr);
  const virkdataKey = (process.env as any).EXPO_PUBLIC_VIRKDATA_API_KEY;

  if (virkdataKey) {
    try {
      return await fetchCompanyFromVirkdata(cleanCVR!);
    } catch (err) {
      console.warn('[Virkdata] fetch failed, falling back to cvrapi.dk:', err);
    }
  }

  const response = await fetch(
    `https://cvrapi.dk/api?search=${encodeURIComponent(cleanCVR!)}&country=dk`
  );

  if (!response.ok) {
    throw new Error('Company not found in CVR API');
  }

  const data = await response.json();

  if (!data || data.error) {
    throw new Error(data?.error || 'Invalid CVR API response');
  }

  return data;
}

async function searchCompaniesFromCvrApi(query: string): Promise<CompanySearchResult[]> {
  const response = await fetch(
    `https://cvrapi.dk/api?search=${encodeURIComponent(query)}&country=dk`
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();

  if (!data || data.error) {
    return [];
  }

  const items = Array.isArray(data) ? data : [data];

  return items
    .filter((item: any) => item && !item.error)
    .map(mapToCompanySearchResult)
    .filter((item: CompanySearchResult | null): item is CompanySearchResult => !!item);
}

function detectCompanyChanges(
  oldCompany: CompanyRow,
  freshData: CvrApiResponse
): CompanyEventInsert[] {
  const nextName = firstNonEmptyString(
    freshData.name,
    freshData.companyName,
    freshData.navn
  );

  const nextStatus = firstNonEmptyString(freshData.status, freshData.companyStatus);

  const nextIndustry = firstNonEmptyString(
    freshData.industrydesc,
    freshData.industry,
    freshData.branch,
    freshData.primaryIndustry
  );

  const nextEmployeeCount = firstNumber(
    freshData.employees,
    freshData.employee_count,
    freshData.employeeCount
  );

  const nextAddress = normalizeAddress(freshData);

  const changes: CompanyEventInsert[] = [];

  if (nextName && valuesDiffer(oldCompany.name, nextName)) {
    changes.push({
      company_id: oldCompany.id,
      event_type: 'NAME_CHANGED',
      old_value: { name: oldCompany.name },
      new_value: { name: nextName },
      description: `Company name changed from "${oldCompany.name}" to "${nextName}"`,
      metadata: { source: 'cvr-api-check' },
    });
  }

  if (valuesDiffer(oldCompany.status, nextStatus)) {
    changes.push({
      company_id: oldCompany.id,
      event_type: 'STATUS_CHANGED',
      old_value: { status: oldCompany.status },
      new_value: { status: nextStatus },
      description: `Company status changed to ${nextStatus ?? 'unknown'}`,
      metadata: { source: 'cvr-api-check' },
    });
  }

  if (valuesDiffer(oldCompany.industry, nextIndustry)) {
    changes.push({
      company_id: oldCompany.id,
      event_type: 'INDUSTRY_CHANGED',
      old_value: { industry: oldCompany.industry },
      new_value: { industry: nextIndustry },
      description: 'Company industry changed',
      metadata: { source: 'cvr-api-check' },
    });
  }

  if (valuesDiffer(oldCompany.employee_count, nextEmployeeCount)) {
    changes.push({
      company_id: oldCompany.id,
      event_type: 'EMPLOYEE_COUNT_CHANGED',
      old_value: { employee_count: oldCompany.employee_count },
      new_value: { employee_count: nextEmployeeCount },
      description: 'Employee count changed',
      metadata: { source: 'cvr-api-check' },
    });
  }

  if (valuesDiffer(oldCompany.address, nextAddress)) {
    changes.push({
      company_id: oldCompany.id,
      event_type: 'ADDRESS_CHANGED',
      old_value: oldCompany.address ?? null,
      new_value: nextAddress,
      description: 'Company address changed',
      metadata: { source: 'cvr-api-check' },
    });
  }

  return changes;
}

async function createNotificationsForEvent(
  eventId: string,
  companyId: string,
  description: string
) {
  const { data: watchers, error } = await supabase
    .from('watchlists')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('notification_enabled', true);

  if (error) throw error;

  const rows =
    (watchers ?? []).map((watcher: any) => ({
      user_id: watcher.user_id,
      event_id: eventId,
      title: 'Company update detected',
      body: description,
      read: false,
    })) ?? [];

  if (rows.length === 0) return;

  const { error: insertError } = await supabase.from('notifications').insert(rows);

  if (insertError) throw insertError;
}

async function resolveCompanyIdFromIdentifier(
  companyIdentifier: string
): Promise<string | null> {
  const cleanIdentifier = String(companyIdentifier ?? '').trim();

  if (!cleanIdentifier) return null;

  if (isUuid(cleanIdentifier)) {
    const { data: companyById, error: companyByIdError } = await supabase
      .from('companies')
      .select('id')
      .eq('id', cleanIdentifier)
      .maybeSingle();

    if (companyByIdError) throw companyByIdError;
    if (companyById?.id) return companyById.id;
  }

  const cleanCVR = normalizeCvrNumber(cleanIdentifier);
  if (!cleanCVR) return null;

  const { data: companyByCvr, error: companyByCvrError } = await supabase
    .from('companies')
    .select('id')
    .eq('cvr_number', cleanCVR)
    .maybeSingle();

  if (companyByCvrError) throw companyByCvrError;
  if (companyByCvr?.id) return companyByCvr.id;

  return null;
}

async function resolveCompanyFromIdentifier(
  companyIdentifier: string
): Promise<CompanyRow | null> {
  const cleanIdentifier = String(companyIdentifier ?? '').trim();

  if (!cleanIdentifier) return null;

  if (isUuid(cleanIdentifier)) {
    const { data: companyById, error: companyByIdError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', cleanIdentifier)
      .maybeSingle();

    if (companyByIdError) throw companyByIdError;
    if (companyById) return companyById;
  }

  const cleanCVR = normalizeCvrNumber(cleanIdentifier);
  if (!cleanCVR) return null;

  return await getCompanyByCVR(cleanCVR);
}

// --------------------
// API Functions
// --------------------

export async function getUserProfile() {
  const user = await requireUser();

  let { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        id: user.id,
        email: user.email ?? '',
        full_name: user.user_metadata?.full_name ?? null,
        subscription_tier: 'free',
        max_companies: 5,
        notifications_enabled: true,
      })
      .select('*')
      .single();

    if (insertError) throw insertError;
    return newUser;
  }

  return data;
}

export async function searchCompanies(query: string): Promise<CompanySearchResult[]> {
  const trimmed = query.trim();

  if (!trimmed) return [];

  let localResults: CompanySearchResult[] = [];
  let externalResults: CompanySearchResult[] = [];

  try {
    const { data, error } = await supabase.rpc('search_companies', {
      search_query: trimmed,
      limit_count: 10,
    });

    if (error) {
      console.error('Supabase RPC search_companies error:', error);
    } else if (data) {
      localResults = data
        .map(mapToCompanySearchResult)
        .filter((item: CompanySearchResult | null): item is CompanySearchResult => !!item);
    }
  } catch (err) {
    console.error('Local company search failed:', err);
  }

  if (isNumericString(trimmed)) {
    try {
      const company = await getCompanyByCVR(trimmed);
      const exactResult = mapToCompanySearchResult(company);
      externalResults = exactResult ? [exactResult] : [];
    } catch (err) {
      console.error('CVR exact search failed:', err);
    }
  } else {
    try {
      externalResults = await searchCompaniesFromCvrApi(trimmed);
    } catch (err) {
      console.error('CVR API name search failed:', err);
    }
  }

  const merged = [...localResults, ...externalResults];
  const uniqueByCvr = new Map<string, CompanySearchResult>();

  for (const company of merged) {
    if (!company?.cvr_number) continue;
    if (!uniqueByCvr.has(company.cvr_number)) {
      uniqueByCvr.set(company.cvr_number, company);
    }
  }

  return Array.from(uniqueByCvr.values()).slice(0, 5);
}

export async function getRankedCompanies(limit = 50): Promise<RankedCompany[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));

  const { data, error } = await supabase
    .from('company_risk_scores')
    .select(`
      id,
      company_id,
      cvr_number,
      risk_score,
      risk_level,
      calculated_at,
      company:companies (
        id,
        cvr_number,
        name,
        status,
        industry,
        employee_count
      )
    `)
    .order('risk_score', { ascending: false })
    .order('calculated_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];

  return rows
    .map((row: any): RankedCompany | null => {
      const company = Array.isArray(row?.company) ? row.company[0] : row?.company;
      const companyId = String(row?.company_id ?? company?.id ?? '').trim();
      const cvrNumber = normalizeCvrNumber(row?.cvr_number ?? company?.cvr_number);
      const name = firstNonEmptyString(company?.name);
      const riskScore = Number(row?.risk_score);
      const riskLevel = firstNonEmptyString(row?.risk_level) as RiskLevel | null;

      if (!row?.id || !companyId || !cvrNumber || !name || Number.isNaN(riskScore)) {
        return null;
      }

      return {
        id: String(row.id),
        company_id: companyId,
        cvr_number: cvrNumber,
        name,
        status: firstNonEmptyString(company?.status),
        industry: firstNonEmptyString(company?.industry),
        employee_count: firstNumber(company?.employee_count),
        risk_score: riskScore,
        risk_level: riskLevel ?? 'low',
        calculated_at: firstNonEmptyString(row?.calculated_at),
      };
    })
    .filter((item: RankedCompany | null): item is RankedCompany => !!item);
}

export async function getAllCompaniesForSignals(): Promise<RankedCompany[]> {
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('id, cvr_number, name, status, industry, employee_count')
    .order('name', { ascending: true })
    .limit(500);

  if (companiesError) throw companiesError;
  if (!companies?.length) return [];

  const companyIds = (companies as any[]).map((c) => c.id);
  const { data: scores } = await supabase
    .from('company_risk_scores')
    .select('id, company_id, risk_score, risk_level, calculated_at')
    .in('company_id', companyIds);

  const scoreMap = new Map<string, any>();
  for (const score of (scores || [])) {
    const existing = scoreMap.get(score.company_id);
    if (!existing || score.calculated_at > existing.calculated_at) {
      scoreMap.set(score.company_id, score);
    }
  }

  return (companies as any[])
    .map((company): RankedCompany | null => {
      const cvr = normalizeCvrNumber(company.cvr_number);
      const name = firstNonEmptyString(company.name);
      if (!cvr || !name) return null;
      const score = scoreMap.get(company.id);
      return {
        id: score?.id ?? company.id,
        company_id: company.id,
        cvr_number: cvr,
        name,
        status: firstNonEmptyString(company.status),
        industry: firstNonEmptyString(company.industry),
        employee_count: firstNumber(company.employee_count),
        risk_score: score ? Number(score.risk_score) : 0,
        risk_level: (score?.risk_level as RiskLevel) ?? 'low',
        calculated_at: firstNonEmptyString(score?.calculated_at),
      };
    })
    .filter((item): item is RankedCompany => !!item);
}

export async function getCompanyByCVR(cvr: string) {
  const cleanCVR = normalizeCvrNumber(cvr);

  if (!cleanCVR) {
    throw new Error('CVR is required');
  }

  const { data: existingCompany, error: existingError } = await supabase
    .from('companies')
    .select('*')
    .eq('cvr_number', cleanCVR)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existingCompany) {
    return existingCompany;
  }

  const cvrData = await fetchCompanyFromCvrApi(cleanCVR);
  const companyToInsert = mapCvrToCompanyInsert(cvrData, cleanCVR);

  const { data: newCompany, error: insertError } = await supabase
    .from('companies')
    .insert(companyToInsert)
    .select('*')
    .single();

  if (insertError) throw insertError;
  return newCompany;
}

export async function refreshCompanyByCVR(cvr: string) {
  const cleanCVR = normalizeCvrNumber(cvr);

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('cvr_number', cleanCVR)
    .single();

  if (companyError) throw companyError;

  return checkCompanyForChanges(company.id);
}

export async function checkCompanyForChanges(companyId: string) {
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (companyError) throw companyError;

  const freshData = await fetchCompanyFromCvrApi(company.cvr_number);
  const changes = detectCompanyChanges(company, freshData);

  const mappedState = mapCvrToCompanyInsert(freshData, company.cvr_number);

  const nextCompanyState: CompanyUpdate = {
    name: mappedState.name,
    status: mappedState.status ?? null,
    address: mappedState.address ?? null,
    industry: mappedState.industry ?? null,
    employee_count: mappedState.employee_count ?? null,
    last_checked_at: new Date().toISOString(),
    data_snapshot: mappedState.data_snapshot ?? null,
  };

  const { error: updateError } = await supabase
    .from('companies')
    .update(nextCompanyState)
    .eq('id', companyId);

  if (updateError) throw updateError;

  let createdEvents: any[] = [];

  if (changes.length > 0) {
    const { data: insertedEvents, error: eventsError } = await supabase
      .from('company_events')
      .insert(changes)
      .select('*');

    if (eventsError) throw eventsError;
    createdEvents = insertedEvents ?? [];

    for (const event of createdEvents) {
      await createNotificationsForEvent(event.id, companyId, event.description);
    }
  }

  const { data: updatedCompany, error: updatedCompanyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (updatedCompanyError) throw updatedCompanyError;

  return {
    updatedCompany,
    changesCreated: createdEvents.length,
    events: createdEvents,
  };
}

export async function checkAllWatchedCompaniesForCurrentUser() {
  const user = await requireUser();

  const { data: watchlistRows, error } = await supabase
    .from('watchlists')
    .select('company_id')
    .eq('user_id', user.id);

  if (error) throw error;

  const results = [];

  for (const row of watchlistRows ?? []) {
    try {
      const result = await checkCompanyForChanges(row.company_id);
      results.push(result);
    } catch (err) {
      console.error('Failed to check company:', row.company_id, err);
    }
  }

  return results;
}

export async function getCompanyEvents(companyId: string) {
  const { data, error } = await supabase
    .from('company_events')
    .select('*')
    .eq('company_id', companyId)
    .order('detected_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
}

export async function getEventFeed(limit = 50, offset = 0) {
  const user = await requireUser();

  const { data, error } = await supabase.rpc('get_user_event_feed', {
    user_uuid: user.id,
    limit_count: limit,
    offset_count: offset,
  });

  if (error) throw error;
  return data || [];
}

export async function getAllCompaniesWithScores(): Promise<Array<{
  company: {
    id: string; cvr_number: string; name: string; status: string | null;
    address: Record<string, any> | null; industry: string | null;
    employee_count: number | null; last_checked_at: string | null;
  };
  score: StoredCompanyRiskScore | null;
}>> {
  const [companiesResult, scoresResult] = await Promise.all([
    supabase
      .from('companies')
      .select('id, cvr_number, name, status, address, industry, employee_count, last_checked_at')
      .order('name', { ascending: true }),
    supabase
      .from('company_risk_scores')
      .select('company_id, risk_score, risk_level, risk_factors, event_counts, calculated_at, updated_at'),
  ]);

  if (companiesResult.error) throw companiesResult.error;

  const scoreMap = new Map((scoresResult.data ?? []).map((s: any) => [s.company_id, s]));
  return (companiesResult.data ?? []).map((company: any) => ({
    company,
    score: (scoreMap.get(company.id) ?? null) as StoredCompanyRiskScore | null,
  }));
}

export async function getWatchlist() {
  const user = await requireUser();

  const { data, error } = await supabase
    .from('watchlists')
    .select(`
      id,
      company_id,
      created_at,
      notification_enabled,
      company:companies (
        id,
        cvr_number,
        name,
        status,
        address,
        industry,
        employee_count,
        last_checked_at,
        management_last_synced_at,
        data_snapshot
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function addToWatchlist(companyIdentifier: string) {
  const user = await requireUser();

  const company = await resolveCompanyFromIdentifier(companyIdentifier);

  if (!company) {
    throw new Error('Company not found');
  }

  const { data: existing, error: existingError } = await supabase
    .from('watchlists')
    .select('*')
    .eq('user_id', user.id)
    .eq('company_id', company.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('watchlists')
    .insert({
      user_id: user.id,
      company_id: company.id,
      notification_enabled: true,
    })
    .select('*')
    .single();

  if (error) throw error;

  // Auto-calculate signal score in the background — does not block the UI
  calculateCompanySignalScore({ companyId: company.id }).catch((err) => {
    console.warn('[addToWatchlist] Background signal score failed:', err);
  });

  return data;
}

export async function removeFromWatchlist(companyIdentifier: string) {
  const user = await requireUser();

  const companyId = await resolveCompanyIdFromIdentifier(companyIdentifier);

  if (!companyId) {
    throw new Error('Company not found');
  }

  const { error } = await supabase
    .from('watchlists')
    .delete()
    .eq('user_id', user.id)
    .eq('company_id', companyId);

  if (error) throw error;

  return true;
}

export async function isCompanyInWatchlist(companyIdentifier: string): Promise<boolean> {
  const user = await requireUser();

  const companyId = await resolveCompanyIdFromIdentifier(companyIdentifier);

  if (!companyId) {
    return false;
  }

  const { data, error } = await supabase
    .from('watchlists')
    .select('id')
    .eq('user_id', user.id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw error;

  return !!data;
}

export async function setWatchlistNotification(
  watchlistId: string,
  enabled: boolean
) {
  const { data, error } = await supabase
    .from('watchlists')
    .update({ notification_enabled: enabled })
    .eq('id', watchlistId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function getNotifications() {
  const user = await requireUser();

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
}

export async function markNotificationAsRead(notificationId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

// --------------------
// Management
// --------------------

export async function syncCompanyManagement(cvrNumber: string) {
  const cleanedCvr = String(cvrNumber || '').replace(/\D/g, '');

  if (!cleanedCvr) {
    throw new Error('CVR number is required');
  }

  try {
    return await fetchEdgeFunctionJson<any>('company-management-sync', {
      cvr: cleanedCvr,
    });
  } catch (error: any) {
    console.error('SYNC COMPANY MANAGEMENT ERROR:', error);

    if (String(error?.message || '').includes('404')) {
      throw new Error('company-management-sync is not deployed');
    }

    throw new Error(error?.message || 'Failed to send a request to the Edge Function');
  }
}

export async function getCompanyManagementByCvr(
  cvrNumber: string,
  options?: { forceRefresh?: boolean }
): Promise<CompanyManagement[]> {
  const cleanCVR = assertValidCvrNumber(cvrNumber);

  if (options?.forceRefresh) {
    try {
      await syncCompanyManagement(cleanCVR);
    } catch (err) {
      console.warn('Management sync failed, falling back to cached data:', err);
    }
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id')
    .eq('cvr_number', cleanCVR)
    .maybeSingle();

  if (companyError) throw companyError;
  if (!company) return [];

  const { data, error } = await supabase
    .from('company_management')
    .select('*')
    .eq('company_id', company.id)
    .order('is_primary', { ascending: false })
    .order('is_current', { ascending: false })
    .order('registered_since', { ascending: false });

  if (error) throw error;

  return (data ?? []) as CompanyManagement[];
}

export async function getCompanyDetailsWithManagement(
  cvrNumber: string,
  options?: { forceRefreshManagement?: boolean; staleAfterHours?: number }
): Promise<CompanyDetailsWithManagement> {
  const cleanCVR = assertValidCvrNumber(cvrNumber);
  const company = await getCompanyByCVR(cleanCVR);

  const staleAfterHours = options?.staleAfterHours ?? 12;
  const lastSyncedAt = company.management_last_synced_at
    ? new Date(company.management_last_synced_at).getTime()
    : 0;

  const isStale =
    !lastSyncedAt || Date.now() - lastSyncedAt > staleAfterHours * 60 * 60 * 1000;

  const shouldRefresh = !!options?.forceRefreshManagement || isStale;

  const management = await getCompanyManagementByCvr(cleanCVR, {
    forceRefresh: shouldRefresh,
  });

  const { data: refreshedCompany, error: refreshedCompanyError } = await supabase
    .from('companies')
    .select('*')
    .eq('cvr_number', cleanCVR)
    .single();

  if (refreshedCompanyError) throw refreshedCompanyError;

  return {
    company: refreshedCompany,
    management,
  };
}

export function getPrimaryCeoLikeRole(
  management: CompanyManagement[]
): CompanyManagement | null {
  if (!management.length) return null;

  const sorted = [...management].sort((a, b) => {
    const primaryDiff = Number(b.is_primary) - Number(a.is_primary);
    if (primaryDiff !== 0) return primaryDiff;

    const currentDiff = Number(b.is_current) - Number(a.is_current);
    if (currentDiff !== 0) return currentDiff;

    const roleDiff = getRolePriority(b.role_name) - getRolePriority(a.role_name);
    if (roleDiff !== 0) return roleDiff;

    const aDate = a.registered_since ? new Date(a.registered_since).getTime() : 0;
    const bDate = b.registered_since ? new Date(b.registered_since).getTime() : 0;
    return bDate - aDate;
  });

  const currentExecutive =
    sorted.find((item) => item.is_current && isExecutiveRole(item.role_name)) ?? null;

  if (currentExecutive) return currentExecutive;

  const currentPrimary = sorted.find((item) => item.is_current && item.is_primary) ?? null;
  if (currentPrimary) return currentPrimary;

  const anyCurrent = sorted.find((item) => item.is_current) ?? null;
  if (anyCurrent) return anyCurrent;

  return sorted[0] ?? null;
}

export function formatManagementDate(date: string | null): string {
  if (!date) return 'Unknown';

  try {
    return new Intl.DateTimeFormat('da-DK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  } catch {
    return date;
  }
}

export async function runCompanyManagementSync() {
  try {
    return await fetchEdgeFunctionJson<any>('company-management-sync', {});
  } catch (error: any) {
    console.error('RUN COMPANY MANAGEMENT SYNC ERROR:', error);

    if (String(error?.message || '').includes('404')) {
      throw new Error('company-management-sync is not deployed');
    }

    throw new Error(error?.message || 'Failed to run company management sync');
  }
}

// --------------------
// Signal Score
// --------------------

export async function calculateCompanySignalScore(params: {
  companyId?: string;
  cvr?: string;
}): Promise<CompanySignalScoreV2Response> {
  const companyId = params.companyId?.trim();
  const cvr = params.cvr ? normalizeCvrNumber(params.cvr) : '';

  if (!companyId && !cvr) {
    throw new Error('Either companyId or cvr is required');
  }

  const payload = companyId ? { company_id: companyId } : { cvr };

  try {
    return await fetchEdgeFunctionJson<CompanySignalScoreV2Response>(
      'company-signal-score',
      payload
    );
  } catch (error: any) {
    console.error('CALCULATE COMPANY SIGNAL SCORE ERROR:', error);
    throw new Error(error?.message || 'Failed to calculate company signal score');
  }
}

export async function getCompanySignalScore(
  companyIdentifier: string
): Promise<CompanySignalScoreV2 | null> {
  const company = await resolveCompanyFromIdentifier(companyIdentifier);

  if (!company) {
    throw new Error('Company not found');
  }

  const response = await calculateCompanySignalScore({
    companyId: company.id,
  });

  return response.result ?? null;
}

export async function refreshCompanySignalScore(
  companyIdentifier: string
): Promise<CompanySignalScoreV2 | null> {
  return await getCompanySignalScore(companyIdentifier);
}

export async function getStoredCompanySignalScore(
  companyIdentifier: string
): Promise<StoredCompanyRiskScore | null> {
  const companyId = await resolveCompanyIdFromIdentifier(companyIdentifier);

  if (!companyId) {
    return null;
  }

  const { data, error } = await supabase
    .from('company_risk_scores')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw error;

  return (data as StoredCompanyRiskScore | null) ?? null;
}

export async function getCompanyWithSignalScore(companyIdentifier: string): Promise<{
  company: CompanyRow;
  signalScore: StoredCompanyRiskScore | null;
}> {
  const company = await resolveCompanyFromIdentifier(companyIdentifier);

  if (!company) {
    throw new Error('Company not found');
  }

  const signalScore = await getStoredCompanySignalScore(company.id);

  return {
    company,
    signalScore,
  };
}

export async function getOrCreateCompanySignalScore(
  companyIdentifier: string
): Promise<CompanySignalScoreV2 | null> {
  return await getCompanySignalScore(companyIdentifier);
}
// ─── Today's Top Companies ────────────────────────────────────────────────────

export type TodayTopCompany = {
  company_id: string;
  company_name: string;
  cvr_number: string;
  industry: string | null;
  risk_score: number;
  risk_level: RiskLevel;
  event_count: number;
  latest_event_type: string;
  latest_event_at: string;
};

/**
 * Returns companies that have had events detected today,
 * sorted by their risk_score DESC then event count DESC.
 * Falls back gracefully if company_risk_scores has no match.
 */
export async function getTodayTopCompanies(
  limit = 5
): Promise<TodayTopCompany[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sinceIso = startOfDay.toISOString();

  // Get distinct companies with events today + their event counts
  const { data: eventRows, error: eventError } = await supabase
    .from('company_events')
    .select('company_id, event_type, detected_at')
    .gte('detected_at', sinceIso)
    .order('detected_at', { ascending: false });

  if (eventError) throw eventError;
  if (!eventRows || eventRows.length === 0) return [];

  // Aggregate per company: count + latest event
  const companyMap = new Map<
    string,
    { event_count: number; latest_event_type: string; latest_event_at: string }
  >();

  for (const row of eventRows) {
    const id = row.company_id as string;
    if (!companyMap.has(id)) {
      companyMap.set(id, {
        event_count: 1,
        latest_event_type: row.event_type as string,
        latest_event_at: row.detected_at as string,
      });
    } else {
      companyMap.get(id)!.event_count += 1;
    }
  }

  const companyIds = Array.from(companyMap.keys());

  // Fetch company info
  const { data: companies, error: companyError } = await supabase
    .from('companies')
    .select('id, name, cvr_number, industry')
    .in('id', companyIds);

  if (companyError) throw companyError;

  // Fetch risk scores for these companies
  const { data: scores } = await supabase
    .from('company_risk_scores')
    .select('company_id, risk_score, risk_level')
    .in('company_id', companyIds);

  const scoreMap = new Map<string, { risk_score: number; risk_level: RiskLevel }>();
  for (const s of scores ?? []) {
    scoreMap.set(s.company_id as string, {
      risk_score: Number(s.risk_score),
      risk_level: (s.risk_level ?? 'low') as RiskLevel,
    });
  }

  const results: TodayTopCompany[] = (companies ?? [])
    .map((c: any): TodayTopCompany => {
      const agg = companyMap.get(c.id)!;
      const score = scoreMap.get(c.id);
      return {
        company_id: c.id,
        company_name: c.name ?? 'Unknown',
        cvr_number: c.cvr_number ?? '',
        industry: c.industry ?? null,
        risk_score: score?.risk_score ?? 0,
        risk_level: score?.risk_level ?? 'low',
        event_count: agg.event_count,
        latest_event_type: agg.latest_event_type,
        latest_event_at: agg.latest_event_at,
      };
    })
    .sort((a, b) =>
      b.risk_score !== a.risk_score
        ? b.risk_score - a.risk_score
        : b.event_count - a.event_count
    )
    .slice(0, limit);

  return results;
}
// ─── Regnskabsdata (Financial Reports) ───────────────────────────────────────

export type FinancialYear = {
  year: number;
  revenue: number | null;              // Nettoomsætning
  gross_profit: number | null;         // Bruttofortjeneste
  profit_before_tax: number | null;    // Resultat før skat
  net_result: number | null;           // Årets resultat
  equity: number | null;               // Egenkapital
  total_assets: number | null;         // Aktiver i alt
  short_term_debt: number | null;      // Kortfristet gæld
  long_term_debt: number | null;       // Langfristet gæld
  period_start: string | null;
  period_end: string | null;
};

export type FinancialSummary = {
  cvr_number: string;
  years: FinancialYear[];
  latest: FinancialYear | null;
  // Derived signals
  revenue_trend: 'growing' | 'declining' | 'stable' | 'unknown';
  equity_negative: boolean;
  consecutive_losses: number;
  debt_ratio: number | null;           // Total debt / total assets
};

const REGNSKAB_BASE_URL = 'http://distribution.virk.dk/offentliggoerelser';

function getVirkAuthHeader(): string | null {
  const username = (process.env as any).EXPO_PUBLIC_VIRK_CVR_USERNAME;
  const password = (process.env as any).EXPO_PUBLIC_VIRK_CVR_PASSWORD;
  if (!username || !password) return null;
  return 'Basic ' + btoa(`${username}:${password}`);
}

function extractXbrlValue(
  facts: any[],
  ...fieldNames: string[]
): number | null {
  for (const field of fieldNames) {
    const fact = facts.find(
      (f: any) =>
        (f?.elementName ?? f?.field ?? '').toLowerCase().includes(field.toLowerCase())
    );
    if (fact?.value !== undefined && fact?.value !== null) {
      const num = Number(fact.value);
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

export async function getCompanyFinancials(
  cvrNumber: string
): Promise<FinancialSummary | null> {
  const auth = getVirkAuthHeader();
  if (!auth) {
    console.log('[api] No Virk credentials — skipping financial fetch');
    return null;
  }

  const cvr = cvrNumber.replace(/\D/g, '');

  try {
    const response = await fetch(`${REGNSKAB_BASE_URL}/_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        query: {
          bool: {
            must: [
              { term: { cvrNummer: parseInt(cvr, 10) } },
              { term: { 'offentliggoerelse.dokumenter.dokumentType': 'AARSRAPPORT' } },
            ],
          },
        },
        sort: [{ 'offentliggoerelse.offentliggoerelsesTidspunkt': { order: 'desc' } }],
        size: 5, // last 5 years
      }),
    });

    if (!response.ok) {
      console.warn('[api] Regnskab API returned', response.status);
      return null;
    }

    const json = await response.json();
    const hits: any[] = json?.hits?.hits ?? [];

    if (hits.length === 0) return null;

    const years: FinancialYear[] = hits
      .map((hit: any): FinancialYear | null => {
        const doc = hit?._source;
        if (!doc) return null;

        const xbrl = doc?.xbrlData ?? doc?.regnskabsData ?? {};
        const facts: any[] = Array.isArray(xbrl?.facts)
          ? xbrl.facts
          : Object.entries(xbrl).map(([k, v]) => ({ elementName: k, value: v }));

        const period = doc?.regnskabsperiode ?? doc?.offentliggoerelse?.regnskabsperiode ?? {};

        const year =
          period?.slutDato
            ? new Date(period.slutDato).getFullYear()
            : new Date(doc?.offentliggoerelse?.offentliggoerelsesTidspunkt ?? Date.now()).getFullYear();

        return {
          year,
          revenue: extractXbrlValue(facts, 'nettoomsaetning', 'revenue', 'GrossProfit'),
          gross_profit: extractXbrlValue(facts, 'bruttofortjeneste', 'GrossProfit'),
          profit_before_tax: extractXbrlValue(facts, 'ResultatFoerSkat', 'profitLoss'),
          net_result: extractXbrlValue(facts, 'AaretResultat', 'profitLossForYear'),
          equity: extractXbrlValue(facts, 'Egenkapital', 'equity'),
          total_assets: extractXbrlValue(facts, 'AktivErIAlt', 'assets'),
          short_term_debt: extractXbrlValue(facts, 'KortfristetGaeld', 'shortTermDebt'),
          long_term_debt: extractXbrlValue(facts, 'LangfristetGaeld', 'longTermDebt'),
          period_start: period?.startDato ?? null,
          period_end: period?.slutDato ?? null,
        };
      })
      .filter((y): y is FinancialYear => y !== null)
      .sort((a, b) => b.year - a.year);

    if (years.length === 0) return null;

    const latest = years[0];

    // Revenue trend
    let revenueTrend: FinancialSummary['revenue_trend'] = 'unknown';
    if (years.length >= 2 && years[0].revenue !== null && years[1].revenue !== null) {
      const change = years[0].revenue - years[1].revenue;
      const pct = years[1].revenue !== 0 ? (change / Math.abs(years[1].revenue)) * 100 : 0;
      if (pct > 5) revenueTrend = 'growing';
      else if (pct < -5) revenueTrend = 'declining';
      else revenueTrend = 'stable';
    }

    // Consecutive losses
    let consecutiveLosses = 0;
    for (const y of years) {
      if (y.net_result !== null && y.net_result < 0) consecutiveLosses++;
      else break;
    }

    // Debt ratio
    const totalDebt =
      (latest.short_term_debt ?? 0) + (latest.long_term_debt ?? 0);
    const debtRatio =
      latest.total_assets && latest.total_assets > 0
        ? totalDebt / latest.total_assets
        : null;

    return {
      cvr_number: cvr,
      years,
      latest,
      revenue_trend: revenueTrend,
      equity_negative: (latest.equity ?? 0) < 0,
      consecutive_losses: consecutiveLosses,
      debt_ratio: debtRatio,
    };
  } catch (err) {
    console.error('[api] getCompanyFinancials error:', err);
    return null;
  }
}
// ─── Score History ────────────────────────────────────────────────────────────

export type ScoreHistoryPoint = {
  score: number;
  risk_level: string;
  calculated_at: string;
};

export async function getCompanyScoreHistory(
  companyId: string,
  days = 30
): Promise<ScoreHistoryPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('company_risk_score_history')
    .select('risk_score, risk_level, calculated_at')
    .eq('company_id', companyId)
    .gte('calculated_at', since.toISOString())
    .order('calculated_at', { ascending: true })
    .limit(60);

  if (error) {
    console.error('[api] getCompanyScoreHistory error:', error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    score: Number(row.risk_score),
    risk_level: row.risk_level ?? 'low',
    calculated_at: row.calculated_at,
  }));
}

// ─── AI Insights ──────────────────────────────────────────────────────────────

export type AIInsight = {
  company_id: string;
  cvr_number: string;
  insight: string;
  prediction_type: 'leadership_change_likely' | 'leadership_change_possible' | 'leadership_change_unlikely' | 'insufficient_data';
  confidence: 'low' | 'medium' | 'high';
  generated_at: string;
  cached?: boolean;
};

export async function getCompanyAIInsight(
  companyId: string,
  forceRefresh = false
): Promise<AIInsight | null> {
  try {
    // Check local cache first
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('company_ai_insights')
        .select('*')
        .eq('company_id', companyId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (cached) return { ...(cached as AIInsight), cached: true };
    }

    // Call edge function
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const supabaseUrl = (supabase as any).supabaseUrl as string;
    const response = await fetch(`${supabaseUrl}/functions/v1/company-ai-insight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ company_id: companyId, force_refresh: forceRefresh }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.insight ?? null;
  } catch (err) {
    console.error('[api] getCompanyAIInsight error:', err);
    return null;
  }
}

// ─── Company News ─────────────────────────────────────────────────────────────

export type NewsArticle = {
  id: string;
  company_id: string;
  cvr_number: string;
  title: string;
  description: string | null;
  url: string;
  source_name: string | null;
  published_at: string;
  sentiment_score: number;
  sentiment_label: 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive';
  score_impact: number;
  fetched_at: string;
  cached?: boolean;
};

export async function getCompanyNews(
  companyId: string,
  forceRefresh = false
): Promise<NewsArticle[]> {
  try {
    // Check local cache first
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('company_news')
        .select('*')
        .eq('company_id', companyId)
        .gt('expires_at', new Date().toISOString())
        .order('published_at', { ascending: false })
        .limit(15);

      if (cached && cached.length > 0) {
        return (cached as NewsArticle[]).map(a => ({ ...a, cached: true }));
      }
    }

    // Call edge function
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const supabaseUrl = (supabase as any).supabaseUrl as string;

    const response = await fetch(`${supabaseUrl}/functions/v1/company-news`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ company_id: companyId, force_refresh: forceRefresh }),
    });

    if (!response.ok) return [];
    const data = await response.json();
    return data.articles ?? [];
  } catch (err) {
    console.error('[api] getCompanyNews error:', err);
    return [];
  }
}