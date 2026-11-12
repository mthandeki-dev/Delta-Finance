import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/secret-codes/:id — revoke an unused code.
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const code = await prisma.secretCode.findUnique({ where: { id } });
  if (!code || code.usedAt || code.revokedAt) throw new AppError(404, 'NOT_FOUND', 'No active code with that id.');
  await prisma.secretCode.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit('SECRET_CODE_REVOKED', { actor: `admin:${admin.xrplAddress}`, detail: { prefix: code.prefix } });
  return ok({ ok: true });
});
