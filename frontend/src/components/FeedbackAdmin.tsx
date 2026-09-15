import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/client';
import type { FeedbackStatsResponse, ModelStatusResponse } from '../types';

export function FeedbackAdmin() {
  const [stats, setStats] = useState<FeedbackStatsResponse | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [retrainResult, setRetrainResult] = useState<string | null>(null);
  const [retrainError, setRetrainError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([api.getFeedbackStats(), api.getModelStatus()]);
      setStats(s);
      setModelStatus(m);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRetrain = async () => {
    setRetraining(true);
    setRetrainResult(null);
    setRetrainError(null);
    try {
      const result = await api.retrainModel();
      setRetrainResult(
        `Model trained on ${result.sample_count} samples. ` +
        (result.cv_mae != null ? `MAE: ${result.cv_mae}, ` : '') +
        (result.cv_r2 != null ? `R²: ${result.cv_r2}` : '')
      );
      load(); // refresh stats
    } catch (e: any) {
      setRetrainError(e.message || 'Retraining failed');
    } finally {
      setRetraining(false);
    }
  };

  if (loading) {
    return (
      <div className="gov-card">
        <div className="gov-card-body">
          <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 80 }} />
        </div>
      </div>
    );
  }

  const labelColors: Record<string, string> = {
    agree: '#22c55e',
    too_high: '#f59e0b',
    too_low: '#ef4444',
    false_positive: '#6b7280',
  };

  const labelIcons: Record<string, string> = {
    agree: '✓',
    too_high: '↓',
    too_low: '↑',
    false_positive: '✗',
  };

  const labelNames: Record<string, string> = {
    agree: 'Agree',
    too_high: 'Too High',
    too_low: 'Too Low',
    false_positive: 'False Positive',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary cards */}
      <div className="gov-card">
        <div className="gov-card-body">
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a5f', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🧑‍⚖️</span>
            Human-in-the-Loop Feedback Dashboard
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '.5px' }}>Total Reviews</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#1e3a5f', marginTop: 4 }}>{stats?.total_feedback ?? 0}</div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '.5px' }}>Agreement Rate</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#22c55e', marginTop: 4 }}>{stats?.agreement_rate ?? 0}%</div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '.5px' }}>Training Ready</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: stats?.can_train ? '#22c55e' : '#f59e0b', marginTop: 4 }}>
                {stats?.can_train ? 'Yes' : `${stats?.total_feedback ?? 0}/${stats?.min_samples_for_training ?? 30}`}
              </div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '.5px' }}>Model Status</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: modelStatus?.model_exists ? '#22c55e' : '#9ca3af', marginTop: 4 }}>
                {modelStatus?.model_exists ? 'Active' : 'None'}
              </div>
            </div>
          </div>

          {/* Label distribution */}
          {stats && stats.total_feedback > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#6b7280', marginBottom: 8 }}>
                Feedback Distribution
              </div>
              <div style={{ display: 'flex', gap: 8, height: 32, borderRadius: 6, overflow: 'hidden' }}>
                {Object.entries(stats.label_distribution).map(([label, count]) => {
                  const pct = (count / stats.total_feedback) * 100;
                  return (
                    <div
                      key={label}
                      style={{
                        width: `${pct}%`,
                        minWidth: pct > 0 ? 30 : 0,
                        background: labelColors[label] || '#9ca3af',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 700,
                        borderRadius: 4,
                      }}
                      title={`${labelNames[label] || label}: ${count} (${pct.toFixed(0)}%)`}
                    >
                      {labelIcons[label]} {count}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                {Object.entries(stats.label_distribution).map(([label, count]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: labelColors[label] || '#9ca3af' }} />
                    {labelNames[label] || label}: {count}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Model management */}
      <div className="gov-card">
        <div className="gov-card-body">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginBottom: 12 }}>
            🤖 Supervised Learning Model
          </div>

          {modelStatus?.model_exists ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}>Model Active</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <span>Trained: {modelStatus.trained_at ? new Date(modelStatus.trained_at).toLocaleDateString() : '—'}</span>
                <span>Samples: {modelStatus.sample_count ?? '—'}</span>
                {modelStatus.cv_mae != null && <span>MAE: {modelStatus.cv_mae}</span>}
                {modelStatus.cv_r2 != null && <span>R²: {modelStatus.cv_r2}</span>}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                The model adjusts 30% of the final risk score on the next pipeline run.
              </div>
            </div>
          ) : (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>No model trained yet</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                Collect at least {stats?.min_samples_for_training ?? 30} human reviews,
                then click "Retrain Model" to train a GradientBoosting model on the feedback.
              </div>
            </div>
          )}

          {retrainResult && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#166534', marginBottom: 10 }}>
              ✓ {retrainResult}
            </div>
          )}

          {retrainError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 10 }}>
              ✗ {retrainError}
            </div>
          )}

          <button
            onClick={handleRetrain}
            disabled={retraining || !stats?.can_train}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: stats?.can_train ? '#1e3a5f' : '#e2e8f0',
              color: stats?.can_train ? '#fff' : '#9ca3af',
              fontSize: 13,
              fontWeight: 600,
              cursor: stats?.can_train ? 'pointer' : 'not-allowed',
              opacity: retraining ? 0.6 : 1,
            }}
          >
            {retraining ? '⏳ Training Model…' : '🔄 Retrain Model'}
          </button>

          {!stats?.can_train && (
            <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 10 }}>
              Need {(stats?.min_samples_for_training ?? 30) - (stats?.total_feedback ?? 0)} more reviews
            </span>
          )}
        </div>
      </div>

      {/* Recent feedback table */}
      {stats && stats.recent_feedback.length > 0 && (
        <div className="gov-card">
          <div className="gov-card-body">
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginBottom: 12 }}>
              📋 Recent Feedback
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: '#6b7280', fontSize: 10, textTransform: 'uppercase' }}>Work ID</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: '#6b7280', fontSize: 10, textTransform: 'uppercase' }}>Reviewer</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: '#6b7280', fontSize: 10, textTransform: 'uppercase' }}>Label</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: '#6b7280', fontSize: 10, textTransform: 'uppercase' }}>Original</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: '#6b7280', fontSize: 10, textTransform: 'uppercase' }}>Corrected</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: '#6b7280', fontSize: 10, textTransform: 'uppercase' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_feedback.map(fb => (
                    <tr key={fb.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11 }}>{fb.work_id.slice(-20)}</td>
                      <td style={{ padding: '6px 8px' }}>{fb.reviewer}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          background: `${labelColors[fb.human_label] || '#9ca3af'}15`,
                          color: labelColors[fb.human_label] || '#9ca3af',
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 600,
                        }}>
                          {labelIcons[fb.human_label]} {labelNames[fb.human_label] || fb.human_label}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fb.original_score?.toFixed(1) ?? '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fb.corrected_score?.toFixed(1) ?? '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#9ca3af', fontSize: 11 }}>
                        {new Date(fb.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Top reviewers */}
      {stats && stats.top_reviewers.length > 0 && (
        <div className="gov-card">
          <div className="gov-card-body">
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginBottom: 12 }}>
              👥 Top Reviewers
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {stats.top_reviewers.map(r => (
                <div key={r.reviewer} style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontSize: 12,
                }}>
                  <span style={{ fontWeight: 600 }}>{r.reviewer}</span>
                  <span style={{ color: '#9ca3af', marginLeft: 8 }}>{r.cnt} reviews</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
