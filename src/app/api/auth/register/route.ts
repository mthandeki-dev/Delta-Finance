import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import bcrypt from 'bcrypt';
import { startSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/auth/register — create an account with username, email, and password.
export const POST = route(async (req) => {
  const body = await readJson(req);

  const username = str(body.username, 'username', 30);
  const email = str(body.email, 'email', 200).toLowerCase();
  const password = str(body.password, 'password', 128);

  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    throw new AppError(400, 'VALIDATION', 'Username may only contain letters, numbers, and underscores (3–30 characters).');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, 'VALIDATION', 'Please enter a valid email address.');
  }
  if (password.length < 8) {
    throw new AppError(400, 'VALIDATION', 'Password must be at least 8 characters.');
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true, username: true },
  });
  if (existing?.email === email) throw new AppError(409, 'EMAIL_TAKEN', 'An account with that email already exists.');
  if (existing?.username === username) throw new AppError(409, 'USERNAME_TAKEN', 'That username is already taken.');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { username, email, passwordHash, passwordSalt: null },
  });

  await startSession(user);
  return ok({ ok: true });
});
