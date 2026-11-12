'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from './api';

type SignIn = { uuid: string; qrPng: string; deeplink: string };
type Poll = { state: 'pending' | 'signed' | 'rejected' | 'expired' };

export function LoginCard() {
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
    <div className="card w-full max-w-sm" aria-live="polite">
      {!request ? (
        <>
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="hint mt-1">Use your Xaman wallet. No password, and your keys never leave your phone.</p>
          <button onClick={start} disabled={busy} className="btn-primary mt-5 w-full">
            {busy ? 'Preparing…' : 'Sign in with Xaman'}
          </button>
          {message && (
            <p role="alert" className="mt-3 text-sm text-white">
              <span className="font-semibold text-df-yellow">Couldn’t sign in.</span> {message}
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
