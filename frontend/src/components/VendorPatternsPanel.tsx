import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { getVendorPatterns, getClusterRecords } from '../api/client';
import { fmtInr } from '../utils/format';
import type { ClusterRecord, VendorSharedDesc, VendorAmountCluster } from '../types';

/* ── risk colour ── */
function riskColor(score: number) {
  if (score >= 75) return 'var(--danger)';
  if (score >= 40) return 'var(--warning)';
  if (score >= 20) return 'var(--info)';
  return 'var(--text-muted)';
}

function RiskBadge({ score, level }: { score: number; level: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 4,
      fontSize: '0.62rem', fontWeight: 700, fontFamily: 'var(--mono)',
      background: `color-mix(in srgb, ${riskColor(score)} 15%, transparent)`,
      color: riskColor(score), border: `1px solid color-mix(in srgb, ${riskColor(score)} 30%, transparent)`,
    }}>
      {score.toFixed(0)} · {level?.replace(/ - .*/,'') ?? '—'}
    </span>
  );
}

/* ── expandable records drawer ── */
function RecordsDrawer({
  clusterType, workDescription, workType, amount, onOpenDossier,
}: {
  clusterType: 'description' | 'amount';
  workDescription?: string;
  workType?: string;
  amount?: number;
  onOpenDossier?: (id: string) => void;
}) {
  const { data, loading, error } = useApi(
    () => getClusterRecords({ cluster_type: clusterType, work_description: workDescription, work_type: workType, amount }),
    [clusterType, workDescription, workType, amount],
  );

  if (loading) return (
    <div className="cluster-drawer">
      {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 36, marginBottom: 4 }} />)}
    </div>
  );

  if (error) return (
    <div className="cluster-drawer" style={{ color: 'var(--danger)', fontSize: '0.72rem', padding: '0.5rem 1rem' }}>
      Failed to load records: {error}
    </div>
  );

  const records = data?.records ?? [];

  return (
    <div className="cluster-drawer">
      <div className="cluster-drawer-header">
        <span>{records.length} work{records.length !== 1 ? 's' : ''} in this cluster</span>
        {onOpenDossier && <span style={{ color: 'var(--text-dim)', fontSize: '0.62rem' }}>Click a row to open dossier</span>}
      </div>
      <div className="cluster-drawer-table-wrap">
        <table className="cluster-drawer-table">
          <thead>
            <tr>
              <th title="Unique work identifier">Work ID</th>
              <th title="MP who recommended the work">MP</th>
              <th>State</th>
              <th title="Sanctioned amount">Amount</th>
              <th title="Date sanctioned or completed">Date</th>
              <th title="Current work status">Status</th>
              <th title="Anomaly risk score 0–100">Risk</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r: ClusterRecord) => (
              <tr
                key={r.work_id}
                className="cluster-drawer-row"
                onClick={() => onOpenDossier?.(r.work_id)}
                style={{ cursor: onOpenDossier ? 'pointer' : 'default' }}
                title={onOpenDossier ? `Open dossier for ${r.work_id}` : undefined}
              >
                <td style={{ fontFamily: 'var(--mono)', color: 'var(--info)', fontSize: '0.63rem' }}>{r.work_id}</td>
                <td style={{ fontWeight: 500, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.mp_name}</td>
                <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.state}</td>
                <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtInr(r.amount)}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.65rem', whiteSpace: 'nowrap' }}>{r.date?.slice(0,10) ?? '—'}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.63rem', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.work_status ?? '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}><RiskBadge score={r.risk_score} level={r.risk_level} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── description cluster row ── */
