import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import { getSessionUser } from '@/lib/session';
import { runAgent } from '@/services/agent.service';
import { translateToEnglish } from '@/services/translation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function validApiKey(given: string | null): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(env.agentApiKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Minimal in-memory rate limit (per caller, per instance). Put WAF/API Gateway limits in front for production.
const hits = new Map<string, number[]>();
function rateLimit(key: string, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new AppError(429, 'RATE_LIMITED', 'Too many agent requests. Try again in a minute.');
  recent.push(now);
  hits.set(key, recent);
}

/**
 * POST /api/agent
 * { "prompt": "...", "sourceLang": "zu-ZA" }
 *
 * sourceLang (optional, default "en-ZA"): BCP-47 code of the language the user spoke or typed.
 * When non-English, the prompt is translated to English here — before intent parsing — using
 * the same translation service as /api/translate. The agent always receives English.
 *
 * Zero-trust router outcomes:
 *   Path A  200  EXECUTED       under limit, not payroll → Privy signs, t54 settles on XRPL Testnet
 *   Path B  202  PENDING_HITL   over limit or payroll    → waits for an admin, a secret code and a Xaman signature
 *   Path C  403  BLOCKED        mandate violation        → rejected, with the enforcing layer recorded
 *           502  FAILED         technical failure
 *
 * Callers: an admin session (dashboard console) or a machine with the x-agent-api-key header.
 */
export const POST = route(async (req) => {
  const user = await getSessionUser();
  const viaKey = validApiKey(req.headers.get('x-agent-api-key'));
  if (!viaKey && !user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in or provide a valid x-agent-api-key header.');
  }
  const actor = user ? `${user.role.toLowerCase()}:${user.xrplAddress ?? user.email ?? user.id}` : 'agent-api';
  rateLimit(actor);

  const body = await readJson<{ prompt?: unknown; sourceLang?: unknown }>(req);
  const rawPrompt  = str(body.prompt, 'prompt', 500);
  const sourceLang = typeof body.sourceLang === 'string' ? body.sourceLang : 'en-ZA';

  // ── Translation gate ───────────────────────────────────────────────────────
  // Translate to English before the prompt reaches the intent parser.
  // Passthrough (no-op) when sourceLang is already English or translation was
  // already done client-side (caller passes "en-ZA" in that case).
  const { translated: prompt } = await translateToEnglish(rawPrompt, sourceLang);

  const authHeader = req.headers.get('authorization') ?? '';
  const privyToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const result = await runAgent({ prompt, actor, privyToken, userId: user?.id ?? null });
  const status = result.status === 'EXECUTED' ? 200 : result.status === 'PENDING_HITL' ? 202 : result.status === 'BLOCKED' ? 403 : 502;
  return ok(result, status);
});
