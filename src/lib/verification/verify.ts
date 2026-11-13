// Pure verification engine. Zero network or DB calls — those are injected via deps.
// Checks run in strict order and are fail-fast: the first failure stops the chain.

import type { Proposal } from './proposal';

export type CheckName = 'PRIVY_AUTH' | 'DB_CONTEXT' | 'WHITELIST' | 'THRESHOLD' | 'DUPLICATE';

export type CheckRecord = {
  check: CheckName;
  passed: boolean;
  reason?: string;
};

export type VerificationContext = {
  whitelistAddresses: ReadonlySet<string>;
  userThresholdRand: number | null; // null = no personal threshold configured
  recentTxCount: number; // identical-ish txs in the dedup window
};

export type VerificationDeps = {
  verifyPrivyToken: (token: string) => Promise<{ userId: string }>;
  loadContext: (opts: { merchantAddress: string; amountRlusd: number; resolvedUserId: string | null }) => Promise<VerificationContext>;
};

export type VerificationResult = {
  checks: CheckRecord[];
  passed: boolean;
  failedCheck: CheckName | null;
  reason: string | null;
  resolvedUserId: string | null;
};

export async function verifyProposal(proposal: Proposal, deps: VerificationDeps): Promise<VerificationResult> {
  const checks: CheckRecord[] = [];
  let resolvedUserId: string | null = proposal.userId;

  function fail(check: CheckName, reason: string): VerificationResult {
    checks.push({ check, passed: false, reason });
    return { checks, passed: false, failedCheck: check, reason, resolvedUserId };
  }

  // (a) PRIVY_AUTH — machine callers without a Privy identity are rejected here
  if (proposal.skipPrivyAuth) {
    checks.push({ check: 'PRIVY_AUTH', passed: true });
  } else if (proposal.adminApprovalEvidence) {
    // HITL approve path: code already validated against DB; admin identity confirmed
    resolvedUserId = proposal.adminApprovalEvidence.adminId;
    checks.push({ check: 'PRIVY_AUTH', passed: true });
  } else if (proposal.privyToken) {
    try {
      const { userId } = await deps.verifyPrivyToken(proposal.privyToken);
      resolvedUserId = userId;
      checks.push({ check: 'PRIVY_AUTH', passed: true });
    } catch (e) {
      return fail('PRIVY_AUTH', `Privy token verification failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    return fail('PRIVY_AUTH', 'No Privy token provided and skipPrivyAuth is false. Machine callers must present a valid Privy identity.');
  }

  // (b) DB_CONTEXT — load vendor whitelist + user threshold + duplicate count
  let ctx: VerificationContext;
  try {
    ctx = await deps.loadContext({
      merchantAddress: proposal.intent.merchant_address,
      amountRlusd: proposal.intent.amount,
      resolvedUserId,
    });
  } catch (e) {
    return fail('DB_CONTEXT', `Context load failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  checks.push({ check: 'DB_CONTEXT', passed: true });

  // (c) WHITELIST — exact match required, no fuzzy or prefix matching
  if (!ctx.whitelistAddresses.has(proposal.intent.merchant_address)) {
    return fail('WHITELIST', 'Recipient not whitelisted');
  }
  checks.push({ check: 'WHITELIST', passed: true });

  // (d) THRESHOLD — only fires when a personal threshold is configured for this user
  if (ctx.userThresholdRand !== null && proposal.amountRand > ctx.userThresholdRand) {
    return fail('THRESHOLD', `Payment R${proposal.amountRand.toFixed(2)} exceeds user threshold R${ctx.userThresholdRand.toFixed(2)}`);
  }
  checks.push({ check: 'THRESHOLD', passed: true });

  // (e) DUPLICATE — block within the dedup window (5-minute default, enforced by loadContext)
  if (ctx.recentTxCount > 0) {
    return fail('DUPLICATE', `${ctx.recentTxCount} near-identical payment(s) found in the dedup window`);
  }
  checks.push({ check: 'DUPLICATE', passed: true });

  return { checks, passed: true, failedCheck: null, reason: null, resolvedUserId };
}
