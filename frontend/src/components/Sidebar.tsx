import type { FilterState, Filters as FiltersMeta } from '../types';

interface SidebarProps {
  filters: FilterState;
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  resetFilters: () => void;
  activeFilterCount: number;
  filtersMeta: FiltersMeta | null;
  apiHealthy: boolean;
  totalRecords: number;
  open: boolean;
  onClose: () => void;
}

const RISK_OPTIONS: { label: string; value: number }[] = [
  { label: 'Low (0+)', value: 0 },
  { label: 'Medium (20+)', value: 20 },
  { label: 'High (40+)', value: 40 },
  { label: 'Critical (75+)', value: 75 },
];

function riskTier(score: number): string {
  if (score >= 75) return 'Critical';
  if (score >= 40) return 'High';
  if (score >= 20) return 'Medium';
  return 'Baseline';
}

function riskColor(score: number): string {
  if (score >= 75) return 'var(--critical)';
  if (score >= 40) return 'var(--high)';
  if (score >= 20) return 'var(--medium)';
  return 'var(--low)';
}

export function Sidebar({
  filters,
  updateFilter,
  resetFilters,
  activeFilterCount,
  filtersMeta,
  apiHealthy,
  totalRecords,
  open,
  onClose,
}: SidebarProps) {
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} role="navigation" aria-label="Investigation filters">
      <div className="flt-head">
        <div className="flt-title">Filters</div>
        <div className="flt-head-right">
          <span className={`flt-count${activeFilterCount > 0 ? ' on' : ''}`}>{activeFilterCount} active</span>
          <button className="flt-close" onClick={onClose} aria-label="Close filters" title="Close filters (Esc)">✕</button>
        </div>
      </div>

      {activeFilterCount > 0 && (
        <>
          <div className="chips-wrap">
            {filters.state && <span className="filter-chip" title={filters.state}>{filters.state}</span>}
            {filters.category && <span className="filter-chip" title={filters.category}>{filters.category}</span>}
            {filters.search && <span className="filter-chip" title={filters.search}>“{filters.search}”</span>}
            {filters.minRisk !== 25 && <span className="filter-chip">Risk ≥ {filters.minRisk}</span>}
            {filters.mpName && <span className="filter-chip" title={filters.mpName}>{filters.mpName}</span>}
          </div>
          <button className="btn-reset" onClick={resetFilters}>Reset all filters</button>
        </>
      )}

      <label className="flt-label" htmlFor="flt-search">Keyword</label>
      <input
        id="flt-search"
        type="text"
        className="flt-input"
        placeholder="Description, work ID…"
        value={filters.search}
        onChange={(e) => { updateFilter('search', e.target.value); updateFilter('page', 0); }}
      />

      <label className="flt-label" htmlFor="flt-state">State / UT</label>
      <select
        id="flt-state"
        className="flt-input"
        value={filters.state}
        onChange={(e) => { updateFilter('state', e.target.value); updateFilter('page', 0); }}
      >
        <option value="">All states</option>
        {(filtersMeta?.states ?? []).map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <label className="flt-label" htmlFor="flt-type">Work category</label>
      <select
        id="flt-type"
        className="flt-input"
        value={filters.category}
        onChange={(e) => { updateFilter('category', e.target.value); updateFilter('page', 0); }}
      >
        <option value="">All categories</option>
        {(filtersMeta?.work_types ?? []).map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      <label className="flt-label" htmlFor="flt-risk">Risk threshold</label>
      <div className="risk-threshold-display">
        <span className="risk-threshold-value" style={{ color: riskColor(filters.minRisk) }}>
          {filters.minRisk}
        </span>
        <span className="risk-threshold-tier" style={{ color: riskColor(filters.minRisk) }}>
          {riskTier(filters.minRisk)}
        </span>
      </div>
      <input
        id="flt-risk"
        type="range"
        className="risk-slider"
        min={0}
        max={75}
        step={25}
        value={filters.minRisk}
        onChange={(e) => updateFilter('minRisk', parseInt(e.target.value))}
        aria-label="Minimum risk threshold"
      />
      <div className="flt-scale">
        {RISK_OPTIONS.map(o => <span key={o.value}>{o.label.split(' ')[0]}</span>)}
      </div>

      {filters.mpName && (
        <div className="flt-target">
          <span>Target MP: <strong>{filters.mpName}</strong></span>
          <button onClick={() => updateFilter('mpName', '')} aria-label="Clear MP filter">✕</button>
        </div>
      )}

      <div className="sidebar-status">
        <div className="sidebar-status-item">
          <span className={`sidebar-status-dot ${apiHealthy ? '' : 'disconnected'}`} />
          Core audit API
        </div>
        <div className="sidebar-status-item" style={{ paddingLeft: '0.7rem' }}>
          {totalRecords.toLocaleString('en-IN')} records
        </div>
      </div>
    </aside>
  );
}
