'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentResult, DashboardData } from '@/lib/types';
import { api, LAYER_LABEL, money } from './api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

const UNKNOWN_ADDRESS = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

const HEADLINE: Record<string, { title: string; tone: string }> = {
  EXECUTED: { title: 'Paid autonomously', tone: 'border-df-yellow' },
  PENDING_HITL: { title: 'Sent for approval', tone: 'border-white' },
  BLOCKED: { title: 'Blocked', tone: 'border-white' },
  FAILED: { title: 'Could not complete', tone: 'border-df-line' },
};

function MicIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7" aria-hidden>
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

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
    vendor && { tag: 'Over limit', text: `Pay ${vendor.label} ${Math.ceil(perTx * 2) || 50} RLUSD for the quarterly order` },
    vendor && { tag: 'Payroll', text: `Pay ${vendor.label} ${small} RLUSD for this month's salary` },
    { tag: 'Unknown', text: `Pay 5 RLUSD to ${UNKNOWN_ADDRESS}` },
  ].filter(Boolean) as { tag: string; text: string }[];

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
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
        {hasSpeech ? 'Speak or type a payment instruction.' : 'Type a payment instruction below.'}
        {!data.config.llm && ' (Language model not configured: using the built-in parser.)'}
      </p>

      <form onSubmit={run} className="mt-6 space-y-4">

        {/* ── Voice hero ── */}
        {hasSpeech && (
          <div className="flex flex-col items-center gap-3 py-6">
            {/* Outer glow rings */}
            <div className="relative flex items-center justify-center">
              {recording && (
                <>
                  <span className="absolute h-36 w-36 animate-ping rounded-full bg-df-yellow/10" style={{ animationDuration: '1.5s' }} aria-hidden />
                  <span className="absolute h-28 w-28 animate-ping rounded-full bg-df-yellow/15" style={{ animationDuration: '1.5s', animationDelay: '0.3s' }} aria-hidden />
                </>
              )}

              {/* Main mic button */}
              <button
                type="button"
                onClick={toggleRecording}
                disabled={busy}
                aria-label={recording ? 'Stop recording' : 'Start voice recording'}
                className={`relative z-10 flex h-24 w-24 items-center justify-center rounded-full border-2 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-df-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                  recording
                    ? 'border-df-yellow bg-df-yellow/10 text-df-yellow shadow-[0_0_40px_rgba(255,214,10,0.25)]'
                    : 'border-df-line bg-df-panel text-neutral-400 hover:border-df-yellow hover:bg-df-yellow/5 hover:text-df-yellow hover:shadow-[0_0_20px_rgba(255,214,10,0.1)]'
                }`}
              >
                {recording ? <StopIcon /> : <MicIcon size={34} />}
              </button>
            </div>

            <p className={`text-sm font-medium transition-colors ${recording ? 'text-df-yellow' : 'text-df-mute'}`}>
              {recording ? 'Listening — tap to stop' : 'Tap to speak'}
            </p>
          </div>
        )}

        {/* ── Transcript / text input ── */}
        <div>
          {hasSpeech && (
            <p className="mb-1.5 text-xs text-df-mute">
              {prompt ? 'Review and edit if needed' : 'Or type your instruction'}
            </p>
          )}
          <label htmlFor="prompt" className="sr-only">Instruction for the agent</label>
          <textarea
            id="prompt"
            className={`input resize-y transition-all ${hasSpeech ? 'min-h-[80px]' : 'min-h-[160px]'}`}
            maxLength={500}
            placeholder={
              vendor
                ? `Pay ${vendor.label} 12.50 RLUSD for invoice 884`
                : 'Approve a vendor first, then: Pay <vendor> 12.50 RLUSD for invoice 884'
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        {micError && (
          <p role="alert" className="text-xs text-neutral-400">
            <span className="text-df-yellow">Mic error.</span> {micError}
          </p>
        )}

        {/* ── Example chips ── */}
        <div className="flex flex-wrap gap-2" aria-label="Example instructions">
          {examples.map((ex) => (
            <button
              key={ex.tag}
              type="button"
              className="badge border-df-line text-neutral-200 hover:border-df-yellow hover:text-white"
              onClick={() => setPrompt(ex.text)}
            >
              Try: {ex.tag}
            </button>
          ))}
        </div>

        {/* ── Red-team toggle (admin only) ── */}
        {data.config.redTeam && isAdmin && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-df-line p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[#FFD60A]"
              checked={redTeam}
              onChange={(e) => setRedTeam(e.target.checked)}
            />
            <span>
              <span className="font-semibold">Stress test: skip Delta Finance own checks</span>
              <span className="hint block">
                Sends a forbidden payment straight to the agent wallet to show that Privy refuses to sign it on its own. Nothing is ever submitted from this mode.
              </span>
            </span>
          </label>
        )}

        {/* ── Send button ── */}
        <button
          className="btn-primary w-full py-3 text-base"
          disabled={busy || !prompt.trim()}
        >
          {busy ? 'Agent is working...' : 'Send to agent'}
        </button>
      </form>

      {/* ── Result ── */}
      <div aria-live="polite" className="mt-4">
        {busy && (
          <p className="hint flex items-center gap-2 text-sm">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-df-yellow" aria-hidden />
            Reading the instruction, checking your limits, settling on the XRP Ledger...
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-df-line p-3 text-sm">
            <span className="font-semibold text-df-yellow">The agent could not run.</span> {error}
          </p>
        )}
        {result && head && (
          <div className={`rounded-lg border p-4 ${head.tone}`}>
            <p className="text-base font-semibold">
              {head.title}
              {result.status === 'BLOCKED' && result.blockedBy && (
                <span className="font-normal text-neutral-300"> by {LAYER_LABEL[result.blockedBy]}</span>
              )}
            </p>
            {result.reason && <p className="mt-1 text-sm text-neutral-300">{result.reason}</p>}
            {result.status === 'PENDING_HITL' && (
              <p className="mt-1 text-sm text-neutral-300">
                {isAdmin
                  ? 'It is waiting for your approval in the section below.'
                  : 'It has been sent to an administrator for approval.'}
              </p>
            )}
            {result.intent && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-neutral-300">
                  What the agent understood: <span className="mono text-white">{money(result.intent.amount)} RLUSD</span>
                  {result.intent.is_payroll && ' - payroll'}
                </summary>
                <pre className="mono mt-2 overflow-x-auto rounded bg-black p-3 text-xs text-neutral-200">
                  {JSON.stringify(result.intent, null, 2)}
                </pre>
              </details>
            )}
            {result.txHash && (
              <a
                className="mt-3 inline-block text-sm font-semibold text-df-yellow underline"
                href={`${data.config.explorerTx}${result.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View the transaction on the XRPL explorer
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
