import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http';
import { clearLoginChallenge, readLoginChallenge, startSession } from '@/lib/session';
import { getSignResult } from '@/services/xaman.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/auth/xaman/:uuid — poll a sign-in. Creates the session once the admin has signed in Xaman.
export const GET = route<{ params: Promise<{ uuid: string }> }>(async (_req, { params }) => {
  const { uuid } = await params;
  // Only the browser that started this sign-in may complete it.
  if ((await readLoginChallenge()) !== uuid) throw new AppError(403, 'LOGIN_MISMATCH', 'This sign-in was not started from this browser.');

  const result = await getSignResult(uuid);
  if (!result.resolved) return ok({ state: result.expired ? 'expired' : 'pending' });
  if (!result.signed || !result.account) {
    await clearLoginChallenge();
    return ok({ state: result.expired ? 'expired' : 'rejected' });
  }

  // RBAC: addresses on the allow-list are administrators; everyone else gets read-only access.
  const role = env.adminAddresses.includes(result.account) ? 'ADMIN' : 'VIEWER';
  const user = await prisma.user.upsert({
    where: { xrplAddress: result.account },
    update: { role, lastLoginAt: new Date(), ...(result.userToken ? { xamanUserToken: result.userToken } : {}) },
    create: { xrplAddress: result.account, role, xamanUserToken: result.userToken },
  });
  await startSession(user);
  await clearLoginChallenge();
  await audit('USER_SIGNED_IN', { actor: `${role.toLowerCase()}:${user.xrplAddress}` });
  return ok({ state: 'signed', role });
});
