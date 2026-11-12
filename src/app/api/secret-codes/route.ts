import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http';
import { generateSecretCode } from '@/lib/secret-code';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/secret-codes — generate a one-time code that unlocks one HITL payment.
// The plain code is returned exactly once; only its scrypt hash is stored.
export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const body = await readJson<{ label?: unknown; ttlHours?: unknown }>(req).catch(() => ({}) as { label?: unknown; ttlHours?: unknown });
  const ttlHours = typeof body.ttlHours === 'number' && body.ttlHours > 0 && body.ttlHours <= 168 ? body.ttlHours : 24;
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 60) : null;

  const code = generateSecretCode();
  const row = await prisma.secretCode.create({
    data: {
      prefix: code.prefix,
      codeHash: code.codeHash,
      salt: code.salt,
      label,
      createdById: admin.id,
      expiresAt: new Date(Date.now() + ttlHours * 3600_000),
    },
  });
  await audit('SECRET_CODE_GENERATED', { actor: `admin:${admin.xrplAddress}`, detail: { prefix: code.prefix, ttlHours } });
  return ok({ id: row.id, code: code.display, expiresAt: row.expiresAt.toISOString() }, 201);
});
