import { useState } from 'react';
import { getDescriptionQuality } from '../api/client';
import type { DescriptionQualityResponse } from '../types';

interface Props {
  workId: string;
}

export function DescriptionQualityBadge({ workId }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DescriptionQualityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function assess() {
    setLoading(true);
    setError(null);
    try {
      const r = await getDescriptionQuality(workId);
      setResult(r);
    } catch (e) {
      setError('Assessment failed');
    } finally {
      setLoading(false);
    }
  }

  const scoreColor = result
    ? result.quality_score >= 70 ? 'var(--ok)' : result.quality_score >= 40 ? 'var(--warning)' : 'var(--danger)'
    : undefined;

  return (
    <div className="desc-quality">
      <div className="desc-quality-header">
        <span className="desc-quality-label">DESCRIPTION QUALITY</span>
        {!result && (
          <button className="desc-quality-btn" onClick={assess} disabled={loading}>
            {loading ? 'Analysing…' : 'Assess'}
          </button>
        )}
        {result && (
          <span className="desc-quality-score" style={{ color: scoreColor }}>
            {result.quality_score}/100
          </span>
        )}
      </div>

      {error && <div className="desc-quality-error">{error}</div>}

      {result && (
        <div className="desc-quality-body">
          <div className="desc-quality-row">
            <span className="desc-quality-key">Vagueness</span>
            <span className="desc-quality-val">{result.vagueness_score}/100</span>
          </div>
          {result.flags.length > 0 && (
            <div className="desc-quality-flags">
              {result.flags.map((f, i) => (
                <span key={i} className="desc-quality-flag">{f}</span>
              ))}
            </div>
          )}
          <div className="desc-quality-assessment">{result.assessment}</div>
        </div>
      )}
    </div>
  );
}
