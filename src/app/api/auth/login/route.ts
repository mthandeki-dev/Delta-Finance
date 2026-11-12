import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import { verifyPassword } from '@/lib/password';
import { startSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/auth/login — sign in with email (or username) and password.
export const POST = route(async (req) => {
  const body = await readJson(req);

  const identifier = str(body.identifier, 'Email or username', 200).toLowerCase();
  const password = str(body.password, 'password', 128);

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
  });

  // Constant-time failure path to prevent user enumeration via timing.
  const invalid = !user || !user.passwordHash || !user.passwordSalt;
  const passwordOk = invalid ? false : verifyPassword(password, user.passwordSalt!, user.passwordHash!);

  if (!passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email/username or password is incorrect.');
  }

  await prisma.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date() } });
  await startSession(user!);
  await audit('USER_SIGNED_IN', { actor: `${user!.role.toLowerCase()}:${user!.email ?? user!.username}` });
  return ok({ ok: true });
});
