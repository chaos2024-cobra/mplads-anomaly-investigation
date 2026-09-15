import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/client';
import type { FeedbackEntry, FeedbackLabel } from '../types';

interface FeedbackPanelProps {
  workId: string;
  currentScore: number;
  reviewer: string;  // username from auth session
}

const LABEL_OPTIONS: { value: FeedbackLabel; label: string; icon: string; color: string }[] = [
  { value: 'agree',          label: 'Agree with Score',  icon: '✓', color: '#22c55e' },
  { value: 'too_high',       label: 'Score Too High',    icon: '↓', color: '#f59e0b' },
  { value: 'too_low',        label: 'Score Too Low',     icon: '↑', color: '#ef4444' },
  { value: 'false_positive', label: 'False Positive',    icon: '✗', color: '#6b7280' },
];

export function FeedbackPanel({ workId, currentScore, reviewer }: FeedbackPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<FeedbackLabel | null>(null);
  const [correctedScore, setCorrectedScore] = useState<number>(Math.round(currentScore));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<FeedbackEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const resp = await api.getWorkFeedback(workId);
      setHistory(resp.results);
    } catch {
      // non-critical
    } finally {
      setLoadingHistory(false);
    }
  }, [workId]);

  useEffect(() => {
    if (expanded) loadHistory();
  }, [expanded, loadHistory]);

  const handleSubmit = async () => {
    if (!selectedLabel) return;
    setSubmitting(true);
    setError(null);
    try {
      const score = (selectedLabel === 'too_high' || selectedLabel === 'too_low')
        ? correctedScore
        : null;
      await api.submitFeedback(workId, reviewer, selectedLabel, score, notes);
      setSubmitted(true);
      loadHistory();
    } catch (e: any) {
      setError(e.message || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const showSlider = selectedLabel === 'too_high' || selectedLabel === 'too_low';

  return (
    <div style={{
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      marginTop: 16,
      background: '#f8fafc',
      overflow: 'hidden',
    }}>
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          color: '#1e3a5f',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🧑‍⚖️</span>
          Human Feedback — Risk Score Review
          {history.length > 0 && (
            <span style={{
              background: '#dbeafe',
              color: '#1e40af',
              borderRadius: 10,
              padding: '1px 8px',
              fontSize: 11,
              fontWeight: 700,
            }}>
              {history.length} review{history.length !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px' }}>
          {/* Submission form */}
          {!submitted ? (
            <>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
                Current risk score: <strong>{currentScore.toFixed(1)}</strong>/100.
                Does this score accurately reflect the anomaly risk?
              </p>

              {/* Label radio buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                {LABEL_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setSelectedLabel(opt.value);
                      if (opt.value === 'too_high') setCorrectedScore(Math.max(0, Math.round(currentScore * 0.5)));
                      if (opt.value === 'too_low') setCorrectedScore(Math.min(100, Math.round(currentScore * 1.5)));
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: selectedLabel === opt.value
                        ? `2px solid ${opt.color}`
                        : '1px solid #e2e8f0',
                      background: selectedLabel === opt.value ? `${opt.color}10` : '#fff',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: selectedLabel === opt.value ? 700 : 500,
                      color: '#1a1a2e',
                      transition: 'all .15s',
                    }}
                  >
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: selectedLabel === opt.value ? opt.color : '#f1f5f9',
                      color: selectedLabel === opt.value ? '#fff' : '#9ca3af',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, flexShrink: 0,
                    }}>
                      {opt.icon}
                    </span>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Corrected score slider */}
              {showSlider && (
                <div style={{
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Suggested corrected score:</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1e3a5f' }}>{correctedScore}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={correctedScore}
                    onChange={e => setCorrectedScore(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#1e3a5f' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af' }}>
                    <span>0 — No Risk</span>
                    <span>100 — Critical</span>
                  </div>
                </div>
              )}

              {/* Notes textarea */}
              <textarea
                placeholder="Optional: Add justification or notes for this assessment…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 12,
                  resize: 'vertical',
                  marginBottom: 12,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />

              {error && (
                <div style={{
                  background: '#fef2f2',
                  color: '#dc2626',
                  padding: '6px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  marginBottom: 10,
                }}>
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!selectedLabel || submitting}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: selectedLabel ? '#1e3a5f' : '#e2e8f0',
                  color: selectedLabel ? '#fff' : '#9ca3af',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: selectedLabel ? 'pointer' : 'not-allowed',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Submitting…' : 'Submit Feedback'}
              </button>
            </>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '16px 0',
              color: '#22c55e',
              fontSize: 14,
              fontWeight: 600,
            }}>
              ✓ Feedback submitted successfully
              <button
                onClick={() => { setSubmitted(false); setSelectedLabel(null); setNotes(''); }}
                style={{
                  display: 'block',
                  margin: '8px auto 0',
                  background: 'none',
                  border: 'none',
                  color: '#1e3a5f',
                  fontSize: 12,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Submit another review
              </button>
            </div>
          )}

          {/* Feedback history */}
          {history.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.5px',
                color: '#6b7280',
                marginBottom: 8,
              }}>
                Previous Reviews
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.map(fb => (
                  <div key={fb.id} style={{
                    background: '#fff',
                    border: '1px solid #f1f5f9',
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 12,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>
                        {LABEL_OPTIONS.find(o => o.value === fb.human_label)?.icon}{' '}
                        {LABEL_OPTIONS.find(o => o.value === fb.human_label)?.label}
                        {fb.corrected_score != null && (
                          <span style={{ color: '#6b7280', fontWeight: 400 }}>
                            {' '}→ {fb.corrected_score.toFixed(0)}/100
                          </span>
                        )}
                      </span>
                      <span style={{ color: '#9ca3af', fontSize: 11 }}>
                        {fb.reviewer} · {new Date(fb.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {fb.notes && (
                      <div style={{ color: '#6b7280', fontSize: 11, fontStyle: 'italic' }}>
                        "{fb.notes}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingHistory && (
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>Loading review history…</div>
          )}
        </div>
      )}
    </div>
  );
}
