import { ok, route } from '@/lib/http';
import { requireAdmin } from '@/lib/session';
import { checkAndRestock } from '@/services/inventory.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/inventory/check — trigger a restock check immediately (admin only)
export const POST = route(async () => {
  await requireAdmin();
  const results = await checkAndRestock();
  return ok({ triggered: results.length, results });
});
