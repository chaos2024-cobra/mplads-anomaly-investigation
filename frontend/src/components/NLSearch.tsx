import { useState, useRef } from 'react';
import { nlSearch } from '../api/client';
import type { Project, NLSearchFilters } from '../types';
import { fmtInr } from '../utils/format';

interface NLSearchProps {
  onResults: (results: Project[], filters: NLSearchFilters, query: string, total: number) => void;
  onClear: () => void;
  active: boolean;
}

export function NLSearch({ onResults, onClear, active }: NLSearchProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFilters, setLastFilters] = useState<NLSearchFilters | null>(null);
  const [lastTotal, setLastTotal] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await nlSearch(q);
      setLastFilters(result.filters);
      setLastTotal(result.total);
      onResults(result.results, result.filters, q, result.total);
    } catch (err: any) {
      setError(err.message || 'AI search failed');
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setQuery('');
    setLastFilters(null);
    setLastTotal(0);
    setError(null);
    onClear();
    inputRef.current?.focus();
  }

  function chips(f: NLSearchFilters) {
    const items: { label: string; value: string }[] = [];
    if (f.state) items.push({ label: 'State', value: f.state });
    if (f.mp_name) items.push({ label: 'MP', value: f.mp_name });
    if (f.work_type) items.push({ label: 'Type', value: f.work_type });
    if (f.min_risk_score) items.push({ label: 'Min Risk', value: `${f.min_risk_score}+` });
    if (f.min_amount) items.push({ label: 'Min Amount', value: fmtInr(f.min_amount) });
    if (f.work_status) items.push({ label: 'Status', value: f.work_status });
    if (f.search) items.push({ label: 'Search', value: f.search });
    return items;
  }

  return (
    <div className="ai-search-container">
      <div className={`ai-search-bar${active ? ' ai-search-bar--active' : ''}`}>
        <form className="ai-search-form" onSubmit={handleSearch}>
          <div className="ai-search-input-wrap">
            <span className="ai-search-icon">✦</span>
            <input
              ref={inputRef}
              className={`ai-search-input${loading ? ' loading' : ''}`}
              type="text"
              placeholder='Ask in plain English — e.g. "stalled works in UP over ₹50L" or "BJP MPs with phantom completion"'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
              aria-label="AI natural language search"
            />
            {query && !loading && (
              <button type="button" className="ai-search-clear" onClick={handleClear} aria-label="Clear">×</button>
            )}
            {loading ? (
              <span className="ai-search-spinner">
                <span className="ai-spinner-dots"><span /><span /><span /></span>
              </span>
            ) : (
              <button type="submit" className="ai-search-submit" disabled={!query.trim()} aria-label="Search">↑</button>
            )}
          </div>
        </form>

        {active && lastFilters && (
          <div className="ai-search-summary">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', color: 'var(--info)', fontWeight: 700 }}>
                {lastTotal.toLocaleString()} results
              </span>
              {lastFilters.explanation && (
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>— {lastFilters.explanation}</span>
              )}
              <button
                style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.3rem' }}
                onClick={handleClear}
              >
                ✕ Clear AI search
              </button>
            </div>
            {chips(lastFilters).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.35rem' }}>
                {chips(lastFilters).map((c, i) => (
                  <span key={i} className="ai-filter-chip">
                    <span style={{ color: 'var(--text-dim)' }}>{c.label}:</span> {c.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="ai-search-error">
          <span style={{ marginRight: '0.4rem' }}>⚠</span>
          {error}
          <button
            style={{ marginLeft: '0.5rem', fontSize: '0.62rem', color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => handleSearch()}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
