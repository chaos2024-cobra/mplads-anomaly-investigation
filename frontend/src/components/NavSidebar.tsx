import { AshokaEmblem } from './Icons';
import type { ReactNode } from 'react';

export type ViewId =
  | 'overview' | 'projects' | 'risk' | 'geo' | 'mp' | 'agency'
  | 'compliance' | 'financial' | 'patterns' | 'copilot' | 'reports' | 'system';

export interface NavItem {
  id: ViewId;
  label: string;
  icon: ReactNode;
}

interface NavSidebarProps {
  items: NavItem[];
  active: ViewId;
  onSelect: (id: ViewId) => void;
  open: boolean;
  onClose: () => void;
}

export function NavSidebar({ items, active, onSelect, open, onClose }: NavSidebarProps) {
  return (
    <>
      {open && <div className="gov-sidebar-scrim" onClick={onClose} />}
      <aside className={`gov-sidebar${open ? ' open' : ''}`} aria-label="Primary navigation">
        <div className="gov-sidebar-label">MPLADS Intelligence</div>

        <nav className="gov-nav">
          {items.map(item => (
            <button
              key={item.id}
              className={`gov-nav-item${active === item.id ? ' active' : ''}`}
              onClick={() => { onSelect(item.id); onClose(); }}
              aria-current={active === item.id ? 'page' : undefined}
            >
              <span className="gov-nav-icon">{item.icon}</span>
              <span className="gov-nav-text">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="gov-sidebar-foot">
          <div className="gov-ministry">
            <div className="gov-ministry-emblem"><AshokaEmblem size={22} /></div>
            <div>
              <div className="gov-ministry-name">Ministry of Statistics<br />and Programme Implementation</div>
              <div className="gov-ministry-sub">Government of India</div>
            </div>
          </div>
          <div className="gov-quote">
            “Data for Development.<br />Accountability for a Stronger India.”
          </div>
          <div className="gov-tricolor-rule"><i /><i /><i /></div>
        </div>
      </aside>
    </>
  );
}

