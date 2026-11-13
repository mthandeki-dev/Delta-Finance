import { audit } from '@/lib/audit';
import { AGENT_WALLET_ID, POLICY_ID, prisma } from '@/lib/db';
import { ok, route } from '@/lib/http';
import { requireAdmin, requireUser } from '@/lib/session';
import { agentWalletStatus, setupAgentWallet } from '@/services/agent.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// GET /api/agent/wallet — live on-ledger status of the agent wallet (balances, trust line).
export const GET = route(async () => {
  await requireUser();
  return ok({ wallet: await agentWalletStatus() });
});

// POST /api/agent/wallet — provision the agent: Privy wallet → faucet → RLUSD trust line → policy. Idempotent.
export const POST = route(async () => {
  const admin = await requireAdmin();
  const { wallet, steps } = await setupAgentWallet(`admin:${admin.xrplAddress ?? admin.username}`);
  return ok({ address: wallet.address, steps });
});

// DELETE /api/agent/wallet — reset: removes the wallet record so the next setup creates a fresh one.
export const DELETE = route(async () => {
  const admin = await requireAdmin();
  const actor = `admin:${admin.xrplAddress ?? admin.username}`;
  const existing = await prisma.agentWallet.findUnique({ where: { id: AGENT_WALLET_ID } });
  if (!existing) return ok({ ok: true, message: 'No wallet record to remove.' });
  await prisma.agentWallet.delete({ where: { id: AGENT_WALLET_ID } });
  await prisma.treasuryPolicy.update({
    where: { id: POLICY_ID },
    data: { privyPolicyId: null, privySyncedAt: null, privySyncError: null },
  });
  await audit('AGENT_WALLET_RESET', { actor, detail: { removedAddress: existing.address } });
  return ok({ ok: true, message: `Wallet ${existing.address} removed. Click "Set up agent wallet" to provision a new one.` });
});
