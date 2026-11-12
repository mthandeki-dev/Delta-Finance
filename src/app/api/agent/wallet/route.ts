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
  const { wallet, steps } = await setupAgentWallet(`admin:${admin.xrplAddress}`);
  return ok({ address: wallet.address, steps });
});
