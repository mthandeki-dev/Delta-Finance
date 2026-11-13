import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http';
import { fromMicro } from '@/lib/money';
import { requireUser } from '@/lib/session';
import { getSignResult } from '@/services/xaman.service';
import { confirmRlusdPayment } from '@/services/xrpl.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/transactions/:id/status — polled while a HITL payment waits for the Xaman signature.
// Reconciles the Xaman payload and then the validated ledger; only a validated tesSUCCESS counts as EXECUTED.
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireUser();
  const { id } = await params;
  const tx = await prisma.transactionLog.findUnique({ where: { id }, include: { approvedBy: true } });
  if (!tx) throw new AppError(404, 'NOT_FOUND', 'Payment not found.');
  if (tx.status !== 'AWAITING_SIGNATURE' || !tx.xamanPayloadUuid || !tx.amountRlusd || !tx.merchantAddress) {
    return ok({ status: tx.status, txHash: tx.txHash, reason: tx.reason });
  }

  const actor = tx.approvedBy ? `admin:${tx.approvedBy.xrplAddress}` : 'system';
  const sign = await getSignResult(tx.xamanPayloadUuid);
  if (!sign.resolved && !sign.expired) return ok({ status: 'AWAITING_SIGNATURE' });

  if (!sign.signed || !sign.txid) {
    const reason = sign.expired ? 'The Xaman sign request expired.' : 'The admin declined the request in Xaman.';
    await prisma.transactionLog.update({ where: { id }, data: { status: 'REJECTED', reason } });
    await audit('HITL_REJECTED', { actor, txId: id, detail: { reason } });
    return ok({ status: 'REJECTED', reason });
  }

  // The signer must be an administrator. Accept addresses that have ADMIN role in the DB
  // or that appear in ADMIN_XRPL_ADDRESSES (covers admins who use password login and have no DB xrplAddress yet).
  const signerAddress = sign.account;
  const signer = signerAddress ? await prisma.user.findUnique({ where: { xrplAddress: signerAddress } }) : null;
  const isAdmin = signer?.role === 'ADMIN' || (signerAddress ? env.adminAddresses.includes(signerAddress) : false);
  if (!isAdmin) {
    const reason = `Signed by ${signerAddress ?? 'an unknown account'}, which is not an administrator. Recorded for review.`;
    await prisma.transactionLog.update({ where: { id }, data: { status: 'FAILED', txHash: sign.txid, reason } });
    await audit('HITL_SIGNER_NOT_ADMIN', { actor, txId: id, detail: { signer: signerAddress, txid: sign.txid } });
    return ok({ status: 'FAILED', txHash: sign.txid, reason });
  }

  const amount = fromMicro(BigInt(tx.amountRlusd.mul(1_000_000).toFixed(0)));
  const ledger = await confirmRlusdPayment(sign.txid, { to: tx.merchantAddress, amount }, 3);
  if (!ledger.validated) return ok({ status: 'AWAITING_SIGNATURE', txHash: sign.txid, note: 'Signed. Waiting for ledger validation.' });

  if (ledger.result === 'tesSUCCESS') {
    await prisma.transactionLog.update({ where: { id }, data: { status: 'EXECUTED', txHash: sign.txid, settledVia: 'XAMAN', reason: tx.reason } });
    await audit('HITL_PAYMENT_EXECUTED', { actor: `admin:${signerAddress}`, txId: id, detail: { hash: sign.txid, amount, to: tx.merchantAddress } });
    return ok({ status: 'EXECUTED', txHash: sign.txid });
  }
  const reason = `Ledger rejected the payment: ${ledger.result}.${ledger.result === 'tecPATH_DRY' ? ' The signing account or the vendor may be missing an RLUSD trust line or balance.' : ''}`;
  await prisma.transactionLog.update({ where: { id }, data: { status: 'FAILED', reason } });
  await audit('HITL_PAYMENT_FAILED', { actor, txId: id, detail: { hash: sign.txid, result: ledger.result } });
  return ok({ status: 'FAILED', reason });
});
