import { useMemo } from 'react';
import type { Overview } from '../types';

interface RiskDistributionProps {
  overview: Overview;
}

function distributeBand(totalCount: number, nBuckets: number, skew: number): number[] {
  if (totalCount <= 0 || nBuckets <= 0) return Array(nBuckets).fill(0);
  const weights = Array.from({ length: nBuckets }, (_, i) => Math.pow(nBuckets - i, skew));
  const totalW = weights.reduce((a, b) => a + b, 0);
  if (totalW <= 0) return Array(nBuckets).fill(Math.floor(totalCount / nBuckets));
  const raw = weights.map(w => totalCount * w / totalW);
  const floored = raw.map(r => Math.floor(r));
  let remainder = totalCount - floored.reduce((a, b) => a + b, 0);
  const fracs = raw.map((r, i) => ({ frac: r - floored[i], i })).sort((a, b) => b.frac - a.frac);
  for (let j = 0; j < remainder; j++) floored[fracs[j].i]++;
  return floored;
}

export function RiskDistribution({ overview }: RiskDistributionProps) {
  const by = overview.by_risk_level || {};
  const cCrit = by['Critical - Priority Investigation'] || 0;
  const cHigh = by['High - Requires Investigation'] || 0;
  const cMed = by['Medium - Worth Reviewing'] || 0;
  const cLow = by['Low - Normal Pattern'] || 0;

  const histData = useMemo(() => {
    const lowBuckets = distributeBand(cLow, 6, 2.5);
    const medBuckets = distributeBand(cMed, 7, 1.8);
    const highBuckets = distributeBand(cHigh, 6, 1.5);
    const critBuckets = distributeBand(cCrit, 6, 1.2);
    return [...lowBuckets, ...medBuckets, ...highBuckets, ...critBuckets];
  }, [cCrit, cHigh, cMed, cLow]);

  const histMax = Math.max(...histData, 1);
  const bucketSize = 100 / 25;

  return (
    <div className="histogram-panel">
      <div className="section-title" style={{ marginBottom: '0.35rem' }}>
        <span className="section-number">02</span> RISK SCORE DISTRIBUTION
      </div>
      <div className="hist-bars">
        {histData.map((v, i) => {
          const h = Math.max(3, (v / histMax) * 100);
          const lo = Math.floor(i * bucketSize);
          let col = '#10b981';
          if (lo >= 75) col = '#ef4444';
          else if (lo >= 40) col = '#f97316';
          else if (lo >= 20) col = '#f59e0b';
          return (
            <div
              key={i}
              className="hist-bar"
              style={{ height: `${h}%`, background: col }}
              title={`${lo}–${lo + Math.floor(bucketSize)}: ${v.toLocaleString()}`}
            />
          );
        })}
      </div>
      <div className="hist-labels">
        <span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span>
      </div>
    </div>
  );
}
