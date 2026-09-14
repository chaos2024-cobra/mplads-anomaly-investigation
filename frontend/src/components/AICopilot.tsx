import { useState, useRef, useEffect } from 'react';
import { postCopilot } from '../api/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'Which states have the most delayed projects?',
  'Show MPs with highest critical work rate',
  'What are the most common fraud signals?',
  'Which work types have the highest cost overruns?',
  'Summarize the national risk picture',
  'Which states have the lowest fund utilization?',
];

export function AICopilot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function submit(query: string) {
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    const history = [...messages].slice(-6);

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const result = await postCopilot(trimmed, history);
      setMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to get response. Please try again.'}`,
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  function handleSuggestion(s: string) {
    setInput(s);
    submit(s);
  }

  return (
    <div className="copilot-wrap">
      <div className="copilot-header">
        <span className="copilot-title">AI AUDIT COPILOT</span>
        <span className="copilot-subtitle">Ask questions about MPLADS data in plain English</span>
      </div>

      <div className="copilot-messages">
        {messages.length === 0 && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '2rem 1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: 'var(--info)' }}>✦</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.25rem' }}>Ask anything about MPLADS data</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1.25rem', maxWidth: 320, lineHeight: 1.5 }}>
              Powered by AI — query risk patterns, fund utilization, or MP performance in plain English
            </div>
            <div className="copilot-suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s} className="copilot-suggestion-chip" onClick={() => handleSuggestion(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`copilot-message ${msg.role}`}>
            <div style={{
              fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.10em',
              color: msg.role === 'user' ? 'var(--info)' : 'var(--text-dim)',
              marginBottom: '0.2rem', textTransform: 'uppercase',
            }}>
              {msg.role === 'user' ? 'YOU' : 'COPILOT'}
            </div>
            <div className="copilot-message-content">{msg.content}</div>
          </div>
        ))}

        {loading && (
          <div className="copilot-message assistant">
            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.10em', color: 'var(--text-dim)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
              COPILOT
            </div>
            <div className="copilot-typing">
              <span className="copilot-dot" />
              <span className="copilot-dot" />
              <span className="copilot-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="copilot-input-row">
        <input
          className="copilot-input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about risk patterns, fund utilization, MP performance..."
          disabled={loading}
          autoFocus
        />
        <button
          className="copilot-send-btn"
          onClick={() => submit(input)}
          disabled={loading || !input.trim()}
          aria-label="Send message"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
