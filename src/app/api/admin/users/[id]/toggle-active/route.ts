import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/admin/users/[id]/toggle-active
export const POST = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  // Prevent self-deactivation
  if (admin.id === id) {
    throw new AppError(409, 'SELF_DEACTIVATION', 'You cannot deactivate your own account.');
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, active: true, role: true, username: true, email: true },
  });
  if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found.');

  // Protect last active admin from deactivation
  if (target.active && target.role === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN', active: true, NOT: { id } } });
    if (adminCount === 0) throw new AppError(409, 'LAST_ADMIN', 'Cannot deactivate the last active administrator.');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { active: !target.active },
    select: { id: true, active: true },
  });

  const event = updated.active ? 'ADMIN_USER_ACTIVATED' : 'ADMIN_USER_DEACTIVATED';
  await audit(event, {
    actor: `admin:${admin.email ?? admin.username}`,
    detail: { targetUserId: id, targetUsername: target.username ?? target.email },
  });

  return ok({ id: updated.id, active: updated.active });
});
