import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toProposal } from '../src/lib/verification/proposal';
import { sanitiseOutcomeReason, USER_MESSAGES } from '../src/lib/verification/messages';
import { verifyProposal, type VerificationContext, type VerificationDeps } from '../src/lib/verification/verify';
import type { Intent } from '../src/lib/policy/router';

const VENDOR = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const STRANGER = 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX';
const FX = 18; // ZAR per RLUSD (server-side constant)

const intent = (over: Partial<Intent> = {}): Intent => ({
  action: 'PAY',
  amount: 10,
  merchant_address: VENDOR,
  is_payroll: false,
  ...over,
});

const ctx = (over: Partial<VerificationContext> = {}): VerificationContext => ({
  whitelistAddresses: new Set([VENDOR]),
  userThresholdRand: null,
  recentTxCount: 0,
  ...over,
});

const okDeps = (ctxOverride: Partial<VerificationContext> = {}): VerificationDeps => ({
  verifyPrivyToken: async () => ({ userId: 'privy-user-1' }),
  loadContext: async () => ctx(ctxOverride),
});

// ── T7: orders ──────────────────────────────────────────────────────────────────

test('T7 — PRIVY_AUTH fires before WHITELIST when token is missing', async () => {
  const proposal = toProposal(intent({ merchant_address: STRANGER }), FX, { skipPrivyAuth: false });
  const result = await verifyProposal(proposal, okDeps());
  assert.equal(result.failedCheck, 'PRIVY_AUTH');
  assert.equal(result.passed, false);
});

test('T7 — WHITELIST fires before THRESHOLD when recipient not whitelisted', async () => {
  const proposal = toProposal(intent({ merchant_address: STRANGER }), FX, { skipPrivyAuth: true, userId: 'u1' });
  const result = await verifyProposal(proposal, okDeps({ userThresholdRand: 999 }));
  assert.equal(result.failedCheck, 'WHITELIST');
});

// ── T8: logging ─────────────────────────────────────────────────────────────────

test('T8 — all 5 checks are recorded on a passing run', async () => {
  const proposal = toProposal(intent(), FX, { skipPrivyAuth: true, userId: 'u1' });
  const result = await verifyProposal(proposal, okDeps());
  assert.equal(result.passed, true);
  assert.equal(result.checks.length, 5);
  const names = result.checks.map((c) => c.check);
  assert.deepEqual(names, ['PRIVY_AUTH', 'DB_CONTEXT', 'WHITELIST', 'THRESHOLD', 'DUPLICATE']);
  assert.ok(result.checks.every((c) => c.passed));
});

test('T8 — only checks up to and including the failed check are logged', async () => {
  const proposal = toProposal(intent({ merchant_address: STRANGER }), FX, { skipPrivyAuth: true, userId: 'u1' });
  const result = await verifyProposal(proposal, okDeps());
  assert.equal(result.failedCheck, 'WHITELIST');
  // PRIVY_AUTH + DB_CONTEXT passed, WHITELIST failed — only 3 entries
  assert.equal(result.checks.length, 3);
});

// ── T9: safe errors ──────────────────────────────────────────────────────────────

test('T9 — WHITELIST userMessage is exactly the required wording', () => {
  assert.equal(USER_MESSAGES['WHITELIST'], 'Recipient not whitelisted');
});

test('T9 — sanitiseOutcomeReason returns safe message for every check name', () => {
  for (const check of ['PRIVY_AUTH', 'DB_CONTEXT', 'WHITELIST', 'THRESHOLD', 'DUPLICATE']) {
    const msg = sanitiseOutcomeReason(check);
    assert.ok(typeof msg === 'string' && msg.length > 0, `Missing message for ${check}`);
    assert.ok(!msg.includes('Error'), `Message for ${check} leaks "Error"`);
    assert.ok(!msg.includes('prisma'), `Message for ${check} leaks implementation detail`);
  }
});

