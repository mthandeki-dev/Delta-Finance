// ─── Language config ──────────────────────────────────────────────────────────
// Add entries here to expose more languages in the voice dropdown.
// code must be a valid BCP-47 tag accepted by Web Speech API (or future cloud providers).

export interface SpeechLang {
  code: string;
  label: string;
}

export const SPEECH_LANGS: SpeechLang[] = [
  { code: 'en-ZA',  label: 'English'   },
  { code: 'zu-ZA',  label: 'isiZulu'   },
  { code: 'af-ZA',  label: 'Afrikaans' },
  { code: 'xh-ZA',  label: 'isiXhosa'  },
  { code: 'nso-ZA', label: 'Sepedi'    },
];

export const DEFAULT_LANG     = 'en-ZA';
export const LANG_STORAGE_KEY = 'df_speech_lang';

// ─── Payment keyword translation map ─────────────────────────────────────────
// Maps lower-cased spoken words/phrases in a source language to the canonical
// English token the downstream parser expects. Keys are matched as whole words.
// Wallet addresses and numeric amounts are always preserved exactly as heard.

export const PAYMENT_KEYWORD_MAP: Partial<Record<string, Record<string, string>>> = {
  'zu-ZA': {
    'hlawula':    'pay',
    'khokha':     'pay',
    'yisa':       'send',
    'ku':         'to',
    'ukuya ku':   'to',
    'ngoba':      'for',
    'inkokhelo':  'invoice',
    'umholo':     'salary',
    'inhlawulo':  'payment',
  },
  'af-ZA': {
    'betaal':     'pay',
    'stuur':      'send',
    'aan':        'to',
    'vir':        'for',
    'faktuur':    'invoice',
    'salaris':    'salary',
    'betaling':   'payment',
  },
  'xh-ZA': {
    'hlawula':    'pay',
    'thumela':    'send',
    'ku':         'to',
    'ukuya ku':   'to',
    'ngo':        'for',
    'intlawulo':  'payment',
    'umvuzo':     'salary',
  },
  'nso-ZA': {
    'duela':      'pay',
    'romela':     'send',
    'go':         'to',
    'bakeng':     'for',
    'tefelo':     'payment',
    'moputso':    'salary',
  },
};

// ─── Mishearing correction map ────────────────────────────────────────────────
// Add known STT mishearings for domain-specific terms here.
// Matched as whole words / phrases, case-insensitive.

export interface CorrectionEntry {
  pattern: string;      // exact lower-cased token(s) as heard by STT
  replacement: string;  // canonical form to show in the review box
}

export const MISHEARING_MAP: CorrectionEntry[] = [
  { pattern: 'r l u s d',  replacement: 'RLUSD' },
  { pattern: 'r l u s t',  replacement: 'RLUSD' },
  { pattern: 'rlosd',       replacement: 'RLUSD' },
  { pattern: 'rlusd',       replacement: 'RLUSD' },
  { pattern: 'ex r p l',   replacement: 'XRPL'  },
  { pattern: 'exrpl',       replacement: 'XRPL'  },
];

// ─── XRPL address guard ───────────────────────────────────────────────────────
// XRPL addresses must never be altered by any normalisation step.

function isXrplAddress(token: string): boolean {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,33}$/.test(token);
}

// Replace XRPL addresses with stable placeholders, run fn, then restore.
function withAddressesProtected(text: string, fn: (s: string) => string): string {
  const store: string[] = [];
  const safe = text.replace(/\br[1-9A-HJ-NP-Za-km-z]{24,33}\b/g, (m) => {
    store.push(m);
    return `\x00${store.length - 1}\x00`;
  });
  return fn(safe).replace(/\x00(\d+)\x00/g, (_, i) => store[Number(i)]);
}

// ─── normaliseForEnglishParser ────────────────────────────────────────────────
// Replaces payment keywords in a non-English transcript with English equivalents
// so the downstream parser can understand the intent.

export function normaliseForEnglishParser(text: string, langCode: string): string {
  if (langCode === 'en-ZA') return text;
  const map = PAYMENT_KEYWORD_MAP[langCode];
  if (!map) return text;

  return withAddressesProtected(text, (safe) => {
    // Sort phrases longest-first so "ukuya ku" is replaced before "ku"
    const phrases = Object.keys(map).sort(
      (a, b) => b.split(/\s+/).length - a.split(/\s+/).length,
    );

    let result = safe;
    for (const phrase of phrases) {
      const escaped = phrase.replace(/\s+/g, '\\s+');
      const re = new RegExp(`\\b${escaped}\\b`, 'gi');
      result = result.replace(re, map[phrase]);
    }
    return result;
  });
}

// ─── applyMishearingMap ───────────────────────────────────────────────────────

export function applyMishearingMap(text: string, corrections: CorrectionEntry[]): string {
  return withAddressesProtected(text, (safe) => {
    const sorted = [...corrections].sort((a, b) => b.pattern.length - a.pattern.length);
    let result = safe;
    for (const { pattern, replacement } of sorted) {
      const escaped = pattern.replace(/\s+/g, '\\s+');
      const re = new RegExp(`\\b${escaped}\\b`, 'gi');
      result = result.replace(re, replacement);
    }
    return result;
  });
}

// ─── Levenshtein distance ─────────────────────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length];
}

// ─── correctNames ─────────────────────────────────────────────────────────────
// Fuzzy-matches n-gram windows against contact/vendor labels using Levenshtein.
// Replaces close matches with the exact saved spelling.
// XRPL addresses are always skipped.

function editThreshold(nameLen: number): number {
  // No edits for very short names (≤4 chars), 1 for medium, 2 for long
  return Math.min(2, Math.max(0, Math.floor((nameLen - 3) / 4)));
}

export function correctNames(
  text: string,
  contacts: { label: string }[],
  maxDistance = 2,
): string {
  if (!contacts.length) return text;

  return withAddressesProtected(text, (safe) => {
    // Longest labels first so "Gogo's Flour Mill" is tried before "Gogo"
    const sorted = [...contacts].sort((a, b) => b.label.length - a.label.length);
    let tokens = safe.split(/\s+/);

    for (const contact of sorted) {
      const nameLower  = contact.label.toLowerCase();
      const nameTokens = nameLower.split(/\s+/);
      const n          = nameTokens.length;
      const threshold  = Math.min(maxDistance, editThreshold(nameLower.length));

      for (let i = 0; i <= tokens.length - n; i++) {
        const window = tokens.slice(i, i + n).join(' ').toLowerCase();
        const dist   = levenshtein(window, nameLower);
        if (dist > 0 && dist <= threshold) {
          tokens = [
            ...tokens.slice(0, i),
            contact.label,
            ...tokens.slice(i + n),
          ];
          break;
        }
      }
    }

    return tokens.join(' ');
  });
}
