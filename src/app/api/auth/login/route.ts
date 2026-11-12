import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import { verifyUserPassword } from '@/lib/password';
import { startSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Legacy POST /api/auth/login remains available to clients using the signed
// Delta Finance session. The web password form uses NextAuth credentials.
export const POST = route(async (req) => {
  const body = await readJson(req);
  const identifier = str(body.identifier, 'Email or username', 200).toLowerCase();
  const password = str(body.password, 'password', 128);
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
  });

  if (!user || !(await verifyUserPassword(user, password))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email/username or password is incorrect.');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession(user);
  await audit('USER_SIGNED_IN', { actor: `${user.role.toLowerCase()}:${user.email ?? user.username}` });
  return ok({ ok: true });
});
