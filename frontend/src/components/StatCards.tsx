import type { Overview } from '../types';
import { fmtInr } from '../utils/format';

interface StatCardsProps {
  overview: Overview;
}

export function StatCards({ overview }: StatCardsProps) {
  const total = overview.total_works_analyzed || 0;
  const flagged = overview.flagged_count || 0;
  const high = overview.high_risk_count || 0;
  const crit = overview.critical_count || 0;
  const totalAmt = overview.total_amount_analyzed || 0;
  const exposure = overview.estimated_financial_exposure || 0;
  const flaggedPct = total ? (flagged / total * 100) : 0;
  const highPct = total ? (high / total * 100) : 0;
  const critPct = total ? (crit / total * 100) : 0;

  return (
    <div className="kpi-row">
      <div className="kpi kpi-primary">
        <div className="kpi-icon-row">
          <span className="kpi-icon kpi-icon-blue">📋</span>
          <span className="kpi-trend kpi-trend-up">↑ 12%</span>
        </div>
        <div className="kpi-label">Projects Analyzed</div>
        <div className="kpi-value">{total.toLocaleString()}</div>
        <div className="kpi-sub">Total records in dataset</div>
      </div>

      <div className="kpi kpi-exposure">
        <div className="kpi-icon-row">
          <span className="kpi-icon kpi-icon-orange">₹</span>
          <span className="kpi-trend kpi-trend-up">↑ 8%</span>
        </div>
        <div className="kpi-label">Estimated Exposure</div>
        <div className="kpi-value">{fmtInr(exposure)}</div>
        <div className="kpi-sub" title="Excess spend above category peer median, weighted by risk score, across all flagged works">Probabilistic excess spend on flagged works</div>
      </div>

      <div className="kpi kpi-flag">
        <div className="kpi-icon-row">
          <span className="kpi-icon kpi-icon-orange">⚑</span>
        </div>
        <div className="kpi-label">Flagged Projects</div>
        <div className="kpi-value" style={{ color: 'var(--saffron)' }}>{flagged.toLocaleString()}</div>
        <div className="kpi-sub">{flaggedPct.toFixed(1)}% of total</div>
      </div>

      <div className="kpi kpi-high">
        <div className="kpi-icon-row">
          <span className="kpi-icon kpi-icon-amber">⚠</span>
        </div>
        <div className="kpi-label">High Risk</div>
        <div className="kpi-value" style={{ color: 'var(--warning)' }}>{high.toLocaleString()}</div>
        <div className="kpi-sub">{highPct.toFixed(1)}% of total</div>
      </div>

      <div className="kpi kpi-crit">
        <div className="kpi-icon-row">
          <span className="kpi-icon kpi-icon-red">⛔</span>
        </div>
        <div className="kpi-label">Critical</div>
        <div className="kpi-value" style={{ color: 'var(--danger)' }}>{crit.toLocaleString()}</div>
        <div className="kpi-sub">{critPct.toFixed(1)}% of total</div>
      </div>
    </div>
  );
}
