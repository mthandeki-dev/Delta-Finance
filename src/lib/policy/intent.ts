// Anti-hallucination layer. Whatever produced the intent (LLM or deterministic parser), it must
//   1. match the strict JSON shape, and
//   2. be *grounded*: the amount and the destination must be traceable to the operator's own words.
// Pure module: no framework or network dependencies.

import { hasExcessPrecision, MAX_AMOUNT } from '../money';
import { CLASSIC_ADDRESS_RE, type Intent } from './router';

export type VendorRef = { label: string; xrplAddress: string };

export type IntentErrorCode =
  | 'NOT_A_PAYMENT'
  | 'MALFORMED_INTENT'
  | 'UNGROUNDED_AMOUNT'
  | 'UNGROUNDED_MERCHANT'
  | 'AMBIGUOUS_AMOUNT'
  | 'AMBIGUOUS_MERCHANT';

export class IntentError extends Error {
  constructor(
    public code: IntentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'IntentError';
  }
}

const ADDRESS_IN_TEXT_RE = /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/g;
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;
export const PAYROLL_RE = /\b(payroll|salary|salaries|wages?|paychecks?|payslips?|stipends?|bonus(?:es)?)\b/i;
const PAY_VERB_RE = /\b(pay|send|transfer|wire|remit|settle|disburse)\b/i;
const ALLOWED_KEYS = ['action', 'amount', 'merchant_address', 'is_payroll'];

/** Strict structural validation of `{"action":"PAY","amount":n,"merchant_address":"r…","is_payroll":b}`. */
export function validateIntentShape(raw: unknown): Intent {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new IntentError('MALFORMED_INTENT', 'Intent is not a JSON object.');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.action === 'NONE') throw new IntentError('NOT_A_PAYMENT', 'The instruction is not a single payment request.');
  const extra = Object.keys(obj).filter((k) => !ALLOWED_KEYS.includes(k));
  if (extra.length > 0) throw new IntentError('MALFORMED_INTENT', `Unexpected fields: ${extra.join(', ')}`);
  if (obj.action !== 'PAY') throw new IntentError('MALFORMED_INTENT', 'action must be "PAY".');
  if (typeof obj.amount !== 'number' || !Number.isFinite(obj.amount) || obj.amount <= 0 || obj.amount > MAX_AMOUNT) {
    throw new IntentError('MALFORMED_INTENT', 'amount must be a positive number.');
  }
  if (hasExcessPrecision(obj.amount)) {
    throw new IntentError('MALFORMED_INTENT', 'amount has more than 6 decimal places.');
  }
  if (typeof obj.merchant_address !== 'string' || !CLASSIC_ADDRESS_RE.test(obj.merchant_address)) {
    throw new IntentError('MALFORMED_INTENT', 'merchant_address must be a classic XRPL address.');
  }
  if (typeof obj.is_payroll !== 'boolean') throw new IntentError('MALFORMED_INTENT', 'is_payroll must be a boolean.');
  return {
    action: 'PAY',
    amount: obj.amount,
    merchant_address: obj.merchant_address,
    is_payroll: obj.is_payroll,
  };
}

export function extractAddresses(prompt: string): string[] {
  return [...new Set(prompt.match(ADDRESS_IN_TEXT_RE) ?? [])];
}

/** Numbers the operator actually typed (addresses are removed first — they contain digits). */
export function extractNumbers(prompt: string): number[] {
  const withoutAddresses = prompt.replace(ADDRESS_IN_TEXT_RE, ' ');
  return (withoutAddresses.match(NUMBER_RE) ?? [])
    .map((s) => Number(s.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
}

function vendorsNamedIn(prompt: string, vendors: VendorRef[]): VendorRef[] {
  const lower = prompt.toLowerCase();
  return vendors.filter((v) => v.label.trim().length >= 2 && lower.includes(v.label.trim().toLowerCase()));
}

/**
 * Grounding: reject any intent whose amount or destination cannot be traced to the prompt.
 * The payroll flag can only ever be raised here, never lowered.
 */
export function groundIntent(intent: Intent, prompt: string, vendors: VendorRef[]): Intent {
  const numbers = extractNumbers(prompt);
  if (!numbers.some((n) => Math.abs(n - intent.amount) < 1e-9)) {
    throw new IntentError(
      'UNGROUNDED_AMOUNT',
      `The amount ${intent.amount} does not appear in the instruction. Refusing to act on a possibly hallucinated value.`,
    );
  }
  const typed = extractAddresses(prompt);
  const named = vendorsNamedIn(prompt, vendors).map((v) => v.xrplAddress);
  if (!typed.includes(intent.merchant_address) && !named.includes(intent.merchant_address)) {
    throw new IntentError(
      'UNGROUNDED_MERCHANT',
      'The destination address was neither typed in the instruction nor matches a vendor named in it.',
    );
  }
  return { ...intent, is_payroll: intent.is_payroll || PAYROLL_RE.test(prompt) };
}

/** Deterministic parser. Used as the fallback when no LLM is configured, and as a cross-check in tests. */
export function deterministicParse(prompt: string, vendors: VendorRef[]): Intent {
  if (!PAY_VERB_RE.test(prompt)) {
    throw new IntentError('NOT_A_PAYMENT', 'The instruction is not a payment request.');
  }

  const typed = extractAddresses(prompt);
  let merchant: string;
  if (typed.length === 1) {
    merchant = typed[0];
  } else if (typed.length > 1) {
    throw new IntentError('AMBIGUOUS_MERCHANT', 'More than one XRPL address was given. One payment per instruction.');
  } else {
    const named = vendorsNamedIn(prompt, vendors);
    if (named.length === 0) throw new IntentError('UNGROUNDED_MERCHANT', 'No destination address or known vendor name found.');
    if (named.length > 1) throw new IntentError('AMBIGUOUS_MERCHANT', 'More than one vendor is named. One payment per instruction.');
    merchant = named[0].xrplAddress;
  }

  const cleaned = prompt.replace(ADDRESS_IN_TEXT_RE, ' ');
  const withUnit = [
    ...cleaned.matchAll(/\$\s*(\d[\d,]*(?:\.\d+)?)/g),
    ...cleaned.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(?:rlusd|usd|dollars?)\b/gi),
  ].map((m) => Number(m[1].replace(/,/g, '')));
  const candidates = withUnit.length > 0 ? [...new Set(withUnit)] : [...new Set(extractNumbers(prompt))];
  if (candidates.length === 0) throw new IntentError('UNGROUNDED_AMOUNT', 'No amount found in the instruction.');
  if (candidates.length > 1) throw new IntentError('AMBIGUOUS_AMOUNT', 'More than one amount found. One payment per instruction.');

  return validateIntentShape({
    action: 'PAY',
    amount: candidates[0],
    merchant_address: merchant,
    is_payroll: PAYROLL_RE.test(prompt),
  });
}
