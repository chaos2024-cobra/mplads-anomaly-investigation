import { useState, useRef, useEffect } from 'react';
import { authLogin, type AuthSession } from '../api/client';

interface Props {
  onLogin: (session: AuthSession) => void;
  onSignup: () => void;
  onGuest: () => void;
}

export function LoginPage({ onLogin, onSignup, onGuest }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError('');
    setLoading(true);
    try {
      const session = await authLogin(username.trim(), password);
      onLogin(session);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      <div className="login-bg-pattern" aria-hidden />

      <div className="login-card">
        {/* Header */}
        <div className="login-header">
          <div className="login-emblem">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
              <circle cx="24" cy="24" r="23" stroke="#2563A8" strokeWidth="2" fill="#F7F9FC"/>
              <circle cx="24" cy="24" r="4" fill="#2563A8"/>
              <circle cx="24" cy="24" r="8" stroke="#2563A8" strokeWidth="1.2" fill="none"/>
              <circle cx="24" cy="24" r="12" stroke="#2563A8" strokeWidth="0.8" fill="none" strokeDasharray="2.5 2.5"/>
              {/* Spokes */}
              {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                const x1 = 24 + 9 * Math.cos(rad);
                const y1 = 24 + 9 * Math.sin(rad);
                const x2 = 24 + 12 * Math.cos(rad);
                const y2 = 24 + 12 * Math.sin(rad);
                return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2563A8" strokeWidth="0.8"/>;
              })}
            </svg>
          </div>
          <div className="login-title-block">
            <h1 className="login-title">MPLADS Intelligence</h1>
            <p className="login-subtitle">Anomaly Detection &amp; Investigation Platform</p>
          </div>
        </div>

        <div className="login-divider" />

        {/* Classification banner */}
        <div className="login-classification">
          <span className="login-class-dot" />
          RESTRICTED ACCESS — AUTHORISED PERSONNEL ONLY
        </div>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-field">
            <label className="login-label" htmlFor="lp-user">Username</label>
            <input
              id="lp-user"
              ref={userRef}
              className={`login-input${error ? ' login-input-error' : ''}`}
              type="text"
              autoComplete="username"
              spellCheck={false}
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              disabled={loading}
              placeholder="Enter your username"
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="lp-pass">Password</label>
            <div className="login-pass-wrap">
              <input
                id="lp-pass"
                className={`login-input login-input-pass${error ? ' login-input-error' : ''}`}
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                disabled={loading}
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="login-pass-toggle"
                onClick={() => setShowPass(v => !v)}
                tabIndex={-1}
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <span className="login-error-icon">⚠</span>
              {error}
            </div>
          )}

          <button
            className="login-submit"
            type="submit"
            disabled={loading || !username.trim() || !password}
          >
            {loading ? (
              <span className="login-spinner">
                <span /><span /><span />
              </span>
            ) : (
              'Sign In →'
            )}
          </button>

          <button type="button" className="signup-back-btn" onClick={onSignup} disabled={loading}>
            Don't have an account? Sign Up
          </button>

          <div className="login-guest-sep"><span>or</span></div>

          <button type="button" className="login-guest-btn" onClick={onGuest} disabled={loading}>
            Continue as guest — view risk scores without signing in
          </button>
        </form>

        <div className="login-footer">
          <span>Ministry of Statistics &amp; Programme Implementation</span>
          <span className="login-footer-sep">·</span>
          <span>Government of India</span>
        </div>
      </div>
    </div>
  );
}
