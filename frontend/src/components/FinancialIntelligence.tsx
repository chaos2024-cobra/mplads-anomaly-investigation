import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { getFinancial } from '../api/client';
import { fmtInr } from '../utils/format';

type SortKey = 'state' | 'total_amount' | 'total_exp' | 'utilization_pct' | 'exposure';

const KPI_META: { key: keyof ReturnType<typeof summaryKeys>; label: string; desc: string; warn?: boolean }[] = [
  { key: 'total_sanctioned',  label: 'Total Sanctioned',   desc: 'Total amount approved for all MPLADS works in the dataset' },
  { key: 'total_expenditure', label: 'Total Expenditure',  desc: 'Actual spend recorded across all works — what has been disbursed so far' },
  { key: 'utilization_pct',   label: 'Utilization %',      desc: 'Expenditure ÷ sanctioned amount. Low % means most of the allocated funds have not been spent yet', warn: true },
  { key: 'idle_funds',        label: 'Idle Funds',         desc: 'Total sanctioned amount minus all expenditure — money allocated but not yet spent across all works', warn: true },
  { key: 'financial_exposure',label: 'Financial Exposure', desc: 'Total sanctioned value of works with a financial anomaly signal (amount significantly above peer category median)', warn: true },
  { key: 'cost_overrun_count',label: 'Overpriced Works',   desc: 'Works where the sanctioned amount is more than 2× the median for similar works in the same category — likely inflated', warn: true },
];

function summaryKeys(s: Record<string, number>) { return s; }

const COL_META: Record<string, string> = {
  'Work ID':     'Unique identifier for this MPLADS work record',
  'MP':          'Member of Parliament who recommended this work',
  'State':       'State where the work was sanctioned',
  'Ratio':       'Amount ÷ category median. >2× means this work costs more than twice the typical work of the same type — likely inflated',
  'Score':       'Unaccounted funds score (0–100). Higher = larger gap between payment and completion status',
  'Stage':       'Current pipeline stage of the work (e.g. In Progress, Completed)',
  'Amount':      'Sanctioned amount for this work in INR',
  'Sanctioned':  'Total amount sanctioned by the MP for works in this state',
  'Expenditure': 'Actual amount spent/disbursed in this state',
  'Utilization': 'Expenditure as % of sanctioned. Most states show very low utilization as funds are still being disbursed',
  'Exposure':    'Sanctioned value of works with risk score ≥ 50 (flagged as suspicious) in this state',
};

function Th({ label, right, onClick, active, dir, minWidth }: {
  label: string; right?: boolean; onClick?: () => void;
  active?: boolean; dir?: 'asc' | 'desc'; minWidth?: number;
}) {
  return (
    <th
      title={COL_META[label] ?? ''}
      onClick={onClick}
      style={{
        textAlign: right ? 'right' : 'left',
        cursor: onClick ? 'pointer' : 'default',
        minWidth,
        userSelect: 'none',
      }}
      className={`financial-sort-th${active ? ' active' : ''}`}
    >
      {label}
      {onClick && (
        <span style={{ marginLeft: 3, opacity: active ? 1 : 0.3, color: active ? 'var(--info)' : undefined }}>
          {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      )}
    </th>
  );
}

function RatioBadge({ ratio }: { ratio: number }) {
  const [color, label] =
    ratio > 3 ? ['var(--danger)', 'Severe'] :
    ratio > 2 ? ['var(--warning)', 'Inflated'] :
                ['var(--success)', 'Normal'];
  return (
    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color }}>
      {ratio.toFixed(2)}×
      <span style={{ marginLeft: 4, fontSize: '0.58rem', fontFamily: 'var(--sans)', fontWeight: 600, color, opacity: 0.85 }}>
        {label}
      </span>
    </span>
  );
}

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = score >= 30 ? 'var(--danger)' : score >= 15 ? 'var(--warning)' : 'var(--info)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
      <div style={{ width: 48, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontFamily: 'var(--mono)', color, minWidth: 28, textAlign: 'right', fontSize: '0.7rem' }}>{score.toFixed(1)}</span>
    </div>
  );
}

