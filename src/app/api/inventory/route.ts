import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import { requireAdmin, requireUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/inventory — list all active inventory items
export const GET = route(async () => {
  await requireUser();
  const items = await prisma.inventory.findMany({ orderBy: { itemName: 'asc' } });
  return ok(items.map(serializeItem));
});

// POST /api/inventory — create a new inventory item (admin only)
export const POST = route(async (req) => {
  await requireAdmin();
  const body = await readJson<Record<string, unknown>>(req);

  const itemName = str(body.itemName, 'itemName');
  const unit = str(body.unit, 'unit');
  const vendorName = str(body.vendorName, 'vendorName');
  const fulfillmentChannel = body.fulfillmentChannel === 'EXTERNAL_WEB' ? 'EXTERNAL_WEB' : 'XRPL_VENDOR';

  if (typeof body.currentStock !== 'number' || body.currentStock < 0) throw new AppError(400, 'VALIDATION', 'currentStock must be a non-negative number.');
  if (typeof body.minimumThreshold !== 'number' || body.minimumThreshold <= 0) throw new AppError(400, 'VALIDATION', 'minimumThreshold must be positive.');
  if (typeof body.restockQuantity !== 'number' || body.restockQuantity <= 0) throw new AppError(400, 'VALIDATION', 'restockQuantity must be positive.');
  if (typeof body.unitPriceRlusd !== 'number' || body.unitPriceRlusd <= 0) throw new AppError(400, 'VALIDATION', 'unitPriceRlusd must be positive.');
  if (typeof body.maxSpendLimit !== 'number' || body.maxSpendLimit <= 0) throw new AppError(400, 'VALIDATION', 'maxSpendLimit must be positive.');

  if (fulfillmentChannel === 'XRPL_VENDOR' && body.vendorWalletAddress && typeof body.vendorWalletAddress !== 'string') {
    throw new AppError(400, 'VALIDATION', 'vendorWalletAddress must be a string.');
  }

  const item = await prisma.inventory.create({
    data: {
      itemName,
      unit,
      vendorName,
      fulfillmentChannel,
      currentStock: body.currentStock as number,
      minimumThreshold: body.minimumThreshold as number,
      restockQuantity: body.restockQuantity as number,
      unitPriceRlusd: body.unitPriceRlusd as number,
      maxSpendLimit: body.maxSpendLimit as number,
      vendorWalletAddress: typeof body.vendorWalletAddress === 'string' ? body.vendorWalletAddress : null,
      externalProductUrl: typeof body.externalProductUrl === 'string' ? body.externalProductUrl : null,
    },
  });

  return ok(serializeItem(item), 201);
});

function serializeItem(item: Awaited<ReturnType<typeof prisma.inventory.findMany>>[number]) {
  return {
    id: item.id,
    itemName: item.itemName,
    unit: item.unit,
    currentStock: Number(item.currentStock),
    minimumThreshold: Number(item.minimumThreshold),
    restockQuantity: Number(item.restockQuantity),
    unitPriceRlusd: Number(item.unitPriceRlusd),
    maxSpendLimit: Number(item.maxSpendLimit),
    fulfillmentChannel: item.fulfillmentChannel,
    vendorName: item.vendorName,
    vendorWalletAddress: item.vendorWalletAddress,
    externalProductUrl: item.externalProductUrl,
    restockStatus: item.restockStatus,
    lastRestockAt: item.lastRestockAt?.toISOString() ?? null,
    lastRestockTxHash: item.lastRestockTxHash,
    lastRestockOrderId: item.lastRestockOrderId,
    screenshotPath: item.screenshotPath ? `/screenshots/${item.screenshotPath.split(/[\\/]/).pop()}` : null,
    active: item.active,
    createdAt: item.createdAt.toISOString(),
  };
}
