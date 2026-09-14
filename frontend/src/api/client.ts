import type {
  Overview,
  Filters,
  WorksResponse,
  Project,
  PeerResponse,
  TransactionsResponse,
  TopSuspiciousResponse,
  SortOption,
  NLSearchResponse,
  BriefResponse,
  SimilarWorksResponse,
  LLMRiskResponse,
  PrioritizeResponse,
  TrendsResponse,
  VendorPatternsResponse,
  ClusterRecord,
  EarlyWarningResponse,
  AuditLogResponse,
  DescriptionQualityResponse,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

async function apiGet<T>(path: string, params?: Record<string, string | number | undefined | null>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function getOverview(): Promise<Overview> {
  return apiGet<Overview>('/api/overview');
}

export async function getFilters(): Promise<Filters> {
  return apiGet<Filters>('/api/filters');
}

export async function getWorks(params: {
  state?: string;
  district?: string;
  mp_name?: string;
  work_type?: string;
  min_risk_score?: number;
  search?: string;
  sort?: SortOption;
  limit?: number;
  offset?: number;
  date_from?: string;
}): Promise<WorksResponse> {
  return apiGet<WorksResponse>('/api/works', params);
}

export async function getWorkDetail(workId: string): Promise<Project> {
  return apiGet<Project>(`/api/works/${encodeURIComponent(workId)}`);
}

export async function getWorkPeers(workId: string, n = 6): Promise<PeerResponse> {
  return apiGet<PeerResponse>(`/api/works/${encodeURIComponent(workId)}/peers`, { n });
}

export async function getRelatedTransactions(workId: string, n = 10): Promise<TransactionsResponse> {
  return apiGet<TransactionsResponse>(`/api/works/${encodeURIComponent(workId)}/related-transactions`, { n });
}

export async function getTopSuspiciousMps(n = 25, minRiskScore = 50): Promise<TopSuspiciousResponse> {
  return apiGet<TopSuspiciousResponse>('/api/mps/top-suspicious', { n, min_risk_score: minRiskScore });
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function streamChat(
  workId: string,
  message: string,
  history: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ work_id: workId, message, history }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Chat API error: ${response.status}`);
  }
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.content) onChunk(parsed.content);
      } catch { /* ignore malformed */ }
    }
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function nlSearch(query: string): Promise<NLSearchResponse> {
  const response = await fetch(`${BASE_URL}/api/nl-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`NL Search failed: ${response.status}`);
  return response.json();
}

export async function generateBrief(workId: string): Promise<BriefResponse> {
  const response = await fetch(`${BASE_URL}/api/brief/${encodeURIComponent(workId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Brief generation failed: ${response.status}`);
  return response.json();
}

export async function getSimilarWorks(workId: string, topK = 8): Promise<SimilarWorksResponse> {
  const response = await fetch(`${BASE_URL}/api/works/${encodeURIComponent(workId)}/similar?top_k=${topK}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Similar works failed: ${response.status}`);
  return response.json();
}

export async function getLLMRisk(workId: string): Promise<LLMRiskResponse> {
  const response = await fetch(`${BASE_URL}/api/llm-risk/${encodeURIComponent(workId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`LLM risk assessment failed: ${response.status}`);
  return response.json();
}

export async function prioritizeWorks(workIds: string[]): Promise<PrioritizeResponse> {
  const response = await fetch(`${BASE_URL}/api/prioritize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ work_ids: workIds }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Prioritization failed: ${response.status}`);
  return response.json();
}

export async function getTrends(): Promise<TrendsResponse> {
  return apiGet<TrendsResponse>('/api/trends');
}

export async function getVendorPatterns(): Promise<VendorPatternsResponse> {
  return apiGet<VendorPatternsResponse>('/api/vendor-patterns');
}

export async function getClusterRecords(params: {
  cluster_type: 'description' | 'amount';
  work_description?: string;
  work_type?: string;
  amount?: number;
}): Promise<{ records: ClusterRecord[] }> {
  return apiGet('/api/vendor-patterns/cluster-records', params as Record<string, string | number | undefined>);
}

export async function getEarlyWarning(): Promise<EarlyWarningResponse> {
  return apiGet<EarlyWarningResponse>('/api/early-warning');
}

export async function getAuditLog(limit = 50): Promise<AuditLogResponse> {
  return apiGet<AuditLogResponse>('/api/audit-log', { limit });
}

export async function appendAuditLog(workId: string, action: string): Promise<void> {
  await fetch(`${BASE_URL}/api/audit-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ work_id: workId, action, authority: 'analyst' }),
  });
}

