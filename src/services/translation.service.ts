// Server-side translation: natural language → English payment instruction.
//
// Strategy:
//   1. Passthrough  if sourceLang is already English (en-ZA)
//   2. LLM          Anthropic API, temperature=0, payment-domain system prompt
//   3. Keyword-map  falls back when LLM is not configured or returns an error
//
// XRPL addresses (starting with 'r', 25-34 chars) and numeric amounts are always
// preserved exactly — the system prompt explicitly forbids the model from altering them.

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
