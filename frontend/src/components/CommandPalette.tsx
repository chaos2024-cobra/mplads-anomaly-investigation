import { useEffect, useRef, useState, useCallback } from 'react';
import type { Project } from '../types';
import { riskColor } from '../utils/format';

interface CommandPaletteProps {
  projects: Project[];
  onOpen: (workId: string) => void;
}

export function CommandPalette({ projects, onOpen }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = query.trim().length === 0
    ? projects.slice(0, 8)
    : projects.filter((p) => {
        const q = query.toLowerCase();
        return (
          p.work_id.toLowerCase().includes(q) ||
          p.mp_name.toLowerCase().includes(q) ||
          p.state.toLowerCase().includes(q) ||
          (p.work_description ?? '').toLowerCase().includes(q)
        );
      }).slice(0, 12);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setCursor(0);
  }, []);

  const select = useCallback((workId: string) => {
    onOpen(workId);
    close();
  }, [onOpen, close]);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) setCursor(0);
          return !prev;
        });
      }
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      if (filtered[cursor]) select(filtered[cursor].work_id);
    }
  }

  if (!open) return null;

  return (
    <div className="cmd-backdrop" onClick={close}>
      <div className="cmd-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="cmd-search-row">
          <span className="cmd-icon">⌘</span>
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Search by work ID, MP name, state…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button className="cmd-clear" onClick={() => setQuery('')} aria-label="Clear">×</button>
          )}
          <kbd className="cmd-esc" onClick={close}>ESC</kbd>
        </div>

        {filtered.length === 0 ? (
          <div className="cmd-empty">No results for "{query}"</div>
        ) : (
          <ul ref={listRef} className="cmd-list">
            {filtered.map((p, i) => (
              <li
                key={p.work_id}
                className={`cmd-item${i === cursor ? ' active' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => select(p.work_id)}
              >
                <div className="cmd-item-main">
                  <span className="cmd-item-id mono">{p.work_id}</span>
                  <span className="cmd-item-mp">{p.mp_name}</span>
                </div>
                <div className="cmd-item-meta">
                  <span className="cmd-item-state">{p.state}</span>
                  <span className="cmd-item-risk" style={{ color: riskColor(p.risk_score) }}>
                    {p.risk_score.toFixed(0)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="cmd-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open dossier</span>
          <span><kbd>Esc</kbd> close</span>
          <span className="cmd-footer-tip">Press <kbd>⌘K</kbd> anywhere to open</span>
        </div>
      </div>
    </div>
  );
}
