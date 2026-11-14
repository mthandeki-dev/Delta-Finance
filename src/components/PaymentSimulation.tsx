'use client';
import { useState, useEffect } from 'react';

// ── 3D character: Nomvula "Gogo" – old granny selling fatcakes ──────────────
function GogoCharacter() {
  return (
    <div style={{ perspective: '520px' }} className="relative flex flex-col items-center select-none">
      <div className="char-float w-full">
        <svg viewBox="0 0 100 155" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto drop-shadow-lg" aria-label="Gogo selling fatcakes">
          {/* ── Dress / body ── */}
          <ellipse cx="50" cy="122" rx="30" ry="32" fill="#6B3FA0"/>
          <ellipse cx="38" cy="118" rx="14" ry="26" fill="#5A348C" />
          {/* apron */}
          <path d="M34 110 Q32 148 50 150 Q68 148 66 110 Q58 106 50 106 Q42 106 34 110Z" fill="#F5A623"/>
          <rect x="42" y="130" width="16" height="11" rx="3" fill="#E8951E"/>
          {/* ── Arms reaching down to tray ── */}
          <path d="M24 108 Q14 118 18 132" stroke="#8B5A2B" strokeWidth="9" strokeLinecap="round" fill="none"/>
          <path d="M76 108 Q86 118 82 132" stroke="#8B5A2B" strokeWidth="9" strokeLinecap="round" fill="none"/>
          {/* ── Tray ── */}
          <ellipse cx="50" cy="143" rx="34" ry="7" fill="#6B4423"/>
          <ellipse cx="50" cy="140" rx="31" ry="6" fill="#8B5733"/>
          {/* ── Fatcakes (amagwinya) ── */}
          <circle cx="37" cy="136" r="7"   fill="#D4791C"/>
          <circle cx="37" cy="134" r="4"   fill="#F0A030" opacity="0.9"/>
          <circle cx="50" cy="133" r="8.5" fill="#C06818"/>
          <circle cx="50" cy="130" r="5"   fill="#E89030" opacity="0.9"/>
          <circle cx="63" cy="136" r="7"   fill="#D4791C"/>
          <circle cx="63" cy="134" r="4"   fill="#F0A030" opacity="0.9"/>
          <circle cx="43" cy="140" r="6"   fill="#B85E14"/>
          <circle cx="43" cy="138" r="3.5" fill="#D4801E" opacity="0.9"/>
          <circle cx="57" cy="140" r="6"   fill="#B85E14"/>
          <circle cx="57" cy="138" r="3.5" fill="#D4801E" opacity="0.9"/>
          {/* ── Neck ── */}
          <rect x="43" y="77" width="14" height="15" rx="6" fill="#8B5A2B"/>
          {/* ── Head ── */}
          <ellipse cx="50" cy="64" rx="24" ry="25" fill="#8B5A2B"/>
          <ellipse cx="50" cy="66" rx="20" ry="21" fill="#9B6535"/>
          {/* ── Doek (head wrap) ── */}
          <path d="M27 60 Q29 36 50 34 Q71 36 73 60 Q62 52 50 54 Q38 52 27 60Z" fill="#C0392B"/>
          <path d="M27 60 Q38 54 50 56 Q62 54 73 60 Q68 44 50 42 Q32 44 27 60Z" fill="#E84820"/>
          {/* doek bow */}
          <ellipse cx="71" cy="54" rx="9" ry="6" fill="#C0392B" transform="rotate(-25 71 54)"/>
          <ellipse cx="74" cy="51" rx="5" ry="4" fill="#E84820" transform="rotate(-25 74 51)"/>
          <circle  cx="71" cy="55" r="2.8" fill="#A0291B"/>
          {/* ── Glasses ── */}
          <circle cx="43" cy="66" r="6.5"  fill="none" stroke="#3A2010" strokeWidth="1.6"/>
          <circle cx="57" cy="66" r="6.5"  fill="none" stroke="#3A2010" strokeWidth="1.6"/>
          <line x1="49.5" y1="66" x2="50.5" y2="66" stroke="#3A2010" strokeWidth="1.6"/>
          <line x1="36.5" y1="64.5" x2="34" y2="63" stroke="#3A2010" strokeWidth="1.6"/>
          <line x1="63.5" y1="64.5" x2="66" y2="63" stroke="#3A2010" strokeWidth="1.6"/>
          {/* eyes */}
          <ellipse cx="43" cy="66" rx="3.4" ry="3.4" fill="#1E0E06"/>
          <ellipse cx="57" cy="66" rx="3.4" ry="3.4" fill="#1E0E06"/>
          <circle  cx="44.3" cy="64.8" r="1.2" fill="white"/>
          <circle  cx="58.3" cy="64.8" r="1.2" fill="white"/>
          {/* nose */}
          <ellipse cx="50" cy="73" rx="3" ry="2" fill="#7A4A1E"/>
          {/* smile */}
          <path d="M42 79 Q50 87 58 79" stroke="#6B3A18" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
          <path d="M44 80 Q50 85 56 80" fill="white" opacity="0.65"/>
          {/* cheeks */}
          <ellipse cx="38" cy="76" rx="5.5" ry="4" fill="rgba(220,80,50,0.28)"/>
          <ellipse cx="62" cy="76" rx="5.5" ry="4" fill="rgba(220,80,50,0.28)"/>
        </svg>
      </div>
      {/* ground shadow */}
      <div className="char-shadow mt-[-6px] h-2 w-16 rounded-full bg-black/40 blur-sm"/>
    </div>
  );
}

