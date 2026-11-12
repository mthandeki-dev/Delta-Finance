import { audit } from '@/lib/audit';
import { ensurePolicy, POLICY_ID, prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route } from '@/lib/http';
import { fromMicro, toMicro } from '@/lib/money';
import { requireAdmin } from '@/lib/session';
import { syncPrivyMandate } from '@/services/agent.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function limit(value: unknown, field: string): string {
  try {
    const micro = toMicro(typeof value === 'number' ? value : String(value ?? ''));
    if (micro < 0n || micro > toMicro('100000000')) throw new Error();
    return fromMicro(micro);
  } catch {
    throw new AppError(400, 'VALIDATION', `${field} must be a number between 0 and 100,000,000 with at most 6 decimals.`);
  }
}

// PUT /api/policy — an admin changes the mandate: limits and the kill switch.
// The change is written to Postgres and mirrored to Privy's policy engine before the response returns.
export const PUT = route(async (req) => {
  const admin = await requireAdmin();
  const body = await readJson<{ dailyLimitRlusd?: unknown; perTxLimitRlusd?: unknown; agentEnabled?: unknown }>(req);
  const before = await ensurePolicy();

  const data: { dailyLimitRlusd?: string; perTxLimitRlusd?: string; agentEnabled?: boolean } = {};
  if (body.dailyLimitRlusd !== undefined) data.dailyLimitRlusd = limit(body.dailyLimitRlusd, 'Daily limit');
  if (body.perTxLimitRlusd !== undefined) data.perTxLimitRlusd = limit(body.perTxLimitRlusd, 'Per-payment limit');
  if (body.agentEnabled !== undefined) {
    if (typeof body.agentEnabled !== 'boolean') throw new AppError(400, 'VALIDATION', 'agentEnabled must be true or false.');
    data.agentEnabled = body.agentEnabled;
  }
  const daily = data.dailyLimitRlusd ?? before.dailyLimitRlusd.toFixed(6);
  const perTx = data.perTxLimitRlusd ?? before.perTxLimitRlusd.toFixed(6);
  if (toMicro(perTx) > toMicro(daily)) {
    throw new AppError(400, 'VALIDATION', 'The per-payment limit cannot be higher than the daily limit.');
  }

  await prisma.treasuryPolicy.update({ where: { id: POLICY_ID }, data: { ...data, updatedById: admin.id } });
  await audit('MANDATE_UPDATED', {
    actor: `admin:${admin.xrplAddress}`,
    detail: {
      before: { daily: before.dailyLimitRlusd.toFixed(6), perTx: before.perTxLimitRlusd.toFixed(6), agentEnabled: before.agentEnabled },
      after: data,
    },
  });
  const privySync = await syncPrivyMandate(`admin:${admin.xrplAddress}`);
  return ok({ ok: true, privySync });
});
