'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentResult, DashboardData } from '@/lib/types';
import { getFillerParts, matchVendors, stripFiller, type TextPart, type VendorMatch } from '@/lib/intent-filter';
import { api, LAYER_LABEL, money } from './api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

const SILENCE_MS    = 5000; // ms of silence before auto-stop
const UNKNOWN_ADDRESS = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

const HEADLINE: Record<string, { title: string; tone: string }> = {
  EXECUTED:     { title: 'Paid autonomously',  tone: 'border-df-yellow/40 bg-df-yellow/[0.05]' },
  PENDING_HITL: { title: 'Sent for approval',  tone: 'border-white/20 bg-white/[0.03]' },
  BLOCKED:      { title: 'Blocked',            tone: 'border-orange-400/40 bg-orange-400/[0.05]' },
  FAILED:       { title: 'Could not complete', tone: 'border-red-400/20 bg-red-400/[0.04]' },
};

function MicIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

// ─── Mic Button ───────────────────────────────────────────────────────────────

type RecState = 'idle' | 'listening' | 'finalising';

function MicButton({ recState, busy, onClick }: { recState: RecState; busy: boolean; onClick: () => void }) {
  const label =
    recState === 'finalising' ? 'Finalising...' :
    recState === 'listening'  ? 'Listening... tap to stop early' :
    'Tap to speak';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || recState === 'finalising'}
      aria-label={recState !== 'idle' ? 'Stop recording' : 'Start voice recording'}
      className={`relative flex w-full items-center justify-center gap-3 rounded-xl border-2 py-4 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-df-cyan/60 disabled:cursor-not-allowed disabled:opacity-40 ${
        recState === 'finalising'
          ? 'border-df-yellow/50 bg-df-yellow/[0.05] text-df-yellow'
          : recState === 'listening'
          ? 'border-red-400/60 bg-red-400/[0.06] text-red-400'
          : 'border-dashed border-white/20 bg-white/[0.02] text-neutral-400 hover:border-df-cyan/40 hover:bg-df-cyan/[0.03] hover:text-df-cyan'
      }`}
    >
      {/* Pulse ring while actively listening */}
      {recState === 'listening' && (
        <span className="pointer-events-none absolute inset-0 rounded-xl border-2 border-red-400/25 animate-ping" aria-hidden />
      )}

      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
        recState === 'finalising' ? 'bg-df-yellow/15' :
        recState === 'listening'  ? 'bg-red-400/20'   : 'bg-white/[0.06]'
      }`}>
        {recState !== 'idle' ? <StopIcon /> : <MicIcon />}
      </span>

      <span className="text-sm font-semibold">{label}</span>

      {recState === 'listening' && (
        <span className="ml-auto mr-1 flex items-center gap-1.5 text-xs text-red-400/80">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" aria-hidden />
          live
        </span>
      )}
      {recState === 'finalising' && (
        <span className="ml-auto mr-1 flex items-center gap-1.5 text-xs text-df-yellow/80">
          <span className="h-1.5 w-1.5 rounded-full bg-df-yellow animate-pulse" aria-hidden />
          processing
        </span>
      )}
    </button>
  );
}

// ─── Telemetry Strip ──────────────────────────────────────────────────────────

interface TelemetryProps {
  fillerParts: TextPart[];
  cleanedPrompt: string;
  result: AgentResult | null;
  busy: boolean;
  perTxLimit: number;
  explorerTxBase: string;
  sessionExecCount: number;
}

function TelemetryStrip({ fillerParts, cleanedPrompt, result, busy, perTxLimit, explorerTxBase, sessionExecCount }: TelemetryProps) {
  const rawAmount   = result?.intent?.amount ?? null;
  const amount      = rawAmount !== null ? Math.round(rawAmount * 10000) / 10000 : null;
  const perTxPct    = amount !== null ? Math.min(100, Math.round((amount / perTxLimit) * 100)) : null;
  const autoExec    = result?.status === 'EXECUTED';
  const needsHITL   = result?.status === 'PENDING_HITL';
  const isPayroll   = result?.intent?.is_payroll;
  const isBlocked   = result?.status === 'BLOCKED';
  const fillerCount = fillerParts.filter((p) => p.isFiller).length;

  const policyLabel =
    autoExec && !isPayroll   ? 'under limit: auto-executing'        :
    isPayroll                ? 'payroll: human approval required'    :
    needsHITL                ? 'over limit: human approval required' :
    isBlocked                ? 'blocked by policy'                   : 'policy result';

  const policyBadge = autoExec && !isPayroll ? 'badge-policy' : isBlocked ? 'badge-blocked' : 'badge-noise';

  return (
    <div className="card-sharp mt-3 font-mono text-xs">
      <div className="mb-3 flex items-center justify-between border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <span className={`badge-live text-[10px] ${busy ? 'animate-pulse' : ''}`}>
            {busy ? 'LIVE' : 'VERIFIED'}
          </span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Agent Telemetry</span>
        </div>
        {sessionExecCount > 0 && (
          <span className="badge-settled text-[10px]">
            {sessionExecCount} autonomous tx{sessionExecCount > 1 ? 's' : ''} this session
          </span>
        )}
      </div>

      <div className="telem-step space-y-2 pb-3">
        <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">01 · Voice → Intent</p>
        <div className="space-y-1">
          <p className="text-[10px] text-neutral-700">RAW HEARD</p>
          <p className="leading-relaxed text-neutral-400">
            {fillerParts.map((part, i) =>
              part.isFiller
                ? <span key={i} className="filler-text">{part.text}</span>
                : <span key={i}>{part.text}</span>
            )}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-neutral-700">CLEAN INTENT</p>
          <p className="text-white">{cleanedPrompt}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {fillerCount > 0 && (
            <span className="badge-noise text-[10px] normal-case">
              {fillerCount} filler{fillerCount > 1 ? 's' : ''} stripped
            </span>
          )}
          {!busy && result && (
            <span className="badge-verified text-[10px] normal-case">intent resolved</span>
          )}
        </div>
      </div>

      {!busy && result && amount !== null && (
        <div className="telem-step-2 space-y-2 border-t border-white/[0.06] pt-3 pb-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">02 · Policy Check</p>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-neutral-400">
              <span className="data-mono text-white">{amount.toFixed(4)}</span>
              <span className="text-neutral-700"> RLUSD  vs  cap </span>
              <span className="data-mono text-white">{perTxLimit.toFixed(0)}</span>
              <span className="text-neutral-700"> RLUSD</span>
            </span>
            <span className={`font-bold tabular-nums ${autoExec ? 'text-green-400' : 'text-orange-400'}`}>
              {perTxPct}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-df-line">
            <div
              className={`h-full rounded-full transition-all duration-700 ${autoExec ? 'bg-green-400' : 'bg-orange-400'}`}
              style={{ width: `${perTxPct}%` }}
            />
          </div>
          <span className={`${policyBadge} text-[10px] normal-case`}>{policyLabel}</span>
        </div>
      )}

      {!busy && result?.txHash && (
        <div className="telem-step-3 space-y-2 border-t border-white/[0.06] pt-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">03 · XRPL Settlement</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="badge-settled text-[10px] normal-case">settled on xrpl</span>
            <a
              href={`${explorerTxBase}${result.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10px] text-df-yellow underline-offset-2 hover:underline"
            >
              {result.txHash.slice(0, 10)}…{result.txHash.slice(-8)}
            </a>
          </div>
        </div>
      )}

      {busy && (
        <div className="border-t border-white/[0.06] pt-3 space-y-1.5 text-[11px]">
          <div className="flex items-center gap-2 text-neutral-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-df-blue animate-pulse" aria-hidden />
            Checking policy thresholds...
          </div>
          <div className="flex items-center gap-2 text-neutral-700">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-df-line" aria-hidden />
            Awaiting XRPL settlement...
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AgentConsole({ data, isAdmin, onDone }: { data: DashboardData; isAdmin: boolean; onDone: () => Promise<void> | void }) {
  const [prompt, setPrompt] = useState('');
  const [redTeam, setRedTeam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [recState, setRecState]       = useState<RecState>('idle');
  const [micError, setMicError]       = useState<string | null>(null);
  const [hasSpeech, setHasSpeech]     = useState<boolean | null>(null);
  const [interimText, setInterimText] = useState('');

  // Voice telemetry
  const [fillerParts, setFillerParts]           = useState<TextPart[]>([]);
  const [cleanedTranscript, setCleanedTranscript] = useState('');
  const [vendorMatch, setVendorMatch]           = useState<VendorMatch | null>(null);

  // Session counters
  const [sessionExecCount, setSessionExecCount]   = useState(0);
  const [lastSubmitWasVoice, setLastSubmitWasVoice] = useState(false);

  // ── Recognition refs ─────────────────────────────────────────────────────────
  const recognitionRef  = useRef<AnySpeechRecognition>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // userStoppedRef: true when WE triggered the stop (5s timer or manual tap).
  // If onend fires while this is false, the browser ended the session early → auto-restart.
  const userStoppedRef  = useRef(false);
  // isListeningRef: guards against stale-closure re-starts after component unmount.
  const isListeningRef  = useRef(false);
  // accumulatedRef: confirmed final text collected across all auto-restarts in this session.
  const accumulatedRef  = useRef('');

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    setHasSpeech(typeof window !== 'undefined' && (!!w.SpeechRecognition || !!w.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      userStoppedRef.current = true; // prevent auto-restart on unmount
      recognitionRef.current?.abort();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // ── Core recognition logic ────────────────────────────────────────────────────
  // Extracted so onend can call it again on early browser stop.
  function startRecognition() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setMicError('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      setRecState('idle');
      return;
    }

    const rec: AnySpeechRecognition = new SR();
    rec.lang            = 'en-ZA';   // South African English; browsers fall back to en-US
    rec.interimResults  = true;      // stream words live as they are spoken
    rec.maxAlternatives = 1;
    rec.continuous      = true;      // don't stop on natural mid-sentence pauses

    rec.onstart = () => {
      isListeningRef.current = true;
      setRecState('listening');
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      // Every new speech event resets the 5-second silence countdown.
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        userStoppedRef.current = true;
        setRecState('finalising');
        recognitionRef.current?.stop();
      }, SILENCE_MS);

      let interim  = '';
      let newFinal = '';

      // Only process new results from resultIndex onward — prevents duplication on restart
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          newFinal += e.results[i][0].transcript as string;
        } else {
          interim += e.results[i][0].transcript as string;
        }
      }

      // Append confirmed final text to our cross-restart accumulator
      if (newFinal.trim()) {
        accumulatedRef.current = accumulatedRef.current
          ? `${accumulatedRef.current} ${newFinal.trim()}`
          : newFinal.trim();
      }

      setInterimText(interim);

      // Live-update the textarea: confirmed text + whatever is currently being heard
      const display = interim
        ? `${accumulatedRef.current} ${interim}`.trim()
        : accumulatedRef.current;
      if (display) setPrompt(display);
    };

    rec.onend = () => {
      if (userStoppedRef.current || !isListeningRef.current) {
        // ── Intentional stop: 5s timer fired, manual tap, or unmount ────────
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        isListeningRef.current = false;
        userStoppedRef.current = false;
        setInterimText('');

        // Finalise prompt to the confirmed accumulated text (drop any dangling interim)
        if (accumulatedRef.current) {
          setPrompt(accumulatedRef.current);
          setFillerParts(getFillerParts(accumulatedRef.current));
          setCleanedTranscript(stripFiller(accumulatedRef.current));
          setVendorMatch(matchVendors(accumulatedRef.current, data.vendors));
        }

        setRecState('idle');
      } else {
        // ── Browser ended the session early (common in Chrome) — auto-restart ─
        // Accumulated text and the 5s timer are both preserved.
        setInterimText('');
        startRecognition();
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed') {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        isListeningRef.current = false;
        userStoppedRef.current = false;
        setRecState('idle');
        setMicError('Microphone access was denied. Allow it in your browser settings.');
      } else if (e.error === 'no-speech' || e.error === 'aborted') {
        // 'no-speech': browser detected silence — onend fires next and auto-restarts.
        // 'aborted':   we called abort() on unmount — onend will see userStopped=true.
      } else {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        isListeningRef.current = false;
        userStoppedRef.current = false;
        setRecState('idle');
        setMicError(`Voice input error: ${e.error}`);
      }
    };

    recognitionRef.current = rec;
    rec.start();
  }

  // ── Toggle handler (tap the mic button) ──────────────────────────────────────
  function toggleRecording() {
    if (recState !== 'idle') {
      // Manual stop — flag as intentional so onend doesn't auto-restart
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      userStoppedRef.current = true;
      setRecState('finalising');
      recognitionRef.current?.stop();
      return;
    }

    // Start a fresh recording session
    setMicError(null);
    setInterimText('');
    setPrompt('');
    setFillerParts([]);
    setCleanedTranscript('');
    setVendorMatch(null);
    accumulatedRef.current = '';

    startRecognition();
  }

  const vendor  = data.vendors[0];
  const perTx   = Number(data.policy.perTxLimitRlusd);
  const small   = Math.max(1, Math.min(5, Math.floor(perTx / 2) || 1));
  const examples = [
    vendor && { tag: 'Routine',    text: `Pay ${vendor.label} ${small} RLUSD for invoice 1042` },
    vendor && { tag: 'Over limit', text: `Pay ${vendor.label} ${Math.ceil(perTx * 2) || 50} RLUSD for the quarterly order` },
    vendor && { tag: 'Payroll',    text: `Pay ${vendor.label} ${small} RLUSD for this month's salary` },
    { tag: 'Unknown', text: `Pay 5 RLUSD to ${UNKNOWN_ADDRESS}` },
  ].filter(Boolean) as { tag: string; text: string }[];

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    const isVoice = cleanedTranscript !== '';
    setBusy(true);
    setError(null);
    setResult(null);
    setLastSubmitWasVoice(isVoice);
    try {
      const r = await api<AgentResult & { error?: { message: string } }>('/api/agent', {
        method: 'POST',
        body: { prompt, redTeam },
        okStatuses: [403, 502],
      });
      if (r.error) throw new Error(r.error.message);
      if (r.status === 'EXECUTED') setSessionExecCount((c) => c + 1);
      setResult(r);
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const head          = result ? HEADLINE[result.status] : null;
  const showTelemetry = lastSubmitWasVoice && (busy || result !== null);

  return (
    <section className="card relative" aria-labelledby="console-h">
      {sessionExecCount > 0 && (
        <div className="absolute right-5 top-5 z-10">
          <span className="badge-settled text-[10px] normal-case">
            {sessionExecCount} autonomous tx{sessionExecCount > 1 ? 's' : ''} verified
          </span>
        </div>
      )}

      <p className="eyebrow">Agent</p>
      <h2 id="console-h" className="card-title">Give the agent an instruction</h2>
      <p className="hint mt-1">
        {hasSpeech ? 'Speak or type a payment instruction.' : 'Type a payment instruction below.'}
        {!data.config.llm && ' (Language model not configured: using the built-in parser.)'}
      </p>

      <form onSubmit={run} className="mt-6 space-y-4">

        {/* ── Mic button ─────────────────────────────────────────────────── */}
        {hasSpeech && (
          <>
            <MicButton recState={recState} busy={busy} onClick={toggleRecording} />

            {/* Interim speech display — shown while listening */}
            <div className={`overflow-hidden transition-all duration-300 ${recState === 'listening' ? 'max-h-28 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="rounded-xl border border-df-cyan/20 bg-df-cyan/[0.03] px-4 py-3">
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
                  Live transcript
                </p>
                <p className="text-sm leading-relaxed text-neutral-300">
                  {interimText
                    ? <>{interimText}<span className="sim-cursor text-df-cyan" aria-hidden /></>
                    : <span className="animate-pulse text-df-mute">Waiting for speech...</span>
                  }
                </p>
              </div>
            </div>

            {/* Vendor match pill */}
            {vendorMatch && recState === 'idle' && !busy && (
              <div className="flex items-center gap-3 rounded-xl border border-df-cyan/25 bg-df-cyan/[0.04] px-3 py-2.5">
                <span className="badge-verified text-[10px] normal-case shrink-0">vendor matched</span>
                <span className="text-sm font-semibold text-white truncate">{vendorMatch.label}</span>
                <span className="ml-auto font-mono text-[10px] text-neutral-500 shrink-0">
                  {Math.round(vendorMatch.score * 100)}%
                </span>
              </div>
            )}
          </>
        )}

        {/* ── Review / edit textarea ─────────────────────────────────────── */}
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
            onChange={(e) => {
              setPrompt(e.target.value);
              // Clear voice trace when user manually edits
              if (fillerParts.length > 0) {
                setFillerParts([]);
                setCleanedTranscript('');
                setVendorMatch(null);
              }
            }}
          />
        </div>

        {micError && (
          <p role="alert" className="text-xs text-neutral-400">
            <span className="text-df-yellow">Mic error.</span> {micError}
          </p>
        )}

        {/* ── Example chips ──────────────────────────────────────────────── */}
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

        {/* ── Red-team toggle (admin only) ───────────────────────────────── */}
        {data.config.redTeam && isAdmin && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] p-3 text-sm">
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

        {/* ── Send button ────────────────────────────────────────────────── */}
        <button className="btn-primary w-full py-3 text-base" disabled={busy || !prompt.trim()}>
          {busy ? 'Agent is working...' : 'Send to agent'}
        </button>
      </form>

      {/* ── Result area ────────────────────────────────────────────────────── */}
      <div aria-live="polite" className="mt-4 space-y-3">
        {busy && !showTelemetry && (
          <p className="hint flex items-center gap-2 text-sm">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-df-blue" aria-hidden />
            Reading the instruction, checking your limits, settling on the XRP Ledger...
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-df-line p-3 text-sm">
            <span className="font-semibold text-df-yellow">The agent could not run.</span> {error}
          </p>
        )}

        {result && head && (
          <div className={`rounded-xl border p-4 backdrop-blur-sm ${head.tone}`}>
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
                  What the agent understood:{' '}
                  <span className="mono text-white">{money(result.intent.amount)} RLUSD</span>
                  {result.intent.is_payroll && ' - payroll'}
                </summary>
                <pre className="mono mt-2 overflow-x-auto rounded-lg bg-black/60 p-3 text-xs text-neutral-200">
                  {JSON.stringify(result.intent, null, 2)}
                </pre>
              </details>
            )}
            {result.txHash && !showTelemetry && (
              <a
                className="mt-3 inline-block text-sm font-semibold text-df-yellow underline"
                href={`${data.config.explorerTx}${result.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View on the XRPL explorer
              </a>
            )}
          </div>
        )}

        {showTelemetry && (
          <TelemetryStrip
            fillerParts={fillerParts}
            cleanedPrompt={cleanedTranscript || prompt}
            result={result}
            busy={busy}
            perTxLimit={perTx}
            explorerTxBase={data.config.explorerTx}
            sessionExecCount={sessionExecCount}
          />
        )}
      </div>
    </section>
  );
}
