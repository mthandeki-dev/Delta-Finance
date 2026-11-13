import { timingSafeEqual } from 'node:crypto';
import { decode } from 'ripple-binary-codec';
import { audit } from '@/lib/audit';
import { AGENT_WALLET_ID, ensurePolicy, prisma } from '@/lib/db';
import { env, RLUSD_HEX } from '@/lib/env';
import { ok, route } from '@/lib/http';
import { fromMicro, toMicro } from '@/lib/money';
import {
  buildRequirements,
  decodeHeader,
  encodeHeader,
  facilitatorSettle,
  facilitatorVerify,
  FacilitatorUnavailable,
  requirementsMatch,
  X402Denied,
  type PaymentPayload,
  type PaymentRequirements,
  type SettlementResponse,
} from '@/services/t54.service';
import { submitSignedBlob } from '@/services/xrpl.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const TF_PARTIAL_PAYMENT = 0x00020000;

function internalCaller(key: string | null): boolean {
  if (!key) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(env.agentApiKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Gateway's own inspection of the signed blob, independent of the facilitator. */
function assertBlobMatches(blob: string, req: PaymentRequirements, agentAddress: string) {
  let tx: Record<string, any>;
  try {
    tx = decode(blob) as Record<string, any>;
  } catch {
    throw new X402Denied('X402_GATEWAY', 'Signed transaction could not be decoded.');
  }
  const amount = tx.Amount ?? tx.DeliverMax;
  let okAmount = false;
  try {
    okAmount =
      typeof amount === 'object' &&
      amount?.currency === RLUSD_HEX &&
      amount?.issuer === req.extra.issuer &&
      toMicro(String(amount.value)) === toMicro(req.amount);
  } catch {
    okAmount = false;
  }
  if (
    tx.TransactionType !== 'Payment' ||
    tx.Account !== agentAddress ||
    tx.Destination !== req.payTo ||
    !okAmount ||
    tx.SendMax !== undefined ||
    tx.Paths !== undefined ||
    ((tx.Flags ?? 0) & TF_PARTIAL_PAYMENT) !== 0 ||
    typeof tx.LastLedgerSequence !== 'number'
  ) {
    throw new X402Denied('X402_GATEWAY', 'Signed transaction does not match the quoted payment.');
  }
}

/**
 * POST /api/x402/settle/:txId — the treasury's x402 settlement gateway (the "resource server").
 *
 * The quote comes from the TransactionLog row the router wrote, never from the caller, and the mandate is
 * re-checked here. So even an agent that skipped the router cannot obtain a quote for anything unapproved.
 *
 *   no PAYMENT-SIGNATURE  → 402 + PAYMENT-REQUIRED
 *   with PAYMENT-SIGNATURE → t54 /verify → t54 /settle → 200 + PAYMENT-RESPONSE
 */
export const POST = route<{ params: Promise<{ txId: string }> }>(async (req, { params }) => {
  if (!internalCaller(req.headers.get('x-internal-key'))) {
    return ok({ error: 'forbidden', layer: 'X402_GATEWAY', reason: 'Unknown caller.' }, 403);
  }
  const { txId } = await params;
  const deny = async (reason: string) => {
    await audit('GATEWAY_BLOCKED', { actor: 'x402-gateway', txId, detail: { layer: 'X402_GATEWAY', reason } });
    return ok({ error: 'mandate_violation', layer: 'X402_GATEWAY', reason }, 403);
  };

  const [tx, policy, wallet] = await Promise.all([
    prisma.transactionLog.findUnique({ where: { id: txId } }),
    ensurePolicy(),
    prisma.agentWallet.findUnique({ where: { id: AGENT_WALLET_ID } }),
  ]);
  if (!tx || tx.route !== 'AUTONOMOUS' || tx.status !== 'PENDING' || !tx.amountRlusd || !tx.merchantAddress || !tx.invoiceId) {
    return ok({ error: 'forbidden', layer: 'X402_GATEWAY', reason: 'No authorised payment with this id.' }, 403);
  }
  if (!wallet) return deny('The agent wallet is not provisioned.');
  if (!policy.agentEnabled) return deny('The agent is paused by an administrator.');
  const vendor = await prisma.vendor.findFirst({ where: { xrplAddress: tx.merchantAddress, active: true } });
  if (!vendor) return deny(`Destination ${tx.merchantAddress} is not an approved vendor.`);
  const amount = fromMicro(BigInt(tx.amountRlusd.mul(1_000_000).toFixed(0)));
  if (toMicro(amount) > BigInt(policy.perTxLimitRlusd.mul(1_000_000).toFixed(0))) return deny('Amount exceeds the per-payment limit.');

  const requirements = buildRequirements({ payTo: tx.merchantAddress, amount, invoiceId: tx.invoiceId });

  // ── Step 1: no payment attached → 402 challenge ──
  const payload = decodeHeader<PaymentPayload>(req.headers.get('PAYMENT-SIGNATURE'));
  if (!payload) {
    const challenge = {
      x402Version: 2,
      error: 'payment_required',
      resource: { url: req.nextUrl.pathname, description: `Delta Finance vendor settlement: ${vendor.label}` },
      accepts: [requirements],
    };
    return ok(challenge, 402, { 'PAYMENT-REQUIRED': encodeHeader(challenge) });
  }

  // ── Step 2: verify and settle ──
  try {
    if (!payload.payload?.signedTxBlob || !requirementsMatch(payload.accepted, requirements)) {
      throw new X402Denied('X402_GATEWAY', 'Payment payload does not match the quote.');
    }
    assertBlobMatches(payload.payload.signedTxBlob, requirements, wallet.address);

    let settled: SettlementResponse;
    try {
      await facilitatorVerify(payload, requirements);
      settled = await facilitatorSettle(payload, requirements);
    } catch (e) {
      // Opt-in demo/testnet safety net: fall back to direct XRPL submission when the facilitator is
      // unreachable (5xx) OR when it denies with a feature it does not support (e.g. RLUSD IOU on
      // testnet). The blob has already passed Privy's policy and the gateway's own inspection, so the
      // security guarantee is maintained; we simply skip t54's additional verification layer.
      const canFallback = env.directSubmitFallback && (e instanceof FacilitatorUnavailable || (e instanceof X402Denied && e.layer === 'T54_FACILITATOR'));
      if (!canFallback) throw e;
      await audit('FACILITATOR_FALLBACK', { actor: 'x402-gateway', txId, detail: { error: (e as Error).message } });
      const res = await submitSignedBlob(payload.payload.signedTxBlob);
      if (res.result !== 'tesSUCCESS') return ok({ error: 'settlement_failed', reason: `Ledger result ${res.result}` }, 502);
      settled = { success: true, transaction: res.hash, network: requirements.network, payer: wallet.address, settledVia: 'DIRECT_FALLBACK' };
    }
    return ok(settled, 200, { 'PAYMENT-RESPONSE': encodeHeader(settled) });
  } catch (e) {
    if (e instanceof X402Denied) {
      return ok({ error: 'payment_invalid', layer: e.layer, reason: e.message }, 402);
    }
    if (e instanceof FacilitatorUnavailable) {
      return ok({ error: 'facilitator_unavailable', reason: e.message }, 502);
    }
    throw e;
  }
});
