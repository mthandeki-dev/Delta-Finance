import { ok, route } from '@/lib/http';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/me — current authenticated user (safe subset, no password hash)
export const GET = route(async () => {
  const user = await requireUser();
  return ok({
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    xrplAddress: user.xrplAddress,
    role: user.role,
    active: user.active,
    requirePasswordChange: user.requirePasswordChange,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt.toISOString(),
  });
});
