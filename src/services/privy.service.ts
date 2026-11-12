// Privy server wallet for the agent (XRPL, Tier 2: Privy decodes and signs; we submit).
// The agent never holds a key. Privy's policy engine evaluates every signing request against the
// mandate mirrored from the admin dashboard — an enforcement point the agent cannot reach or change.
//
// REST API reference: https://docs.privy.io/wallets/using-wallets/other-chains/xrpl
// Policy shape:       https://docs.privy.io/controls/policies/example-policies/xrpl

import { encodeForSigning } from 'ripple-binary-codec';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';

const BASE = 'https://api.privy.io/v1';

/** Privy's policy engine refused to sign. This is the "blocked by infrastructure" signal. */
export class PrivyPolicyDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivyPolicyDenied';
  }
}

async function privy<T>(path: string, init: { method: string; body?: unknown; signing?: boolean }): Promise<T> {
  const auth = Buffer.from(`${env.privyAppId}:${env.privyAppSecret}`).toString('base64');
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers: { Authorization: `Basic ${auth}`, 'privy-app-id': env.privyAppId, 'Content-Type': 'application/json' },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new AppError(503, 'PRIVY_UNAVAILABLE', `Could not reach Privy: ${String(e)}`);
  }
  const text = await res.text();
  if (!res.ok) {
    // On a signing call, a policy denial comes back as a 4xx whose body mentions the policy.
    if (init.signing && res.status >= 400 && res.status < 500 && /polic|denied|not allowed/i.test(text)) {
      throw new PrivyPolicyDenied(extractMessage(text) || 'Signing request denied by the wallet policy.');
    }
    throw new AppError(502, 'PRIVY_ERROR', `Privy ${init.method} ${path} failed (${res.status}): ${extractMessage(text)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function extractMessage(text: string): string {
  try {
    const j = JSON.parse(text);
    return String(j.error?.message ?? j.error ?? j.message ?? text).slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

export type PrivyWallet = { id: string; address: string; public_key: string };

export function createXrplWallet(): Promise<PrivyWallet> {
  return privy<PrivyWallet>('/wallets', { method: 'POST', body: { chain_type: 'xrpl' } });
}

/**
 * Signs an autofilled XRPL transaction with the agent wallet.
 * Returns the fully signed blob, ready to submit (or hand to the x402 facilitator).
 */
export async function signXrplTransaction(
  wallet: { privyWalletId: string; publicKey: string },
  tx: object,
): Promise<string> {
  const withKey = { ...tx, SigningPubKey: wallet.publicKey.replace(/^0x/, '').toUpperCase() };
  // encodeForSigning prepends the single-signing prefix 0x53545800
  const encoded = encodeForSigning(withKey as Parameters<typeof encodeForSigning>[0]);
  const res = await privy<{ data: { signed_transaction: string } }>(`/wallets/${wallet.privyWalletId}/rpc`, {
    method: 'POST',
    signing: true,
    body: { method: 'xrpl_signTransaction', params: { transaction: encoded, encoding: 'hex' } },
  });
  const blob = res.data?.signed_transaction;
  if (!blob) throw new AppError(502, 'PRIVY_ERROR', 'Privy did not return a signed transaction.');
  return blob.replace(/^0x/, '').toUpperCase();
}

type Condition = { field_source: 'xrpl_transaction'; field: string; operator: string; value: string | string[] };
type Rule = { name: string; method: 'xrpl_signTransaction'; conditions: Condition[]; action: 'ALLOW' | 'DENY' };

/**
 * The mandate as a Privy policy. Privy denies anything that matches no ALLOW rule, so the agent wallet
 * can sign exactly one thing: an RLUSD Payment, to a whitelisted vendor, at or under the per-payment cap.
 * With an empty whitelist (or the kill switch on) there is no ALLOW rule for payments at all.
 */
export function buildMandatePolicy(m: { whitelist: string[]; perTxLimit: string; agentEnabled: boolean; rlusdIssuer: string }) {
  const cond = (field: string, operator: string, value: string | string[]): Condition => ({
    field_source: 'xrpl_transaction',
    field,
    operator,
    value,
  });
  const rules: Rule[] = [];
  if (m.agentEnabled && m.whitelist.length > 0) {
    rules.push({
      name: 'RLUSD payments to approved vendors within the per-payment cap',
      method: 'xrpl_signTransaction',
      conditions: [
        cond('TransactionType', 'eq', 'Payment'),
        cond('Payment.Destination', 'in', m.whitelist),
        cond('Payment.Amount.issuer', 'eq', m.rlusdIssuer),
        cond('Payment.Amount.value', 'lte', m.perTxLimit),
      ],
      action: 'ALLOW',
    });
  } else {
    // Privy requires at least one rule; an explicit deny keeps the intent readable in their dashboard.
    rules.push({
      name: m.agentEnabled ? 'No approved vendors: deny all payments' : 'Agent paused: deny all payments',
      method: 'xrpl_signTransaction',
      conditions: [cond('TransactionType', 'eq', 'Payment')],
      action: 'DENY',
    });
  }
  return { version: '1.0', name: 'Delta Finance treasury mandate', chain_type: 'xrpl', rules };
}

/** Creates the policy or replaces its rules, then makes sure it is the wallet's only policy. */
export async function upsertMandatePolicy(
  walletId: string,
  existingPolicyId: string | null,
  policy: ReturnType<typeof buildMandatePolicy>,
): Promise<string> {
  let policyId = existingPolicyId;
  if (policyId) {
    await privy(`/policies/${policyId}`, { method: 'PATCH', body: { name: policy.name, rules: policy.rules } });
  } else {
    policyId = (await privy<{ id: string }>('/policies', { method: 'POST', body: policy })).id;
  }
  await privy(`/wallets/${walletId}`, { method: 'PATCH', body: { policy_ids: [policyId] } });
  return policyId;
}
