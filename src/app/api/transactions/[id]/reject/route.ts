import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http';
import { requireAdmin } from '@/lib/session';
import { cancelPayload } from '@/services/xaman.service';

// POST /api/transactions/:id/reject — admin cancels an escalated payment at any point before it is signed.
// Works at both PENDING_HITL (before code entry) and AWAITING_SIGNATURE (Xaman request open).
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const actor = `admin:${admin.xrplAddress ?? admin.username}`;

  const tx = await prisma.transactionLog.findUnique({ where: { id } });
  if (!tx || (tx.status !== 'PENDING_HITL' && tx.status !== 'AWAITING_SIGNATURE')) {
    throw new AppError(409, 'NOT_PENDING', 'This payment is not waiting for approval.');
  }

  // Cancel the open Xaman sign request so the admin's phone stops prompting them.
  if (tx.status === 'AWAITING_SIGNATURE' && tx.xamanPayloadUuid) {
    await cancelPayload(tx.xamanPayloadUuid);
  }

  await prisma.transactionLog.update({
    where: { id },
    data: { status: 'REJECTED', reason: `Cancelled by ${actor}.` },
  });
  await audit('HITL_REJECTED', { actor, txId: id, detail: { cancelledAt: tx.status } });
  return ok({ ok: true });
});
