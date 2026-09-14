import { useMemo } from 'react';

interface HeaderProps {
  apiHealthy: boolean;
  totalRecords: number;
}

export function Header({ apiHealthy, totalRecords }: HeaderProps) {
  const now = useMemo(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, []);

  return (
    <header className="app-header">
      <div className="app-brand">
        <div className="app-shield">◆</div>
        <div>
          <div className="app-title-main">MPLADS ANOMALY INVESTIGATION</div>
          <div className="app-title-sub">Explainable audit intelligence across official project records</div>
        </div>
      </div>
      <div className="app-meta">
        <div className={`app-status ${apiHealthy ? '' : 'offline'}`}>
          <span className="app-status-dot" />
          {apiHealthy ? 'DATASET ONLINE' : 'OFFLINE'}
        </div>
        <span className="app-records">{totalRecords.toLocaleString()} RECORDS</span>
        <span className="app-verified">VERIFIED OFFICIAL DATA</span>
        <span className="app-refresh">Last refreshed {now}</span>
      </div>
    </header>
  );
}
