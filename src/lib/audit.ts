import type { Prisma } from '@prisma/client';
import { prisma } from './db';

/**
 * Append-only audit trail: "prove what the agent did and why".
 * Written to Postgres and mirrored to stdout as one JSON line (CloudWatch-friendly).
 */
export async function audit(event: string, opts: { actor: string; txId?: string; detail?: Record<string, unknown> }) {
  const line = { level: event.includes('BLOCKED') ? 'warn' : 'info', scope: 'audit', event, ...opts, at: new Date().toISOString() };
  if (line.level === 'warn') console.warn(JSON.stringify(line));
  else console.log(JSON.stringify(line));
  try {
    await prisma.auditLog.create({
      data: { event, actor: opts.actor, txId: opts.txId, detail: (opts.detail ?? undefined) as Prisma.InputJsonValue | undefined },
    });
  } catch (e) {
    // Never let audit persistence take the payment path down; stdout already has the record.
    console.error(JSON.stringify({ level: 'error', scope: 'audit', message: 'failed to persist audit row', error: String(e) }));
  }
}
