import { AGENT_WALLET_ID, ensurePolicy, prisma } from '@/lib/db';
import { env, EXPLORER_TX } from '@/lib/env';
import { ok, route } from '@/lib/http';
import { fromMicro } from '@/lib/money';
import { requireUser } from '@/lib/session';
import type { DashboardData, SecretCodeView } from '@/lib/types';
import { spentTodayMicro } from '@/services/agent.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/dashboard — everything the dashboard renders, in one round trip (polled every few seconds).
export const GET = route(async () => {
  const user = await requireUser();
  const [policy, vendors, codes, txs, wallet, spent] = await Promise.all([
    ensurePolicy(),
    prisma.vendor.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } }),
    prisma.secretCode.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.transactionLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.agentWallet.findUnique({ where: { id: AGENT_WALLET_ID } }),
    spentTodayMicro(),
  ]);
  const labels = new Map(vendors.map((v) => [v.xrplAddress, v.label]));
  const now = Date.now();

  const data: DashboardData = {
    user: {
      id: user.id,
      xrplAddress: user.xrplAddress,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      requirePasswordChange: user.requirePasswordChange,
    },
    policy: {
      agentEnabled: policy.agentEnabled,
      dailyLimitRlusd: fromMicro(BigInt(policy.dailyLimitRlusd.mul(1_000_000).toFixed(0))),
      perTxLimitRlusd: fromMicro(BigInt(policy.perTxLimitRlusd.mul(1_000_000).toFixed(0))),
      spentTodayRlusd: fromMicro(spent),
      privySyncedAt: policy.privySyncedAt?.toISOString() ?? null,
      privySyncError: policy.privySyncError,
      updatedAt: policy.updatedAt.toISOString(),
    },
    vendors: vendors.map((v) => ({
      id: v.id,
      label: v.label,
      xrplAddress: v.xrplAddress,
      country: v.country,
      isVendor: v.isVendor,
      createdAt: v.createdAt.toISOString(),
    })),
    secretCodes: codes.map((c) => {
      const state: SecretCodeView['state'] = c.revokedAt ? 'REVOKED' : c.usedAt ? 'USED' : c.expiresAt.getTime() < now ? 'EXPIRED' : 'ACTIVE';
      return { id: c.id, prefix: c.prefix, label: c.label, createdAt: c.createdAt.toISOString(), expiresAt: c.expiresAt.toISOString(), state };
    }),
    transactions: txs.map((t) => ({
      id: t.id,
      createdAt: t.createdAt.toISOString(),
      actor: t.actor,
      prompt: t.prompt,
      amountRlusd: t.amountRlusd ? fromMicro(BigInt(t.amountRlusd.mul(1_000_000).toFixed(0))) : null,
      merchantAddress: t.merchantAddress,
      vendorLabel: t.merchantAddress ? (labels.get(t.merchantAddress) ?? null) : null,
      isPayroll: t.isPayroll,
      route: t.route,
      status: t.status,
      blockedBy: t.blockedBy,
      reason: t.reason,
      txHash: t.txHash,
      settledVia: t.settledVia,
      whitelisted: t.merchantAddress ? labels.has(t.merchantAddress) : false,
    })),
    agentWallet: wallet ? { address: wallet.address, trustlineSet: wallet.trustlineSet } : null,
    config: {
      privy: env.configured.privy,
      xaman: env.configured.xaman,
      llm: env.configured.llm,
      redTeam: env.allowRedTeam,
      displayFx: env.displayFx,
      explorerTx: EXPLORER_TX,
    },
  };
  return ok(data);
});
