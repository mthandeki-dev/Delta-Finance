import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/transactions/:id/reject — an admin declines an escalated payment.
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const updated = await prisma.transactionLog.updateMany({
    where: { id, status: 'PENDING_HITL' },
    data: { status: 'REJECTED', reason: `Declined by admin ${admin.xrplAddress}.` },
  });
  if (updated.count !== 1) throw new AppError(409, 'NOT_PENDING', 'This payment is not waiting for approval.');
  await audit('HITL_REJECTED', { actor: `admin:${admin.xrplAddress}`, txId: id });
  return ok({ ok: true });
});
