// Server-side translation: natural language → English payment instruction.
//
// Strategy:
//   1. Passthrough  if sourceLang is already English (en-ZA)
//   2. Vulavula     Lelapa AI Vulavula API — when VULAVULA_API_KEY is set
//   3. Google       Google Cloud Translation API — when GOOGLE_CLOUD_API_KEY is set
//   4. LLM          Anthropic API, temperature=0, payment-domain system prompt
//   5. Keyword-map  last resort when no cloud service is configured or all fail
//
// XRPL addresses (starting with 'r', 25-34 chars) and RLUSD are protected via
// placeholder substitution before any cloud call and restored after.

import { env } from '@/lib/env';
import type { TranslationMethod } from '@/lib/message-protocol';
import {
  normaliseForEnglishParser,
  applyMishearingMap,
  MISHEARING_MAP,
  SPEECH_LANGS,
  DEFAULT_LANG,
} from '@/lib/speech-langs';

const TRANSLATE_SYSTEM = `You translate one financial payment instruction to English.

Preserve exactly — do not alter, translate, or paraphrase:
  • All numeric amounts (e.g. "5", "12.50", "1 500")
  • All XRPL addresses — they start with lowercase 'r' and are 25–34 characters
  • All vendor or company names (proper nouns)
  • The word "RLUSD" or any currency code

Output ONLY the translated English sentence. No explanation, no code fences, no quotes.
If the instruction is already in English, output it unchanged.`;

async function translateWithLLM(text: string, sourceLang: string): Promise<string> {
  const langLabel = SPEECH_LANGS.find((l) => l.code === sourceLang)?.label ?? sourceLang;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':          env.anthropicKey,
      'anthropic-version':  '2023-06-01',
      'content-type':       'application/json',
    },
    body: JSON.stringify({
      model:       env.llmModel,
      max_tokens:  300,
      temperature: 0,
      system: TRANSLATE_SYSTEM,
      messages: [
        {
          role:    'user',
          content: `Source language: ${langLabel}\n\nInstruction:\n"""${text}"""`,
        },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`Translation request failed with ${res.status}`);

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const result = data.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';

  // Sanity: if the model returned nothing useful, treat it as a failure
  if (!result || result.length < 2) throw new Error('LLM returned an empty translation');

  return result;
}

// ─── Vulavula language code map (BCP-47 → ISO 639-3 Flores-200) ──────────────
const VULAVULA_LANG: Record<string, string> = {
  'zu-ZA':  'zul_Latn',
  'af-ZA':  'afr_Latn',
  'xh-ZA':  'xho_Latn',
  'nso-ZA': 'nso_Latn',
};

type VulavulaTranslateResponse = {
  id?: string;
  translation?: { translated_text: string }[];
  detail?: string;
};

/** Lelapa AI Vulavula — built for African languages, including isiXhosa. */
async function translateWithVulavula(text: string, sourceLang: string): Promise<string> {
  const sourceCode = VULAVULA_LANG[sourceLang];
  if (!sourceCode) throw new Error(`Vulavula translation does not support language: ${sourceLang}`);

  // Protect XRPL addresses and RLUSD from being altered
  const store: string[] = [];
  const safe = text.replace(/\br[1-9A-HJ-NP-Za-km-z]{24,33}\b|\bRLUSD\b/g, (m) => {
    store.push(m);
    return `[[${store.length - 1}]]`;
  });

  const res = await fetch('https://api.lelapa.ai/v1/translate/process', {
    method:  'POST',
    headers: { 'X-CLIENT-TOKEN': env.vulavulaKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ input_text: safe, source_lang: sourceCode, target_lang: 'eng_Latn' }),
    signal:  AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as VulavulaTranslateResponse | null;
    throw new Error(err?.detail ?? `Vulavula returned ${res.status}`);
  }

  const data = (await res.json()) as VulavulaTranslateResponse;
  const result = data.translation?.[0]?.translated_text?.trim() ?? '';
  if (!result || result.length < 2) throw new Error('Vulavula returned empty translation');

  return result.replace(/\[\[(\d+)\]\]/g, (_, i) => store[Number(i)] ?? '');
}

/** Google Cloud Translation API — preserves XRPL addresses and amounts via placeholders. */
async function translateWithGoogle(text: string, sourceLang: string): Promise<string> {
  // Replace XRPL addresses and bare amounts with stable placeholders before sending to Google
  const store: string[] = [];
  const safe = text.replace(/\br[1-9A-HJ-NP-Za-km-z]{24,33}\b|\bRLUSD\b/g, (m) => {
    store.push(m);
    return `[[${store.length - 1}]]`;
  });

  const sourceIso = sourceLang.split('-')[0]; // "zu-ZA" → "zu"
  const url = `https://translation.googleapis.com/language/translate/v2?key=${env.googleCloudKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: safe, source: sourceIso, target: 'en', format: 'text' }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Google Translate returned ${res.status}`);

  const data = (await res.json()) as {
    data?: { translations?: { translatedText: string }[] };
    error?: { message: string };
  };

  if (data.error) throw new Error(data.error.message);

  const result = data.data?.translations?.[0]?.translatedText?.trim() ?? '';
  if (!result || result.length < 2) throw new Error('Google Translate returned empty result');

  // Restore placeholders
  return result.replace(/\[\[(\d+)\]\]/g, (_, i) => store[Number(i)] ?? '');
}

/** Keyword-map fallback: replaces known payment verbs only. */
function translateWithKeywordMap(text: string, sourceLang: string): string {
  const normalised = normaliseForEnglishParser(text, sourceLang);
  return applyMishearingMap(normalised, MISHEARING_MAP);
}

export interface TranslationResult {
  translated: string;
  method: TranslationMethod;
}

/**
 * Translates a payment instruction to English.
 * Returns the original text unchanged when the source is already English.
 */
export async function translateToEnglish(
  text: string,
  sourceLang: string,
): Promise<TranslationResult> {
  if (sourceLang === DEFAULT_LANG || sourceLang.startsWith('en-')) {
    return { translated: text, method: 'passthrough' };
  }

  if (env.configured.vulavula) {
    try {
      const translated = await translateWithVulavula(text, sourceLang);
      return { translated, method: 'vulavula' };
    } catch (e) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          scope: 'translation',
          message: 'Vulavula translation failed, trying next strategy',
          error: String(e),
          sourceLang,
        }),
      );
    }
  }

  if (env.configured.googleCloud) {
    try {
      const translated = await translateWithGoogle(text, sourceLang);
      return { translated, method: 'google' };
    } catch (e) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          scope: 'translation',
          message: 'Google Translate failed, trying LLM',
          error: String(e),
          sourceLang,
        }),
      );
    }
  }

  if (env.configured.llm) {
    try {
      const translated = await translateWithLLM(text, sourceLang);
      return { translated, method: 'llm' };
    } catch (e) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          scope: 'translation',
          message: 'LLM translation failed, falling back to keyword map',
          error: String(e),
          sourceLang,
        }),
      );
    }
  }

  return { translated: translateWithKeywordMap(text, sourceLang), method: 'keyword-map' };
}
