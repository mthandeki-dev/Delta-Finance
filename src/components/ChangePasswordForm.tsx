'use client';

import { useState } from 'react';
import { api } from './api';

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirm) { setError('Passwords do not match.'); return; }
    if (newPassword === currentPassword) { setError('New password must be different from your current password.'); return; }

    setBusy(true);
    try {
      await api('/api/me/password', { method: 'PUT', body: { currentPassword, newPassword } });
      window.location.href = '/dashboard';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-4" aria-live="polite">
      <div>
        <label className="label" htmlFor="current-password">Current (temporary) password</label>
        <div className="relative">
          <input
            id="current-password"
            className="input pr-10"
            type={showCurrent ? 'text' : 'password'}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-white"
            onClick={() => setShowCurrent((v) => !v)}
            aria-label={showCurrent ? 'Hide password' : 'Show password'}
          >
            {showCurrent ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="new-password">New password</label>
        <div className="relative">
          <input
            id="new-password"
            className="input pr-10"
            type={showNew ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-white"
            onClick={() => setShowNew((v) => !v)}
            aria-label={showNew ? 'Hide password' : 'Show password'}
          >
            {showNew ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          className="input"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-white">
          <span className="font-semibold text-df-yellow">Error.</span> {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );
}
