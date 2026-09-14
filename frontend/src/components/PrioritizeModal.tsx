import { useState, useEffect } from 'react';
import { prioritizeWorks } from '../api/client';
import type { PrioritizeResponse } from '../types';

interface PrioritizeModalProps {
  workIds: string[];
  onClose: () => void;
  onOpenDossier?: (workId: string) => void;
}

export function PrioritizeModal({ workIds, onClose, onOpenDossier }: PrioritizeModalProps) {
  const [data, setData] = useState<PrioritizeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    prioritizeWorks(workIds)
      .then(setData)
      .catch((e) => setError(e.message || 'Prioritization failed'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="prioritize-modal" role="dialog" aria-modal="true" aria-label="AI Investigation Prioritization">
        <div className="prioritize-modal-header">
          <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--info)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            ✦ AI INVESTIGATION PRIORITIZATION
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            Ranked {workIds.length} selected works by investigation urgency
          </div>
          <button
            className="dossier-close"
            onClick={onClose}
            aria-label="Close"
            style={{ top: '0.75rem', right: '0.75rem' }}
          >
            ×
          </button>
        </div>

        <div className="prioritize-modal-body">
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem 0', color: 'var(--text-dim)', fontSize: '0.72rem' }}>
              <span className="ai-spinner-dots"><span /><span /><span /></span>
              Analysing and ranking {workIds.length} works…
            </div>
          )}

          {error && (
            <div className="ai-error" style={{ margin: '0.5rem 0' }}>
              {error}
            </div>
          )}

          {data && (
            <>
              {data.summary && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '0.75rem', padding: '0.6rem', background: 'var(--surface)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
                  {data.summary}
                </div>
              )}
              <div className="priority-list">
                {data.ranked.map((item) => (
                  <div key={item.work_id} className="priority-item">
                    <div className="priority-rank">#{item.rank}</div>
                    <div className="priority-body">
                      <div className="priority-id">{item.work_id}</div>
                      <div className="priority-reason">{item.reason}</div>
                    </div>
                    {onOpenDossier && (
                      <button
                        onClick={() => { onOpenDossier(item.work_id); onClose(); }}
                        style={{ flexShrink: 0, fontSize: '0.62rem', padding: '0.2rem 0.5rem', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-sm)', background: 'var(--surface-raised)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                      >
                        Open
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
