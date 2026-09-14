import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { getCompliance } from '../api/client';
import { fmtInr } from '../utils/format';
import type { ComplianceRule } from '../types';

const RULE_VALUE_FORMAT: Record<string, { unit: string; isCurrency: boolean }> = {
  sanction_timeline:    { unit: 'days', isCurrency: false },
  completion_timeline:  { unit: 'days', isCurrency: false },
  payment_initiation:   { unit: 'score', isCurrency: false },
  category_eligibility: { unit: 'score', isCurrency: false },
  duplicate_work:       { unit: 'score', isCurrency: false },
  phantom_completion:   { unit: 'score', isCurrency: false },
  cost_overrun:         { unit: '×', isCurrency: false },
};

function fmtRuleValue(ruleId: string, value: number): string {
  const fmt = RULE_VALUE_FORMAT[ruleId];
  if (!fmt) return fmtInr(value);
  if (fmt.unit === '×') return `${value.toFixed(2)}×`;
  return `${Math.round(value)} ${fmt.unit}`;
}

function statusOrder(status: ComplianceRule['status']): number {
  if (status === 'breach') return 0;
  if (status === 'warning') return 1;
  return 2;
}

function StatusIcon({ status }: { status: ComplianceRule['status'] }) {
  if (status === 'pass') return <span className="compliance-status-icon pass">✓</span>;
  if (status === 'warning') return <span className="compliance-status-icon warning">⚠</span>;
  return <span className="compliance-status-icon breach">✗</span>;
}

export function ComplianceMonitor({
  onOpenDossier,
  onViewRecords,
}: {
  onOpenDossier?: (id: string) => void;
  onViewRecords?: (ruleId: string, label: string) => void;
}) {
  const { data, loading, error } = useApi(() => getCompliance(), []);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div style={{ padding: '1rem 0' }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} className="skeleton" style={{ height: 72, marginBottom: 8, borderRadius: 6 }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="state-error">
        <div className="state-error-icon">⚠</div>
        <div className="state-error-title">Failed to load compliance data</div>
        <div className="state-error-desc">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const sorted = [...data.rules].sort((a, b) => statusOrder(a.status) - statusOrder(b.status));

  return (
    <div style={{ padding: '0.75rem 0' }}>
      <div className="compliance-summary">
        <span className="compliance-summary-stat">{data.summary.total_checked} RULES CHECKED</span>
        <span className="compliance-summary-sep">·</span>
        <span className="compliance-summary-stat breach">{data.summary.breaches} BREACHES</span>
        <span className="compliance-summary-sep">·</span>
        <span className="compliance-summary-stat warning">{data.summary.warnings} WARNINGS</span>
      </div>

      {onViewRecords && (
        <div className="compliance-hint">
          Click any breach or warning rule to view all non-compliant case files in the Projects tab.
        </div>
      )}

      <div className="compliance-grid">
        {sorted.map(rule => {
          const isOpen = expanded.has(rule.id);
          const isClickable = onViewRecords && rule.status !== 'pass' && rule.breach_count > 0;
          return (
            <div
              key={rule.id}
              className={`compliance-card ${rule.status}${isClickable ? ' clickable' : ''}`}
              onClick={isClickable ? () => onViewRecords(rule.id, rule.label) : undefined}
              title={isClickable ? `View all ${rule.breach_count} non-compliant works for: ${rule.label}` : undefined}
            >
              <div className="compliance-card-header">
                <StatusIcon status={rule.status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="compliance-rule-label">{rule.label}</div>
                  <div className="compliance-rule-desc">{rule.description}</div>
                </div>
                <div className="compliance-card-right">
                  {(rule.breach_count > 0 || rule.affected_amount > 0) && (
                    <div className="compliance-stats">
                      {rule.breach_count > 0 && (
                        <span className="compliance-breach-count">{rule.breach_count} cases</span>
                      )}
                      {rule.affected_amount > 0 && (
                        <span className="compliance-amount">{fmtInr(rule.affected_amount)}</span>
                      )}
                    </div>
                  )}
                  {isClickable && (
                    <div className="compliance-view-btn">View records →</div>
                  )}
                </div>
              </div>

              {rule.sample_works.length > 0 && (
                <button
                  className="compliance-samples-toggle"
                  onClick={(e) => toggleExpand(rule.id, e)}
                >
                  {isOpen ? '▲' : '▼'} {isOpen ? 'Hide' : 'Show'} {rule.sample_works.length} sample{rule.sample_works.length !== 1 ? 's' : ''}
                </button>
              )}

              {isOpen && (
                <div className="compliance-samples" onClick={e => e.stopPropagation()}>
                  {rule.sample_works.map(w => (
                    <div
                      key={w.work_id}
                      className="compliance-sample-row"
                      onClick={() => onOpenDossier?.(w.work_id)}
                      style={{ cursor: onOpenDossier ? 'pointer' : 'default' }}
                      title={onOpenDossier ? `Open dossier for ${w.work_id}` : undefined}
                    >
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--info)', fontSize: '0.65rem' }}>{w.work_id}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>{w.mp_name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>{w.state}</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)', fontSize: '0.65rem', marginLeft: 'auto' }}>{fmtRuleValue(rule.id, w.value)}</span>
                      {onOpenDossier && <span style={{ color: 'var(--info)', fontSize: '0.6rem', marginLeft: 6 }}>→</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
