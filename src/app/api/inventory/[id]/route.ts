import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route } from '@/lib/http';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH /api/inventory/[id] — update stock level or item settings (admin only)
export const PATCH = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const body = await readJson<Record<string, unknown>>(req);

  const existing = await prisma.inventory.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Inventory item not found.');

  const data: Record<string, unknown> = {};
  if (typeof body.currentStock === 'number') data.currentStock = body.currentStock;
  if (typeof body.minimumThreshold === 'number') data.minimumThreshold = body.minimumThreshold;
  if (typeof body.restockQuantity === 'number') data.restockQuantity = body.restockQuantity;
  if (typeof body.unitPriceRlusd === 'number') data.unitPriceRlusd = body.unitPriceRlusd;
  if (typeof body.maxSpendLimit === 'number') data.maxSpendLimit = body.maxSpendLimit;
  if (typeof body.vendorWalletAddress === 'string') data.vendorWalletAddress = body.vendorWalletAddress;
  if (typeof body.externalProductUrl === 'string') data.externalProductUrl = body.externalProductUrl;
  if (typeof body.active === 'boolean') data.active = body.active;
  if (typeof body.vendorName === 'string') data.vendorName = body.vendorName;
  if (body.restockStatus === 'IDLE') data.restockStatus = 'IDLE';

  const updated = await prisma.inventory.update({ where: { id }, data: data as never });
  return ok({ id: updated.id, currentStock: Number(updated.currentStock), restockStatus: updated.restockStatus });
});

// DELETE /api/inventory/[id] — soft-delete (admin only)
export const DELETE = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await ctx.params;
  await prisma.inventory.update({ where: { id }, data: { active: false } });
  return ok({ deleted: true });
});
