import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import { fromMicro } from '@/lib/money';
import { parseSecretCode, verifySecret } from '@/lib/secret-code';
import { requireAdmin } from '@/lib/session';
import { verify as verifyProposal } from '@/services/verification.service';
import { createPaymentRequest } from '@/services/xaman.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;

/**
 * POST /api/transactions/:id/approve  { "code": "DF-XXXXXX-XXXXX-XXXXX-XXXXX" }
 *
 * Human-in-the-loop, two factors: (1) a one-time secret code, then (2) the admin's own signature in Xaman.
 * A valid code does not move money; it only releases the sign request to the admin's phone.
 */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const actor = `admin:${admin.xrplAddress ?? admin.username}`;
  const input = str((await readJson<{ code?: unknown }>(req)).code, 'Secret code', 40);

  const tx = await prisma.transactionLog.findUnique({ where: { id } });
  if (!tx || !tx.amountRlusd || !tx.merchantAddress) throw new AppError(404, 'NOT_FOUND', 'Payment not found.');
  if (tx.status !== 'PENDING_HITL') throw new AppError(409, 'NOT_PENDING', 'This payment is not waiting for approval.');
  if (tx.hitlAttempts >= MAX_ATTEMPTS) {
    throw new AppError(423, 'LOCKED', 'Too many incorrect codes. This payment is locked; reject it and have the agent resubmit.');
  }

  // Factor 1: the secret code (single use, expiring, constant-time comparison)
  const parsed = parseSecretCode(input);
  const row = parsed ? await prisma.secretCode.findUnique({ where: { prefix: parsed.prefix } }) : null;
  const valid =
    parsed && row && !row.usedAt && !row.revokedAt && row.expiresAt.getTime() > Date.now() && verifySecret(parsed.secret, row.salt, row.codeHash);
  if (!valid || !row) {
    const updated = await prisma.transactionLog.update({ where: { id }, data: { hitlAttempts: { increment: 1 } } });
    await audit('HITL_CODE_REJECTED', { actor, txId: id, detail: { attempts: updated.hitlAttempts } });
    const left = MAX_ATTEMPTS - updated.hitlAttempts;
    throw new AppError(403, 'BAD_CODE', `That code is not valid, has expired or was already used. ${left} attempt${left === 1 ? '' : 's'} left.`);
  }

  // A human can approve over-limit and payroll payments, but nobody can approve a non-whitelisted destination.
  const vendor = await prisma.vendor.findFirst({ where: { xrplAddress: tx.merchantAddress, active: true } });
  if (!vendor) {
    await prisma.transactionLog.update({
      where: { id },
      data: { route: 'BLOCKED', status: 'BLOCKED', blockedBy: 'APP_POLICY', reason: 'Vendor was removed from the whitelist before approval.' },
    });
    await audit('AGENT_BLOCKED', { actor, txId: id, detail: { layer: 'APP_POLICY', reason: 'vendor no longer whitelisted' } });
    throw new AppError(409, 'VENDOR_NOT_WHITELISTED', 'This vendor is no longer approved. The payment has been blocked.');
  }

  // Backend verification gate (WHITELIST + DUPLICATE only; PRIVY_AUTH skipped for admin session)
  const intentAmount = Number(fromMicro(BigInt(tx.amountRlusd.mul(1_000_000).toFixed(0))));
  const vr = await verifyProposal({
    intent: { action: 'PAY', amount: intentAmount, merchant_address: tx.merchantAddress, is_payroll: tx.isPayroll },
    actor,
    txId: id,
    skipPrivyAuth: true,
    userId: admin.id,
    adminApprovalEvidence: { codeId: row.id, adminId: admin.id },
  });
  if (!vr.passed) {
    await prisma.transactionLog.update({
      where: { id },
      data: { route: 'BLOCKED', status: 'BLOCKED', blockedBy: 'BACKEND_VERIFICATION', reason: vr.userMessage },
    });
    await audit('AGENT_BLOCKED', { actor, txId: id, detail: { layer: 'BACKEND_VERIFICATION', failedCheck: vr.failedCheck } });
    throw new AppError(409, 'VERIFICATION_FAILED', vr.userMessage ?? 'The payment was blocked by a verification check.');
  }

  // Burn the code atomically so two concurrent approvals cannot share it.
  const burned = await prisma.secretCode.updateMany({
    where: { id: row.id, usedAt: null, revokedAt: null },
    data: { usedAt: new Date(), usedForTxId: id },
  });
  if (burned.count !== 1) throw new AppError(409, 'CODE_USED', 'That code was just used. Generate a new one.');

  // Factor 2: the admin signs the XRPL Payment in Xaman
  const amount = fromMicro(BigInt(tx.amountRlusd.mul(1_000_000).toFixed(0)));
  const request = await createPaymentRequest({
    txId: id,
    destination: tx.merchantAddress,
    amount,
    userToken: admin.xamanUserToken,
    memo: `HITL ${id}`,
  });
  await prisma.transactionLog.update({
    where: { id },
    data: { status: 'AWAITING_SIGNATURE', xamanPayloadUuid: request.uuid, approvedById: admin.id },
  });
  await audit('HITL_CODE_ACCEPTED', { actor, txId: id, detail: { codePrefix: row.prefix, xamanPayload: request.uuid, pushed: request.pushed } });
  return ok({ qrPng: request.qrPng, deeplink: request.deeplink, pushed: request.pushed });
});
