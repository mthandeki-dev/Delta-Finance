import { ok, route } from '@/lib/http';
import { endSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async () => {
  await endSession();
  return ok({ ok: true });
});
