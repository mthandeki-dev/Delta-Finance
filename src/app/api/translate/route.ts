import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import type { TranslateResponse } from '@/lib/message-protocol';
import { SPEECH_LANGS } from '@/lib/speech-langs';
import { getSessionUser } from '@/lib/session';
import { translateToEnglish } from '@/services/translation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_CODES = new Set(SPEECH_LANGS.map((l) => l.code));

/**
 * POST /api/translate
 * { "text": "<instruction in any language>", "sourceLang": "zu-ZA" }
 *
 * Returns the instruction translated to English, using the LLM when available
 * and the keyword-map as a fallback. English inputs are returned unchanged
 * with method "passthrough".
 *
 * Requires a valid session (same gate as /api/agent).
 */
export const POST = route(async (req) => {
  const user = await getSessionUser();
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to use the translation endpoint.');

  const body = await readJson<{ text?: unknown; sourceLang?: unknown }>(req);
  const text       = str(body.text, 'text', 2000);
  const sourceLang = str(body.sourceLang, 'sourceLang', 20);

  if (!SUPPORTED_CODES.has(sourceLang)) {
    throw new AppError(
      400,
      'UNSUPPORTED_LANGUAGE',
      `"${sourceLang}" is not in the supported language list. Add it to SPEECH_LANGS in speech-langs.ts.`,
    );
  }

  const { translated, method } = await translateToEnglish(text, sourceLang);

  return ok({
    original:   text,
    translated,
    sourceLang,
    targetLang: 'en',
    method,
  } satisfies TranslateResponse);
});
