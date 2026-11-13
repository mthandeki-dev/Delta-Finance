import bcrypt from 'bcrypt';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import { requireAdmin } from '@/lib/session';
import type { UserView } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toView(u: {
  id: string; fullName: string | null; username: string | null; email: string | null;
  xrplAddress: string | null; role: string; active: boolean; requirePasswordChange: boolean;
  createdAt: Date; updatedAt: Date; lastLoginAt: Date;
}): UserView {
  return {
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    email: u.email,
    xrplAddress: u.xrplAddress,
    role: u.role as 'ADMIN' | 'VIEWER',
    active: u.active,
    requirePasswordChange: u.requirePasswordChange,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    lastLoginAt: u.lastLoginAt.toISOString(),
  };
}

// GET /api/admin/users — list all users
export const GET = route(async () => {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, fullName: true, username: true, email: true, xrplAddress: true,
      role: true, active: true, requirePasswordChange: true,
      createdAt: true, updatedAt: true, lastLoginAt: true,
    },
  });
  return ok({ users: users.map(toView) });
});

// POST /api/admin/users — create a new user
export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const body = await readJson(req);

  const username = str(body.username, 'username', 30).toLowerCase();
  const password = str(body.password, 'password', 128);
  const roleRaw = str(body.role, 'role', 10).toUpperCase();
  const fullName = typeof body.fullName === 'string' && body.fullName.trim() ? body.fullName.trim() : null;
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null;

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    throw new AppError(400, 'VALIDATION', 'Username may only contain lowercase letters, numbers and underscores (3–30 chars).');
  }
  if (!['ADMIN', 'VIEWER'].includes(roleRaw)) {
    throw new AppError(400, 'VALIDATION', 'Role must be ADMIN or VIEWER.');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, 'VALIDATION', 'Please enter a valid email address.');
  }
  if (password.length < 8) {
    throw new AppError(400, 'VALIDATION', 'Password must be at least 8 characters.');
  }

  const conflict = await prisma.user.findFirst({
    where: { OR: [{ username }, ...(email ? [{ email }] : [])] },
    select: { username: true, email: true },
  });
  if (conflict?.username === username) throw new AppError(409, 'USERNAME_TAKEN', 'That username is already taken.');
  if (email && conflict?.email === email) throw new AppError(409, 'EMAIL_TAKEN', 'An account with that email already exists.');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      username,
      fullName,
      email,
      passwordHash,
      passwordSalt: null,
      role: roleRaw as 'ADMIN' | 'VIEWER',
      active: true,
      requirePasswordChange: true,
    },
    select: {
      id: true, fullName: true, username: true, email: true, xrplAddress: true,
      role: true, active: true, requirePasswordChange: true,
      createdAt: true, updatedAt: true, lastLoginAt: true,
    },
  });

  await audit('ADMIN_USER_CREATED', {
    actor: `admin:${admin.email ?? admin.username}`,
    detail: { newUserId: user.id, username, role: roleRaw },
  });

  return ok({ user: toView(user) }, 201);
});
