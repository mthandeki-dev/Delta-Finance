'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentResult, DashboardData } from '@/lib/types';
import { getFillerParts, hasFillers, matchVendors, stripFiller, type TextPart, type VendorMatch } from '@/lib/intent-filter';
import { api, LAYER_LABEL, money } from './api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

const UNKNOWN_ADDRESS = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

const HEADLINE: Record<string, { title: string; tone: string }> = {
  EXECUTED:     { title: 'Paid autonomously',  tone: 'border-df-yellow/40 bg-df-yellow/[0.05]' },
  PENDING_HITL: { title: 'Sent for approval',  tone: 'border-white/20 bg-white/[0.03]' },
  BLOCKED:      { title: 'Blocked',            tone: 'border-orange-400/40 bg-orange-400/[0.05]' },
  FAILED:       { title: 'Could not complete', tone: 'border-red-400/20 bg-red-400/[0.04]' },
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

// ─── Voice Orb ───────────────────────────────────────────────────────────────

type OrbState = 'idle' | 'listening' | 'filtering' | 'thinking' | 'done';

function VoiceOrb({
  recording, busy, result, filtering, speaking, onClick, disabled,
  waveCanvasRef, orbSphereRef,
}: {
  recording: boolean;
  busy: boolean;
  result: AgentResult | null;
  filtering?: boolean;
  speaking?: boolean;
  onClick: () => void;
  disabled?: boolean;
  waveCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  orbSphereRef: React.RefObject<HTMLSpanElement | null>;
}) {
  const state: OrbState =
    busy      ? 'thinking'  :
    recording ? 'listening' :
    filtering ? 'filtering' :
    result    ? 'done'      : 'idle';

  const sphereGrad: Record<OrbState, string> = {
    idle:      'radial-gradient(ellipse at 38% 32%, rgba(255,255,255,0.15) 0%, rgba(0,242,254,0.14)  30%, rgba(79,172,254,0.20)  60%, rgba(0,0,0,0.65) 100%)',
    listening: 'radial-gradient(ellipse at 38% 32%, rgba(255,255,255,0.22) 0%, rgba(0,242,254,0.42)  30%, rgba(79,172,254,0.32)  60%, rgba(0,0,0,0.5)  100%)',
    filtering: 'radial-gradient(ellipse at 38% 32%, rgba(255,255,255,0.20) 0%, rgba(255,214,10,0.38) 30%, rgba(230,190,0,0.26)   60%, rgba(0,0,0,0.58) 100%)',
    thinking:  'radial-gradient(ellipse at 38% 32%, rgba(255,255,255,0.18) 0%, rgba(79,172,254,0.38) 30%, rgba(0,242,254,0.26)   60%, rgba(0,0,0,0.55) 100%)',
    done:      'radial-gradient(ellipse at 38% 32%, rgba(255,255,255,0.20) 0%, rgba(255,214,10,0.28) 30%, rgba(255,214,10,0.16)   60%, rgba(0,0,0,0.6)  100%)',
  };

  const baseGlow: Record<OrbState, string> = {
    idle:      'rgba(0,242,254,0.12)',
    listening: 'rgba(0,242,254,0.42)',
    filtering: 'rgba(255,214,10,0.38)',
    thinking:  'rgba(79,172,254,0.36)',
    done:      'rgba(255,214,10,0.26)',
  };
  // React-driven ambient halo — rAF overrides sphere glow independently
  const glowColor = speaking && recording ? 'rgba(0,242,254,0.65)' : baseGlow[state];

  const statusText: Record<OrbState, string> = {
    idle:      'Tap to speak',
    listening: speaking ? 'Speaking' : 'Listening',
    filtering: 'Filtering',
    thinking:  'Investigating',
    done:      'Complete',
  };

  const statusColor: Record<OrbState, string> = {
    idle:      'text-df-mute',
    listening: speaking ? 'text-df-cyan' : 'text-df-mute',
    filtering: 'text-df-yellow',
    thinking:  'text-df-blue',
    done:      'text-df-yellow',
  };

  const spinColor =
    state === 'filtering'
      ? 'conic-gradient(from 0deg, transparent 55%, rgba(255,214,10,0.65) 88%, transparent 100%)'
      : 'conic-gradient(from 0deg, transparent 55%, rgba(79,172,254,0.65) 88%, transparent 100%)';

  const doneRingColor = result?.status === 'EXECUTED' ? 'rgba(255,214,10,0.55)' : 'rgba(255,255,255,0.28)';
  const ringDur    = speaking ? '0.95s' : '1.9s';
  const ringDelay2 = speaking ? '0.27s' : '0.55s';
  const ringDelay3 = speaking ? '0.54s' : '1.1s';

  return (
    <div className="flex flex-col items-center gap-5 py-8">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={recording ? 'Stop recording' : 'Start voice recording'}
        className="relative flex h-36 w-36 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-df-cyan/60 focus-visible:ring-offset-4 focus-visible:ring-offset-black"
      >
        {/* Ambient halo — React-driven */}
        <span
          className="pointer-events-none absolute inset-[-20px] rounded-full transition-all duration-500"
          style={{ background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)` }}
          aria-hidden
        />

        {/* Ripple rings — speed reacts to speaking state */}
        {recording && (
          <>
            <span className="orb-ring-1 pointer-events-none absolute h-44 w-44 rounded-full border border-df-cyan/[0.28]" style={{ animationDuration: ringDur }} aria-hidden />
            <span className="orb-ring-2 pointer-events-none absolute h-56 w-56 rounded-full border border-df-cyan/[0.14]" style={{ animationDuration: ringDur, animationDelay: ringDelay2 }} aria-hidden />
            <span className="orb-ring-3 pointer-events-none absolute h-72 w-72 rounded-full border border-df-cyan/[0.07]"  style={{ animationDuration: ringDur, animationDelay: ringDelay3 }} aria-hidden />
          </>
        )}

        {/* Filtering / Thinking: rotating arc */}
        {(busy || state === 'filtering') && (
          <span className="orb-spin-arc pointer-events-none absolute h-40 w-40 rounded-full" style={{ background: spinColor }} aria-hidden />
        )}

        {/* Done: lock ring */}
        {!busy && !recording && !filtering && result && (
          <span className="orb-lock-ring pointer-events-none absolute h-40 w-40 rounded-full border-2" style={{ borderColor: doneRingColor }} aria-hidden />
        )}

        {/* ── Audio-reactive waveform canvas ──
            200×200 px, centered over the 144×144 button.
            Written to directly by the rAF loop — zero React re-renders. */}
        <canvas
          ref={waveCanvasRef}
          className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300 ${recording ? 'opacity-100' : 'opacity-0'}`}
          style={{ width: 200, height: 200 }}
          aria-hidden
        />

        {/* Sphere — transform + boxShadow driven by rAF while recording */}
        <span
          ref={orbSphereRef}
          className={`relative z-10 flex h-28 w-28 items-center justify-center rounded-full transition-colors duration-500 ${
            state === 'idle'      ? 'orb-breathe'       :
            state === 'filtering' ? 'orb-filter-glitch' : ''
          }`}
          style={{
            background:  sphereGrad[state],
            boxShadow: `0 0 52px ${glowColor}, inset 0 1px 2px rgba(255,255,255,0.12)`,
          }}
        >
          <span
            className="pointer-events-none absolute inset-0 rounded-full opacity-40"
            style={{ background: 'radial-gradient(ellipse at 28% 22%, rgba(255,255,255,0.28) 0%, transparent 52%)' }}
            aria-hidden
          />
          <span className="relative z-10">
            {recording ? <StopIcon /> : <MicIcon size={30} />}
          </span>
        </span>
      </button>

      <p className={`text-xs font-semibold tracking-widest uppercase transition-colors duration-200 ${statusColor[state]}`}>
        {statusText[state]}
      </p>
    </div>
  );
}

// ─── Live Telemetry Strip ─────────────────────────────────────────────────────

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
    autoExec && !isPayroll   ? 'under limit: auto-executing'       :
    isPayroll                ? 'payroll: human approval required'   :
    needsHITL                ? 'over limit: human approval required' :
    isBlocked                ? 'blocked by policy'                  : 'policy result';

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

      {/* 01: Voice → Intent */}
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

      {/* 02: Policy Check */}
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

      {/* 03: XRPL Settlement */}
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

      {/* Loading steps */}
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

  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [hasSpeech, setHasSpeech] = useState<boolean | null>(null);
  const recognitionRef = useRef<AnySpeechRecognition>(null);

  // Live STT state
  const [interimTranscript, setInterimTranscript] = useState('');
  const [fillerParts, setFillerParts] = useState<TextPart[]>([]);
  const [cleanedTranscript, setCleanedTranscript] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [vendorMatch, setVendorMatch] = useState<VendorMatch | null>(null);

  // Session telemetry
  const [sessionExecCount, setSessionExecCount] = useState(0);
  const [lastSubmitWasVoice, setLastSubmitWasVoice] = useState(false);

  // ── Web Audio API refs (zero React re-renders in hot path) ──────────────────
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef   = useRef<number>(0);
  // DOM element refs — written to directly from rAF loop
  const waveCanvasRef  = useRef<HTMLCanvasElement | null>(null);
  const orbSphereRef   = useRef<HTMLSpanElement | null>(null);
  const volumeBarRef   = useRef<HTMLDivElement | null>(null);

  const speaking = recording && interimTranscript.length > 0;

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    setHasSpeech(typeof window !== 'undefined' && (!!w.SpeechRecognition || !!w.webkitSpeechRecognition));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      cancelAnimationFrame(animFrameRef.current);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => null);
    };
  }, []);

  // ── Tear down Web Audio resources ──────────────────────────────────────────
  function stopAudio() {
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = 0;

    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    audioCtxRef.current?.close().catch(() => null);
    audioCtxRef.current = null;
    analyserRef.current = null;

    // Clear canvas
    const canvas = waveCanvasRef.current;
    if (canvas) {
      const ctx2d = canvas.getContext('2d');
      if (ctx2d) ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Reset sphere to CSS-driven state
    if (orbSphereRef.current) {
      orbSphereRef.current.style.transform = '';
      orbSphereRef.current.style.boxShadow = '';
    }

    // Reset volume bar
    if (volumeBarRef.current) {
      volumeBarRef.current.style.width = '0%';
    }
  }

  // ── Start/stop recording ───────────────────────────────────────────────────
  async function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }

    setMicError(null);
    setInterimTranscript('');

    // ── 1. Web Audio API: mic → AnalyserNode → rAF canvas loop ──────────────
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mediaStreamRef.current = stream;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtxCtor: typeof AudioContext = window.AudioContext ?? (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxCtor();
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;              // 64 frequency bins
      analyser.smoothingTimeConstant = 0.8;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      // Set canvas pixel buffer size
      const canvas = waveCanvasRef.current;
      if (canvas) {
        canvas.width  = 200;
        canvas.height = 200;
      }

      // Pre-allocate frequency buffer outside the loop
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const N       = 48;   // radial bars
      const CX      = 100;
      const CY      = 100;
      const INNER_R = 61;   // just past the sphere edge (r=56)
      const MAX_BAR = 32;

      function drawFrame() {
        animFrameRef.current = requestAnimationFrame(drawFrame);

        const an = analyserRef.current;
        const cv = waveCanvasRef.current;
        if (!an || !cv) return;

        an.getByteFrequencyData(freqData);

        // Compute average normalised volume (0–1)
        let sum = 0;
        for (let j = 0; j < freqData.length; j++) sum += freqData[j];
        const vol = sum / (freqData.length * 255);

        // ── Direct DOM: sphere scale + glow ─────────────────────────────────
        const sphere = orbSphereRef.current;
        if (sphere) {
          const scale    = (1 + vol * 0.14).toFixed(3);
          const glowBlur = Math.round(52 + vol * 36);
          const glowA    = (0.28 + vol * 0.42).toFixed(2);
          sphere.style.transform  = `scale(${scale})`;
          sphere.style.boxShadow  = `0 0 ${glowBlur}px rgba(0,242,254,${glowA}), inset 0 1px 2px rgba(255,255,255,0.12)`;
        }

        // ── Direct DOM: volume bar ───────────────────────────────────────────
        const vbar = volumeBarRef.current;
        if (vbar) {
          vbar.style.width           = `${(vol * 100).toFixed(1)}%`;
          vbar.style.backgroundColor = vol > 0.65 ? '#fbbf24' : '#00F2FE';
        }

        // ── Canvas: radial frequency bars ────────────────────────────────────
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, 200, 200);

        const bins = freqData.length;

        // Pass 1 — glow halos
        ctx.lineWidth = 4;
        ctx.lineCap   = 'round';
        for (let i = 0; i < N; i++) {
          const amp = freqData[Math.floor((i / N) * bins)] / 255;
          if (amp < 0.04) continue;
          const angle  = (i / N) * Math.PI * 2 - Math.PI / 2;
          const barLen = 3 + amp * MAX_BAR;
          const cosA   = Math.cos(angle);
          const sinA   = Math.sin(angle);
          ctx.shadowColor  = 'rgba(0,242,254,0.7)';
          ctx.shadowBlur   = amp * 10;
          ctx.strokeStyle  = `rgba(0,242,254,${(amp * 0.38).toFixed(2)})`;
          ctx.beginPath();
          ctx.moveTo(CX + cosA * INNER_R,           CY + sinA * INNER_R);
          ctx.lineTo(CX + cosA * (INNER_R + barLen), CY + sinA * (INNER_R + barLen));
          ctx.stroke();
        }

        // Pass 2 — sharp coloured bars (cyan → blue around the circle)
        ctx.shadowBlur = 0;
        ctx.lineWidth  = 1.5;
        for (let i = 0; i < N; i++) {
          const amp = freqData[Math.floor((i / N) * bins)] / 255;
          const angle  = (i / N) * Math.PI * 2 - Math.PI / 2;
          const barLen = 3 + amp * MAX_BAR;
          const cosA   = Math.cos(angle);
          const sinA   = Math.sin(angle);
          const hue    = i / N;
          const r      = Math.round(hue * 79);
          const g      = Math.round(242 - hue * 70);
          ctx.strokeStyle = `rgba(${r},${g},254,${(0.18 + amp * 0.82).toFixed(2)})`;
          ctx.beginPath();
          ctx.moveTo(CX + cosA * INNER_R,           CY + sinA * INNER_R);
          ctx.lineTo(CX + cosA * (INNER_R + barLen), CY + sinA * (INNER_R + barLen));
          ctx.stroke();
        }

        // Overall volume pulse ring
        if (vol > 0.03) {
          ctx.shadowBlur  = 0;
          ctx.strokeStyle = `rgba(0,242,254,${(vol * 0.32).toFixed(2)})`;
          ctx.lineWidth   = 1;
          ctx.beginPath();
          ctx.arc(CX, CY, INNER_R + vol * 14, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      drawFrame();

    } catch {
      // Web Audio unavailable (permission denied before STT, or unsupported)
      // Speech recognition continues without the visualizer
    }

    // ── 2. Web Speech API ────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.lang              = 'en-ZA';   // South African English; browsers fall back to en-US
    rec.interimResults    = true;
    rec.maxAlternatives   = 1;
    rec.continuous        = false;

    rec.onstart = () => setRecording(true);

    rec.onend = () => {
      setRecording(false);
      setInterimTranscript('');
      stopAudio();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      setRecording(false);
      setInterimTranscript('');
      stopAudio();
      if (e.error === 'not-allowed')   setMicError('Microphone access was denied. Allow it in your browser settings.');
      else if (e.error !== 'no-speech') setMicError(`Voice input error: ${e.error}`);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let liveText  = '';
      let finalText = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalText += e.results[i][0].transcript as string;
        } else {
          liveText += e.results[i][0].transcript as string;
        }
      }

      if (liveText) setInterimTranscript(liveText);

      if (finalText) {
        const parts   = getFillerParts(finalText);
        const cleaned = stripFiller(finalText);

        setFillerParts(parts);
        setCleanedTranscript(cleaned);
        setInterimTranscript('');

        if (hasFillers(finalText)) {
          setFiltering(true);
          setTimeout(() => setFiltering(false), 1200);
        }

        setPrompt((prev) => (prev.trimEnd() ? `${prev.trimEnd()} ${cleaned}` : cleaned));

        const match = matchVendors(finalText, data.vendors);
        setVendorMatch(match);
      }
    };

    recognitionRef.current = rec;
    rec.start();
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

        {/* ── Voice Orb ──────────────────────────────────────────────────── */}
        {hasSpeech && (
          <>
            <VoiceOrb
              recording={recording}
              busy={busy}
              result={result}
              filtering={filtering}
              speaking={speaking}
              onClick={toggleRecording}
              disabled={busy}
              waveCanvasRef={waveCanvasRef}
              orbSphereRef={orbSphereRef}
            />

            {/* ── Live transcript + volume meter ─────────────────────────── */}
            <div className={`overflow-hidden transition-all duration-300 ${recording ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="rounded-xl border border-df-cyan/20 bg-df-cyan/[0.03] px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">Live transcript</p>
                  {/* Real-time volume bar — written directly by rAF, no React state */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-neutral-700">VOL</span>
                    <div className="h-1 w-16 overflow-hidden rounded-full bg-df-line">
                      <div
                        ref={volumeBarRef}
                        className="h-full rounded-full"
                        style={{ width: '0%', backgroundColor: '#4FACFE', transition: 'none' }}
                      />
                    </div>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-neutral-300">
                  {interimTranscript
                    ? <>{interimTranscript}<span className="sim-cursor text-df-cyan" aria-hidden /></>
                    : <span className="animate-pulse text-df-mute">Waiting for speech...</span>
                  }
                </p>
              </div>
            </div>

            {/* ── Vendor match pill ──────────────────────────────────────── */}
            {vendorMatch && !busy && (
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

        {/* ── Text input ─────────────────────────────────────────────────── */}
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

        {/* Voice telemetry strip — voice submissions only */}
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