// ── 3D character: Thabo Nkosi – Eskom CFO ──────────────────────────────────
function EskomCfoCharacter() {
  return (
    <div style={{ perspective: '520px' }} className="relative flex flex-col items-center select-none">
      <div className="char-float w-full">
        <svg viewBox="0 0 100 155" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto drop-shadow-lg" aria-label="Eskom CFO Thabo">
          {/* ── Legs / trousers ── */}
          <rect x="37" y="122" width="10" height="28" rx="4" fill="#1C2B4A"/>
          <rect x="53" y="122" width="10" height="28" rx="4" fill="#1C2B4A"/>
          {/* shoes */}
          <ellipse cx="41" cy="150" rx="8" ry="4" fill="#111120"/>
          <ellipse cx="58" cy="150" rx="8" ry="4" fill="#111120"/>
          {/* ── Suit body ── */}
          <path d="M22 90 Q18 148 50 150 Q82 148 78 90 Q70 83 50 82 Q30 83 22 90Z" fill="#1C2B4A"/>
          <path d="M22 90 Q24 148 50 150 Q50 148 50 82 Q30 83 22 90Z" fill="rgba(0,0,0,0.14)"/>
          {/* shirt */}
          <path d="M42 88 L42 118 Q46 122 50 122 Q54 122 58 118 L58 88 Q54 85 50 84 Q46 85 42 88Z" fill="#E8ECF4"/>
          {/* Eskom-orange tie */}
          <path d="M47 89 L46 120 Q50 125 54 120 L53 89 Z" fill="#FF6B2B"/>
          <path d="M47 89 L50 94 L53 89 Q51 86 50 86 Q49 86 47 89Z" fill="#E55A1E"/>
          <line x1="46.5" y1="102" x2="53.5" y2="102" stroke="rgba(255,255,255,0.28)" strokeWidth="0.9"/>
          <line x1="46.5" y1="110" x2="53.5" y2="110" stroke="rgba(255,255,255,0.28)" strokeWidth="0.9"/>
          {/* suit lapels */}
          <path d="M50 87 L42 93 L44 102 L50 96Z" fill="#243555"/>
          <path d="M50 87 L58 93 L56 102 L50 96Z" fill="#152040"/>
          {/* Eskom badge on lapel */}
          <rect x="43.5" y="97" width="8" height="5.5" rx="1" fill="#FF6B2B"/>
          <text x="45" y="101.5" fontSize="3.4" fill="white" fontFamily="monospace" fontWeight="bold">ESK</text>
          {/* ── Arms: left relaxed, right holding tablet ── */}
          <path d="M24 94 Q16 108 20 124 Q22 130 26 134" stroke="#1C2B4A" strokeWidth="12" strokeLinecap="round" fill="none"/>
          <path d="M76 94 Q84 108 78 122 Q75 130 72 136" stroke="#1C2B4A" strokeWidth="12" strokeLinecap="round" fill="none"/>
          {/* hands */}
          <ellipse cx="26" cy="136" rx="6" ry="5" fill="#C8A882"/>
          <ellipse cx="72" cy="138" rx="6" ry="5" fill="#C8A882"/>
          {/* tablet in right hand */}
          <rect x="65" y="120" width="15" height="22" rx="2.5" fill="#1E1E2E"/>
          <rect x="66" y="121" width="13" height="18" rx="1.5" fill="#0A4A80"/>
          <line x1="66" y1="128" x2="79" y2="128" stroke="#FF6B2B" strokeWidth="0.7" opacity="0.8"/>
          <line x1="66" y1="132" x2="79" y2="132" stroke="#FF6B2B" strokeWidth="0.4" opacity="0.5"/>
          <line x1="66" y1="135" x2="75" y2="135" stroke="#FF6B2B" strokeWidth="0.4" opacity="0.5"/>
          {/* ── Neck ── */}
          <rect x="44" y="72" width="12" height="13" rx="5" fill="#C8A882"/>
          {/* ── Head (more angular / square jaw) ── */}
          <path d="M30 55 Q30 36 50 34 Q70 36 70 55 L68 76 Q62 86 50 87 Q38 86 32 76 Z" fill="#C8A882"/>
          <ellipse cx="50" cy="60" rx="18" ry="20" fill="#D4B896"/>
          {/* ── Hair ── */}
          <path d="M30 52 Q32 34 50 32 Q68 34 70 52 Q62 44 50 44 Q38 44 30 52Z" fill="#1E0E06"/>
          {/* ── Ears ── */}
          <ellipse cx="31" cy="60" rx="4" ry="5" fill="#C0A07A"/>
          <ellipse cx="69" cy="60" rx="4" ry="5" fill="#C0A07A"/>
          {/* ── Eyes ── */}
          <ellipse cx="43" cy="60" rx="4" ry="3.5" fill="#18181E"/>
          <ellipse cx="57" cy="60" rx="4" ry="3.5" fill="#18181E"/>
          <circle  cx="44.2" cy="58.8" r="1.4" fill="white"/>
          <circle  cx="58.2" cy="58.8" r="1.4" fill="white"/>
          {/* eyebrows (confident arch) */}
          <path d="M39 54 Q43 52 47 54" stroke="#1E0E06" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
          <path d="M53 54 Q57 52 61 54" stroke="#1E0E06" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
          {/* ── Nose ── */}
          <path d="M50 64 L50 70 M47 70 Q50 72 53 70" stroke="#A88060" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
          {/* ── Mouth – composed, slight smile ── */}
          <path d="M44 76 Q50 80 56 76" stroke="#A07050" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
          {/* square jaw definition */}
          <path d="M32 70 Q34 82 40 85 Q50 88 60 85 Q66 82 68 70" fill="#C8A882"/>
        </svg>
      </div>
      {/* ground shadow */}
      <div className="char-shadow mt-[-6px] h-2 w-14 rounded-full bg-black/40 blur-sm"/>
    </div>
  );
}

