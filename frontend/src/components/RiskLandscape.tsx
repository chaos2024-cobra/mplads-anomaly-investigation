import type { Overview } from '../types';

interface RiskLandscapeProps {
  overview: Overview;
  totalFiltered: number;
}

export function RiskLandscape({ overview, totalFiltered }: RiskLandscapeProps) {
  const by = overview.by_risk_level || {};
  const cCrit = by['Critical - Priority Investigation'] || 0;
  const cHigh = by['High - Requires Investigation'] || 0;
  const cMed = by['Medium - Worth Reviewing'] || 0;
  const cLow = by['Low - Normal Pattern'] || 0;
  const totalS = overview.total_works_analyzed || 1;

  const pCrit = (cCrit / totalS * 100);
  const pHigh = (cHigh / totalS * 100);
  const pMed = (cMed / totalS * 100);
  const pLow = (cLow / totalS * 100);

  return (
    <div className="landscape">
      <div className="landscape-header">
        <div>
          <div className="section-title">
            <span className="section-number">01</span> NATIONAL RISK LANDSCAPE
          </div>
          <div className="section-subtitle">Distribution of anomaly scores across analyzed projects</div>
        </div>
        <div className="landscape-meta">{totalFiltered.toLocaleString()} matching filters · {totalS.toLocaleString()} total</div>
      </div>

      <div className="risk-bar-track">
        <div
          className="risk-seg"
          style={{ width: cCrit ? Math.max(pCrit, 0.8) + '%' : '0%', background: '#ef4444' }}
          title={`Critical: ${cCrit.toLocaleString()} (${pCrit.toFixed(1)}%)`}
        />
        <div
          className="risk-seg"
          style={{ width: cHigh ? Math.max(pHigh, 0.8) + '%' : '0%', background: '#f97316' }}
          title={`High: ${cHigh.toLocaleString()} (${pHigh.toFixed(1)}%)`}
        />
        <div
          className="risk-seg"
          style={{ width: cMed ? pMed + '%' : '0%', background: '#f59e0b' }}
          title={`Medium: ${cMed.toLocaleString()} (${pMed.toFixed(1)}%)`}
        />
        <div
          className="risk-seg"
          style={{ width: cLow ? pLow + '%' : '0%', background: '#10b981' }}
          title={`Baseline: ${cLow.toLocaleString()} (${pLow.toFixed(1)}%)`}
        />
      </div>

      <div className="risk-legend">
        <div className="risk-legend-item">
          <div className="risk-dot" style={{ background: '#ef4444' }} />
          <div>
            <div className="risk-legend-name">CRITICAL</div>
            <div className="risk-legend-val">{cCrit.toLocaleString()}<span className="risk-legend-pct">{pCrit.toFixed(1)}%</span></div>
          </div>
        </div>
        <div className="risk-legend-item">
          <div className="risk-dot" style={{ background: '#f97316' }} />
          <div>
            <div className="risk-legend-name">HIGH</div>
            <div className="risk-legend-val">{cHigh.toLocaleString()}<span className="risk-legend-pct">{pHigh.toFixed(1)}%</span></div>
          </div>
        </div>
        <div className="risk-legend-item">
          <div className="risk-dot" style={{ background: '#f59e0b' }} />
          <div>
            <div className="risk-legend-name">MEDIUM</div>
            <div className="risk-legend-val">{cMed.toLocaleString()}<span className="risk-legend-pct">{pMed.toFixed(1)}%</span></div>
          </div>
        </div>
        <div className="risk-legend-item">
          <div className="risk-dot" style={{ background: '#10b981' }} />
          <div>
            <div className="risk-legend-name">BASELINE</div>
            <div className="risk-legend-val">{cLow.toLocaleString()}<span className="risk-legend-pct">{pLow.toFixed(1)}%</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
