// The zero-trust router. Pure and deterministic: given a validated intent and a snapshot of the
// treasury mandate it returns exactly one of three routes. The LLM never sees or influences this code.

import { toMicro } from '../money';

export type Intent = {
  action: 'PAY';
  amount: number;
  merchant_address: string;
  is_payroll: boolean;
};

export type PolicySnapshot = {
  agentEnabled: boolean;
  dailyLimitMicro: bigint;
  perTxLimitMicro: bigint;
  spentTodayMicro: bigint;
  /** Active, whitelisted vendor addresses */
  whitelist: ReadonlySet<string>;
  /** The agent's own address, if provisioned (self-payments are refused) */
  agentAddress?: string;
};

export type BlockCode =
  | 'AGENT_DISABLED'
  | 'INVALID_AMOUNT'
  | 'INVALID_ADDRESS'
  | 'SELF_PAYMENT'
  | 'VENDOR_NOT_WHITELISTED';

export type Decision =
  | { route: 'AUTONOMOUS' }
  | { route: 'HITL'; reasons: string[] }
  | { route: 'BLOCKED'; code: BlockCode; reason: string };

export const CLASSIC_ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

export function decide(intent: Intent, policy: PolicySnapshot): Decision {
  // ── Path C: hard blocks. No human override exists for these. ──
  if (!policy.agentEnabled) {
    return { route: 'BLOCKED', code: 'AGENT_DISABLED', reason: 'The agent is paused by an administrator (kill switch).' };
  }

  let amountMicro: bigint;
  try {
    amountMicro = toMicro(intent.amount);
  } catch {
    return { route: 'BLOCKED', code: 'INVALID_AMOUNT', reason: 'Amount is not a valid RLUSD value.' };
  }
  if (amountMicro <= 0n) {
    return { route: 'BLOCKED', code: 'INVALID_AMOUNT', reason: 'Amount must be greater than zero.' };
  }

  if (!CLASSIC_ADDRESS_RE.test(intent.merchant_address)) {
    return { route: 'BLOCKED', code: 'INVALID_ADDRESS', reason: 'Destination is not a valid XRPL address.' };
  }
  if (policy.agentAddress && intent.merchant_address === policy.agentAddress) {
    return { route: 'BLOCKED', code: 'SELF_PAYMENT', reason: 'The agent cannot pay itself.' };
  }
  if (!policy.whitelist.has(intent.merchant_address)) {
    return {
      route: 'BLOCKED',
      code: 'VENDOR_NOT_WHITELISTED',
      reason: `Destination ${intent.merchant_address} is not an approved vendor.`,
    };
  }

  // ── Path B: escalate to a human. ──
  // Only payroll and daily-limit breaches require human approval; everything else runs autonomously.
  // Per-tx limits are enforced at the Privy wallet-policy layer independently.
  const reasons: string[] = [];
  if (intent.is_payroll) reasons.push('Payroll payments always require human approval.');
  if (policy.spentTodayMicro + amountMicro > policy.dailyLimitMicro) {
    reasons.push('Payment would exceed the daily autonomous spend limit.');
  }
  if (reasons.length > 0) return { route: 'HITL', reasons };

  // ── Path A: within mandate. ──
  return { route: 'AUTONOMOUS' };
}
