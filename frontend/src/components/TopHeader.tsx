import { useMemo } from 'react';
import { AshokaEmblem, IconMenu } from './Icons';

interface TopHeaderProps {
  apiHealthy: boolean;
  totalRecords: number;
  onMenuToggle: () => void;
  userName?: string;
  userRole?: string;
  onLogout?: () => void;
}

export function TopHeader({ apiHealthy, totalRecords, onMenuToggle, userName, userRole, onLogout }: TopHeaderProps) {
  const lastUpdated = useMemo(() => {
    const d = new Date();
    const mon = d.toLocaleString('en-GB', { month: 'short' });
    return `${String(d.getDate()).padStart(2, '0')} ${mon} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, []);

  const initials = userName ? userName.slice(0, 2).toUpperCase() : '??';

  return (
    <header className="gov-header">
      {/* Subtle tricolor wave — identity accent only */}
      <div className="gov-header-wave" aria-hidden="true">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d="M0,38 C260,8 460,74 700,44 C900,19 1050,58 1200,34 L1200,0 L0,0 Z" fill="#E98B2A" opacity="0.13" />
          <path d="M0,62 C240,32 470,96 720,66 C920,42 1060,80 1200,58 L1200,28 C1050,52 900,13 700,38 C460,68 260,2 0,32 Z" fill="#FFFFFF" opacity="0.5" />
          <path d="M0,120 L1200,120 L1200,80 C1060,102 920,64 720,88 C470,118 240,54 0,84 Z" fill="#2E8B57" opacity="0.11" />
        </svg>
      </div>

      <button className="gov-icon-btn gov-menu-btn" onClick={onMenuToggle} aria-label="Toggle navigation">
        <IconMenu size={17} />
      </button>

      <div className="gov-header-left">
        <div className="gov-emblem"><AshokaEmblem size={42} /></div>
        <div>
          <div className="gov-brand-title">MPLADS <span>Anomaly Investigation</span></div>
          <div className="gov-brand-tagline">Transparent Monitoring. Stronger Citizen Outcomes.</div>
        </div>
      </div>

      <div className="gov-header-divider" />

      <div className="gov-scheme">
        <div className="gov-scheme-name">Members of Parliament<br />Local Area Development Scheme</div>
        <div className="gov-scheme-pillars">People &nbsp;|&nbsp; Projects &nbsp;|&nbsp; Progress</div>
      </div>

      <div className="gov-header-right">
        <div className="gov-dataset-status">
          <div className={`gov-status-line${apiHealthy ? '' : ' offline'}`}>
            <span className="gov-status-dot" />
            {apiHealthy ? 'Dataset Online' : 'Dataset Offline'}
          </div>
          <div className="gov-status-meta">
            {totalRecords.toLocaleString('en-IN')} records · {lastUpdated}
          </div>
        </div>

        {userName && (
          <div className="header-user-chip">
            <div className="header-user-avatar">{initials}</div>
            <div>
              <div className="header-user-name">{userName}</div>
              {userRole && <div className="header-user-role">{userRole}</div>}
            </div>
            {onLogout && (
              <button className="header-logout-btn" onClick={onLogout} title="Sign out">
                Sign out
              </button>
            )}
          </div>
        )}

        <div className="gov-motto">
          <div className="gov-motto-text">Sabka Saath<br />Sabka Vikas</div>
          <div className="gov-motto-rule"><i /><i /><i /></div>
        </div>
      </div>
    </header>
  );
}
