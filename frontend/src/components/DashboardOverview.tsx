import { useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import * as api from '../api/client';
import { INDIA_STATES } from './india_states_data';
import { fmtInr } from '../utils/format';
import type { Overview, Project } from '../types';
import {
  IconClipboard, IconRupee, IconFlag, IconAlert, IconArrowRight,
  IconSearch, IconReport, IconSparkle, IconPlus, IconMinus,
} from './Icons';

/* ── Semantic risk palette (single source of truth) ──────── */
const C = {
  low: '#3BAF7A',
  medium: '#D6A33A',
  high: '#D97732',
  critical: '#C94B4B',
  minimal: '#CBD6E2',
  blue: '#2563A8',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

interface Props {
  overview: Overview;
  onOpenDossier: (workId: string) => void;
  onSelectState: (state: string) => void;
  onNavigate: (view: 'projects' | 'reports' | 'copilot') => void;
}

export function DashboardOverview({ overview, onOpenDossier, onSelectState, onNavigate }: Props) {
  const trends = useApi(() => api.getTrends(), []);
  const warning = useApi(() => api.getEarlyWarning(), []);
  const recent = useApi(
    () => api.getWorks({ min_risk_score: 40, sort: 'risk_score_desc', limit: 6, offset: 0 }),
    [],
  );

  return (
    <>
      <div className="gov-kpi-row">
        <KpiCards overview={overview} />
      </div>

      <div className="gov-row gov-row-a">
        <RiskLandscapeCard overview={overview} onViewDetails={() => onNavigate('projects')} />
        <AnomalyTrendsCard
          monthly={trends.data?.monthly ?? []}
          loading={trends.loading}
        />
        <EarlyWarningCard
          total={warning.data?.total ?? 0}
          results={warning.data?.results ?? []}
          loading={warning.loading}
          onView={() => onNavigate('reports')}
        />
      </div>

      <div className="gov-row gov-row-b">
        <RiskMapCard
          byState={trends.data?.by_state ?? []}
          loading={trends.loading}
          onSelectState={onSelectState}
        />
        <RecentFlaggedCard
          rows={recent.data?.results ?? []}
          loading={recent.loading}
          onOpen={onOpenDossier}
          onViewAll={() => onNavigate('projects')}
        />
        <div className="gov-stack">
          <SystemStatusCard healthy={!!overview} />
          <QuickActionsCard onNavigate={onNavigate} />
        </div>
      </div>

      <FooterBanner />
    </>
  );
}

/* ════════════════════════════════════════════════════════
   KPI CARDS
   ════════════════════════════════════════════════════════ */
function KpiCards({ overview }: { overview: Overview }) {
  const total = overview.total_works_analyzed || 0;
  const flagged = overview.flagged_count || 0;
  const high = overview.high_risk_count || 0;
  const crit = overview.critical_count || 0;
  const exposure = overview.estimated_financial_exposure || 0;
  const pct = (n: number) => (total ? ((n / total) * 100).toFixed(1) : '0.0');

  return (
    <>
      <div className="gov-kpi">
        <div className="gov-kpi-top">
          <span className="gov-kpi-icon blue"><IconClipboard size={16} /></span>
        </div>
        <div className="gov-kpi-label">Projects analysed</div>
        <div className="gov-kpi-value">{total.toLocaleString('en-IN')}</div>
        <div className="gov-kpi-foot">Total records in dataset</div>
      </div>

      <div className="gov-kpi">
        <div className="gov-kpi-top">
          <span className="gov-kpi-icon green"><IconRupee size={16} /></span>
        </div>
        <div className="gov-kpi-label">Total exposure</div>
        <div className="gov-kpi-value">{fmtInr(exposure)}</div>
        <div className="gov-kpi-foot">Across analysed projects</div>
      </div>

      <div className="gov-kpi">
        <div className="gov-kpi-top">
          <span className="gov-kpi-icon saffron"><IconFlag size={16} /></span>
        </div>
        <div className="gov-kpi-label">Flagged projects</div>
        <div className="gov-kpi-value flag">{flagged.toLocaleString('en-IN')}</div>
        <div className="gov-kpi-foot">{pct(flagged)}% of total</div>
      </div>

      <div className="gov-kpi">
        <div className="gov-kpi-top">
          <span className="gov-kpi-icon orange"><IconAlert size={16} /></span>
        </div>
        <div className="gov-kpi-label">High risk</div>
        <div className="gov-kpi-value high">{high.toLocaleString('en-IN')}</div>
        <div className="gov-kpi-foot">{pct(high)}% of total</div>
      </div>

      <div className="gov-kpi">
        <div className="gov-kpi-top">
          <span className="gov-kpi-icon red"><IconAlert size={16} /></span>
        </div>
        <div className="gov-kpi-label">Critical</div>
        <div className="gov-kpi-value crit">{crit.toLocaleString('en-IN')}</div>
        <div className="gov-kpi-foot">{pct(crit)}% of total</div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════
   NATIONAL RISK LANDSCAPE
   ════════════════════════════════════════════════════════ */
function RiskLandscapeCard({ overview, onViewDetails }: { overview: Overview; onViewDetails: () => void }) {
  const by = overview.by_risk_level || {};
  const crit = by['Critical - Priority Investigation'] || 0;
  const high = by['High - Requires Investigation'] || 0;
  const med = by['Medium - Worth Reviewing'] || 0;
  const low = by['Low - Normal Pattern'] || 0;
  const total = overview.total_works_analyzed || 1;

  const seg = [
    { key: 'low', label: 'Baseline (Low)', n: low, color: C.low },
    { key: 'medium', label: 'Medium', n: med, color: C.medium },
    { key: 'high', label: 'High', n: high, color: C.high },
    { key: 'critical', label: 'Critical', n: crit, color: C.critical },
  ];

  return (
    <div className="gov-card">
      <div className="gov-card-head">
        <div>
          <div className="gov-card-title">National risk landscape</div>
          <div className="gov-card-sub">Distribution of projects by risk level</div>
        </div>
        <button className="gov-link" onClick={onViewDetails}>View details →</button>
      </div>
      <div className="gov-card-body">
        <div className="gov-riskbar">
          {seg.map(s => (
            <i
              key={s.key}
              style={{ width: `${Math.max((s.n / total) * 100, s.n ? 0.6 : 0)}%`, background: s.color }}
              title={`${s.label}: ${s.n.toLocaleString('en-IN')} (${((s.n / total) * 100).toFixed(1)}%)`}
            />
          ))}
        </div>
        <div className="gov-risk-metrics">
          {seg.map(s => (
            <div key={s.key} className={`gov-risk-metric ${s.key}`}>
              <div className="gov-risk-metric-value">
                {s.n.toLocaleString('en-IN')}
                <span className="gov-risk-metric-pct"> · {((s.n / total) * 100).toFixed(1)}%</span>
              </div>
              <div className="gov-risk-metric-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   ANOMALY TRENDS — clean line chart
   ════════════════════════════════════════════════════════ */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function AnomalyTrendsCard({
  monthly, loading,
}: { monthly: { month: string; flagged_count: number; critical_count: number }[]; loading: boolean }) {
  const gran = 'monthly';

  const series = useMemo(
    () => [...monthly].sort((a, b) => a.month.localeCompare(b.month)).slice(-12),
    [monthly],
  );

  const W = 460, H = 168;
  const P = { t: 10, r: 8, b: 22, l: 34 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;

  const max = Math.max(1, ...series.map(d => Math.max(d.flagged_count, d.critical_count)));
  const niceMax = Math.ceil(max / 4) * 4 || 4;

  const x = (i: number) => P.l + (series.length <= 1 ? iw / 2 : (i / (series.length - 1)) * iw);
  const y = (v: number) => P.t + ih - (v / niceMax) * ih;
  const path = (key: 'flagged_count' | 'critical_count') =>
    series.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');

  return (
    <div className="gov-card">
      <div className="gov-card-head">
        <div>
          <div className="gov-card-title">Anomaly trends</div>
          <div className="gov-card-sub">Flagged and critical projects over time</div>
        </div>
      </div>
      <div className="gov-card-body">
        {loading ? (
          <div className="skeleton" style={{ height: H }} />
        ) : series.length === 0 ? (
          <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '0.78rem' }}>
            No trend data available
          </div>
        ) : (
          <>
            <svg className="gov-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Anomaly trends over time">
              {/* horizontal gridlines + y labels */}
              {[0, 1, 2, 3, 4].map(i => {
                const v = (niceMax / 4) * i;
                const yy = y(v);
                return (
                  <g key={i}>
                    <line className="gov-chart-grid" x1={P.l} y1={yy} x2={W - P.r} y2={yy} opacity={i === 0 ? 0.9 : 0.45} />
                    <text className="gov-chart-axis" x={P.l - 6} y={yy + 3} textAnchor="end">{Math.round(v)}</text>
                  </g>
                );
              })}
              {/* x labels */}
              {series.map((d, i) => {
                const m = parseInt(d.month.slice(5, 7), 10) - 1;
                return (
                  <text key={d.month} className="gov-chart-axis" x={x(i)} y={H - 6} textAnchor="middle">
                    {MONTH_ABBR[m] ?? d.month.slice(5)}
                  </text>
                );
              })}
              <path className="gov-chart-line flagged" d={path('flagged_count')} />
              <path className="gov-chart-line critical" d={path('critical_count')} />
              {series.map((d, i) => (
                <circle key={`f${d.month}`} className="gov-chart-dot" cx={x(i)} cy={y(d.flagged_count)} r={2.6} fill={C.blue}>
                  <title>{`${d.month}: ${d.flagged_count} flagged`}</title>
                </circle>
              ))}
              {series.map((d, i) => (
                <circle key={`c${d.month}`} className="gov-chart-dot" cx={x(i)} cy={y(d.critical_count)} r={2.6} fill={C.critical}>
                  <title>{`${d.month}: ${d.critical_count} critical`}</title>
                </circle>
              ))}
            </svg>
            <div className="gov-legend">
              <span className="gov-legend-item"><i className="gov-legend-swatch" style={{ background: C.blue }} /> Flagged projects</span>
              <span className="gov-legend-item"><i className="gov-legend-swatch" style={{ background: C.critical }} /> Critical projects</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   EARLY WARNING
   ════════════════════════════════════════════════════════ */
function EarlyWarningCard({
  total, results, loading, onView,
}: {
  total: number;
  results: { rec_delay_score: number; stall_score: number; unaccounted_score: number; fin_score: number }[];
  loading: boolean;
  onView: () => void;
}) {
  const buckets = useMemo(() => ([
    { label: 'Pending sanction (>45 days)', color: C.high, n: results.filter(r => (r.rec_delay_score ?? 0) > 0).length },
    { label: 'Incomplete (>1 year)', color: C.critical, n: results.filter(r => (r.stall_score ?? 0) > 0).length },
    { label: 'No payment (>3 months)', color: C.medium, n: results.filter(r => (r.unaccounted_score ?? 0) > 0).length },
    { label: 'High cost deviation', color: C.blue, n: results.filter(r => (r.fin_score ?? 0) > 0).length },
  ]), [results]);

  return (
    <div className="gov-warn">
      <div className="gov-warn-head">
        <span className="gov-warn-icon"><IconAlert size={17} /></span>
        <span className="gov-warn-title">Early warning</span>
      </div>
      <div className="gov-warn-msg">
        <b>{loading ? '—' : total.toLocaleString('en-IN')}</b> projects are at risk of missing key
        compliance deadlines in the next 90 days.
      </div>
      <button className="gov-warn-btn" onClick={onView}>
        View at-risk projects
        <IconArrowRight size={15} />
      </button>
      <div className="gov-warn-rows">
        {buckets.map(b => (
          <div key={b.label} className="gov-warn-row">
            <i className="gov-warn-row-dot" style={{ background: b.color }} />
            <span className="gov-warn-row-label">{b.label}</span>
            <span className="gov-warn-row-count">{loading ? '—' : b.n.toLocaleString('en-IN')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   RISK MAP OF INDIA — choropleth
   ════════════════════════════════════════════════════════ */
function RiskMapCard({
  byState, loading, onSelectState,
}: {
  byState: { state: string; flagged_count: number; critical_count: number; avg_risk_score: number }[];
  loading: boolean;
  onSelectState: (s: string) => void;
}) {
  const [metric, setMetric] = useState<'risk' | 'count'>('risk');
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<string | null>(null);

  const lookup = useMemo(() => {
    const m = new Map<string, { flagged: number; critical: number; avg: number; raw: string }>();
    byState.forEach(s => m.set(norm(s.state), {
      flagged: s.flagged_count,
      critical: s.critical_count,
      avg: s.avg_risk_score,
      raw: s.state,
    }));
    return m;
  }, [byState]);

  const maxFlagged = useMemo(
    () => Math.max(1, ...byState.map(s => s.flagged_count)),
    [byState],
  );

  function fillFor(stateId: string) {
    const d = lookup.get(norm(stateId));
    if (!d) return C.minimal;
    if (metric === 'risk') {
      const v = d.avg;
      if (v >= 75) return '#8B0000';      // dark red — critical
      if (v >= 60) return C.critical;     // red
      if (v >= 48) return '#D45E1A';      // deep orange
      if (v >= 38) return C.high;         // orange
      if (v >= 28) return C.medium;       // amber
      if (v >= 18) return '#A8C44A';      // yellow-green
      if (v > 0)   return C.low;          // green
      return C.minimal;
    }
    const r = d.flagged / maxFlagged;
    if (r >= 0.75) return '#8B0000';
    if (r >= 0.55) return C.critical;
    if (r >= 0.40) return '#D45E1A';
    if (r >= 0.27) return C.high;
    if (r >= 0.15) return C.medium;
    if (r >= 0.06) return '#A8C44A';
    if (r > 0)     return C.low;
    return C.minimal;
  }

  const top = useMemo(
    () => [...byState].sort((a, b) => b.flagged_count - a.flagged_count).slice(0, 5),
    [byState],
  );

  const vb = useMemo(() => {
    const w = 400 / zoom, h = 480 / zoom;
    return `${(400 - w) / 2} ${(480 - h) / 2} ${w} ${h}`;
  }, [zoom]);

  return (
    <div className="gov-card">
      <div className="gov-card-head">
        <div>
          <div className="gov-card-title">Risk map of India</div>
          <div className="gov-card-sub">State-wise distribution of anomaly scores</div>
        </div>
        <select
          className="gov-select"
          value={metric}
          onChange={e => setMetric(e.target.value as 'risk' | 'count')}
          aria-label="Map metric"
        >
          <option value="risk">Risk level</option>
          <option value="count">Project count</option>
        </select>
      </div>

      <div className="gov-card-body">
        <div className="gov-map-layout">
          <div className="gov-map-canvas">
            <svg className="gov-map-svg" viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img" aria-label="India risk choropleth">
              {INDIA_STATES.map(s => {
                const d = lookup.get(norm(s.id));
                return (
                  <path
                    key={s.id}
                    d={s.d}
                    className={`gov-map-state${hover === s.id ? ' selected' : ''}`}
                    fill={loading ? C.minimal : fillFor(s.id)}
                    onMouseEnter={() => setHover(s.id)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => d && onSelectState(d.raw)}
                  >
                    <title>
                      {d ? `${s.id} — ${d.flagged.toLocaleString('en-IN')} flagged, avg risk ${d.avg.toFixed(1)}` : `${s.id} — no flagged records`}
                    </title>
                  </path>
                );
              })}
            </svg>
            <div className="gov-map-zoom">
              <button onClick={() => setZoom(z => Math.min(z + 0.25, 2.5))} aria-label="Zoom in"><IconPlus size={13} /></button>
              <button onClick={() => setZoom(z => Math.max(z - 0.25, 1))} aria-label="Zoom out"><IconMinus size={13} /></button>
            </div>
          </div>

          <div>
            <div className="gov-rank-title">High risk states</div>
            {loading
              ? [1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton" style={{ height: 22, marginBottom: 4 }} />)
              : top.map((s, i) => (
                <div key={s.state} className="gov-rank-row" onClick={() => onSelectState(s.state)} title={`Filter projects to ${s.state}`}>
                  <span className="gov-rank-num">{i + 1}</span>
                  <span className="gov-rank-name">{s.state}</span>
                  <span className="gov-rank-val">{s.flagged_count.toLocaleString('en-IN')}</span>
                </div>
              ))}
          </div>
        </div>

        <div className="gov-map-legend">
          {[
            ['Severe (75+)', '#8B0000'],
            ['Critical (60–74)', C.critical],
            ['High (48–59)', '#D45E1A'],
            ['Elevated (38–47)', C.high],
            ['Medium (28–37)', C.medium],
            ['Low (18–27)', '#A8C44A'],
            ['Minimal (<18)', C.low],
            ['No data', C.minimal],
          ].map(([label, color]) => (
            <span key={label} className="gov-map-legend-item">
              <i className="gov-map-legend-swatch" style={{ background: color }} /> {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   RECENT FLAGGED PROJECTS
   ════════════════════════════════════════════════════════ */
function tierOf(score: number) {
  if (score >= 75) return 'critical';
  if (score >= 40) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}
function daysSince(date: string): number | null {
  const t = Date.parse(date);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}

function RecentFlaggedCard({
  rows, loading, onOpen, onViewAll,
}: { rows: Project[]; loading: boolean; onOpen: (id: string) => void; onViewAll: () => void }) {
  return (
    <div className="gov-card">
      <div className="gov-card-head">
        <div>
          <div className="gov-card-title">Recent flagged projects</div>
          <div className="gov-card-sub">Highest anomaly scores requiring review</div>
        </div>
        <button className="gov-link" onClick={onViewAll}>View all →</button>
      </div>
      <div className="gov-card-body">
        {loading ? (
          [1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton" style={{ height: 32, marginBottom: 4 }} />)
        ) : rows.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', padding: '12px 0' }}>No flagged projects found.</div>
        ) : (
          <div className="gov-table-scroll">
            <table className="gov-table">
              <thead>
                <tr>
                  <th>Work ID</th>
                  <th>State</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Risk</th>
                  <th style={{ textAlign: 'right' }}>Days since</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => {
                  const tier = tierOf(Math.round(p.risk_score));
                  const d = daysSince(p.date);
                  return (
                    <tr key={p.work_id} onClick={() => onOpen(p.work_id)} title="Open investigation dossier">
                      <td className="gov-td-id">{p.work_id}</td>
                      <td>{p.state}</td>
                      <td>{p.work_subcategory && p.work_subcategory !== 'other' ? p.work_subcategory : p.work_type}</td>
                      <td className="gov-td-amount" style={{ textAlign: 'right' }}>{fmtInr(p.amount)}</td>
                      <td>
                        <span className={`gov-risk-tag ${tier}`}>
                          <i />{tier.charAt(0).toUpperCase() + tier.slice(1)}
                        </span>
                      </td>
                      <td className="gov-td-num" style={{ textAlign: 'right' }}>{d ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SYSTEM STATUS
   ════════════════════════════════════════════════════════ */
function SystemStatusCard({ healthy }: { healthy: boolean }) {
  const updated = useMemo(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, []);

  return (
    <div className="gov-card">
      <div className="gov-card-head">
        <div className="gov-card-title">System status</div>
        <span className="gov-pill-ok">
          <i style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
          {healthy ? 'All systems operational' : 'Degraded'}
        </span>
      </div>
      <div className="gov-card-body">
        <div className="gov-status-rows">
          <div className="gov-status-row"><span>Data sync</span><span className="gov-status-val"><i />Online</span></div>
          <div className="gov-status-row"><span>Data verification</span><span className="gov-status-val"><i />Complete</span></div>
          <div className="gov-status-row"><span>AI models</span><span className="gov-status-val"><i />Active</span></div>
          <div className="gov-status-row"><span>Last updated</span><span className="gov-status-val neutral">{updated}</span></div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   QUICK ACTIONS
   ════════════════════════════════════════════════════════ */
function QuickActionsCard({ onNavigate }: { onNavigate: (v: 'projects' | 'reports' | 'copilot') => void }) {
  return (
    <div className="gov-card">
      <div className="gov-card-head">
        <div className="gov-card-title">Quick actions</div>
      </div>
      <div className="gov-card-body">
        <div className="gov-actions">
          <button className="gov-action primary" onClick={() => onNavigate('projects')}>
            <IconSearch size={15} /> View flagged projects
            <span className="gov-action-arrow"><IconArrowRight size={15} /></span>
          </button>
<button className="gov-action" onClick={() => onNavigate('copilot')}>
            <IconSparkle size={15} /> Ask AI Copilot
            <span className="gov-action-arrow"><IconArrowRight size={15} /></span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   FOOTER BANNER
   ════════════════════════════════════════════════════════ */
export function FooterBanner() {
  return (
    <div className="gov-footer">
      <div className="gov-footer-quote">
        “From data to development — ensuring MPLADS funds create real impact.”
      </div>
      <div className="gov-footer-org">
        <b>Ministry of Statistics and Programme Implementation</b><br />
        Government of India
      </div>
      <div className="gov-footer-motto">
        <div className="gov-motto-text">Sabka Saath<br />Sabka Vikas</div>
        <div className="gov-motto-rule"><i /><i /><i /></div>
      </div>
    </div>
  );
}

