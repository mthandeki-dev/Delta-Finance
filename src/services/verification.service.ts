// Binds the pure verifier to live Prisma + Privy dependencies.
// Every call writes a ProposalVerification row and an AuditLog entry regardless of outcome.

import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { sanitiseOutcomeReason } from '@/lib/verification/messages';
import { toProposal } from '@/lib/verification/proposal';
import { verifyProposal, type VerificationResult } from '@/lib/verification/verify';
import type { Intent } from '@/lib/policy/router';

export type VerifyInput = {
  intent: Intent;
  actor: string;
  txId?: string | null;
  privyToken?: string | null;
  skipPrivyAuth?: boolean;
  userId?: string | null;
  adminApprovalEvidence?: { codeId: string; adminId: string } | null;
};

export type VerifyOutput = VerificationResult & {
  userMessage: string | null;
  proposalVerificationId: string;
};

const DEDUP_WINDOW_MS = 5 * 60 * 1000;

export async function verify(input: VerifyInput): Promise<VerifyOutput> {
  const fxZarPerRlusd = env.fxZarPerRlusd;
  const proposal = toProposal(input.intent, fxZarPerRlusd, {
    privyToken: input.privyToken,
    skipPrivyAuth: input.skipPrivyAuth,
    userId: input.userId,
    adminApprovalEvidence: input.adminApprovalEvidence,
  });

  const result = await verifyProposal(proposal, {
    async verifyPrivyToken(token) {
      const key = env.privyVerificationKey;
      if (!key) throw new Error('PRIVY_VERIFICATION_KEY is not configured on this server.');
      const { verifyAccessToken } = await import('@privy-io/node');
      const payload = await verifyAccessToken({
        access_token: token,
        app_id: env.privyAppId,
        verification_key: key,
      });
      return { userId: payload.user_id };
    },

    async loadContext({ merchantAddress, amountRlusd, resolvedUserId }) {
      const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS);

      const [vendors, user, recentCount] = await Promise.all([
        prisma.vendor.findMany({ where: { active: true }, select: { xrplAddress: true } }),
        resolvedUserId
          ? prisma.user.findFirst({
              where: { OR: [{ id: resolvedUserId }, { privyUserId: resolvedUserId }] },
              select: { thresholdAmountRand: true },
            })
          : Promise.resolve(null),
        prisma.transactionLog.count({
          where: {
            merchantAddress,
            amountRlusd: amountRlusd,
            createdAt: { gte: windowStart },
            status: { notIn: ['BLOCKED', 'REJECTED', 'FAILED'] },
            ...(input.txId ? { NOT: { id: input.txId } } : {}),
          },
        }),
      ]);

      return {
        whitelistAddresses: new Set(vendors.map((v) => v.xrplAddress)),
        userThresholdRand: user?.thresholdAmountRand != null ? Number(user.thresholdAmountRand) : null,
        recentTxCount: recentCount,
      };
    },
  });

  const userMessage = result.passed ? null : sanitiseOutcomeReason(result.failedCheck);

  const pv = await prisma.proposalVerification.create({
    data: {
      txId: input.txId ?? null,
      userId: result.resolvedUserId ?? input.userId ?? null,
      aiProposal: { intent: input.intent, amountRand: proposal.amountRand },
      checks: result.checks,
      passed: result.passed,
      failedCheck: result.failedCheck ?? null,
      reason: result.reason ?? null,
      userMessage,
    },
  });

  await audit(result.passed ? 'VERIFICATION_PASSED' : 'VERIFICATION_FAILED', {
    actor: input.actor,
    txId: input.txId ?? undefined,
    detail: { failedCheck: result.failedCheck, checks: result.checks.length, pvId: pv.id },
  });

  return { ...result, userMessage, proposalVerificationId: pv.id };
}