function DescRow({ d, onOpenDossier }: { d: VendorSharedDesc; onOpenDossier?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const avgRiskColor = d.avg_risk_score >= 40 ? 'var(--danger)' : d.avg_risk_score >= 20 ? 'var(--warning)' : 'var(--text-muted)';

  return (
    <div className={`cluster-row${open ? ' expanded' : ''}`}>
      <div className="cluster-row-head" onClick={() => setOpen(o => !o)}>
        <span className="cluster-expand-icon">{open ? '▾' : '▸'}</span>
        <div className="cluster-row-main">
          <div className="cluster-desc-text">{d.work_description?.slice(0, 140) || '(no description)'}</div>
          <div className="cluster-chips">
            <span className="cluster-chip chip-mp" title="Number of distinct MPs using this exact description">{d.mp_count} MPs</span>
            <span className="cluster-chip chip-works" title="Total works with this description">{d.work_count} works</span>
            <span className="cluster-chip chip-amount" title="Average sanctioned amount across these works">{fmtInr(d.avg_amount)} avg</span>
            <span className="cluster-chip chip-states" title="States where this description appears">{d.states}</span>
            <span className="cluster-chip" style={{ color: avgRiskColor, borderColor: avgRiskColor }} title="Average risk score across all works in this cluster">
              avg risk {d.avg_risk_score?.toFixed(1)}
            </span>
          </div>
        </div>
        <div className="cluster-row-why">
          <div className="cluster-why-label">Why flagged</div>
          <div className="cluster-why-text">
            Identical description used by {d.mp_count} different MPs across {d.states?.split(',').length ?? '?'} states —
            suggests coordinated submission or templated fraud.
          </div>
        </div>
      </div>
      {open && (
        <RecordsDrawer
          clusterType="description"
          workDescription={d.work_description}
          onOpenDossier={onOpenDossier}
        />
      )}
    </div>
  );
}

/* ── amount cluster row ── */
function AmountRow({ c, onOpenDossier }: { c: VendorAmountCluster; onOpenDossier?: (id: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`cluster-row${open ? ' expanded' : ''}`}>
      <div className="cluster-row-head" onClick={() => setOpen(o => !o)}>
        <span className="cluster-expand-icon">{open ? '▾' : '▸'}</span>
        <div className="cluster-row-main">
          <div className="cluster-desc-text">
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{c.work_type}</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>— exact amount {fmtInr(c.amount)}</span>
          </div>
          <div className="cluster-chips">
            <span className="cluster-chip chip-mp" title="Number of distinct MPs with this exact type + amount">{c.mp_count} MPs</span>
            <span className="cluster-chip chip-works" title="Total works with this exact combination">{c.work_count} works</span>
            <span className="cluster-chip chip-states" title="States where this pattern appears">{c.states}</span>
          </div>
        </div>
        <div className="cluster-row-why">
          <div className="cluster-why-label">Why flagged</div>
          <div className="cluster-why-text">
            {c.mp_count} MPs submitted works of this exact type at exactly {fmtInr(c.amount)} —
            exact-amount matching across MPs suggests coordinated or templated recommendations.
          </div>
        </div>
      </div>
      {open && (
        <RecordsDrawer
          clusterType="amount"
          workType={c.work_type}
          amount={c.amount}
          onOpenDossier={onOpenDossier}
        />
      )}
    </div>
  );
}

/* ── main panel ── */
export function VendorPatternsPanel({ onOpenDossier }: { onOpenDossier?: (id: string) => void }) {
  const [subTab, setSubTab] = useState<'descriptions' | 'clusters'>('descriptions');
  const data = useApi(() => getVendorPatterns(), []);

  if (data.loading) return (
    <div className="vendor-body">
      {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 6 }} />)}
    </div>
  );

  if (!data.data) return null;

  const { shared_descriptions, amount_clusters } = data.data;

  return (
    <div className="vendor-body">
      <div className="vendor-intro">
        Pattern detection identifies works that share suspiciously identical descriptions or exact amounts across
        multiple MPs — hallmarks of coordinated submissions. Click any row to expand and inspect the individual records.
      </div>

      <div className="vendor-subtabs">
        <button
          className={`vendor-subtab${subTab === 'descriptions' ? ' active' : ''}`}
          onClick={() => setSubTab('descriptions')}
        >
          Shared Descriptions ({shared_descriptions.length})
        </button>
        <button
          className={`vendor-subtab${subTab === 'clusters' ? ' active' : ''}`}
          onClick={() => setSubTab('clusters')}
        >
          Amount Clusters ({amount_clusters.length})
        </button>
      </div>

      {subTab === 'descriptions' && (
        <>
          <div className="cluster-tab-desc">
            Works where the description text is <strong>identical</strong> across 2+ MPs.
            Legitimate works sometimes share descriptions, but exact matches across states are rare without coordination.
          </div>
          <div className="cluster-list">
            {shared_descriptions.slice(0, 20).map((d, i) => (
              <DescRow key={i} d={d} onOpenDossier={onOpenDossier} />
            ))}
          </div>
        </>
      )}

      {subTab === 'clusters' && (
        <>
          <div className="cluster-tab-desc">
            Works where the <strong>same work type + exact rupee amount</strong> appears across 3+ MPs.
            Exact-amount matching is statistically unlikely without coordination or a shared template.
          </div>
          <div className="cluster-list">
            {amount_clusters.slice(0, 20).map((c, i) => (
              <AmountRow key={i} c={c} onOpenDossier={onOpenDossier} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
