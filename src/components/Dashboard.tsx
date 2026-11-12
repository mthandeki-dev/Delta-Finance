'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DashboardData, WalletStatus } from '@/lib/types';
import { ActivityTable, ApprovalQueue } from './Activity';
import { AgentConsole } from './AgentConsole';
import { api, localEquivalent, money, shortAddress } from './api';
import { Logo } from './Logo';
import { MandatePanel, SecretCodePanel, VendorPanel, WalletPanel } from './MandatePanels';

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [wallet, setWallet] = useState<WalletStatus>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await api<DashboardData>('/api/dashboard'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const reloadWallet = useCallback(async () => {
    try {
      setWallet((await api<{ wallet: WalletStatus }>('/api/agent/wallet')).wallet);
    } catch {
      /* the panel shows the last known state */
    }
  }, []);

  useEffect(() => {
    reload();
    reloadWallet();
    const a = setInterval(reload, 5000);
    const b = setInterval(reloadWallet, 20000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [reload, reloadWallet]);

  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 5000);
  }, []);

  if (!data) {
    return (
      <main id="main" className="flex min-h-screen items-center justify-center" aria-busy="true">
        <p className="hint" role="status">
          {error ?? 'Loading your treasury…'}
        </p>
      </main>
    );
  }

  const isAdmin = data.user.role === 'ADMIN';
  const { policy, config } = data;
  const spent = Number(policy.spentTodayRlusd);
  const daily = Number(policy.dailyLimitRlusd);
  const pct = daily > 0 ? Math.min(100, Math.round((spent / daily) * 100)) : 100;
  const remaining = Math.max(0, daily - spent);

  async function toggleAgent() {
    if (!data) return;
    const next = !data.policy.agentEnabled;
    if (!next || window.confirm('Resume the agent? It will start paying within your limits again.')) {
      setPausing(true);
      try {
        const r = await api<{ privySync: { ok: boolean; skipped?: boolean; error?: string } }>('/api/policy', {
          method: 'PUT',
          body: { agentEnabled: next },
        });
        notify(
          next
            ? 'Agent resumed.'
            : r.privySync.ok
              ? 'Agent paused. Its wallet will refuse to sign payments.'
              : 'Agent paused in Delta Finance.' + (r.privySync.error ? ` Wallet policy sync failed: ${r.privySync.error}` : ''),
        );
        await reload();
      } catch (e) {
        notify((e as Error).message);
      } finally {
        setPausing(false);
      }
    }
  }

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/';
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <Logo />
        <div className="flex items-center gap-3 text-sm">
          <span className="badge border-df-yellow text-df-yellow">XRPL Testnet</span>
          <span className="mono hidden text-neutral-300 sm:inline" title={data.user.xrplAddress}>
            {shortAddress(data.user.xrplAddress)}
          </span>
          <span className="badge border-df-line text-neutral-200">{isAdmin ? 'Administrator' : 'Read-only'}</span>
          <button onClick={signOut} className="btn-ghost">
            Sign out
          </button>
        </div>
      </header>

      <main id="main" className="space-y-6">
        {error && (
          <p role="alert" className="card border-white text-sm">
            <strong className="text-df-yellow">Connection problem.</strong> {error} Showing the last data we received.
          </p>
        )}
        {!isAdmin && (
          <p className="card text-sm text-neutral-300">
            You are signed in with a wallet that is not on the administrator list, so this view is read-only.
          </p>
        )}
        {policy.privySyncError && (
          <p role="alert" className="card border-df-yellow text-sm">
            <strong className="text-df-yellow">Wallet policy out of sync.</strong> The last change could not be mirrored to Privy, so every payment now
            needs human approval. Save the limits again to retry. <span className="text-neutral-400">({policy.privySyncError})</span>
          </p>
        )}

        {/* ── Status strip: the agent, its budget, and the stop button ── */}
        <section aria-labelledby="status-h" className="grid gap-4 lg:grid-cols-4">
          <h1 id="status-h" className="sr-only">
            Treasury status
          </h1>

          <div className={`card flex flex-col justify-between ${policy.agentEnabled ? '' : 'border-white'}`}>
            <div>
              <p className="eyebrow">Agent</p>
              <p className="mt-1 flex items-center gap-2 text-2xl font-bold">
                <span className={`inline-block h-3 w-3 rounded-full ${policy.agentEnabled ? 'bg-df-yellow' : 'bg-white'}`} aria-hidden />
                {policy.agentEnabled ? 'Active' : 'Paused'}
              </p>
              <p className="hint mt-1">{policy.agentEnabled ? 'Paying approved vendors within your limits.' : 'No payments will be made until you resume.'}</p>
            </div>
            {isAdmin && (
              <button onClick={toggleAgent} disabled={pausing} className={`${policy.agentEnabled ? 'btn-danger' : 'btn-primary'} mt-4`}>
                {pausing ? 'Working…' : policy.agentEnabled ? 'Stop the agent' : 'Resume the agent'}
              </button>
            )}
          </div>

          <div className="card lg:col-span-2">
            <p className="eyebrow">Autonomous spend today</p>
            <p className="mt-1 text-2xl font-bold">
              <span className="mono">{money(spent)}</span>
              <span className="text-base font-normal text-neutral-400">
                {' '}
                of <span className="mono">{money(daily)}</span> RLUSD
              </span>
            </p>
            <div
              className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-df-line"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Share of the daily limit used"
            >
              <div className="h-full rounded-full bg-df-yellow" style={{ width: `${pct}%` }} />
            </div>
            <p className="hint mt-2">
              <span className="mono text-white">{money(remaining)}</span> RLUSD left today
              {localEquivalent(remaining, config.displayFx) && <span> ({localEquivalent(remaining, config.displayFx)}, indicative)</span>}. Resets at
              00:00 UTC. Above this, the agent asks you first.
            </p>
          </div>

          <div className="card">
            <p className="eyebrow">Per-payment cap</p>
            <p className="mt-1 text-2xl font-bold">
              <span className="mono">{money(policy.perTxLimitRlusd)}</span> <span className="text-base font-normal text-neutral-400">RLUSD</span>
            </p>
            <p className="hint mt-1">
              Enforced twice: by Delta Finance and by the agent’s wallet provider.
              {localEquivalent(policy.perTxLimitRlusd, config.displayFx) && <> {localEquivalent(policy.perTxLimitRlusd, config.displayFx)}.</>}
            </p>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <AgentConsole data={data} isAdmin={isAdmin} onDone={reload} />
          <ApprovalQueue data={data} isAdmin={isAdmin} onChange={reload} notify={notify} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <MandatePanel data={data} isAdmin={isAdmin} onChange={reload} notify={notify} />
          <VendorPanel data={data} isAdmin={isAdmin} onChange={reload} notify={notify} />
          <div className="space-y-6">
            <WalletPanel
              data={data}
              wallet={wallet}
              isAdmin={isAdmin}
              onChange={async () => {
                await reload();
                await reloadWallet();
              }}
              notify={notify}
            />
            <SecretCodePanel data={data} isAdmin={isAdmin} onChange={reload} notify={notify} />
          </div>
        </div>

        <ActivityTable data={data} />
      </main>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
        {toast && <p className="pointer-events-auto max-w-lg rounded-lg border border-df-yellow bg-black px-4 py-3 text-sm shadow-lg">{toast}</p>}
      </div>
    </div>
  );
}

export type PanelProps = {
  data: DashboardData;
  isAdmin: boolean;
  onChange: () => Promise<void> | void;
  notify: (message: string) => void;
};
