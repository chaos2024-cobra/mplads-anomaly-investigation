import { useApi } from '../hooks/useApi';
import { getTopSuspiciousMps } from '../api/client';
import type { TopSuspiciousMP } from '../types';
import { riskColor, severityBadgeClass } from '../utils/format';

interface TopSuspiciousMPsProps {
  onSelectMp: (mp: string) => void;
}

export function TopSuspiciousMPs({ onSelectMp }: TopSuspiciousMPsProps) {
  const { data, loading, error } = useApi(() => getTopSuspiciousMps(25, 50), []);

  if (loading) {
    return (
      <>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton" style={{ height: 44, marginBottom: 4 }} />
        ))}
      </>
    );
  }

  if (error) {
    return (
      <div className="state-error">
        <div className="state-error-icon">⚠</div>
        <div className="state-error-title">Failed to load MPs</div>
        <div className="state-error-desc">{error}</div>
      </div>
    );
  }

  const mpList: TopSuspiciousMP[] = data?.results || [];

  if (mpList.length === 0) {
    return (
      <div className="state-empty">
        <div className="state-empty-title">No MPs exceed threshold</div>
        <div className="state-empty-desc">No MPs currently exceed the minimum risk score threshold.</div>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: '0.65rem' }}>
        <div className="section-title">
          <span className="section-number">04</span> PARLIAMENTARY AUDIT RANKING
        </div>
        <div className="section-subtitle">MPs ranked by volume of high and critical-risk projects</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: '0.35rem' }}>
            PRIORITY INVESTIGATION TARGETS
          </div>
          {mpList.slice(0, 12).map((mp, idx) => {
            const avg = mp.avg_risk_score;
            const barCol = riskColor(avg);
            const badgeClass = severityBadgeClass(avg);
            return (
              <div className="mp-card" key={mp.mp_name} onClick={() => onSelectMp(mp.mp_name)} style={{ cursor: 'pointer' }}>
                <div className="mp-card-left">
                  <span className="mp-card-num">{String(idx + 1).padStart(2, '0')}</span>
                  <div>
                    <div className="mp-card-name">{mp.mp_name}</div>
                    <div className="mp-card-sub">{mp.constituency}, {mp.state}</div>
                  </div>
                </div>
                <div className="mp-card-right">
                  <div className="mp-card-score">
                    <div className="mp-card-score-val">{avg.toFixed(1)}</div>
                    <div className="mp-card-bar"><div className="mp-card-bar-fill" style={{ width: `${avg}%`, background: barCol }} /></div>
                  </div>
                  <span className={`badge ${badgeClass}`}>{avg >= 75 ? 'CRITICAL' : avg >= 50 ? 'HIGH' : avg >= 25 ? 'MEDIUM' : 'BASELINE'}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: '0.35rem' }}>
            FLAGGED VS CRITICAL VOLUME
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '0.75rem', minHeight: 300 }}>
            {mpList.slice(0, 10).map((mp, idx) => {
              const maxFlagged = Math.max(...mpList.slice(0, 10).map(m => m.flagged_works), 1);
              return (
                <div key={mp.mp_name} style={{ marginBottom: '0.3rem' }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)', marginBottom: '0.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {mp.mp_name}
                  </div>
                  <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <div style={{ flex: 1, height: 8, background: '#141e30', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(mp.flagged_works / maxFlagged) * 100}%`, background: 'var(--info)', borderRadius: 2 }} />
                    </div>
                    <div style={{ flex: 1, height: 8, background: '#141e30', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(mp.critical_works / maxFlagged) * 100}%`, background: 'var(--danger)', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: '0.55rem', fontFamily: 'var(--mono)', color: 'var(--text-dim)', minWidth: 50, textAlign: 'right' }}>
                      {mp.flagged_works}/{mp.critical_works}
                    </span>
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', fontSize: '0.55rem', color: 'var(--text-dim)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--info)' }} /> Flagged
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--danger)' }} /> Critical
              </span>
            </div>
          </div>

          <div style={{ marginTop: '0.5rem' }}>
            <select
              style={{ width: '100%', padding: '0.45rem 0.6rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: 'var(--text)', fontSize: '0.72rem' }}
              aria-label="Target MP"
            >
              {mpList.map((mp) => (
                <option key={mp.mp_name} value={mp.mp_name}>{mp.mp_name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: '0.35rem' }}>
          FULL PARLIAMENTARY ROSTER
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Member of Parliament</th>
                <th>State</th>
                <th>Constituency</th>
                <th>Flagged</th>
                <th>Critical</th>
                <th>Avg Risk</th>
                <th>Max</th>
              </tr>
            </thead>
            <tbody>
              {mpList.map((mp, idx) => (
                <tr key={mp.mp_name} onClick={() => onSelectMp(mp.mp_name)} style={{ cursor: 'pointer' }}>
                  <td className="td-risk">{String(idx + 1).padStart(2, '0')}</td>
                  <td className="td-mp">{mp.mp_name}</td>
                  <td>{mp.state}</td>
                  <td>{mp.constituency}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{mp.flagged_works}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{mp.critical_works}</td>
                  <td className="td-risk" style={{ color: riskColor(mp.avg_risk_score) }}>{mp.avg_risk_score.toFixed(1)}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{mp.max_risk_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
