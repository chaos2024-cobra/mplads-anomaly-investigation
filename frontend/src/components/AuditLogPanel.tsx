import { useApi } from '../hooks/useApi';
import { getAuditLog } from '../api/client';

export function AuditLogPanel() {
  const data = useApi(() => getAuditLog(100), []);

  return (
    <div className="audit-log-panel">
      <div className="audit-log-header">
        <span className="audit-log-title">INVESTIGATION AUDIT TRAIL</span>
        <span className="audit-log-count">{data.data?.entries.length ?? 0} entries</span>
      </div>

      {data.loading && (
        <div className="audit-log-body">
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{height:32,marginBottom:3}} />)}
        </div>
      )}

      {data.data && data.data.entries.length === 0 && (
        <div className="audit-log-empty">No actions recorded this session.</div>
      )}

      {data.data && data.data.entries.length > 0 && (
        <div className="audit-log-body">
          {data.data.entries.slice().reverse().map((e, i) => (
            <div key={i} className="audit-log-row">
              <span className="audit-log-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
              <span className="audit-log-work">{e.work_id}</span>
              <span className="audit-log-action">{e.action}</span>
              <span className="audit-log-authority">{e.authority}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
