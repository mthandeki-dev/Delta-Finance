import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http';
import { requireAdmin } from '@/lib/session';
import { syncPrivyMandate } from '@/services/agent.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/vendors/:id — remove a vendor from the whitelist (soft delete keeps history readable).
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor || !vendor.active) throw new AppError(404, 'NOT_FOUND', 'Vendor not found.');
  await prisma.vendor.update({ where: { id }, data: { active: false } });
  await audit('VENDOR_REMOVED', { actor: `admin:${admin.xrplAddress}`, detail: { label: vendor.label, xrplAddress: vendor.xrplAddress } });
  const privySync = await syncPrivyMandate(`admin:${admin.xrplAddress}`);
  return ok({ ok: true, privySync });
});
