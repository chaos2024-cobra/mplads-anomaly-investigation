import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { getTrends } from '../api/client';
import { fmtInr } from '../utils/format';
import type { TrendState } from '../types';

interface Props {
  onSelectState: (state: string) => void;
}

type SortKey = 'flagged_count' | 'critical_count' | 'avg_risk_score' | 'total_amount';

export function TrendPanel({ onSelectState }: Props) {
  const trends = useApi(() => getTrends(), []);
  const [sortKey, setSortKey] = useState<SortKey>('flagged_count');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [hovered, setHovered] = useState<string | null>(null);

  if (trends.loading) {
    return (
      <div className="trend-body">
        {[1,2,3].map(i => <div key={i} className="skeleton" style={{height: 60, marginBottom: 8}} />)}
      </div>
    );
  }

  if (!trends.data) return null;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sortedStates = [...trends.data.by_state].sort((a, b) => {
    const mul = sortDir === 'desc' ? -1 : 1;
    return mul * (a[sortKey] - b[sortKey]);
  });

  const maxFlagged = Math.max(...sortedStates.map(s => s.flagged_count)) || 1;

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th
        className={`ts-th${active ? ' active' : ''}`}
        onClick={() => toggleSort(k)}
        title={`Sort by ${label}`}
      >
        {label}
        <span className="ts-sort-indicator">
          {active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
        </span>
      </th>
    );
  }

  return (
    <div className="trend-body">
      <div className="trend-section">
        <div className="trend-section-title">SIGNAL BREAKDOWN</div>
        <div className="trend-signals">
          {Object.entries(trends.data.signal_breakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([key, count]) => {
              const total = Object.values(trends.data!.signal_breakdown).reduce((s, v) => s + v, 0) || 1;
              const pct = (count / total) * 100;
              const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              return (
                <div key={key} className="trend-signal-row">
                  <div className="trend-signal-label">{label}</div>
                  <div className="trend-signal-bar-wrap">
                    <div className="trend-signal-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="trend-signal-count">{count.toLocaleString()}</div>
                </div>
              );
            })}
        </div>
      </div>

      <div className="trend-section">
        <div className="trend-section-title">MONTHLY FLAGGED WORKS (LAST 12 MONTHS)</div>
        <div className="trend-months">
          {trends.data.monthly.slice(0, 12).reverse().map(m => {
            const maxCount = Math.max(...trends.data!.monthly.slice(0, 12).map(x => x.flagged_count)) || 1;
            const pct = (m.flagged_count / maxCount) * 100;
            return (
              <div key={m.month} className="trend-month-col">
                <div className="trend-month-bar-wrap">
                  <div
                    className="trend-month-bar"
                    style={{ height: `${pct}%` }}
                    title={`${m.flagged_count} flagged, ${m.critical_count} critical`}
                  />
                </div>
                <div className="trend-month-label">{m.month.slice(5)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="trend-section trend-section-states">
        <div className="ts-header">
          <div className="trend-section-title" style={{ margin: 0 }}>TOP STATES BY FLAGGED WORKS</div>
          <span className="ts-hint">click row → filter cases</span>
        </div>
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-th ts-th-state">#  State</th>
              <SortHeader label="Flagged" k="flagged_count" />
              <SortHeader label="Critical" k="critical_count" />
              <SortHeader label="Avg Risk" k="avg_risk_score" />
              <SortHeader label="Amount" k="total_amount" />
              <th className="ts-th ts-th-bar">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {sortedStates.map((s, i) => {
              const flaggedPct = (s.flagged_count / maxFlagged) * 100;
              const criticalPct = s.flagged_count > 0 ? (s.critical_count / s.flagged_count) * 100 : 0;
              const isHovered = hovered === s.state;
              return (
                <tr
                  key={s.state}
                  className={`ts-row${isHovered ? ' hovered' : ''}`}
                  onClick={() => onSelectState(s.state)}
                  onMouseEnter={() => setHovered(s.state)}
                  onMouseLeave={() => setHovered(null)}
                  title={`Filter cases to ${s.state}`}
                >
                  <td className="ts-td ts-td-state">
                    <span className="ts-rank">{i + 1}</span>
                    <span className="ts-state-name">{s.state}</span>
                  </td>
                  <td className="ts-td ts-td-num">{s.flagged_count.toLocaleString()}</td>
                  <td className="ts-td ts-td-critical">{s.critical_count.toLocaleString()}</td>
                  <td className="ts-td ts-td-num">{s.avg_risk_score.toFixed(1)}</td>
                  <td className="ts-td ts-td-amount">{fmtInr(s.total_amount)}</td>
                  <td className="ts-td ts-td-bar">
                    <div className="ts-bar-track">
                      <div className="ts-bar-flagged" style={{ width: `${flaggedPct}%` }}>
                        <div className="ts-bar-critical" style={{ width: `${criticalPct}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
