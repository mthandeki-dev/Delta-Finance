import { ok, readJson, route } from '@/lib/http';
import { requireAdmin } from '@/lib/session';
import { receiveStock } from '@/services/inventory.service';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/inventory/[id]/receive — mark stock as received (admin only)
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const body = await readJson<{ quantity: number }>(req);

  if (typeof body.quantity !== 'number' || body.quantity <= 0) {
    throw new AppError(400, 'VALIDATION', 'quantity must be a positive number.');
  }

  await receiveStock(id, body.quantity);
  return ok({ received: true });
});
