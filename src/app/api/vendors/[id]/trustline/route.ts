import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http';
import { requireAdmin } from '@/lib/session';
import { createTrustSetRequest } from '@/services/xaman.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/vendors/:id/trustline — generate a Xaman TrustSet QR so the vendor can add the RLUSD trust line. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor || !vendor.active) throw new AppError(404, 'NOT_FOUND', 'Vendor not found.');
  const request = await createTrustSetRequest(vendor.label);
  return ok(request, 201);
});
