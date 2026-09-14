import { useState, useEffect, useRef } from 'react';

interface InvestigationNotesProps {
  workId: string;
}

const STORAGE_KEY = (id: string) => `mplads_notes_${id}`;

export function InvestigationNotes({ workId }: InvestigationNotesProps) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load from localStorage when workId changes
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY(workId));
    setText(stored ?? '');
    setSaved(false);
  }, [workId]);

  // Auto-save with debounce
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (text.trim()) {
        localStorage.setItem(STORAGE_KEY(workId), text);
      } else {
        localStorage.removeItem(STORAGE_KEY(workId));
      }
      setSaved(true);
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [text, workId]);

  const hasContent = text.trim().length > 0;

  return (
    <div className={`notes-widget${expanded ? ' expanded' : ''}${hasContent ? ' has-content' : ''}`}>
      <button
        className="notes-toggle"
        onClick={() => {
          setExpanded((prev) => {
            if (!prev) setTimeout(() => textareaRef.current?.focus(), 50);
            return !prev;
          });
        }}
        aria-expanded={expanded}
        title="Investigation notes (stored locally)"
      >
        <span className="notes-icon">{hasContent ? '📝' : '✎'}</span>
        <span className="notes-label">Investigation Notes</span>
        {hasContent && <span className="notes-dot" />}
        <span className="notes-chevron">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="notes-body">
          <textarea
            ref={textareaRef}
            className="notes-textarea"
            value={text}
            onChange={(e) => { setText(e.target.value); setSaved(false); }}
            placeholder="Type investigation notes here… (auto-saved locally)"
            rows={5}
          />
          <div className="notes-footer">
            <span className="notes-status">{saved && hasContent ? '✓ Saved locally' : 'Unsaved'}</span>
            <div className="notes-actions">
              {hasContent && (
                <button
                  className="notes-action-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(text).catch(() => {});
                  }}
                  title="Copy notes"
                >
                  Copy
                </button>
              )}
              {hasContent && (
                <button
                  className="notes-action-btn notes-action-clear"
                  onClick={() => { setText(''); setSaved(false); }}
                  title="Clear notes"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
