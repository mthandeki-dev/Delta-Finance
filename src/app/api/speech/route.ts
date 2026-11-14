import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http';
import { getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── Vulavula BCP-47 → lang_code map ─────────────────────────────────────────
// Only languages the Vulavula STT model supports.
const VULAVULA_STT_LANGS: Record<string, string> = {
  'en-ZA':  'eng',
  'zu-ZA':  'zul',
  'af-ZA':  'afr',
  'nso-ZA': 'sot', // Sesotho
};

type VulavulaSTTResponse = {
  transcription_text?: string;
  error_message?: string | null;
};

type GoogleSTTResponse = {
  results?: { alternatives?: { transcript: string }[] }[];
  error?: { message: string; code: number };
};

async function transcribeWithVulavula(file: File, lang: string): Promise<string> {
  const langCode = VULAVULA_STT_LANGS[lang];
  if (!langCode) {
    throw new AppError(422, 'LANG_NOT_SUPPORTED', `Vulavula STT does not support language: ${lang}`);
  }

  const form = new FormData();
  form.append('file', file, file.name || 'recording.webm');

  const url = `https://api.lelapa.ai/v1/transcribe/sync?lang_code=${langCode}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'X-CLIENT-TOKEN': env.vulavulaKey },
    body:    form,
    signal:  AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as VulavulaSTTResponse | null;
    throw new AppError(502, 'STT_FAILED', err?.error_message ?? `Vulavula STT returned ${res.status}`);
  }

  const data = (await res.json()) as VulavulaSTTResponse;
  return data.transcription_text?.trim() ?? '';
}

async function transcribeWithGoogle(file: File, lang: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  const mimeType  = file.type || 'audio/webm';
  const encoding  = mimeType.includes('ogg') ? 'OGG_OPUS' : 'WEBM_OPUS';
  const url       = `https://speech.googleapis.com/v1/speech:recognize?key=${env.googleCloudKey}`;

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      config: { encoding, languageCode: lang, model: 'default', useEnhanced: true, enableAutomaticPunctuation: false },
      audio:  { content: base64 },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as GoogleSTTResponse | null;
    throw new AppError(502, 'STT_FAILED', err?.error?.message ?? `Google STT returned ${res.status}`);
  }

  const data = (await res.json()) as GoogleSTTResponse;
  return (data.results ?? []).flatMap((r) => r.alternatives?.[0]?.transcript ?? '').join(' ').trim();
}

/**
 * POST /api/speech  (multipart/form-data)
 *   file  — audio blob (WebM/OGG Opus from MediaRecorder)
 *   lang  — BCP-47 language code, e.g. "zu-ZA"
 *
 * Routes to Vulavula STT if VULAVULA_API_KEY is set, otherwise Google Cloud STT.
 * Returns { transcript: string }.
 */
export const POST = route(async (req) => {
  const user = await getSessionUser();
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to use speech recognition.');

  if (!env.configured.vulavula && !env.configured.googleCloud) {
    throw new AppError(503, 'STT_NOT_CONFIGURED', 'No speech recognition service is configured.');
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    throw new AppError(400, 'BAD_FORM', 'Request must be multipart/form-data.');
  }

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) throw new AppError(400, 'MISSING_AUDIO', 'No audio file provided.');

  const lang = typeof formData.get('lang') === 'string' ? (formData.get('lang') as string) : 'en-ZA';

  const transcript = env.configured.vulavula
    ? await transcribeWithVulavula(file, lang)
    : await transcribeWithGoogle(file, lang);

  return ok({ transcript });
});
