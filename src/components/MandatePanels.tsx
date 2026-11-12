'use client';

import { useEffect, useState } from 'react';
import type { WalletStatus } from '@/lib/types';
import { api, money, shortAddress, timeAgo } from './api';
import type { PanelProps } from './Dashboard';

type SyncResult = { privySync?: { ok: boolean; skipped?: boolean; error?: string } };
const syncNote = (r: SyncResult) =>
  r.privySync?.ok ? ' Mirrored to the wallet policy.' : r.privySync?.skipped ? '' : ` Wallet policy sync failed: ${r.privySync?.error ?? 'unknown error'}`;

// ───────────────────────────── 1. What can the agent do? ─────────────────────────────

export function MandatePanel({ data, isAdmin, onChange, notify }: PanelProps) {
  const [daily, setDaily] = useState(data.policy.dailyLimitRlusd);
  const [perTx, setPerTx] = useState(data.policy.perTxLimitRlusd);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the form in step with the server unless the admin is editing.
  useEffect(() => {
    if (!dirty) {
      setDaily(data.policy.dailyLimitRlusd);
      setPerTx(data.policy.perTxLimitRlusd);
    }
  }, [data.policy.dailyLimitRlusd, data.policy.perTxLimitRlusd, dirty]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await api<SyncResult>('/api/policy', { method: 'PUT', body: { dailyLimitRlusd: daily, perTxLimitRlusd: perTx } });
      setDirty(false);
      notify(`Limits saved.${syncNote(r)}`);
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card" aria-labelledby="mandate-h">
      <p className="eyebrow">What can the agent do?</p>
      <h2 id="mandate-h" className="card-title">
        Spending limits
      </h2>
      <p className="hint mt-1">Payments inside these limits run on their own. Anything above them, and all payroll, waits for your approval.</p>
      <form onSubmit={save} className="mt-4 space-y-4">
        <div>
          <label htmlFor="daily" className="label">
            Daily limit (RLUSD)
          </label>
          <input
            id="daily"
            className="input mono"
            inputMode="decimal"
            value={daily}
            disabled={!isAdmin}
            onChange={(e) => {
              setDaily(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div>
          <label htmlFor="pertx" className="label">
            Per-payment limit (RLUSD)
          </label>
          <input
            id="pertx"
            className="input mono"
            inputMode="decimal"
            value={perTx}
            disabled={!isAdmin}
            aria-describedby="pertx-help"
            onChange={(e) => {
              setPerTx(e.target.value);
              setDirty(true);
            }}
          />
          <p id="pertx-help" className="hint mt-1 text-xs">
            Also written into the agent’s wallet policy at Privy, where the agent cannot change it.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm">
            <span className="font-semibold text-df-yellow">Not saved.</span> {error}
          </p>
        )}
        {isAdmin && (
          <button className="btn-primary w-full" disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save limits'}
          </button>
        )}
      </form>
      <p className="hint mt-3 text-xs">
        {data.policy.privySyncedAt ? `Wallet policy last synced ${timeAgo(data.policy.privySyncedAt)}.` : 'Wallet policy not synced yet. Set up the agent wallet first.'}
      </p>
    </section>
  );
}

// ───────────────────────────── 2. Who can it pay? ─────────────────────────────

export function VendorPanel({ data, isAdmin, onChange, notify }: PanelProps) {
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<SyncResult>('/api/vendors', { method: 'POST', body: { label, xrplAddress: address, country } });
      notify(`${label} approved.${syncNote(r)}`);
      setLabel('');
      setAddress('');
      setCountry('');
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Remove ${name}? The agent will no longer be able to pay them.`)) return;
    try {
      const r = await api<SyncResult>(`/api/vendors/${id}`, { method: 'DELETE' });
      notify(`${name} removed.${syncNote(r)}`);
      await onChange();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  return (
    <section className="card" aria-labelledby="vendors-h">
      <p className="eyebrow">Who can it pay?</p>
      <h2 id="vendors-h" className="card-title">
        Approved vendors
      </h2>
      <p className="hint mt-1">The agent can only pay these XRPL addresses. Nobody, including an administrator, can approve a payment to any other address.</p>

      {data.vendors.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-df-line p-4 text-sm text-neutral-300">No vendors yet. Add your first supplier below.</p>
      ) : (
        <ul className="mt-4 divide-y divide-df-line">
          {data.vendors.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {v.label} {v.country && <span className="badge ml-1 border-df-line text-neutral-300">{v.country}</span>}
                </p>
                <p className="mono text-xs text-neutral-400" title={v.xrplAddress}>
                  {shortAddress(v.xrplAddress)}
                </p>
              </div>
              {isAdmin && (
                <button onClick={() => remove(v.id, v.label)} className="btn-ghost shrink-0" aria-label={`Remove ${v.label}`}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <form onSubmit={add} className="mt-4 space-y-3 border-t border-df-line pt-4">
          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <div>
              <label htmlFor="v-label" className="label">
                Vendor name
              </label>
              <input id="v-label" className="input" required maxLength={60} placeholder="Lagos Textiles Ltd" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div>
              <label htmlFor="v-country" className="label">
                Country
              </label>
              <input
                id="v-country"
                className="input uppercase"
                maxLength={2}
                placeholder="NG"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                aria-describedby="v-country-help"
              />
            </div>
          </div>
          <span id="v-country-help" className="sr-only">
            Optional two-letter country code
          </span>
          <div>
            <label htmlFor="v-address" className="label">
              XRPL address
            </label>
            <input id="v-address" className="input mono" required placeholder="r…" value={address} onChange={(e) => setAddress(e.target.value.trim())} />
          </div>
          {error && (
            <p role="alert" className="text-sm">
              <span className="font-semibold text-df-yellow">Not added.</span> {error}
            </p>
          )}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Adding…' : 'Approve vendor'}
          </button>
        </form>
      )}
    </section>
  );
}

// ───────────────────────────── Agent wallet ─────────────────────────────

export function WalletPanel({ data, wallet, isAdmin, onChange, notify }: PanelProps & { wallet: WalletStatus }) {
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(wallet?.activated && wallet.rlusdTrustline && data.policy.privySyncedAt);

  async function setup() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ steps: string[] }>('/api/agent/wallet', { method: 'POST' });
      setSteps(r.steps);
      notify('Agent wallet is set up.');
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="wallet-h">
      <p className="eyebrow">Agent wallet</p>
      <h2 id="wallet-h" className="card-title">
        {data.agentWallet ? 'Privy server wallet' : 'Not set up yet'}
      </h2>
      {data.agentWallet ? (
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-400">Address</dt>
            <dd className="mono" title={data.agentWallet.address}>
              {shortAddress(data.agentWallet.address)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-400">RLUSD balance</dt>
            <dd className="mono">{wallet ? money(wallet.rlusdBalance) : '…'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-400">XRP (fees and reserve)</dt>
            <dd className="mono">{wallet ? money(wallet.xrpBalance) : '…'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-400">RLUSD trust line</dt>
            <dd>{wallet?.rlusdTrustline ? 'Set' : 'Missing'}</dd>
          </div>
        </dl>
      ) : (
        <p className="hint mt-1">Creates the agent’s wallet at Privy, activates it on Testnet, opens an RLUSD trust line and attaches your limits. Takes about 20 seconds.</p>
      )}
      {wallet && !wallet.reachable && <p className="hint mt-2 text-xs">The ledger could not be reached just now; balances may be out of date.</p>}
      {wallet?.activated && wallet.rlusdTrustline && Number(wallet.rlusdBalance) === 0 && (
        <p className="mt-3 rounded-lg border border-df-yellow p-3 text-sm">
          The wallet has no RLUSD yet. Get test RLUSD at{' '}
          <a className="font-semibold text-df-yellow underline" href="https://tryrlusd.com" target="_blank" rel="noreferrer">
            tryrlusd.com
          </a>{' '}
          and send it to the address above.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm">
          <span className="font-semibold text-df-yellow">Setup stopped.</span> {error}
        </p>
      )}
      {steps.length > 0 && (
        <ul className="hint mt-3 list-inside list-disc text-xs">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      {isAdmin && !ready && (
        <button onClick={setup} disabled={busy || !data.config.privy} className="btn-primary mt-4 w-full">
          {busy ? 'Setting up… (about 20 s)' : data.agentWallet ? 'Finish setup' : 'Set up agent wallet'}
        </button>
      )}
      {!data.config.privy && <p className="hint mt-2 text-xs">Add PRIVY_APP_ID and PRIVY_APP_SECRET to the server to enable this.</p>}
    </section>
  );
}

// ───────────────────────────── Secret codes ─────────────────────────────

export function SecretCodePanel({ data, isAdmin, onChange, notify }: PanelProps) {
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = data.secretCodes.filter((c) => c.state === 'ACTIVE');

  async function generate() {
    setBusy(true);
    try {
      const r = await api<{ code: string }>('/api/secret-codes', { method: 'POST', body: {} });
      setFresh(r.code);
      await onChange();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/api/secret-codes/${id}`, { method: 'DELETE' });
      await onChange();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  return (
    <section className="card" aria-labelledby="codes-h">
      <p className="eyebrow">Approvals</p>
      <h2 id="codes-h" className="card-title">
        Approval codes
      </h2>
      <p className="hint mt-1">A one-time code unlocks one payment that needs approval. You still sign the payment yourself in Xaman.</p>

      {fresh && (
        <div className="mt-4 rounded-lg border border-df-yellow p-3" role="status">
          <p className="text-sm font-semibold text-df-yellow">Copy this code now. It will not be shown again.</p>
          <p className="mono mt-2 select-all break-all text-base">{fresh}</p>
          <div className="mt-3 flex gap-2">
            <button
              className="btn-ghost"
              onClick={() => navigator.clipboard?.writeText(fresh).then(() => notify('Code copied.'), () => notify('Copy failed. Select the code and copy it manually.'))}
            >
              Copy
            </button>
            <button className="btn-ghost" onClick={() => setFresh(null)}>
              I’ve saved it
            </button>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <ul className="mt-4 divide-y divide-df-line text-sm">
          {active.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="mono">DF-{c.prefix}-•••••</span>
                <span className="hint ml-2 text-xs">expires {new Date(c.expiresAt).toLocaleString()}</span>
              </span>
              {isAdmin && (
                <button className="btn-ghost" onClick={() => revoke(c.id)} aria-label={`Revoke code DF-${c.prefix}`}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isAdmin && (
        <button onClick={generate} disabled={busy} className="btn-primary mt-4 w-full">
          {busy ? 'Generating…' : 'Generate approval code'}
        </button>
      )}
    </section>
  );
}
