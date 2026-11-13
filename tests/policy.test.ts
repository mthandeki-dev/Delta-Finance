import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMicro, fromMicro } from '../src/lib/money';
import { decide, type PolicySnapshot } from '../src/lib/policy/router';
import { deterministicParse, groundIntent, validateIntentShape, IntentError } from '../src/lib/policy/intent';

const VENDOR = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
// Whitelisted but isVendor=false — represents a payroll/contractor address
const PAYROLL = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const STRANGER = 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX';
const vendors = [{ label: 'Lagos Textiles', xrplAddress: VENDOR }];

const policy = (over: Partial<PolicySnapshot> = {}): PolicySnapshot => ({
  agentEnabled: true,
  dailyLimitMicro: toMicro('100'),
  perTxLimitMicro: toMicro('25'),
  spentTodayMicro: 0n,
  whitelist: new Set([VENDOR, PAYROLL]),
  autonomousVendors: new Set([VENDOR]), // PAYROLL is whitelisted but not autonomous
  ...over,
});
const pay = (amount: number, merchant_address = VENDOR, is_payroll = false) =>
  ({ action: 'PAY', amount, merchant_address, is_payroll }) as const;

test('money: exact decimal round trip', () => {
  assert.equal(toMicro('0.1') + toMicro('0.2'), toMicro('0.3'));
  assert.equal(fromMicro(toMicro('12.340000')), '12.34');
  assert.equal(toMicro(5), 5_000_000n);
  assert.throws(() => toMicro('1e5'));
  assert.throws(() => toMicro('-1'));
});

test('router: Path A — isVendor=true is always autonomous (ignores payroll flag and daily limit)', () => {
  assert.deepEqual(decide(pay(10), policy()), { route: 'AUTONOMOUS' });
  assert.deepEqual(decide(pay(1, VENDOR, true), policy()), { route: 'AUTONOMOUS' }); // payroll flag ignored for vendor
  assert.deepEqual(decide(pay(90), policy({ spentTodayMicro: toMicro('80') })), { route: 'AUTONOMOUS' }); // daily limit ignored
});

test('router: Path B — non-autonomous whitelisted address: daily limit escalates', () => {
  assert.equal(decide(pay(20, PAYROLL), policy({ spentTodayMicro: toMicro('80') })).route, 'AUTONOMOUS');
  assert.equal(decide(pay(20, PAYROLL), policy({ spentTodayMicro: toMicro('80.01') })).route, 'HITL');
});

test('router: Path B — non-autonomous whitelisted address: payroll escalates', () => {
  assert.equal(decide(pay(1, PAYROLL, true), policy()).route, 'HITL');
  assert.equal(decide(pay(1, PAYROLL, false), policy()).route, 'AUTONOMOUS');
});

test('router: Path C — non-whitelisted destination is blocked, never escalated', () => {
  const d = decide(pay(1, STRANGER), policy());
  assert.equal(d.route, 'BLOCKED');
  assert.equal(d.route === 'BLOCKED' && d.code, 'VENDOR_NOT_WHITELISTED');
  // a big payroll payment to a stranger is still a block, not a HITL request
  assert.equal(decide(pay(5000, STRANGER, true), policy()).route, 'BLOCKED');
});

test('router: Path C — kill switch, bad amounts, self payment', () => {
  assert.equal(decide(pay(1), policy({ agentEnabled: false })).route, 'BLOCKED');
  assert.equal(decide(pay(0), policy()).route, 'BLOCKED');
  assert.equal(decide(pay(-5), policy()).route, 'BLOCKED');
  assert.equal(decide(pay(1), policy({ agentAddress: VENDOR })).route, 'BLOCKED');
});

test('intent: strict shape', () => {
  assert.throws(() => validateIntentShape({ action: 'PAY', amount: '5', merchant_address: VENDOR, is_payroll: false }), IntentError);
  assert.throws(() => validateIntentShape({ action: 'PAY', amount: 5, merchant_address: VENDOR, is_payroll: false, memo: 'x' }), IntentError);
  assert.throws(() => validateIntentShape({ action: 'REFUND', amount: 5, merchant_address: VENDOR, is_payroll: false }), IntentError);
  assert.throws(() => validateIntentShape({ action: 'NONE' }), /not a single payment/);
  assert.equal(validateIntentShape(pay(5)).amount, 5);
});

test('intent: grounding rejects hallucinated amount or address', () => {
  const prompt = 'Pay Lagos Textiles 12.50 RLUSD for invoice 884';
  assert.equal(groundIntent(pay(12.5), prompt, vendors).amount, 12.5);
  assert.throws(() => groundIntent(pay(125), prompt, vendors), /does not appear/);
  assert.throws(() => groundIntent(pay(12.5, STRANGER), prompt, vendors), /neither typed/);
});

test('intent: grounding can raise the payroll flag but never lower it', () => {
  const g = groundIntent(pay(10), `Send 10 RLUSD salary to ${VENDOR}`, vendors);
  assert.equal(g.is_payroll, true);
  assert.equal(groundIntent(pay(10, VENDOR, true), `Send 10 RLUSD to ${VENDOR}`, vendors).is_payroll, true);
});

test('intent: deterministic parser', () => {
  assert.deepEqual(deterministicParse('Pay Lagos Textiles 12.50 RLUSD for invoice 884', vendors), pay(12.5));
  assert.deepEqual(deterministicParse(`send $1,200 to ${STRANGER}`, vendors), pay(1200, STRANGER));
  assert.equal(deterministicParse(`Run payroll: pay 40 RLUSD to ${VENDOR}`, vendors).is_payroll, true);
  assert.throws(() => deterministicParse('What is our balance?', vendors), /not a payment/);
  assert.throws(() => deterministicParse('Pay 5 RLUSD', vendors), IntentError);
  assert.throws(() => deterministicParse(`Pay 5 RLUSD to ${VENDOR} and ${STRANGER}`, vendors), /More than one/);
  assert.throws(() => deterministicParse('Pay Lagos Textiles 5 RLUSD and 7 RLUSD', vendors), /More than one amount/);
});

test('intent: digits inside an address are not mistaken for an amount', () => {
  assert.deepEqual(deterministicParse(`pay 3 RLUSD to ${VENDOR}`, vendors), pay(3));
});
