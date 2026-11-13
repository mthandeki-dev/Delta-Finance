import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/http';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/finance-admins/[id]
export const DELETE = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await ctx.params;
  await prisma.financeAdmin.update({ where: { id }, data: { active: false } });
  return ok({ deleted: true });
});