export function FinancialIntelligence() {
  const { data, loading, error } = useApi(() => getFinancial(), []);
  const [sortKey, setSortKey] = useState<SortKey>('exposure');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  if (loading) return (
    <div style={{ padding: '0.75rem 0' }}>
      {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 8, borderRadius: 6 }} />)}
    </div>
  );

  if (error) return (
    <div className="state-error">
      <div className="state-error-icon">⚠</div>
      <div className="state-error-title">Failed to load financial data</div>
      <div className="state-error-desc">{error}</div>
    </div>
  );

  if (!data) return null;

  const s = data.summary;

  const sortedStates = [...data.by_state].sort((a, b) => {
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    if (typeof av === 'string') return sortDir === 'asc'
      ? (av as unknown as string).localeCompare(bv as unknown as string)
      : (bv as unknown as string).localeCompare(av as unknown as string);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const maxUtil = Math.max(...data.by_state.map(st => st.utilization_pct ?? 0), 1);

  return (
    <div style={{ padding: '0.75rem 0' }}>

      {/* ── KPI row ── */}
      <div className="financial-kpi-row">
        {KPI_META.map(({ key, label, desc, warn }) => {
          const raw = s[key as keyof typeof s] as number;
          const isUtilPct = key === 'utilization_pct';
          const isCostCount = key === 'cost_overrun_count';
          const formatted = isUtilPct ? `${raw?.toFixed(1) ?? 'N/A'}%`
            : isCostCount ? raw?.toLocaleString()
            : fmtInr(raw);
          const color = warn ? (key === 'utilization_pct'
            ? (raw < 2 ? 'var(--danger)' : raw < 4 ? 'var(--warning)' : 'var(--success)')
            : 'var(--danger)')
            : undefined;
          return (
            <div key={key} className="financial-kpi-card" title={desc}>
              <div className="financial-kpi-label">{label}</div>
              <div className="financial-kpi-value" style={color ? { color } : undefined}>{formatted}</div>
              <div className="financial-kpi-sub">{desc}</div>
            </div>
          );
        })}
      </div>

      {/* ── Cost overruns + Payment gaps ── */}
      <div className="financial-tables">

        <div className="financial-table-section">
          <div className="financial-table-title">OVERPRICED WORKS</div>
          <div className="financial-table-desc">
            Works where the sanctioned amount is more than 2× the median for similar works in the same category.
            This indicates likely price inflation — not overspending against budget, but over-sanctioning relative to peers.
          </div>
          <div className="data-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="financial-table data-table">
              <thead>
                <tr>
                  <Th label="Work ID" />
                  <Th label="MP" />
                  <Th label="State" />
                  <Th label="Ratio" right />
                  <Th label="Amount" right />
                </tr>
              </thead>
              <tbody>
                {data.cost_overruns.map(co => (
                  <tr key={co.work_id}>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--info)', fontSize: '0.65rem' }}>{co.work_id}</td>
                    <td style={{ color: 'var(--text)', fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{co.mp_name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{co.state}</td>
                    <td style={{ textAlign: 'right' }}><RatioBadge ratio={co.cost_ratio ?? 0} /></td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--info)' }}>{fmtInr(co.amount)}</td>
                  </tr>
                ))}
                {data.cost_overruns.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '1rem' }}>No cost overruns detected</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="financial-table-section">
          <div className="financial-table-title">PAYMENT GAPS</div>
          <div className="financial-table-desc">
            Works where funds were disbursed but the work remains incomplete or unverified.
            The score (0–100) measures the size of the gap between payment and completion status.
          </div>
          <div className="data-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="financial-table data-table">
              <thead>
                <tr>
                  <Th label="Work ID" />
                  <Th label="MP" />
                  <Th label="State" />
                  <Th label="Score" right />
                  <Th label="Stage" />
                  <Th label="Amount" right />
                </tr>
              </thead>
              <tbody>
                {data.payment_gaps.map(pg => (
                  <tr key={pg.work_id}>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--info)', fontSize: '0.65rem' }}>{pg.work_id}</td>
                    <td style={{ color: 'var(--text)', fontWeight: 500, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pg.mp_name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{pg.state}</td>
                    <td style={{ textAlign: 'right' }}><ScoreBar score={pg.unaccounted_score ?? 0} /></td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.63rem' }}>{pg.pipeline_stage ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--info)' }}>{fmtInr(pg.amount)}</td>
                  </tr>
                ))}
                {data.payment_gaps.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '1rem' }}>No payment gaps detected</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── State breakdown ── */}
      <div style={{ marginTop: '1.25rem' }}>
        <div className="financial-table-title" style={{ marginBottom: '0.25rem' }}>STATE FINANCIAL BREAKDOWN</div>
        <div className="financial-table-desc" style={{ marginBottom: '0.5rem' }}>
          Fund utilization and exposure by state. Click any column header to sort.
          Red utilization bars indicate states where funds are sitting largely unused.
        </div>
        <div className="data-table-wrap">
          <table className="financial-state-table data-table">
            <thead>
              <tr>
                <Th label="State"       onClick={() => handleSort('state')}           active={sortKey === 'state'}           dir={sortDir} />
                <Th label="Sanctioned"  onClick={() => handleSort('total_amount')}    active={sortKey === 'total_amount'}    dir={sortDir} right />
                <Th label="Expenditure" onClick={() => handleSort('total_exp')}       active={sortKey === 'total_exp'}       dir={sortDir} right />
                <Th label="Utilization" onClick={() => handleSort('utilization_pct')} active={sortKey === 'utilization_pct'} dir={sortDir} right minWidth={160} />
                <Th label="Exposure"    onClick={() => handleSort('exposure')}        active={sortKey === 'exposure'}        dir={sortDir} right />
              </tr>
            </thead>
            <tbody>
              {sortedStates.map(st => {
                const util = st.utilization_pct ?? 0;
                const barPct = Math.min(100, (util / maxUtil) * 100);
                const barColor = util < 2 ? 'var(--danger)' : util < 4 ? 'var(--warning)' : 'var(--success)';
                const utilLabel = util < 2 ? 'Low' : util < 4 ? 'Moderate' : 'Good';
                return (
                  <tr key={st.state}>
                    <td style={{ color: 'var(--text)', fontWeight: 500 }}>{st.state}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--info)' }}>{fmtInr(st.total_amount)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtInr(st.total_exp)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, color: barColor, minWidth: 48, textAlign: 'right' }}>{utilLabel}</span>
                        <div className="fin-util-bar-wrap">
                          <div className="fin-util-bar" style={{ width: `${barPct}%`, background: barColor }} />
                        </div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', minWidth: '3rem', textAlign: 'right' }}>{util.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: (st.exposure ?? 0) > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {(st.exposure ?? 0) > 0 ? fmtInr(st.exposure) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
