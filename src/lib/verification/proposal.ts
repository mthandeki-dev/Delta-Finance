// Pure conversion: Intent + server FX rate → Proposal fed into verifyProposal().
// The FX rate MUST come from env.fxZarPerRlusd (server config), never from the request.

import type { Intent } from '@/lib/policy/router';

export type Proposal = {
  intent: Intent;
  /** RLUSD amount converted to ZAR using the server-side FX rate. Used for threshold check. */
  amountRand: number;
  /** Raw Bearer token from the Authorization header; null for session-auth or admin paths. */
  privyToken: string | null;
  /** True when the caller is already authenticated via a server session (dashboard). */
  skipPrivyAuth: boolean;
  /** DB User.id for session-authenticated callers; null for pure API-key callers. */
  userId: string | null;
  /** Set only on the HITL approve path once the secret code has been validated. */
  adminApprovalEvidence: { codeId: string; adminId: string } | null;
};

export function toProposal(
  intent: Intent,
  fxZarPerRlusd: number,
  opts: {
    privyToken?: string | null;
    skipPrivyAuth?: boolean;
    userId?: string | null;
    adminApprovalEvidence?: { codeId: string; adminId: string } | null;
  } = {},
): Proposal {
  if (!Number.isFinite(fxZarPerRlusd) || fxZarPerRlusd <= 0) {
    throw new Error('fxZarPerRlusd must be a positive finite number sourced from server config');
  }
  return {
    intent,
    amountRand: intent.amount * fxZarPerRlusd,
    privyToken: opts.privyToken ?? null,
    skipPrivyAuth: opts.skipPrivyAuth ?? false,
    userId: opts.userId ?? null,
    adminApprovalEvidence: opts.adminApprovalEvidence ?? null,
  };
}
