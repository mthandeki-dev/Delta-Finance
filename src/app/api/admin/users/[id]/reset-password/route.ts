import bcrypt from 'bcrypt';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/admin/users/[id]/reset-password
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = await readJson(req);

  const newPassword = str(body.newPassword, 'newPassword', 128);
  if (newPassword.length < 8) {
    throw new AppError(400, 'VALIDATION', 'Password must be at least 8 characters.');
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, email: true } });
  if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found.');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id },
    data: { passwordHash, passwordSalt: null, requirePasswordChange: true },
  });

  await audit('ADMIN_PASSWORD_RESET', {
    actor: `admin:${admin.email ?? admin.username}`,
    detail: { targetUserId: id, targetUsername: target.username ?? target.email },
  });

  return ok({ ok: true });
});
