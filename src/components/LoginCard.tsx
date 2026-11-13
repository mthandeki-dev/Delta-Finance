'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from './api';

type SignIn = { uuid: string; qrPng: string; deeplink: string };
type Poll = { state: 'pending' | 'signed' | 'rejected' | 'expired' };
type AuthTab = 'xaman' | 'password';

export function LoginCard() {
  const [tab, setTab] = useState<AuthTab>('xaman');

  return (
    <div className="card w-full max-w-sm">
      <div className="mb-5 flex rounded-lg border border-df-line bg-black p-1">
        <button
          onClick={() => setTab('xaman')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${tab === 'xaman' ? 'bg-df-panel text-white' : 'text-neutral-400 hover:text-white'}`}
        >
          Xaman Wallet
        </button>
        <button
          onClick={() => setTab('password')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${tab === 'password' ? 'bg-df-panel text-white' : 'text-neutral-400 hover:text-white'}`}
        >
          Username / Password
        </button>
      </div>

      {tab === 'xaman' ? <XamanPanel /> : <PasswordPanel />}
    </div>
  );
}

function XamanPanel() {
  const [request, setRequest] = useState<SignIn | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  async function start() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<SignIn>('/api/auth/xaman', { method: 'POST' });
      setRequest(r);
      timer.current = setInterval(async () => {
        try {
          const p = await api<Poll>(`/api/auth/xaman/${r.uuid}`);
          if (p.state === 'pending') return;
          if (timer.current) clearInterval(timer.current);
          if (p.state === 'signed') {
            window.location.href = '/dashboard';
          } else {
            setRequest(null);
            setMessage(p.state === 'expired' ? 'That request expired. Please try again.' : 'Sign-in was declined in Xaman.');
          }
        } catch (e) {
          if (timer.current) clearInterval(timer.current);
          setRequest(null);
          setMessage((e as Error).message);
        }
      }, 2000);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div aria-live="polite">
      {!request ? (
        <>
          <h2 className="text-xl font-semibold">Sign in with Xaman</h2>
          <p className="hint mt-1">Use your XRP Ledger wallet. No password, and your keys never leave your phone.</p>
          <button onClick={start} disabled={busy} className="btn-primary mt-5 w-full">
            {busy ? 'Preparing…' : 'Sign in with Xaman'}
          </button>
          {message && (
            <p role="alert" className="mt-3 text-sm text-white">
              <span className="font-semibold text-df-yellow">Couldn't sign in.</span> {message}
            </p>
          )}
          <p className="hint mt-4 text-xs">XRP Ledger Testnet. Switch Xaman to Testnet under Settings → Advanced.</p>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold">Scan with Xaman</h2>
          <p className="hint mt-1">Open Xaman, scan the code and approve the sign-in.</p>
          <div className="mt-4 flex justify-center rounded-lg bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={request.qrPng} alt="QR code to sign in with Xaman" width={220} height={220} />
          </div>
          <a href={request.deeplink} className="btn-ghost mt-4 w-full">
            On your phone? Open Xaman
          </a>
          <p className="hint mt-3 flex items-center gap-2 text-xs">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-df-yellow" aria-hidden /> Waiting for your approval…
          </p>
        </>
      )}
    </div>
  );
}

function PasswordPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { requirePasswordChange } = await api<{ ok: boolean; requirePasswordChange: boolean }>(
        '/api/auth/login',
        { method: 'POST', body: { identifier, password } },
      );
      window.location.href = requirePasswordChange ? '/change-password' : '/dashboard';
    } catch (e) {
      setError('Email/username or password is incorrect.');
      void e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-live="polite">
      <h2 className="text-xl font-semibold">Sign in</h2>
      <p className="hint mt-1">Use the credentials your administrator provided.</p>

      <div className="mt-5 flex flex-col gap-3">
        <div>
          <label className="label" htmlFor="identifier">Username or email</label>
          <input
            id="identifier"
            className="input"
            type="text"
            placeholder="username or email"
            autoComplete="username email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="password">Password</label>
          <div className="relative">
            <input
              id="password"
              className="input pr-16"
              type={showPw ? 'text' : 'password'}
              placeholder="Your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-white"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-white">
          <span className="font-semibold text-df-yellow">Error.</span> {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary mt-5 w-full">
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
