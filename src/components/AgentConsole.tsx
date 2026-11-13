'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentResult, DashboardData } from '@/lib/types';
import { api, LAYER_LABEL, money } from './api';

// The Web Speech API is not fully typed in lib.dom.d.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

function MicIcon({ recording }: { recording: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 ${recording ? 'text-df-yellow' : 'text-neutral-400'}`}
      aria-hidden
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

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

  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [hasSpeech, setHasSpeech] = useState<boolean | null>(null);
  const recognitionRef = useRef<AnySpeechRecognition>(null);

  // Detect browser Speech API support once on mount
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    setHasSpeech(typeof window !== 'undefined' && (!!w.SpeechRecognition || !!w.webkitSpeechRecognition));
  }, []);

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    setMicError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onstart = () => setRecording(true);
    rec.onend = () => setRecording(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      setRecording(false);
      if (e.error === 'not-allowed') setMicError('Microphone access was denied. Allow it in your browser settings.');
      else if (e.error !== 'no-speech') setMicError(`Voice input error: ${e.error}`);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript: string = e.results[0][0].transcript;
      setPrompt((prev) => (prev.trimEnd() ? `${prev.trimEnd()} ${transcript}` : transcript));
    };

    recognitionRef.current = rec;
    rec.start();
  }

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
        <div className="relative">
          <textarea
            id="prompt"
            className="input min-h-[88px] resize-y pr-12"
            maxLength={500}
            placeholder={vendor ? `Pay ${vendor.label} 12.50 RLUSD for invoice 884` : 'Approve a vendor first, then: Pay <vendor> 12.50 RLUSD for invoice 884'}
            value={prompt}
            disabled={!isAdmin}
            onChange={(e) => setPrompt(e.target.value)}
          />
          {isAdmin && hasSpeech && (
            <button
              type="button"
              onClick={toggleRecording}
              title={recording ? 'Stop recording' : 'Dictate instruction'}
              aria-label={recording ? 'Stop voice recording' : 'Start voice recording'}
              className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border transition-colors
                ${recording
                  ? 'border-df-yellow bg-df-yellow/10 hover:bg-df-yellow/20'
                  : 'border-df-line bg-transparent hover:border-neutral-500'}`}
            >
              {recording
                ? <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-df-yellow" aria-hidden />
                : <MicIcon recording={false} />}
            </button>
          )}
        </div>

        {recording && (
          <p className="mt-1.5 flex items-center gap-2 text-xs text-neutral-400" aria-live="polite">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-df-yellow" aria-hidden />
            Listening… speak your instruction, then click the button to stop.
          </p>
        )}
        {micError && (
          <p role="alert" className="mt-1.5 text-xs text-neutral-400">
            <span className="text-df-yellow">Mic error.</span> {micError}
          </p>
        )}

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
