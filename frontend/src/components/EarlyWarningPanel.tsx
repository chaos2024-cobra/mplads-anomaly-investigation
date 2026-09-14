import { useApi } from '../hooks/useApi';
import { getEarlyWarning } from '../api/client';
import { fmtInr } from '../utils/format';

interface Props {
  onOpen: (workId: string) => void;
}

export function EarlyWarningPanel({ onOpen }: Props) {
  const data = useApi(() => getEarlyWarning(), []);

  if (data.loading) {
    return (
      <div className="early-warning-body">
        {[1,2,3].map(i => <div key={i} className="skeleton" style={{height:44,marginBottom:4}} />)}
      </div>
    );
  }

  if (!data.data) return null;

  return (
    <div className="early-warning-body">
      <div className="early-warning-desc">
        Works with 2+ risk signals but not yet flagged as high-risk — monitor before they escalate.
        <span className="early-warning-badge" style={{marginLeft:'0.5rem'}}>{data.data.total} works</span>
      </div>
      <div className="early-warning-list">
        {data.data.results.slice(0, 20).map(w => (
          <div key={w.work_id} className="early-warning-row" onClick={() => onOpen(w.work_id)}>
            <div className="ew-row-left">
              <span className="ew-work-id">{w.work_id}</span>
              <span className="ew-mp">{w.mp_name}</span>
              <span className="ew-state">{w.state}</span>
            </div>
            <div className="ew-row-right">
              <span className="ew-amount">{fmtInr(w.amount)}</span>
              <span className="ew-signals">{w.signal_count} signals</span>
              <span className={`ew-score risk-${w.risk_level.toLowerCase()}`}>{w.risk_score}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
