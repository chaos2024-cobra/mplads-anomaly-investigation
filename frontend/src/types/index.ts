export interface Overview {
  total_works_analyzed: number;
  total_amount_analyzed: number;
  total_mplads_fund_utilized_all_sources: number;
  total_mplads_allocated_all_sources: number;
  flagged_count: number;
  high_risk_count: number;
  critical_count: number;
  by_risk_level: Record<string, number>;
  estimated_financial_exposure: number;
}

export interface Filters {
  states: string[];
  work_types: string[];
  risk_levels: string[];
}

export interface Project {
  work_id: string;
  mp_name: string;
  state: string;
  constituency: string;
  work_type: string;
  work_subcategory?: string;
  work_description?: string;
  dup_cluster_size?: number;
  amount: number;
  date: string;
  risk_score: number;
  risk_level: string;
  reason: string;
  district?: string;
  work_status?: string;
  pipeline_stage?: string;
  evidence?: Evidence;
  rec_to_san_days?: number | null;
  stall_days?: number | null;
  phantom_days?: number | null;
  total_exp?: number | null;
  cost_ratio?: number | null;
  cost_z?: number | null;
  cost_score?: number | null;
  fin_score?: number | null;
  rec_delay_score?: number | null;
  stall_score?: number | null;
  phantom_score?: number | null;
  dup_score?: number | null;
  calamity_score?: number | null;
  conc_ratio?: number | null;
  portfolio_share?: number | null;
  has_image?: number | null;
  dup_pair?: string | null;
  model_adjusted?: boolean;
  heuristic_score?: number;
}

export interface Evidence {
  financial_anomaly: {
    score: number;
    cost_score: number;
    z_score: number | null;
    ratio_to_category_median: number | null;
    flag_type: string;
    conc_ratio: number | null;
    portfolio_share: number | null;
  };
  rec_delay: {
    score: number;
    days: number;
  };
  stalled_work: {
    score: number;
    work_status: string | null;
    days_stalled: number | null;
  };
  unaccounted_funds: {
    score: number;
    total_disbursed: number | null;
    pipeline_stage: string | null;
  };
  phantom_completion: {
    score: number;
    days_to_complete: number | null;
    has_image: boolean;
  };
  duplicate_work: {
    score: number;
    duplicate_of: string | null;
    cluster_size?: number;
  };
  calamity_misuse: {
    score: number;
  };
}

export interface WorksResponse {
  total: number;
  limit: number;
  offset: number;
  results: Project[];
}

export interface PeerResponse {
  work_type: string;
  work_subcategory: string;
  this_work_amount: number;
  category_median_amount: number | null;
  peers: PeerProject[];
}

export interface PeerProject {
  work_id: string;
  mp_name: string;
  state: string;
  amount: number;
  date: string;
  risk_score: number;
}

export interface Transaction {
  work_id: string;
  state: string;
  amount: number;
  date: string;
  risk_score: number;
  work_type_or_desc: string;
}

export interface TransactionsResponse {
  note: string;
  mp_name: string;
  work_type: string;
  transactions: Transaction[];
}

export interface TopSuspiciousMP {
  mp_name: string;
  state: string;
  constituency: string;
  flagged_works: number;
  critical_works: number;
  avg_risk_score: number;
  max_risk_score: number;
}

export interface TopSuspiciousResponse {
  results: TopSuspiciousMP[];
}

export type SortOption = 'risk_score_desc' | 'amount_desc' | 'date_desc';

export interface NLSearchFilters {
  state: string | null;
  mp_name: string | null;
  work_type: string | null;
  min_risk_score: number | null;
  min_amount: number | null;
  work_status: string | null;
  search: string | null;
  explanation: string;
}

export interface NLSearchResponse {
  filters: NLSearchFilters;
  total: number;
  results: Project[];
  explanation?: string;
}

export interface BriefResponse {
  work_id: string;
  brief: string;
}

export interface SimilarWork {
  work_id: string;
  mp_name: string;
  state: string;
  amount: number;
  risk_score: number;
  work_description?: string;
  similarity_score: number;
}

export interface SimilarWorksResponse {
  work_id: string;
  results: SimilarWork[];
}

export interface LLMRiskResponse {
  work_id: string;
  qualitative_score: number;
  flags: string[];
  reasoning: string;
}

export interface PrioritizedWork {
  work_id: string;
  rank: number;
  reason: string;
}

export interface PrioritizeResponse {
  ranked: PrioritizedWork[];
  summary: string;
}

export interface FilterState {
  state: string;
  district: string;
  category: string;
  search: string;
  minRisk: number;
  mpName: string | null;
  sort: SortOption;
  page: number;
  limit: number;
}

export interface TrendMonth {
  month: string;
  flagged_count: number;
  critical_count: number;
  avg_risk_score: number;
  total_amount: number;
}

export interface TrendState {
  state: string;
  flagged_count: number;
  critical_count: number;
  avg_risk_score: number;
  total_amount: number;
}

