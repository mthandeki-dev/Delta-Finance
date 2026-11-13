import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/http';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/analytics — aggregated data for the 3 dashboard charts
// Returns: monthly spend (bar), per-item spend (bar), inventory levels (bar)
export const GET = route(async () => {
  await requireUser();

  // Last 6 months of OUTGOING ledger entries, grouped by month
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [outgoingLogs, inventoryItems, incomingLogs] = await Promise.all([
    prisma.ledgerLog.findMany({
      where: { direction: 'OUTGOING', createdAt: { gte: sixMonthsAgo } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.inventory.findMany({ where: { active: true }, orderBy: { itemName: 'asc' } }),
    prisma.ledgerLog.findMany({
      where: { direction: 'INCOMING', createdAt: { gte: sixMonthsAgo } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // Monthly spend — group by YYYY-MM
  const monthlyMap = new Map<string, number>();
  for (const log of outgoingLogs) {
    const key = `${log.createdAt.getUTCFullYear()}-${String(log.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + Number(log.amountRlusd));
  }
  const monthlySpend = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amountRlusd]) => ({ month, amountRlusd: Number(amountRlusd.toFixed(6)) }));

  // Per-item spend — sum all outgoing by itemName
  const itemSpendMap = new Map<string, number>();
  for (const log of outgoingLogs) {
    const key = log.itemName ?? 'Unknown';
    itemSpendMap.set(key, (itemSpendMap.get(key) ?? 0) + Number(log.amountRlusd));
  }
  const itemSpend = Array.from(itemSpendMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([itemName, amountRlusd]) => ({ itemName, amountRlusd: Number(amountRlusd.toFixed(6)) }));

  // Inventory levels — current stock vs minimum threshold, plus pending delivery quantity
  const inventoryLevels = inventoryItems.map((item) => ({
    itemName: item.itemName,
    currentStock: Number(item.currentStock),
    minimumThreshold: Number(item.minimumThreshold),
    unit: item.unit,
    restockStatus: item.restockStatus,
    // Units ordered but not yet physically received — rendered as a hollow bar
    pendingStock: item.restockStatus === 'ORDERED' ? Number(item.restockQuantity) : 0,
  }));

  // Cash flow summary
  const totalOut = outgoingLogs.reduce((s, l) => s + Number(l.amountRlusd), 0);
  const totalIn = incomingLogs.reduce((s, l) => s + Number(l.amountRlusd), 0);

  return ok({ monthlySpend, itemSpend, inventoryLevels, summary: { totalOutRlusd: Number(totalOut.toFixed(6)), totalInRlusd: Number(totalIn.toFixed(6)) } });
});
