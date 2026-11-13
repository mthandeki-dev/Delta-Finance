import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { verifyUserPassword } from '@/lib/password';
import { startSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  rateLimit(`login:${ip}`, 20, 60_000);

  const body = await readJson(req);
  const identifier = str(body.identifier, 'Email or username', 200).toLowerCase();
  const password = str(body.password, 'password', 128);

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
  });

  // Generic error — never reveal whether the account exists
  if (!user || !(await verifyUserPassword(user, password))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email/username or password is incorrect.');
  }

  if (!user.active) {
    throw new AppError(401, 'ACCOUNT_DISABLED', 'This account has been deactivated. Contact your administrator.');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession(user);
  await audit('USER_SIGNED_IN', { actor: `${user.role.toLowerCase()}:${user.email ?? user.username}` });

  return ok({ ok: true, requirePasswordChange: user.requirePasswordChange });
});
