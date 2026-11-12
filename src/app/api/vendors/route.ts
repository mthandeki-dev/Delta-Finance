import { audit } from '@/lib/audit';
import { AGENT_WALLET_ID, prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ok, readJson, route, str } from '@/lib/http';
import { requireAdmin } from '@/lib/session';
import { syncPrivyMandate } from '@/services/agent.service';
import { isValidClassicAddress } from '@/services/xrpl.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/vendors — whitelist an XRPL vendor address.
export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const body = await readJson<{ label?: unknown; xrplAddress?: unknown; country?: unknown }>(req);
  const label = str(body.label, 'Vendor name', 60);
  const xrplAddress = str(body.xrplAddress, 'XRPL address', 40);
  const country = typeof body.country === 'string' && /^[A-Za-z]{2}$/.test(body.country.trim()) ? body.country.trim().toUpperCase() : null;

  if (!isValidClassicAddress(xrplAddress)) {
    throw new AppError(400, 'VALIDATION', 'That is not a valid XRPL address. It should start with "r" (checksum verified).');
  }
  const wallet = await prisma.agentWallet.findUnique({ where: { id: AGENT_WALLET_ID } });
  if (wallet?.address === xrplAddress) throw new AppError(400, 'VALIDATION', "The agent's own wallet cannot be a vendor.");

  const vendor = await prisma.vendor.upsert({
    where: { xrplAddress },
    update: { label, country, active: true },
    create: { label, xrplAddress, country, createdById: admin.id },
  });
  await audit('VENDOR_WHITELISTED', { actor: `admin:${admin.xrplAddress}`, detail: { label, xrplAddress, country } });
  const privySync = await syncPrivyMandate(`admin:${admin.xrplAddress}`);
  return ok({ id: vendor.id, privySync }, 201);
});