export interface TrendsResponse {
  monthly: TrendMonth[];
  by_state: TrendState[];
  signal_breakdown: Record<string, number>;
}

export interface VendorSharedDesc {
  work_description: string;
  mp_count: number;
  work_count: number;
  avg_amount: number;
  states: string;
  avg_risk_score: number;
}

export interface VendorAmountCluster {
  work_type: string;
  amount: number;
  mp_count: number;
  work_count: number;
  states: string;
}

export interface VendorPatternsResponse {
  shared_descriptions: VendorSharedDesc[];
  amount_clusters: VendorAmountCluster[];
}

export interface ClusterRecord {
  work_id: string;
  mp_name: string;
  state: string;
  constituency: string;
  work_type: string;
  amount: number;
  date: string;
  risk_score: number;
  risk_level: string;
  work_status: string;
  work_description: string;
}

export interface EarlyWarningWork {
  work_id: string;
  mp_name: string;
  state: string;
  constituency: string;
  work_type: string;
  amount: number;
  date: string;
  risk_score: number;
  risk_level: string;
  work_status: string | null;
  pipeline_stage: string | null;
  fin_score: number;
  rec_delay_score: number;
  stall_score: number;
  unaccounted_score: number;
  phantom_score: number;
  signal_count: number;
}

export interface EarlyWarningResponse {
  total: number;
  results: EarlyWarningWork[];
}

export interface AuditEntry {
  work_id: string;
  action: string;
  authority: string;
  timestamp: string;
}

export interface AuditLogResponse {
  entries: AuditEntry[];
}

export interface DescriptionQualityResponse {
  work_id: string;
  quality_score: number;
  vagueness_score: number;
  flags: string[];
  assessment: string;
}

export interface ComplianceRule {
  id: string;
  label: string;
  description: string;
  status: 'breach' | 'warning' | 'pass';
  breach_count: number;
  affected_amount: number;
  sample_works: { work_id: string; mp_name: string; state: string; value: number }[];
}
export interface ComplianceResponse {
  summary: { total_checked: number; breaches: number; warnings: number };
  rules: ComplianceRule[];
}

export interface MpSummary {
  total_works: number; total_amount: number; total_exp: number; utilization_pct: number;
  flagged_count: number; critical_count: number; avg_risk_score: number;
  completed_works: number; completion_rate: number;
}
export interface MpCategoryBreakdown { work_type: string; count: number; total_amount: number; avg_risk: number; }
export interface MpAnalyticsResponse {
  mp_name: string; state: string; constituency: string;
  summary: MpSummary;
  by_category: MpCategoryBreakdown[];
  risk_distribution: Record<string, number>;
  signal_scores: Record<string, number>;
  top_risk_works: { work_id: string; work_type: string; amount: number; risk_score: number; risk_level: string }[];
}
export interface MpLeaderboardEntry {
  mp_name: string; state: string; constituency: string;
  total_works: number; total_amount: number; flagged_count: number;
  critical_count: number; avg_risk_score: number; utilization_pct: number; completion_rate: number;
}
export interface MpLeaderboardResponse { results: MpLeaderboardEntry[]; }

export interface FinancialSummary {
  total_sanctioned: number; total_expenditure: number; utilization_pct: number;
  idle_funds: number; financial_exposure: number; cost_overrun_count: number; payment_gap_count: number;
}
export interface FinancialResponse {
  summary: FinancialSummary;
  cost_overruns: { work_id: string; mp_name: string; state: string; work_type: string; amount: number; cost_ratio: number; cost_z: number }[];
  payment_gaps: { work_id: string; mp_name: string; state: string; amount: number; total_exp: number; unaccounted_score: number; pipeline_stage: string }[];
  by_state: { state: string; total_amount: number; total_exp: number; utilization_pct: number; exposure: number }[];
  yearly_spending: { year: string; total_amount: number; flagged_amount: number; work_count: number }[];
}

// ── Human-in-the-Loop Feedback Types ─────────────────────────────────────────

export type FeedbackLabel = 'agree' | 'too_high' | 'too_low' | 'false_positive';

export interface FeedbackEntry {
  id: number;
  work_id: string;
  reviewer: string;
  human_label: FeedbackLabel;
  corrected_score: number | null;
  notes: string | null;
  original_score: number;
  created_at: string;
}

export interface FeedbackResponse {
  total: number;
  results: FeedbackEntry[];
}

export interface FeedbackStatsResponse {
  total_feedback: number;
  agreement_rate: number;
  label_distribution: Record<string, number>;
  top_reviewers: { reviewer: string; cnt: number }[];
  recent_feedback: FeedbackEntry[];
  min_samples_for_training: number;
  can_train: boolean;
}

export interface ModelStatusResponse {
  model_exists: boolean;
  trained_at: string | null;
  sample_count: number | null;
  cv_mae: number | null;
  cv_r2: number | null;
  feature_columns?: string[];
  error?: string;
}

export interface RetrainResponse {
  ok: boolean;
  sample_count: number;
  cv_mae: number | null;
  cv_r2: number | null;
  model_path: string;
  trained_at: string;
}
