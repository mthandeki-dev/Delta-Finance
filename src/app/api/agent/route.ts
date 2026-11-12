import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import { getSessionUser } from '@/lib/session';
import { runAgent } from '@/services/agent.service';

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
 * POST /api/agent  { "prompt": "Pay Lagos Textiles 12.50 RLUSD for invoice 884" }
 *
 * The single entry point for the autonomous agent. Semantic → JSON intent → zero-trust router:
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
  if (!viaKey && user?.role !== 'ADMIN') {
    throw new AppError(401, 'UNAUTHENTICATED', 'Provide an admin session or a valid x-agent-api-key header.');
  }
  const actor = user?.role === 'ADMIN' ? `admin:${user.xrplAddress}` : 'agent-api';
  rateLimit(actor);

  const body = await readJson<{ prompt?: unknown; redTeam?: unknown }>(req);
  const prompt = str(body.prompt, 'prompt', 500);
  const redTeam = body.redTeam === true;
  if (redTeam && !(env.allowRedTeam && user?.role === 'ADMIN')) {
    throw new AppError(403, 'REDTEAM_DISABLED', 'The red-team test is only available to admins when ALLOW_REDTEAM_DEMO is on.');
  }

  const result = await runAgent({ prompt, actor, redTeam });
  const status = result.status === 'EXECUTED' ? 200 : result.status === 'PENDING_HITL' ? 202 : result.status === 'BLOCKED' ? 403 : 502;
  return ok(result, status);
});
