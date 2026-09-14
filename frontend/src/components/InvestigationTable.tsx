import { useState, useRef } from 'react';
import type { Project } from '../types';
import { fmtInr, riskColor, riskTier } from '../utils/format';

interface InvestigationTableProps {
  projects: Project[];
  selectedWorkId: string | null;
  onSelect: (workId: string) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

export function InvestigationTable({
  projects,
  selectedWorkId,
  onSelect,
  selectedIds = new Set(),
  onSelectionChange,
}: InvestigationTableProps) {
  const [showDuplicates, setShowDuplicates] = useState(false);
  const headerCheckRef = useRef<HTMLInputElement>(null);

  const clusterRepIds = new Set(projects.filter(p => (p.dup_cluster_size ?? 0) > 0).map(p => p.work_id));

  const isHiddenSecondary = (p: Project) =>
    (p.dup_cluster_size ?? 0) === 0 && !!p.evidence?.duplicate_work?.duplicate_of;

  const visible = showDuplicates ? projects : projects.filter(p => !isHiddenSecondary(p));
  const hiddenCount = projects.length - visible.length;
  const visibleIds = visible.map(p => p.work_id);
  const checkedVisible = visibleIds.filter(id => selectedIds.has(id));
  const allChecked = checkedVisible.length === visibleIds.length && visibleIds.length > 0;
  const someChecked = checkedVisible.length > 0 && !allChecked;

  if (headerCheckRef.current) {
    headerCheckRef.current.indeterminate = someChecked;
  }

  function toggleAll() {
    if (!onSelectionChange) return;
    if (allChecked) {
      const next = new Set(selectedIds);
      visibleIds.forEach(id => next.delete(id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      visibleIds.forEach(id => next.add(id));
      onSelectionChange(next);
    }
  }

  function toggleOne(id: string, e: React.MouseEvent) {
    if (!onSelectionChange) return;
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  return (
    <div className="data-table-wrap" style={{ overflowX: 'auto' }}>
      {hiddenCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.6rem', fontSize: '0.68rem', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: '#f59e0b' }}>⚠</span>
          {hiddenCount} secondary duplicate{hiddenCount > 1 ? 's' : ''} hidden
          <button
            onClick={() => setShowDuplicates(true)}
            style={{ background: 'none', border: 'none', color: 'var(--info)', cursor: 'pointer', fontSize: '0.68rem', textDecoration: 'underline', padding: 0 }}
          >show all</button>
        </div>
      )}
      {showDuplicates && hiddenCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.6rem', fontSize: '0.68rem', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
          Showing all duplicates
          <button
            onClick={() => setShowDuplicates(false)}
            style={{ background: 'none', border: 'none', color: 'var(--info)', cursor: 'pointer', fontSize: '0.68rem', textDecoration: 'underline', padding: 0 }}
          >hide</button>
        </div>
      )}
      <table className="data-table" role="grid">
        <thead>
          <tr>
            {onSelectionChange && (
              <th style={{ width: 32, textAlign: 'center' }}>
                <input
                  ref={headerCheckRef}
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="Select all visible rows"
                  style={{ cursor: 'pointer', accentColor: 'var(--info)' }}
                />
              </th>
            )}
            <th style={{ width: 50 }}>Risk</th>
            <th style={{ width: 70 }}>Tier</th>
            <th>Member of Parliament</th>
            <th>State</th>
            <th>Work Category</th>
            <th>Amount</th>
            <th>Date</th>
            <th>Work ID</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((p) => {
            const score = Math.round(p.risk_score);
            const color = riskColor(score);
            const tier = riskTier(score);
            const isSelected = p.work_id === selectedWorkId;
            const isChecked = selectedIds.has(p.work_id);
            const isRep = clusterRepIds.has(p.work_id);
            const clusterSize = p.dup_cluster_size ?? 0;

            return (
              <tr
                key={p.work_id}
                className={`${isSelected ? 'selected' : ''} ${isChecked ? 'row-checked' : ''}`}
                onClick={() => onSelect(p.work_id)}
                tabIndex={0}
                role="row"
                aria-selected={isSelected}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.work_id); } }}
              >
                {onSelectionChange && (
                  <td style={{ textAlign: 'center' }} onClick={(e) => toggleOne(p.work_id, e)}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      aria-label={`Select ${p.work_id}`}
                      style={{ cursor: 'pointer', accentColor: 'var(--info)' }}
                    />
                  </td>
                )}
                <td className="td-risk">
                  <div className="risk-bar-mini">
                    <span style={{ color }}>{score}</span>
                    <div className="risk-bar-track-mini">
                      <div className="risk-bar-fill-mini" style={{ width: `${score}%`, background: color }} />
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`badge badge-${tier === 'CRITICAL' ? 'critical' : tier === 'HIGH' ? 'high' : tier === 'MEDIUM' ? 'medium' : 'low'}`}>
                    {tier}
                  </span>
                </td>
                <td className="td-mp">
                  {p.mp_name}
                  {isRep && clusterSize > 1 && (
                    <span title={`${clusterSize - 1} near-identical duplicate${clusterSize > 2 ? 's' : ''} hidden`}
                      style={{ marginLeft: '0.35rem', fontSize: '0.6rem', background: '#78350f', color: '#fcd34d', borderRadius: 3, padding: '1px 4px', verticalAlign: 'middle' }}>
                      +{clusterSize - 1} dup
                    </span>
                  )}
                </td>
                <td>{p.state}</td>
                <td>{p.work_subcategory && p.work_subcategory !== 'other' ? p.work_subcategory : p.work_type}</td>
                <td className="td-amount">{fmtInr(p.amount)}</td>
                <td>{p.date}</td>
                <td className="td-workid">{p.work_id}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
