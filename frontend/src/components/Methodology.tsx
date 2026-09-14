export function Methodology() {
  return (
    <>
      <div className="method-strip">
        <div className="method-card method-normal">
          <div className="method-label">BASELINE</div>
          <div className="method-range">0 – 19</div>
          <div className="method-desc">Costs within expected category bounds. Work completed on time with no fund irregularities.</div>
        </div>
        <div className="method-card method-medium">
          <div className="method-label">MEDIUM</div>
          <div className="method-range">20 – 39</div>
          <div className="method-desc">One or more weak signals: minor cost deviation, recommendation delay, or early-stage stall. Worth periodic review.</div>
        </div>
        <div className="method-card method-suspect">
          <div className="method-label">HIGH</div>
          <div className="method-range">40 – 74</div>
          <div className="method-desc">Multiple signals: significant cost outlier, stalled work, unaccounted disbursements, duplicate patterns, or concentration anomaly.</div>
        </div>
        <div className="method-card method-crit">
          <div className="method-label">CRITICAL</div>
          <div className="method-range">75 – 100</div>
          <div className="method-desc">Severe or compounding signals. Extreme cost outlier, funds disbursed on incomplete works, confirmed duplicates, or calamity fund diversion.</div>
        </div>
      </div>
      <div style={{ marginTop: '0.9rem', fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
        <strong style={{ color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>HOW THE SCORE IS CALCULATED</strong>
        <div style={{ marginTop: '0.4rem' }}>
          Six independent signals are each normalized to a fixed point budget, then summed:
          Financial Anomaly <strong style={{ color: 'var(--text-secondary)' }}>(max 25)</strong>,
          Unaccounted Funds <strong style={{ color: 'var(--text-secondary)' }}>(max 20)</strong>,
          Stalled Work <strong style={{ color: 'var(--text-secondary)' }}>(max 20)</strong>,
          Recommendation Delay <strong style={{ color: 'var(--text-secondary)' }}>(max 10)</strong>,
          Phantom Completion <strong style={{ color: 'var(--text-secondary)' }}>(max 10)</strong>,
          Duplicate Work <strong style={{ color: 'var(--text-secondary)' }}>(max 10)</strong>,
          Calamity Fund Misuse <strong style={{ color: 'var(--text-secondary)' }}>(max 5)</strong>.
          The theoretical maximum is 100, but in practice no single work in this dataset triggers all signals at full intensity simultaneously — the highest observed score is 90. Scores are rescaled so that the worst case in the dataset maps to 90, keeping relative distances accurate.
        </div>
      </div>
    </>
  );
}
