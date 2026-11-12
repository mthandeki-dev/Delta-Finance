'use client';

import { useEffect, useRef, useState } from 'react';
import type { DashboardData, TxView } from '@/lib/types';
import { api, LAYER_LABEL, localEquivalent, money, shortAddress, STATUS_LABEL, timeAgo } from './api';
import type { PanelProps } from './Dashboard';

function StatusBadge({ tx }: { tx: TxView }) {
  const tone =
    tx.status === 'EXECUTED'
      ? 'border-df-yellow bg-df-yellow text-black'
      : tx.status === 'BLOCKED' || tx.status === 'REJECTED'
        ? 'border-white bg-white text-black'
        : tx.status === 'FAILED'
          ? 'border-neutral-500 text-neutral-300'
          : 'border-df-yellow text-df-yellow';
  return <span className={`badge ${tone}`}>{STATUS_LABEL[tx.status]}</span>;
}

const payee = (tx: TxView) => tx.vendorLabel ?? shortAddress(tx.merchantAddress);

// ───────────────────────────── Needs your approval (HITL) ─────────────────────────────

export function ApprovalQueue({ data, isAdmin, onChange, notify }: PanelProps) {
  const [open, setOpen] = useState<TxView | null>(null);
  const waiting = data.transactions.filter((t) => t.status === 'PENDING_HITL' || t.status === 'AWAITING_SIGNATURE');

  async function reject(tx: TxView) {
    if (!window.confirm(`Decline the payment of ${money(tx.amountRlusd)} RLUSD to ${payee(tx)}?`)) return;
    try {
      await api(`/api/transactions/${tx.id}/reject`, { method: 'POST' });
      notify('Payment declined.');
      await onChange();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  return (
    <section className="card" aria-labelledby="approvals-h">
      <p className="eyebrow">Human in the loop</p>
      <h2 id="approvals-h" className="card-title">
        Needs your approval {waiting.length > 0 && <span className="badge ml-1 border-df-yellow bg-df-yellow text-black">{waiting.length}</span>}
      </h2>
      {waiting.length === 0 ? (
        <p className="hint mt-3">Nothing is waiting. Payments over your limits, and all payroll, will appear here.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {waiting.map((tx) => (
            <li key={tx.id} className="rounded-lg border border-df-line p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    <span className="mono">{money(tx.amountRlusd)}</span> RLUSD to {payee(tx)}
                  </p>
                  {localEquivalent(tx.amountRlusd, data.config.displayFx) && <p className="hint text-xs">{localEquivalent(tx.amountRlusd, data.config.displayFx)} (indicative)</p>}
                  <p className="hint mt-1 text-sm">{tx.reason}</p>
                  <p className="hint mt-1 truncate text-xs" title={tx.prompt}>
                    “{tx.prompt}”
                  </p>
                </div>
                <StatusBadge tx={tx} />
              </div>
              {isAdmin && (
                <div className="mt-3 flex gap-2">
                  <button className="btn-primary" onClick={() => setOpen(tx)}>
                    {tx.status === 'AWAITING_SIGNATURE' ? 'Check signature' : 'Review and approve'}
                  </button>
                  {tx.status === 'PENDING_HITL' && (
                    <button className="btn-ghost" onClick={() => reject(tx)}>
                      Decline
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <ApproveDialog
          tx={open}
          data={data}
          onClose={async () => {
            setOpen(null);
            await onChange();
          }}
        />
      )}
    </section>
  );
}

type Sign = { qrPng: string; deeplink: string; pushed: boolean };
type StatusPoll = { status: TxView['status']; txHash?: string | null; reason?: string | null; note?: string };

function ApproveDialog({ tx, data, onClose }: { tx: TxView; data: DashboardData; onClose: () => void }) {
  const resuming = tx.status === 'AWAITING_SIGNATURE';
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sign, setSign] = useState<Sign | null>(null);
  const [polling, setPolling] = useState(resuming);
  const [final, setFinal] = useState<StatusPoll | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // The parent re-renders on every poll; keep the latest onClose without re-running the focus effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    (inputRef.current ?? closeRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Poll the signature + ledger status once the request is out.
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(async () => {
      try {
        const s = await api<StatusPoll>(`/api/transactions/${tx.id}/status`);
        setNote(s.note ?? null);
        if (s.status !== 'AWAITING_SIGNATURE') {
          setFinal(s);
          setPolling(false);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }, 2500);
    return () => clearInterval(t);
  }, [polling, tx.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSign(await api<Sign>(`/api/transactions/${tx.id}/approve`, { method: 'POST', body: { code } }));
      setPolling(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const step = final ? 3 : sign || resuming ? 2 : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="approve-h" className="card max-h-[92vh] w-full max-w-md overflow-y-auto border-df-yellow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Step {step} of 3</p>
            <h3 id="approve-h" className="card-title">
              Approve payment
            </h3>
          </div>
          <button ref={closeRef} onClick={onClose} className="btn-ghost" aria-label="Close">
            Close
          </button>
        </div>

        <dl className="mt-4 space-y-1.5 rounded-lg bg-black p-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-400">Amount</dt>
            <dd className="mono font-semibold">{money(tx.amountRlusd)} RLUSD</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-400">To</dt>
            <dd className="text-right">
              {tx.vendorLabel ?? 'Unknown'} <span className="mono block text-xs text-neutral-400">{tx.merchantAddress}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-400">Why it needs you</dt>
            <dd className="max-w-[60%] text-right">{tx.reason}</dd>
          </div>
        </dl>

        <div aria-live="polite">
          {step === 1 && (
            <form onSubmit={submit} className="mt-4">
              <label htmlFor="hitl-code" className="label">
                Approval code
              </label>
              <input
                id="hitl-code"
                ref={inputRef}
                className="input mono uppercase"
                autoComplete="one-time-code"
                placeholder="DF-XXXXXX-XXXXX-XXXXX-XXXXX"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <p className="hint mt-1 text-xs">Generate one under “Approval codes”. Each code works once.</p>
              {error && (
                <p role="alert" className="mt-2 text-sm">
                  <span className="font-semibold text-df-yellow">Not accepted.</span> {error}
                </p>
              )}
              <button className="btn-primary mt-4 w-full" disabled={busy || code.trim().length < 10}>
                {busy ? 'Checking…' : 'Continue to signature'}
              </button>
            </form>
          )}

          {step === 2 && (
            <div className="mt-4">
              <p className="text-sm">
                {sign?.pushed ? 'We sent a sign request to Xaman on your phone.' : resuming && !sign ? 'A sign request is open in Xaman on your phone.' : 'Scan with Xaman to sign.'}{' '}
                You are signing the payment from your own wallet.
              </p>
              {sign && (
                <>
                  <div className="mt-3 flex justify-center rounded-lg bg-white p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sign.qrPng} alt="QR code to sign this payment in Xaman" width={200} height={200} />
                  </div>
                  <a href={sign.deeplink} className="btn-ghost mt-3 w-full">
                    Open in Xaman
                  </a>
                </>
              )}
              <p className="hint mt-3 flex items-center gap-2 text-xs">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-df-yellow" aria-hidden /> {note ?? 'Waiting for your signature…'}
              </p>
              {error && (
                <p role="alert" className="mt-2 text-sm">
                  {error}
                </p>
              )}
            </div>
          )}

          {step === 3 && final && (
            <div className="mt-4">
              <p className="text-base font-semibold">{final.status === 'EXECUTED' ? 'Payment sent and confirmed on the ledger.' : `${STATUS_LABEL[final.status]}.`}</p>
              {final.reason && final.status !== 'EXECUTED' && <p className="hint mt-1 text-sm">{final.reason}</p>}
              {final.txHash && (
                <a className="mt-2 inline-block text-sm font-semibold text-df-yellow underline" href={`${data.config.explorerTx}${final.txHash}`} target="_blank" rel="noreferrer">
                  View on the XRPL explorer
                </a>
              )}
              <button className="btn-primary mt-4 w-full" onClick={onClose}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── 4. How do I prove what it did? ─────────────────────────────

export function ActivityTable({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState<'ALL' | 'AUTONOMOUS' | 'HITL' | 'BLOCKED'>('ALL');
  const rows = data.transactions.filter((t) => filter === 'ALL' || t.route === filter);
  const filters = [
    ['ALL', 'All'],
    ['AUTONOMOUS', 'Autonomous'],
    ['HITL', 'Approved by a person'],
    ['BLOCKED', 'Blocked'],
  ] as const;

  return (
    <section className="card" aria-labelledby="activity-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">How do I prove what it did?</p>
          <h2 id="activity-h" className="card-title">
            Activity
          </h2>
          <p className="hint mt-1">Every instruction, the decision, the reason and the ledger transaction.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filter activity" className="flex flex-wrap gap-1">
            {filters.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`badge ${filter === key ? 'border-df-yellow bg-df-yellow text-black' : 'border-df-line text-neutral-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <a href="/api/audit/export" className="btn-ghost">
            Export audit trail (CSV)
          </a>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-df-line p-6 text-center text-sm text-neutral-300">
          No activity yet. Give the agent its first instruction above.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Agent activity, most recent first</caption>
            <thead className="border-b border-df-line text-xs uppercase tracking-wider text-neutral-400">
              <tr>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  When
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Payment
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Outcome
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Why
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Proof
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-df-line">
              {rows.map((tx) => (
                <tr key={tx.id} className="align-top">
                  <td className="whitespace-nowrap py-3 pr-3 text-neutral-300" title={new Date(tx.createdAt).toLocaleString()}>
                    {timeAgo(tx.createdAt)}
                  </td>
                  <td className="py-3 pr-3">
                    {tx.amountRlusd ? (
                      <p className="font-medium">
                        <span className="mono">{money(tx.amountRlusd)}</span> RLUSD → {payee(tx)}
                        {tx.isPayroll && <span className="badge ml-2 border-df-line text-neutral-300">Payroll</span>}
                      </p>
                    ) : (
                      <p className="text-neutral-300">No payment understood</p>
                    )}
                    <p className="hint mt-0.5 max-w-xs truncate text-xs" title={tx.prompt}>
                      “{tx.prompt}”
                    </p>
                  </td>
                  <td className="py-3 pr-3">
                    <StatusBadge tx={tx} />
                    <p className="hint mt-1 text-xs">
                      {tx.status === 'BLOCKED' && tx.blockedBy
                        ? `by ${LAYER_LABEL[tx.blockedBy]}`
                        : tx.route === 'AUTONOMOUS'
                          ? 'Autonomous'
                          : tx.route === 'HITL'
                            ? 'Human approval'
                            : ''}
                    </p>
                  </td>
                  <td className="max-w-sm py-3 pr-3 text-neutral-300">{tx.reason ?? (tx.status === 'EXECUTED' ? 'Within limits, approved vendor.' : '—')}</td>
                  <td className="py-3">
                    {tx.txHash ? (
                      <a className="mono text-df-yellow underline" href={`${data.config.explorerTx}${tx.txHash}`} target="_blank" rel="noreferrer" aria-label={`View transaction ${tx.txHash} on the explorer`}>
                        {tx.txHash.slice(0, 8)}…
                      </a>
                    ) : (
                      <span className="text-neutral-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
