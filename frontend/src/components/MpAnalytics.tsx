import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { getMpAnalytics } from '../api/client';
import { fmtInr, riskColor } from '../utils/format';
import type { MpLeaderboardResponse, MpAnalyticsResponse } from '../types';

interface Props {
  onOpenDossier: (workId: string) => void;
}

function isLeaderboard(data: MpLeaderboardResponse | MpAnalyticsResponse): data is MpLeaderboardResponse {
  return 'results' in data;
}

const SIGNAL_KEYS: { key: string; label: string }[] = [
  { key: 'fin', label: 'Financial' },
  { key: 'rec_delay', label: 'Rec Delay' },
  { key: 'stall', label: 'Stall' },
  { key: 'dup', label: 'Duplicate' },
  { key: 'phantom', label: 'Phantom' },
];

const DIST_COLORS: Record<string, string> = {
  BASELINE: 'var(--success)',
  MEDIUM: 'var(--warning)',
  HIGH: '#f97316',
  CRITICAL: 'var(--danger)',
};

export function MpAnalytics({ onOpenDossier }: Props) {
  const [selectedMp, setSelectedMp] = useState<string | null>(null);

  const leaderboard = useApi<MpLeaderboardResponse | MpAnalyticsResponse>(
    () => getMpAnalytics(),
    []
  );

  const detail = useApi<MpLeaderboardResponse | MpAnalyticsResponse>(
    () => selectedMp ? getMpAnalytics(selectedMp) : Promise.resolve({ results: [] } as MpLeaderboardResponse),
    [selectedMp]
  );

  const leaderboardData = leaderboard.data && isLeaderboard(leaderboard.data) ? leaderboard.data : null;
  const detailData = detail.data && !isLeaderboard(detail.data) ? detail.data : null;

  if (selectedMp) {
    if (detail.loading) {
      return (
        <div className="mp-analytics">
          <button className="mp-detail-back" onClick={() => setSelectedMp(null)}>← Back to Leaderboard</button>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 8, borderRadius: 6 }} />)}
        </div>
      );
    }
    if (detail.error || !detailData) {
      return (
        <div className="mp-analytics">
          <button className="mp-detail-back" onClick={() => setSelectedMp(null)}>← Back to Leaderboard</button>
          <div className="state-error">
            <div className="state-error-title">Failed to load MP detail</div>
            <div className="state-error-desc">{detail.error}</div>
          </div>
        </div>
      );
    }

    const s = detailData.summary;
    return (
      <div className="mp-analytics mp-detail">
        <button className="mp-detail-back" onClick={() => setSelectedMp(null)}>← Back to Leaderboard</button>
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.15rem' }}>{detailData.mp_name}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{detailData.constituency} · {detailData.state}</div>
        </div>

        {/* KPI row */}
        <div className="mp-kpi-row">
          {[
            { label: 'Total Works', value: s.total_works.toLocaleString() },
            { label: 'Flagged', value: s.flagged_count.toLocaleString() },
            { label: 'Critical', value: s.critical_count.toLocaleString() },
            { label: 'Avg Risk', value: s.avg_risk_score.toFixed(1) },
            { label: 'Utilization', value: `${s.utilization_pct?.toFixed(1) ?? 'N/A'}%` },
          ].map(({ label, value }) => (
            <div key={label} className="mp-kpi-card">
              <div className="mp-kpi-label">{label}</div>
              <div className="mp-kpi-value">{value}</div>
            </div>
          ))}
        </div>

        {/* Category breakdown */}
        <div className="mp-section">
          <div className="mp-section-title">CATEGORY BREAKDOWN</div>
          <div className="mp-category-table">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Work Type</th>
                  <th style={{ textAlign: 'right' }}>Count</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'right' }}>Avg Risk</th>
                </tr>
              </thead>
              <tbody>
                {detailData.by_category.map(cat => (
                  <tr key={cat.work_type}>
                    <td>{cat.work_type}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{cat.count}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--info)' }}>{fmtInr(cat.total_amount)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: riskColor(cat.avg_risk) }}>{cat.avg_risk.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Signal scores */}
        <div className="mp-section">
          <div className="mp-section-title">SIGNAL SCORES</div>
          <div className="mp-signal-bars">
            {SIGNAL_KEYS.map(({ key, label }) => {
              const val = detailData.signal_scores?.[key] ?? 0;
              const pct = Math.min(100, (val / 10) * 100);
              return (
                <div key={key} className="mp-signal-row">
                  <span className="mp-signal-label">{label}</span>
                  <div className="mp-signal-bar-wrap">
                    <div className="mp-signal-bar" style={{ width: `${pct}%`, background: riskColor(val * 10) }} />
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', minWidth: '2rem', textAlign: 'right' }}>{val.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Risk distribution */}
        <div className="mp-section">
          <div className="mp-section-title">RISK DISTRIBUTION</div>
          <div className="mp-dist-chips">
            {Object.entries(detailData.risk_distribution).map(([level, count]) => (
              <div key={level} className="mp-dist-chip" style={{ borderColor: DIST_COLORS[level] ?? 'var(--border)', color: DIST_COLORS[level] ?? 'var(--text-muted)' }}>
                <span>{level}</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top risk works */}
        <div className="mp-section">
          <div className="mp-section-title">TOP RISK WORKS</div>
          <div className="mp-top-works">
            {detailData.top_risk_works.map(w => (
              <div key={w.work_id} className="mp-work-row" onClick={() => onOpenDossier(w.work_id)}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--info)', fontSize: '0.65rem' }}>{w.work_id}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.68rem' }}>{w.work_type}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)', fontSize: '0.65rem', marginLeft: 'auto' }}>{fmtInr(w.amount)}</span>
                <span className={`badge badge-${w.risk_level.toLowerCase()}`}>{w.risk_level}</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: riskColor(w.risk_score), fontSize: '0.7rem', minWidth: '2.5rem', textAlign: 'right' }}>{w.risk_score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Leaderboard view
  return (
    <div className="mp-analytics mp-leaderboard">
      {leaderboard.loading && (
        <div style={{ padding: '0.75rem 0' }}>
          {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton" style={{ height: 40, marginBottom: 4, borderRadius: 4 }} />)}
        </div>
      )}
      {leaderboard.error && (
        <div className="state-error">
          <div className="state-error-title">Failed to load MP leaderboard</div>
          <div className="state-error-desc">{leaderboard.error}</div>
        </div>
      )}
      {leaderboardData && (
        <div className="data-table-wrap">
          <table className="mp-leaderboard-table data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>MP Name</th>
                <th>State</th>
                <th style={{ textAlign: 'right' }}>Works</th>
                <th style={{ textAlign: 'right' }}>Flagged</th>
                <th style={{ textAlign: 'right' }}>Critical</th>
                <th style={{ textAlign: 'right' }}>Avg Risk</th>
                <th style={{ textAlign: 'right' }}>Utilization%</th>
                <th style={{ textAlign: 'right' }}>Completion%</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardData.results.map((mp, idx) => (
                <tr
                  key={mp.mp_name}
                  className="mp-leaderboard-row"
                  onClick={() => setSelectedMp(mp.mp_name)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)', fontSize: '0.65rem' }}>#{idx + 1}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>{mp.mp_name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{mp.state}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{mp.total_works}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--warning)' }}>{mp.flagged_count}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--danger)' }}>{mp.critical_count}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: riskColor(mp.avg_risk_score), fontWeight: 700 }}>{mp.avg_risk_score.toFixed(1)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{mp.utilization_pct?.toFixed(1) ?? 'N/A'}%</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{mp.completion_rate?.toFixed(1) ?? 'N/A'}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