export async function getDescriptionQuality(workId: string): Promise<DescriptionQualityResponse> {
  const response = await fetch(`${BASE_URL}/api/description-quality/${encodeURIComponent(workId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Description quality check failed: ${response.status}`);
  return response.json();
}

export function getExportCsvUrl(params: { state?: string; mp_name?: string; min_risk_score?: number }): string {
  const url = new URL(`${BASE_URL}/api/export/csv`);
  if (params.state) url.searchParams.set('state', params.state);
  if (params.mp_name) url.searchParams.set('mp_name', params.mp_name);
  if (params.min_risk_score) url.searchParams.set('min_risk_score', String(params.min_risk_score));
  return url.toString();
}

export function getExportReportUrl(workId: string): string {
  return `${BASE_URL}/api/export/report/${encodeURIComponent(workId)}`;
}

import type {
  ComplianceResponse,
  MpAnalyticsResponse,
  MpLeaderboardResponse,
  FinancialResponse,
} from '../types';

export async function getCompliance(): Promise<ComplianceResponse> {
  const r = await fetch(`${BASE_URL}/api/compliance`);
  if (!r.ok) throw new Error('compliance fetch failed');
  return r.json();
}

export async function getComplianceRuleWorks(ruleId: string, includeWarnings = false): Promise<{ rule_id: string; total: number; results: Project[] }> {
  return apiGet('/api/compliance/rule-works', { rule_id: ruleId, include_warnings: includeWarnings ? 'true' : 'false' });
}

export async function getMpAnalytics(mpName?: string): Promise<MpAnalyticsResponse | MpLeaderboardResponse> {
  const url = mpName
    ? `${BASE_URL}/api/mp-analytics?mp_name=${encodeURIComponent(mpName)}`
    : `${BASE_URL}/api/mp-analytics`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('mp-analytics fetch failed');
  return r.json();
}

export async function getFinancial(): Promise<FinancialResponse> {
  const r = await fetch(`${BASE_URL}/api/financial`);
  if (!r.ok) throw new Error('financial fetch failed');
  return r.json();
}

export async function postCopilot(query: string, history: {role: string; content: string}[]): Promise<{response: string; query_type: string}> {
  const r = await fetch(`${BASE_URL}/api/copilot`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ query, history }),
  });
  if (!r.ok) throw new Error('copilot fetch failed');
  return r.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export interface AuthSession {
  token: string;
  username: string;
  role: string;
  display_name: string;
}

export async function authLogin(username: string, password: string): Promise<AuthSession> {
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as any).detail || 'Invalid credentials');
  }
  return r.json();
}

export async function authRegister(username: string, password: string, displayName: string, role: string): Promise<AuthSession> {
  const r = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, display_name: displayName, role }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as any).detail || 'Registration failed');
  }
  return r.json();
}

export async function authLogout(token: string): Promise<void> {
  await fetch(`${BASE_URL}/api/auth/logout?token=${encodeURIComponent(token)}`, { method: 'POST' });
}

export async function authMe(token: string): Promise<AuthSession & { token: string }> {
  const r = await fetch(`${BASE_URL}/api/auth/me?token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error('Session expired');
  const data = await r.json();
  return { ...data, token };
}
