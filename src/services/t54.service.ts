// x402 on the XRP Ledger through t54's hosted facilitator ("exact" scheme, x402 v2).
//
//   agent ──POST──▶ settlement gateway            (no payment yet)
//   agent ◀──402── PAYMENT-REQUIRED               (payTo, RLUSD amount, issuer, one-time invoiceId)
//   agent signs an XRPL Payment with its Privy wallet (Privy policy is evaluated here)
//   agent ──POST──▶ gateway + PAYMENT-SIGNATURE   (signed blob)
//   gateway ──▶ t54 facilitator /verify, /settle  (destination, amount, invoice binding; submits on-ledger)
//   agent ◀──200── PAYMENT-RESPONSE               (transaction hash)
//
// Wire format: https://xrpl-x402.t54.ai/docs/xrpl-scheme
// We speak the protocol directly rather than through x402-xrpl's `x402Fetch`, because that client signs
// with a local xrpl.js seed wallet and the agent deliberately has no local key — Privy signs remotely.

import { env, RLUSD_HEX, X402_NETWORK } from '@/lib/env';
import { AppError, errorMessage } from '@/lib/errors';
import { toMicro } from '@/lib/money';

export type PaymentRequirements = {
  scheme: 'exact';
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  maxTimeoutSeconds: number;
  extra: { invoiceId: string; sourceTag: number; issuer?: string; destinationTag?: number };
};

export type PaymentPayload = {
  x402Version: 2;
  accepted: PaymentRequirements;
  payload: { signedTxBlob: string; invoiceId: string };
};

export type SettlementResponse = { success: boolean; transaction?: string; network?: string; payer?: string; settledVia?: string };

/** A policy layer said no. `layer` records which one, for the audit trail. */
export class X402Denied extends Error {
  constructor(
    public layer: 'X402_GATEWAY' | 'T54_FACILITATOR' | 'APP_POLICY',
    message: string,
  ) {
    super(message);
    this.name = 'X402Denied';
  }
}

/** The facilitator could not be reached or answered something unintelligible (not a denial). */
export class FacilitatorUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FacilitatorUnavailable';
  }
}

export const encodeHeader = (obj: unknown) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');

export function decodeHeader<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as T;
  } catch {
    return null;
  }
}

// ───────────────────────────── Seller / gateway side ─────────────────────────────

export function buildRequirements(p: { payTo: string; amount: string; invoiceId: string }): PaymentRequirements {
  return {
    scheme: 'exact',
    network: X402_NETWORK,
    asset: RLUSD_HEX,
    payTo: p.payTo,
    amount: p.amount,
    maxTimeoutSeconds: 120,
    extra: { invoiceId: p.invoiceId, sourceTag: env.sourceTag, issuer: env.rlusdIssuer },
  };
}

export function requirementsMatch(a: PaymentRequirements, b: PaymentRequirements): boolean {
  try {
    return (
      a.scheme === b.scheme &&
      a.network === b.network &&
      a.asset === b.asset &&
      a.payTo === b.payTo &&
      toMicro(a.amount) === toMicro(b.amount) &&
      a.extra?.invoiceId === b.extra?.invoiceId &&
      a.extra?.issuer === b.extra?.issuer
    );
  } catch {
    return false;
  }
}

async function facilitator<T>(path: '/verify' | '/settle', payload: PaymentPayload, requirements: PaymentRequirements): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.facilitatorUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x402Version: 2, paymentPayload: payload, paymentRequirements: requirements }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    throw new FacilitatorUnavailable(`t54 facilitator unreachable: ${errorMessage(e)}`);
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FacilitatorUnavailable(`t54 facilitator ${path} returned ${res.status} with a non-JSON body.`);
  }
  if (res.status >= 500) throw new FacilitatorUnavailable(`t54 facilitator ${path} returned ${res.status}.`);
  return json as T;
}

/** Ask t54 to verify the signed payment against the requirements. Throws X402Denied when it refuses. */
export async function facilitatorVerify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<void> {
  const r = await facilitator<{ isValid?: boolean; invalidReason?: string }>('/verify', payload, requirements);
  if (r.isValid !== true) throw new X402Denied('T54_FACILITATOR', `t54 facilitator rejected the payment: ${r.invalidReason ?? 'invalid'}`);
}

