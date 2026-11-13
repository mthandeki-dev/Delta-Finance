import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/finance-admins — list notification recipients
export const GET = route(async () => {
  await requireAdmin();
  const admins = await prisma.financeAdmin.findMany({ orderBy: { createdAt: 'desc' } });
  return ok(admins);
});

// POST /api/finance-admins — add a notification recipient
export const POST = route(async (req) => {
  await requireAdmin();
  const body = await readJson<Record<string, unknown>>(req);
  const name = str(body.name, 'name');
  const email = str(body.email, 'email', 320);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'VALIDATION', 'email is not a valid address.');

  const admin = await prisma.financeAdmin.create({ data: { name, email } });
  return ok(admin, 201);
});
