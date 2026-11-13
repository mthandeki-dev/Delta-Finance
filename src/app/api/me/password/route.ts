import bcrypt from 'bcrypt';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUT /api/me/password — authenticated user changes their own password
export const PUT = route(async (req) => {
  const user = await requireUser();
  const body = await readJson(req);

  const currentPassword = str(body.currentPassword, 'currentPassword', 128);
  const newPassword = str(body.newPassword, 'newPassword', 128);

  if (newPassword.length < 8) {
    throw new AppError(400, 'VALIDATION', 'New password must be at least 8 characters.');
  }
  if (newPassword === currentPassword) {
    throw new AppError(400, 'VALIDATION', 'New password must be different from your current password.');
  }

  // Verify current password before allowing the change
  if (!user.passwordHash) {
    throw new AppError(400, 'NO_PASSWORD', 'Your account uses a different sign-in method.');
  }
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordSalt: null, requirePasswordChange: false },
  });

  await audit('USER_PASSWORD_CHANGED', { actor: `${user.role.toLowerCase()}:${user.email ?? user.username}` });
  return ok({ ok: true });
});