/** Ask t54 to submit the transaction on-ledger. */
export async function facilitatorSettle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettlementResponse> {
  const r = await facilitator<SettlementResponse & { errorReason?: string }>('/settle', payload, requirements);
  if (r.success !== true || !r.transaction) {
    throw new X402Denied('T54_FACILITATOR', `t54 facilitator did not settle the payment: ${r.errorReason ?? 'unknown reason'}`);
  }
  return { success: true, transaction: r.transaction, network: r.network ?? X402_NETWORK, payer: r.payer, settledVia: 'T54_FACILITATOR' };
}

// ───────────────────────────────── Buyer / agent side ─────────────────────────────────

/**
 * Pays an x402-protected resource. The 402 challenge is treated as untrusted input: it must match what the
 * router authorised (`expect`) before anything is signed.
 */
export async function payViaX402(opts: {
  url: string;
  headers?: Record<string, string>;
  expect: { payTo: string; amount: string };
  sign: (requirements: PaymentRequirements) => Promise<string>;
}): Promise<SettlementResponse> {
  const post = (extra: Record<string, string> = {}) =>
    fetch(opts.url, { method: 'POST', headers: { ...opts.headers, ...extra }, signal: AbortSignal.timeout(90_000) });

  // 1. Unpaid request → 402 challenge
  const first = await post();
  if (first.status === 403) {
    const body = (await first.json().catch(() => ({}))) as { reason?: string };
    throw new X402Denied('X402_GATEWAY', body.reason ?? 'Settlement gateway refused to quote this payment.');
  }
  if (first.status !== 402) {
    throw new AppError(502, 'X402_PROTOCOL', `Expected HTTP 402 from the settlement gateway, got ${first.status}.`);
  }
  const challenge =
    decodeHeader<{ accepts?: PaymentRequirements[] }>(first.headers.get('PAYMENT-REQUIRED')) ??
    ((await first.json().catch(() => null)) as { accepts?: PaymentRequirements[] } | null);
  const requirements = challenge?.accepts?.find((a) => a.scheme === 'exact' && a.network === X402_NETWORK && a.asset === RLUSD_HEX);
  if (!requirements?.extra?.invoiceId) throw new AppError(502, 'X402_PROTOCOL', 'The 402 challenge has no usable RLUSD payment option.');

  // 2. Never sign what was not authorised
  let sameAmount = false;
  try {
    sameAmount = toMicro(requirements.amount) === toMicro(opts.expect.amount);
  } catch {
    sameAmount = false;
  }
  if (requirements.payTo !== opts.expect.payTo || !sameAmount || requirements.extra.issuer !== env.rlusdIssuer) {
    throw new X402Denied('APP_POLICY', 'The 402 challenge does not match the authorised payment. Nothing was signed.');
  }

  // 3. Sign (Privy evaluates the wallet policy here) and retry with the payment attached
  const signedTxBlob = await opts.sign(requirements);
  const payload: PaymentPayload = {
    x402Version: 2,
    accepted: requirements,
    payload: { signedTxBlob, invoiceId: requirements.extra.invoiceId },
  };
  const second = await post({ 'PAYMENT-SIGNATURE': encodeHeader(payload) });
  const body = (await second.json().catch(() => ({}))) as { reason?: string; layer?: string } & SettlementResponse;

  if (second.ok) {
    const settled = decodeHeader<SettlementResponse>(second.headers.get('PAYMENT-RESPONSE')) ?? body;
    if (!settled?.success || !settled.transaction) throw new AppError(502, 'X402_PROTOCOL', 'Gateway reported success without a transaction hash.');
    return { ...settled, settledVia: body.settledVia ?? settled.settledVia ?? 'T54_FACILITATOR' };
  }
  if (second.status === 402 || second.status === 403) {
    throw new X402Denied(body.layer === 'X402_GATEWAY' ? 'X402_GATEWAY' : 'T54_FACILITATOR', body.reason ?? 'Payment rejected.');
  }
  throw new AppError(502, 'X402_SETTLEMENT_FAILED', body.reason ?? `Settlement gateway returned ${second.status}.`);
}
