import React, { useState } from 'react';
import { ChefHat, Lock, Mail, ShieldCheck, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { authService } from '../services/api';

export default function KitchenLogin({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('HOTEL_ADMIN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberTerminal, setRememberTerminal] = useState(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await authService.login(email.trim(), password, role);
      if (rememberTerminal) {
        localStorage.setItem('kds_remember_terminal', 'true');
        localStorage.setItem('kds_last_email', email.trim());
      }
      onLoginSuccess(data.user);
    } catch (err) {
      console.error('Login error:', err);
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Failed to sign in. Please verify your manager/kitchen credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Prefill last email if saved
  React.useEffect(() => {
    const lastEmail = localStorage.getItem('kds_last_email');
    if (lastEmail) setEmail(lastEmail);
  }, []);

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo-box">
            <ChefHat className="w-10 h-10 text-amber-500" />
          </div>
          <h2 className="login-title">Udipi Kitchen Display</h2>
          <p className="login-subtitle">
            Dedicated KDS Terminal for Kitchen Staff & Prep Stations
          </p>
        </div>

        {error && (
          <div className="login-error-box">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Manager / Staff Email</label>
            <div className="input-wrapper">
              <Mail className="input-icon" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="manager@udipi.com"
                className="form-input"
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password / PIN</label>
            <div className="input-wrapper">
              <Lock className="input-icon" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input"
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Terminal Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="form-select"
            >
              <option value="HOTEL_ADMIN">Hotel Admin / Manager (Full KDS Control)</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="CASHIER">Cashier (View Only)</option>
            </select>
          </div>

          <div className="form-checkbox-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={rememberTerminal}
                onChange={(e) => setRememberTerminal(e.target.checked)}
                className="checkbox-input"
              />
              <span>Remember this Kitchen Display terminal</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="login-submit-btn"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner-border animate-spin" />
                Connecting Terminal...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                Launch Kitchen Screen <ArrowRight className="w-5 h-5" />
              </span>
            )}
          </button>
        </form>

        <div className="login-footer">
          <ShieldCheck className="w-4 h-4 text-emerald-400 inline mr-1.5" />
          <span>Real-time Ticket Sync • Auto-KeepAlive • Instant Ringing</span>
        </div>
      </div>
    </div>
  );
}