test('T9 — sanitiseOutcomeReason falls back gracefully for unknown check names', () => {
  const msg = sanitiseOutcomeReason('UNKNOWN_CHECK');
  assert.ok(typeof msg === 'string' && msg.length > 0);
});

// ── T10: isolation ───────────────────────────────────────────────────────────────

test('T10 — verifyProposal is pure: DB errors in loadContext produce DB_CONTEXT failure, not throws', async () => {
  const proposal = toProposal(intent(), FX, { skipPrivyAuth: true, userId: 'u1' });
  const badDeps: VerificationDeps = {
    verifyPrivyToken: async () => ({ userId: 'x' }),
    loadContext: async () => { throw new Error('DB connection lost'); },
  };
  const result = await verifyProposal(proposal, badDeps);
  assert.equal(result.failedCheck, 'DB_CONTEXT');
  assert.equal(result.passed, false);
});

test('T10 — verifyProposal is pure: Privy errors produce PRIVY_AUTH failure, not throws', async () => {
  const proposal = toProposal(intent(), FX, { privyToken: 'bad-token', skipPrivyAuth: false });
  const badDeps: VerificationDeps = {
    verifyPrivyToken: async () => { throw new Error('invalid signature'); },
    loadContext: async () => ctx(),
  };
  const result = await verifyProposal(proposal, badDeps);
  assert.equal(result.failedCheck, 'PRIVY_AUTH');
  assert.equal(result.passed, false);
});

// ── toProposal ───────────────────────────────────────────────────────────────────

test('toProposal rejects non-positive FX rate', () => {
  assert.throws(() => toProposal(intent(), 0, {}), /fxZarPerRlusd/);
  assert.throws(() => toProposal(intent(), -1, {}), /fxZarPerRlusd/);
  assert.throws(() => toProposal(intent(), NaN, {}), /fxZarPerRlusd/);
});

test('toProposal converts amount to ZAR correctly', () => {
  const p = toProposal(intent({ amount: 5 }), 18, { skipPrivyAuth: true });
  assert.equal(p.amountRand, 90);
});

// ── THRESHOLD check ───────────────────────────────────────────────────────────────

test('THRESHOLD passes when amountRand equals threshold exactly', async () => {
  const proposal = toProposal(intent({ amount: 10 }), FX, { skipPrivyAuth: true, userId: 'u1' }); // 180 ZAR
  const result = await verifyProposal(proposal, okDeps({ userThresholdRand: 180 }));
  assert.equal(result.passed, true);
});

test('THRESHOLD fails when amountRand exceeds threshold by 1 cent', async () => {
  const proposal = toProposal(intent({ amount: 10 }), FX, { skipPrivyAuth: true, userId: 'u1' }); // 180 ZAR
  const result = await verifyProposal(proposal, okDeps({ userThresholdRand: 179.99 }));
  assert.equal(result.failedCheck, 'THRESHOLD');
});

test('THRESHOLD is skipped when userThresholdRand is null', async () => {
  const proposal = toProposal(intent({ amount: 1000 }), FX, { skipPrivyAuth: true, userId: 'u1' });
  const result = await verifyProposal(proposal, okDeps({ userThresholdRand: null }));
  assert.equal(result.passed, true);
});

// ── DUPLICATE check ────────────────────────────────────────────────────────────────

test('DUPLICATE fails when recentTxCount > 0', async () => {
  const proposal = toProposal(intent(), FX, { skipPrivyAuth: true, userId: 'u1' });
  const result = await verifyProposal(proposal, okDeps({ recentTxCount: 1 }));
  assert.equal(result.failedCheck, 'DUPLICATE');
});

// ── adminApprovalEvidence ──────────────────────────────────────────────────────────

test('adminApprovalEvidence skips Privy token check and uses adminId as resolvedUserId', async () => {
  const proposal = toProposal(intent(), FX, {
    adminApprovalEvidence: { codeId: 'code-1', adminId: 'admin-db-id' },
  });
  const result = await verifyProposal(proposal, okDeps());
  assert.equal(result.passed, true);
  assert.equal(result.resolvedUserId, 'admin-db-id');
});