// ── Story data ──────────────────────────────────────────────────────────────
const SETTLE_MS = 5600;   // settlement card appears at 70% of the 8s CSS loop
const HOLD_MS   = 3000;   // 3 s hold after last line, as requested
const SWITCH_MS = SETTLE_MS + HOLD_MS;  // 8 600 ms per story
const FADE_MS   = 420;

// ── Main component ──────────────────────────────────────────────────────────
export function PaymentSimulation() {
  const [story,   setStory]   = useState<'gogo' | 'eskom'>('gogo');
  const [animKey, setAnimKey] = useState(0);
  const [fading,  setFading]  = useState(false);

  useEffect(() => {
    const switchTimer = setTimeout(() => {
      setFading(true);
      const fadeTimer = setTimeout(() => {
        setStory(s => (s === 'gogo' ? 'eskom' : 'gogo'));
        setAnimKey(k => k + 1);
        setFading(false);
      }, FADE_MS);
      return () => clearTimeout(fadeTimer);
    }, SWITCH_MS);
    return () => clearTimeout(switchTimer);
  }, [animKey]);

  const isGogo = story === 'gogo';

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/60 backdrop-blur-sm">
      {/* Terminal chrome */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/60"    aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-green-500/60"  aria-hidden />
        <span className="ml-3 font-mono text-xs text-neutral-600">delta-agent · live</span>
      </div>

      {/* Story panel */}
      <div
        key={animKey}
        style={{ opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease-in-out` }}
        className="flex items-start gap-3 px-4 py-4"
      >
        {/* ── Terminal content ── */}
        <div className="flex-1 font-mono text-sm" style={{ minHeight: 172 }}>

          {isGogo ? (
            /* ══ STORY 1: Gogo ══════════════════════════════════════════════ */
            <>
              <div className="sim-prompt flex items-center gap-2 opacity-0">
                <span className="select-none text-df-cyan/50">❯</span>
                <span className="text-white">Pay Gogo&apos;s flour supplier R450</span>
                <span className="sim-cursor text-df-cyan" aria-hidden />
              </div>

              <div className="mt-3 space-y-1.5 pl-5">
                <div className="sim-check-1 flex items-center gap-2 text-xs opacity-0">
                  <span className="text-green-400">✓</span>
                  <span className="text-neutral-400">
                    Vendor <span className="text-white">Gogo&apos;s Flour Mill</span> approved
                  </span>
                </div>
                <div className="sim-check-2 flex items-center gap-2 text-xs opacity-0">
                  <span className="text-green-400">✓</span>
                  <span className="text-neutral-400">
                    Within daily limit — <span className="text-white">R2,840 remaining</span>
                  </span>
                </div>
                <div className="sim-check-3 flex items-center gap-2 text-xs opacity-0">
                  <span className="text-green-400">✓</span>
                  <span className="text-neutral-400">
                    Per-tx cap clear — <span className="text-white">R500 ceiling</span>
                  </span>
                </div>
              </div>

              <div className="sim-settle mt-4 rounded-lg border border-green-500/30 bg-green-500/[0.07] px-4 py-3 opacity-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-400/20 text-green-400 text-xs" aria-hidden>✓</span>
                    <span className="text-sm font-semibold text-white">Settled on XRPL</span>
                  </div>
                  <span className="font-mono text-xs text-green-400">0.3s</span>
                </div>
                <p className="mt-1 font-mono text-xs text-neutral-500">
                  tx: rGHk…3fQp · 450 RLUSD · Testnet
                </p>
              </div>
            </>
          ) : (
            /* ══ STORY 2: Eskom CFO ═════════════════════════════════════════ */
            <>
              <div className="sim-prompt flex items-center gap-2 opacity-0">
                <span className="select-none text-df-cyan/50">❯</span>
                <span className="text-white">Restock coal — Seriti Coal SA · 42&thinsp;000 RLUSD</span>
                <span className="sim-cursor text-df-cyan" aria-hidden />
              </div>

              <div className="mt-3 space-y-1.5 pl-5">
                <div className="sim-check-1 flex items-center gap-2 text-xs opacity-0">
                  <span className="text-green-400">✓</span>
                  <span className="text-neutral-400">
                    Vendor <span className="text-white">Seriti Coal SA</span> whitelisted
                  </span>
                </div>
                <div className="sim-check-2 flex items-center gap-2 text-xs opacity-0">
                  <span className="text-yellow-400">⚠</span>
                  <span className="text-neutral-400">
                    Exceeds per-tx cap — <span className="text-yellow-300">CFO approval required</span>
                  </span>
                </div>
                <div className="sim-check-3 flex items-center gap-2 text-xs opacity-0">
                  <span className="text-green-400">✓</span>
                  <span className="text-neutral-400">
                    CFO approved via Xaman · <span className="text-white">funds released</span>
                  </span>
                </div>
              </div>

              <div className="sim-settle mt-4 rounded-lg border border-green-500/30 bg-green-500/[0.07] px-4 py-3 opacity-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-400/20 text-green-400 text-xs" aria-hidden>✓</span>
                    <span className="text-sm font-semibold text-white">Settled on XRPL</span>
                  </div>
                  <span className="font-mono text-xs text-green-400">1.4s</span>
                </div>
                <p className="mt-1 font-mono text-xs text-neutral-500">
                  tx: rKoal…7mN3 · 42&thinsp;000 RLUSD · Testnet
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── 3D character (right column) ── */}
        <div className="w-24 flex-shrink-0 flex flex-col items-center justify-end" style={{ minHeight: 172 }}>
          {isGogo ? <GogoCharacter /> : <EskomCfoCharacter />}
        </div>
      </div>
    </div>
  );
}
