import { useState, useRef, useEffect } from 'react';
import { authRegister, type AuthSession } from '../api/client';

const ROLE_OPTIONS = [
  { value: 'analyst', label: 'Senior Analyst', desc: 'Full access including AI features and exports' },
  { value: 'auditor', label: 'Audit Officer', desc: 'Read-only — no AI features or exports' },
  { value: 'admin', label: 'Administrator', desc: 'Full access + administrative privileges' },
];

interface Props {
  onLogin: (session: AuthSession) => void;
  onBack: () => void;
}

export function SignupPage({ onLogin, onBack }: Props) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState('analyst');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  function validate(): string | null {
    if (username.trim().length < 3) return 'Username must be at least 3 characters';
    if (!/^[a-z0-9_]+$/i.test(username.trim())) return 'Username may only contain letters, digits, and underscores';
    if (password.length < 6) return 'Password must be at least 6 characters';
    if (password !== confirm) return 'Passwords do not match';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError('');
    setLoading(true);
    try {
      const session = await authRegister(
        username.trim().toLowerCase(),
        password,
        displayName.trim() || username.trim(),
        role,
      );
      onLogin(session);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  const selectedRole = ROLE_OPTIONS.find(r => r.value === role);

  return (
    <div className="login-root">
      <div className="login-bg-pattern" aria-hidden />

      <div className="login-card signup-card">
        {/* Header */}
        <div className="login-header">
          <div className="login-emblem">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
              <circle cx="24" cy="24" r="23" stroke="#2563A8" strokeWidth="2" fill="#F7F9FC"/>
              <circle cx="24" cy="24" r="4" fill="#2563A8"/>
              <circle cx="24" cy="24" r="8" stroke="#2563A8" strokeWidth="1.2" fill="none"/>
              <circle cx="24" cy="24" r="12" stroke="#2563A8" strokeWidth="0.8" fill="none" strokeDasharray="2.5 2.5"/>
              {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                return <line key={deg}
                  x1={24 + 9 * Math.cos(rad)} y1={24 + 9 * Math.sin(rad)}
                  x2={24 + 12 * Math.cos(rad)} y2={24 + 12 * Math.sin(rad)}
                  stroke="#2563A8" strokeWidth="0.8"/>;
              })}
            </svg>
          </div>
          <div className="login-title-block">
            <h1 className="login-title">Create Account</h1>
            <p className="login-subtitle">MPLADS Intelligence Platform</p>
          </div>
        </div>

        <div className="login-divider" />

        <div className="login-classification">
          <span className="login-class-dot" />
          RESTRICTED — AUTHORISED PERSONNEL ONLY
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="signup-row">
            <div className="login-field">
              <label className="login-label" htmlFor="su-user">Username</label>
              <input
                id="su-user"
                ref={userRef}
                className={`login-input${error ? ' login-input-error' : ''}`}
                type="text"
                autoComplete="username"
                spellCheck={false}
                value={username}
                onChange={e => { setUsername(e.target.value); setError(''); }}
                disabled={loading}
                placeholder="e.g. jsmith"
              />
            </div>
            <div className="login-field">
              <label className="login-label" htmlFor="su-name">Display name</label>
              <input
                id="su-name"
                className="login-input"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                disabled={loading}
                placeholder="Your full name (optional)"
              />
            </div>
          </div>

          <div className="signup-row">
            <div className="login-field">
              <label className="login-label" htmlFor="su-pass">Password</label>
              <div className="login-pass-wrap">
                <input
                  id="su-pass"
                  className={`login-input login-input-pass${error ? ' login-input-error' : ''}`}
                  type={showPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  disabled={loading}
                  placeholder="Min. 6 characters"
                />
                <button type="button" className="login-pass-toggle"
                  onClick={() => setShowPass(v => !v)} tabIndex={-1}
                  aria-label={showPass ? 'Hide password' : 'Show password'}>
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <div className="login-field">
              <label className="login-label" htmlFor="su-confirm">Confirm password</label>
              <input
                id="su-confirm"
                className={`login-input${error && password !== confirm ? ' login-input-error' : ''}`}
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={e => { setConfirm(e.target.value); setError(''); }}
                disabled={loading}
                placeholder="Re-enter password"
              />
            </div>
          </div>

          {/* Role selector */}
          <div className="login-field">
            <label className="login-label">Role</label>
            <div className="signup-role-grid">
              {ROLE_OPTIONS.map(opt => (
                <label key={opt.value} className={`signup-role-card${role === opt.value ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="role"
                    value={opt.value}
                    checked={role === opt.value}
                    onChange={() => setRole(opt.value)}
                    disabled={loading}
                  />
                  <span className="signup-role-name">{opt.label}</span>
                  <span className="signup-role-desc">{opt.desc}</span>
                </label>
              ))}
            </div>
            {selectedRole && (
              <p className="signup-role-hint">
                <strong>{selectedRole.label}:</strong> {selectedRole.desc}
              </p>
            )}
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
            disabled={loading || !username.trim() || !password || !confirm}
          >
            {loading ? (
              <span className="login-spinner"><span /><span /><span /></span>
            ) : (
              'Create Account →'
            )}
          </button>

          <button type="button" className="signup-back-btn" onClick={onBack} disabled={loading}>
            ← Back to Sign In
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
