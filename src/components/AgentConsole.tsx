'use client';

import { useState } from 'react';
import type { AgentResult, DashboardData } from '@/lib/types';
import { api, LAYER_LABEL, money } from './api';

// A syntactically valid Testnet address that is not on anyone's whitelist by default (from the XRPL docs).
const UNKNOWN_ADDRESS = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

const HEADLINE: Record<string, { title: string; tone: string }> = {
  EXECUTED: { title: 'Paid autonomously', tone: 'border-df-yellow' },
  PENDING_HITL: { title: 'Sent to you for approval', tone: 'border-white' },
  BLOCKED: { title: 'Blocked', tone: 'border-white' },
  FAILED: { title: 'Could not complete', tone: 'border-df-line' },
};

export function AgentConsole({ data, isAdmin, onDone }: { data: DashboardData; isAdmin: boolean; onDone: () => Promise<void> | void }) {
  const [prompt, setPrompt] = useState('');
  const [redTeam, setRedTeam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vendor = data.vendors[0];
  const perTx = Number(data.policy.perTxLimitRlusd);
  const small = Math.max(1, Math.min(5, Math.floor(perTx / 2) || 1));
  const examples = [
    vendor && { tag: 'Routine', text: `Pay ${vendor.label} ${small} RLUSD for invoice 1042` },
    vendor && { tag: 'Over the limit', text: `Pay ${vendor.label} ${Math.ceil(perTx * 2) || 50} RLUSD for the quarterly order` },
    vendor && { tag: 'Payroll', text: `Pay ${vendor.label} ${small} RLUSD for this month's salary` },
    { tag: 'Unknown recipient', text: `Pay 5 RLUSD to ${UNKNOWN_ADDRESS}` },
  ].filter(Boolean) as { tag: string; text: string }[];

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // 202 (needs approval), 403 (blocked) and 502 (failed) are outcomes, not transport errors.
      const r = await api<AgentResult & { error?: { message: string } }>('/api/agent', {
        method: 'POST',
        body: { prompt, redTeam },
        okStatuses: [403, 502],
      });
      if (r.error) throw new Error(r.error.message);
      setResult(r);
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const head = result ? HEADLINE[result.status] : null;

  return (
    <section className="card" aria-labelledby="console-h">
      <p className="eyebrow">Agent</p>
      <h2 id="console-h" className="card-title">
        Give the agent an instruction
      </h2>
      <p className="hint mt-1">
        Write it the way you would tell a colleague. The agent turns it into one precise payment, then your rules decide what happens.
        {!data.config.llm && ' (Language model not configured: using the built-in parser.)'}
      </p>

      <form onSubmit={run} className="mt-4">
        <label htmlFor="prompt" className="sr-only">
          Instruction for the agent
        </label>
        <textarea
          id="prompt"
          className="input min-h-[88px] resize-y"
          maxLength={500}
          placeholder={vendor ? `Pay ${vendor.label} 12.50 RLUSD for invoice 884` : 'Approve a vendor first, then: Pay <vendor> 12.50 RLUSD for invoice 884'}
          value={prompt}
          disabled={!isAdmin}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Example instructions">
          {examples.map((ex) => (
            <button key={ex.tag} type="button" className="badge border-df-line text-neutral-200 hover:border-df-yellow" disabled={!isAdmin} onClick={() => setPrompt(ex.text)}>
              Try: {ex.tag}
            </button>
          ))}
        </div>

        {data.config.redTeam && isAdmin && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-df-line p-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#FFD60A]" checked={redTeam} onChange={(e) => setRedTeam(e.target.checked)} />
            <span>
              <span className="font-semibold">Stress test: skip Delta Finance’s own checks</span>
              <span className="hint block">
                Sends a forbidden payment straight to the agent’s wallet to show that Privy refuses to sign it on its own. Nothing is ever submitted to the ledger from this
                mode.
              </span>
            </span>
          </label>
        )}

        <button className="btn-primary mt-4 w-full sm:w-auto" disabled={busy || !isAdmin || !prompt.trim()}>
          {busy ? 'Agent is working…' : 'Send to agent'}
        </button>
      </form>

      <div aria-live="polite" className="mt-4">
        {busy && (
          <p className="hint flex items-center gap-2 text-sm">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-df-yellow" aria-hidden /> Reading the instruction, checking your limits, settling on the
            XRP Ledger…
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-df-line p-3 text-sm">
            <span className="font-semibold text-df-yellow">The agent couldn’t run.</span> {error}
          </p>
        )}
        {result && head && (
          <div className={`rounded-lg border p-4 ${head.tone}`}>
            <p className="text-base font-semibold">
              {head.title}
              {result.status === 'BLOCKED' && result.blockedBy && <span className="font-normal text-neutral-300"> by {LAYER_LABEL[result.blockedBy]}</span>}
            </p>
            {result.reason && <p className="mt-1 text-sm text-neutral-300">{result.reason}</p>}
            {result.status === 'PENDING_HITL' && <p className="mt-1 text-sm text-neutral-300">It is waiting in “Needs your approval”.</p>}
            {result.intent && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-neutral-300">
                  What the agent understood: <span className="mono text-white">{money(result.intent.amount)} RLUSD</span>
                  {result.intent.is_payroll && ' · payroll'}
                </summary>
                <pre className="mono mt-2 overflow-x-auto rounded bg-black p-3 text-xs text-neutral-200">{JSON.stringify(result.intent, null, 2)}</pre>
              </details>
            )}
            {result.txHash && (
              <a className="mt-3 inline-block text-sm font-semibold text-df-yellow underline" href={`${data.config.explorerTx}${result.txHash}`} target="_blank" rel="noreferrer">
                View the transaction on the XRPL explorer
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
