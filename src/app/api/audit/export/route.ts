import { prisma } from '@/lib/db';
import { route } from '@/lib/http';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // neutralise spreadsheet formulas
  return `"${s.replace(/"/g, '""')}"`;
};

// GET /api/audit/export — the full audit trail as CSV: what the agent did, and why, for the finance team or an auditor.
export const GET = route(async () => {
  await requireUser();
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' }, take: 10_000, include: { tx: true } });
  const header = ['timestamp_utc', 'event', 'actor', 'payment_id', 'amount_rlusd', 'destination', 'route', 'status', 'blocked_by', 'xrpl_tx_hash', 'instruction', 'detail'];
  const lines = rows.map((r) =>
    [
      r.createdAt.toISOString(),
      r.event,
      r.actor,
      r.txId,
      r.tx?.amountRlusd?.toString(),
      r.tx?.merchantAddress,
      r.tx?.route,
      r.tx?.status,
      r.tx?.blockedBy,
      r.tx?.txHash,
      r.tx?.prompt,
      r.detail,
    ]
      .map(cell)
      .join(','),
  );
  const csv = [header.join(','), ...lines].join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="delta-finance-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
