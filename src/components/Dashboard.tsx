'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardData, FinanceAdmin, InventoryItem, WalletStatus } from '@/lib/types';
import { ActivityTable, ApprovalQueue } from './Activity';
import { AgentConsole } from './AgentConsole';
import { AnalyticsPanel } from './AnalyticsPanel';
import { api, localEquivalent, money, shortAddress } from './api';
import { FinanceAdminPanel } from './FinanceAdminPanel';
import { InventoryPanel } from './InventoryPanel';
import { Logo } from './Logo';
import { MandatePanel, SecretCodePanel, VendorPanel, WalletPanel } from './MandatePanels';

type Section = 'make-payments' | 'agent-setup' | 'payment-history' | 'inventory' | 'analytics';

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: 'make-payments', label: 'Make Payments' },
  { id: 'agent-setup', label: 'Agent Setup' },
  { id: 'payment-history', label: 'Payment History' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'analytics', label: 'Analytics' },
];

function HamburgerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [wallet, setWallet] = useState<WalletStatus>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [financeAdmins, setFinanceAdmins] = useState<FinanceAdmin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('make-payments');
  const [analyticsRefreshKey, setAnalyticsRefreshKey] = useState(0);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!navOpen) return;
    function onDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setNavOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNavOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [navOpen]);

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

  const reloadInventory = useCallback(async () => {
    try {
      setInventory(await api<InventoryItem[]>('/api/inventory'));
    } catch {
      /* non-critical */
    }
  }, []);

  const reloadFinanceAdmins = useCallback(async () => {
    try {
      setFinanceAdmins(await api<FinanceAdmin[]>('/api/finance-admins'));
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    reload();
    reloadWallet();
    reloadInventory();
    reloadFinanceAdmins();
    const a = setInterval(reload, 5000);
    const b = setInterval(reloadWallet, 20000);
    const c = setInterval(reloadInventory, 15000);
    return () => {
      clearInterval(a);
      clearInterval(b);
      clearInterval(c);
    };
  }, [reload, reloadWallet, reloadInventory, reloadFinanceAdmins]);

  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 5000);
  }, []);

  const onStockReceived = useCallback(() => {
    setAnalyticsRefreshKey((k) => k + 1);
  }, []);

  function navigate(section: Section) {
    setActiveSection(section);
    setNavOpen(false);
  }

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

  const activeSectionLabel = NAV_ITEMS.find((n) => n.id === activeSection)?.label ?? '';


  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      {/* ── Sidebar nav ── */}
      {navOpen && <div className="fixed inset-0 z-40 bg-black/60" aria-hidden onClick={() => setNavOpen(false)} />}
      <div
        ref={navRef}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-df-line bg-black transition-transform duration-200 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
        role="dialog"
        aria-label="Navigation menu"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-df-line px-5 py-5">
          <Logo />
          <button
            onClick={() => setNavOpen(false)}
            className="btn-ghost p-1 text-neutral-400 hover:text-white"
            aria-label="Close menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto py-4">
          <ul>
            {NAV_ITEMS.map((item) => {
              const active = activeSection === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => navigate(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full border-l-2 px-6 py-3 text-left text-sm font-medium transition-colors ${
                      active
                        ? 'border-df-yellow bg-white/5 text-df-yellow'
                        : 'border-transparent text-neutral-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* ── Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setNavOpen(true)}
            className="btn-ghost flex items-center gap-1.5 p-2 text-neutral-300 hover:text-white"
            aria-label="Open navigation menu"
            aria-expanded={navOpen}
            aria-controls="main-nav"
          >
            <HamburgerIcon />
          </button>
          <Logo />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="badge border-df-yellow text-df-yellow">XRPL Testnet</span>
          {data.user.xrplAddress ? (
            <span className="mono hidden text-neutral-300 sm:inline" title={data.user.xrplAddress}>
              {shortAddress(data.user.xrplAddress)}
            </span>
          ) : (
            <span className="hidden text-neutral-300 sm:inline">
              {data.user.fullName ?? data.user.username ?? data.user.email ?? 'User'}
            </span>
          )}
          <span className="badge border-df-line text-neutral-200">{isAdmin ? 'Administrator' : 'Read-only'}</span>
          {isAdmin && (
            <a href="/admin/users" className="btn-ghost">
              Users
            </a>
          )}
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

        {/* ── Section heading ── */}
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white">{activeSectionLabel}</h1>
        </div>

        {/* ── Make Payments ── */}
        {activeSection === 'make-payments' && (
          <>
            {/* Chatbox — full width, prominent */}
            <AgentConsole data={data} isAdmin={isAdmin} onDone={reload} />

            {/* Status strip */}
            <section aria-labelledby="status-h" className="grid gap-4 lg:grid-cols-4">
              <h2 id="status-h" className="sr-only">Treasury status</h2>

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
                  Enforced twice: by Delta Finance and by the agent's wallet provider.
                  {localEquivalent(policy.perTxLimitRlusd, config.displayFx) && <> {localEquivalent(policy.perTxLimitRlusd, config.displayFx)}.</>}
                </p>
              </div>
            </section>

            {/* Admin-only: approval queue + secret codes */}
            {isAdmin && (
              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <ApprovalQueue data={data} isAdmin={isAdmin} onChange={reload} notify={notify} />
                <SecretCodePanel data={data} isAdmin={isAdmin} onChange={reload} notify={notify} />
              </div>
            )}
          </>
        )}

        {/* ── Agent Setup ── */}
        {activeSection === 'agent-setup' && (
          <div className="grid gap-6 lg:grid-cols-3">
            <MandatePanel data={data} isAdmin={isAdmin} onChange={reload} notify={notify} />
            <VendorPanel data={data} isAdmin={isAdmin} onChange={reload} notify={notify} />
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
          </div>
        )}

        {/* ── Payment History ── */}
        {activeSection === 'payment-history' && <ActivityTable data={data} />}

        {/* ── Inventory ── */}
        {activeSection === 'inventory' && (
          <div className="space-y-6">
            <InventoryPanel items={inventory} isAdmin={isAdmin} onStockReceived={onStockReceived} />
            {isAdmin && <FinanceAdminPanel initial={financeAdmins} />}
          </div>
        )}

        {/* ── Analytics ── */}
        {activeSection === 'analytics' && <AnalyticsPanel refreshKey={analyticsRefreshKey} />}
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
