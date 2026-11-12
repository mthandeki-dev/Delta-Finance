import { ok, route } from '@/lib/http';
import { setLoginChallenge } from '@/lib/session';
import { createSignIn } from '@/services/xaman.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/auth/xaman — start a Xaman sign-in. Returns a QR code and deep link.
export const POST = route(async () => {
  const request = await createSignIn();
  await setLoginChallenge(request.uuid);
  return ok({ uuid: request.uuid, qrPng: request.qrPng, deeplink: request.deeplink });
});
