import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route } from '@/lib/http';
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
    id: u.id, fullName: u.fullName, username: u.username, email: u.email,
    xrplAddress: u.xrplAddress, role: u.role as 'ADMIN' | 'VIEWER',
    active: u.active, requirePasswordChange: u.requirePasswordChange,
    createdAt: u.createdAt.toISOString(), updatedAt: u.updatedAt.toISOString(), lastLoginAt: u.lastLoginAt.toISOString(),
  };
}

const SELECT = {
  id: true, fullName: true, username: true, email: true, xrplAddress: true,
  role: true, active: true, requirePasswordChange: true,
  createdAt: true, updatedAt: true, lastLoginAt: true,
};

// GET /api/admin/users/[id]
export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const user = await prisma.user.findUnique({ where: { id }, select: SELECT });
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found.');
  return ok({ user: toView(user) });
});

// PUT /api/admin/users/[id] — update fullName, email, username, role
export const PUT = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = await readJson(req);

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, active: true } });
  if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found.');

  const data: Record<string, unknown> = {};

  if (typeof body.fullName === 'string') {
    data.fullName = body.fullName.trim() || null;
  }

  if (typeof body.email === 'string') {
    const email = body.email.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError(400, 'VALIDATION', 'Please enter a valid email address.');
    }
    if (email) {
      const conflict = await prisma.user.findFirst({ where: { email, NOT: { id } }, select: { id: true } });
      if (conflict) throw new AppError(409, 'EMAIL_TAKEN', 'An account with that email already exists.');
    }
    data.email = email || null;
  }

  if (typeof body.username === 'string') {
    const username = body.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      throw new AppError(400, 'VALIDATION', 'Username may only contain lowercase letters, numbers and underscores (3–30 chars).');
    }
    const conflict = await prisma.user.findFirst({ where: { username, NOT: { id } }, select: { id: true } });
    if (conflict) throw new AppError(409, 'USERNAME_TAKEN', 'That username is already taken.');
    data.username = username;
  }

  if (typeof body.role === 'string') {
    const role = body.role.toUpperCase();
    if (!['ADMIN', 'VIEWER'].includes(role)) throw new AppError(400, 'VALIDATION', 'Role must be ADMIN or VIEWER.');
    // Protect last active admin from demotion
    if (target.role === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN', active: true, NOT: { id } } });
      if (adminCount === 0) throw new AppError(409, 'LAST_ADMIN', 'Cannot demote the last active administrator.');
    }
    data.role = role;
  }

  const updated = await prisma.user.update({ where: { id }, data, select: SELECT });

  await audit('ADMIN_USER_UPDATED', {
    actor: `admin:${admin.email ?? admin.username}`,
    detail: { targetUserId: id, changes: Object.keys(data) },
  });

  return ok({ user: toView(updated) });
});
