// The agent orchestrator: parse → ground → route → execute, with every outcome written to the audit trail.
//
// Enforcement layers, in the order a payment meets them:
//   1. INTENT_VALIDATION  strict JSON + grounding (this process)
//   2. APP_POLICY         deterministic router against the Postgres mandate (this process)
//   3. X402_GATEWAY       settlement gateway re-checks the mandate and quotes from the database, not the agent
//   4. PRIVY_POLICY       Privy's policy engine evaluates the transaction before signing   ← outside the agent
//   5. T54_FACILITATOR    t54 verifies destination, amount and invoice binding, then settles ← outside the agent

import type { AgentWallet, TransactionLog } from '@prisma/client';
import { audit } from '@/lib/audit';
import { AGENT_WALLET_ID, ensurePolicy, POLICY_ID, prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { AppError, errorMessage } from '@/lib/errors';
import { fromMicro, numberToDecimalString, toMicro } from '@/lib/money';
import { decide, type Decision, type Intent } from '@/lib/policy/router';
import { IntentError, parseIntent } from './llm.service';
import { verify as verifyProposal } from './verification.service';
import { buildMandatePolicy, createXrplWallet, getPrivyWallet, PrivyPolicyDenied, signXrplTransaction, upsertMandatePolicy } from './privy.service';
import { payViaX402, X402Denied } from './t54.service';
import {
  buildRlusdPayment,
  buildRlusdTrustSet,
  confirmRlusdPayment,
  fundFromFaucet,
  getAccountStatus,
  submitSignedBlob,
} from './xrpl.service';

// One payment at a time: keeps the daily-limit check and the XRPL account Sequence consistent.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

const decimalToMicro = (d: { toFixed(n: number): string } | null | undefined) => toMicro(d ? d.toFixed(6) : '0');

export function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Autonomous RLUSD spent today (UTC). In-flight and unconfirmed payments count, so the limit fails closed. */
export async function spentTodayMicro(): Promise<bigint> {
  const agg = await prisma.transactionLog.aggregate({
    _sum: { amountRlusd: true },
    where: {
      route: 'AUTONOMOUS',
      createdAt: { gte: startOfUtcDay() },
      OR: [{ status: { in: ['EXECUTED', 'PENDING'] } }, { status: 'FAILED', txHash: { not: null } }],
    },
  });
  return decimalToMicro(agg._sum.amountRlusd);
}

// ─────────────────────────────── Mandate → Privy ───────────────────────────────

/** Mirrors the dashboard mandate into Privy's policy engine. Called after every limit or whitelist change. */
export async function syncPrivyMandate(actor: string): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const [policy, wallet, vendors] = await Promise.all([
    ensurePolicy(),
    prisma.agentWallet.findUnique({ where: { id: AGENT_WALLET_ID } }),
    prisma.vendor.findMany({ where: { active: true } }),
  ]);
  if (!env.configured.privy || !wallet) return { ok: false, skipped: true };
  try {
    const privyPolicyId = await upsertMandatePolicy(
      wallet.privyWalletId,
      policy.privyPolicyId,
      buildMandatePolicy({
        whitelist: vendors.map((v) => v.xrplAddress),
        perTxLimit: fromMicro(decimalToMicro(policy.perTxLimitRlusd)),
        agentEnabled: policy.agentEnabled,
        rlusdIssuer: env.rlusdIssuer,
      }),
    );
    await prisma.treasuryPolicy.update({
      where: { id: POLICY_ID },
      data: { privyPolicyId, privySyncedAt: new Date(), privySyncError: null },
    });
    await audit('MANDATE_SYNCED_TO_PRIVY', { actor, detail: { privyPolicyId, vendors: vendors.length } });
    return { ok: true };
  } catch (e) {
    const error = errorMessage(e);
    await prisma.treasuryPolicy.update({ where: { id: POLICY_ID }, data: { privySyncError: error } });
    await audit('MANDATE_SYNC_FAILED', { actor, detail: { error } });
    return { ok: false, error };
  }
}

// ─────────────────────────────── Agent wallet setup ───────────────────────────────

/** Idempotent provisioning: Privy wallet → faucet activation → RLUSD trust line → mandate policy.
 *  If the stored wallet ID is not found under the current Privy credentials (e.g. after an app switch),
 *  the stale record is replaced with a fresh wallet from the current app. */
export async function setupAgentWallet(actor: string): Promise<{ wallet: AgentWallet; steps: string[] }> {
  const steps: string[] = [];
  let wallet = await prisma.agentWallet.findUnique({ where: { id: AGENT_WALLET_ID } });

  if (wallet) {
    const appChanged = wallet.privyAppId !== null && wallet.privyAppId !== env.privyAppId;
    const walletGone = !appChanged && !(await getPrivyWallet(wallet.privyWalletId));
    if (appChanged || walletGone) {
      const reason = appChanged ? `Privy app ID changed (was ${wallet.privyAppId})` : `Wallet ${wallet.address} not found in Privy`;
      steps.push(`${reason} — provisioning a new wallet under app ${env.privyAppId}`);
      await prisma.agentWallet.delete({ where: { id: AGENT_WALLET_ID } });
      await prisma.treasuryPolicy.update({
        where: { id: POLICY_ID },
        data: { privyPolicyId: null, privySyncedAt: null, privySyncError: null },
      });
      await audit('AGENT_WALLET_REPLACED', { actor, detail: { staleAddress: wallet.address, reason } });
      wallet = null;
    }
  }

  if (!wallet) {
    const created = await createXrplWallet();
    wallet = await prisma.agentWallet.create({
      data: { id: AGENT_WALLET_ID, privyAppId: env.privyAppId, privyWalletId: created.id, address: created.address, publicKey: created.public_key },
    });
    steps.push(`Created Privy server wallet ${wallet.address} (app: ${env.privyAppId})`);
    await audit('AGENT_WALLET_CREATED', { actor, detail: { address: wallet.address, privyAppId: env.privyAppId } });
  }

  let status = await getAccountStatus(wallet.address);
  if (!status.activated) {
    await fundFromFaucet(wallet.address);
    steps.push('Activated the account with Testnet XRP from the faucet');
    status = await getAccountStatus(wallet.address);
  }

  if (!status.rlusdTrustline) {
    // The mandate policy only allows RLUSD payments, so the trust line is set before the policy is attached.
    const policy = await ensurePolicy();
    if (policy.privyPolicyId) {
      throw new AppError(409, 'TRUSTLINE_BLOCKED_BY_POLICY', 'The wallet policy is already attached and does not allow TrustSet. Detach it in Privy, then retry.');
    }
    const trustSet = await buildRlusdTrustSet(wallet.address);
    const blob = await signXrplTransaction(wallet, trustSet);
    const res = await submitSignedBlob(blob);
    if (res.result !== 'tesSUCCESS') throw new AppError(502, 'TRUSTSET_FAILED', `TrustSet failed with ${res.result}.`);
    steps.push(`RLUSD trust line set (${res.hash})`);
    await audit('AGENT_TRUSTLINE_SET', { actor, detail: { hash: res.hash } });
  }
  if (!wallet.trustlineSet) {
    wallet = await prisma.agentWallet.update({ where: { id: AGENT_WALLET_ID }, data: { trustlineSet: true } });
  }

  const sync = await syncPrivyMandate(actor);
  steps.push(sync.ok ? 'Mandate mirrored to the Privy policy engine' : `Privy policy sync failed: ${sync.error ?? 'skipped'}`);
  return { wallet, steps };
}

// ─────────────────────────────────── The agent ───────────────────────────────────

export type AgentOutcome = {
  id: string;
  route: TransactionLog['route'];
  status: TransactionLog['status'];
  blockedBy: TransactionLog['blockedBy'];
  reason: string | null;
  txHash: string | null;
  intent: Intent | null;
};

const outcome = (tx: TransactionLog, intent: Intent | null): AgentOutcome => ({
  id: tx.id,
  route: tx.route,
  status: tx.status,
  blockedBy: tx.blockedBy,
  reason: tx.reason,
  txHash: tx.txHash,
  intent,
});

export async function runAgent(input: { prompt: string; actor: string; redTeam?: boolean; privyToken?: string | null; userId?: string | null }): Promise<AgentOutcome> {
  const prompt = input.prompt.trim();
  const { actor } = input;
  const vendors = await prisma.vendor.findMany({ where: { active: true } });

  // 1. Natural language → strict, grounded intent
  let intent: Intent;
  let intentSource: string;
  try {
    const parsed = await parseIntent(prompt, vendors);
    intent = parsed.intent;
    intentSource = parsed.source;
  } catch (e) {
    if (!(e instanceof IntentError)) throw e;
    const tx = await prisma.transactionLog.create({
      data: { actor, prompt, route: 'BLOCKED', status: 'BLOCKED', blockedBy: 'INTENT_VALIDATION', reason: `${e.code}: ${e.message}` },
    });
    await audit('AGENT_BLOCKED', { actor, txId: tx.id, detail: { layer: 'INTENT_VALIDATION', code: e.code, reason: e.message } });
    return outcome(tx, null);
  }

  const amount = numberToDecimalString(intent.amount);
  const base = {
    actor,
    prompt,
    intentJson: intent,
    intentSource,
    amountRlusd: amount,
    merchantAddress: intent.merchant_address,
    isPayroll: intent.is_payroll,
  };

  return serialize(async () => {
    // 2. Deterministic routing against the mandate
    const [policy, wallet, spent] = await Promise.all([
      ensurePolicy(),
      prisma.agentWallet.findUnique({ where: { id: AGENT_WALLET_ID } }),
      spentTodayMicro(),
    ]);
    const perTxLimitMicro = decimalToMicro(policy.perTxLimitRlusd);
    let decision: Decision = decide(intent, {
      agentEnabled: policy.agentEnabled,
      dailyLimitMicro: decimalToMicro(policy.dailyLimitRlusd),
      perTxLimitMicro,
      spentTodayMicro: spent,
      whitelist: new Set(vendors.map((v) => v.xrplAddress)),
      autonomousVendors: new Set(vendors.filter((v) => v.isVendor).map((v) => v.xrplAddress)),
      agentAddress: wallet?.address,
    });

    // Fail closed: if the Privy mirror of the mandate is stale, nothing runs without a human.
    if (decision.route === 'AUTONOMOUS' && policy.privySyncError) {
      decision = { route: 'HITL', reasons: ['The wallet policy at Privy is out of sync with the dashboard. Human approval required until it is re-synced.'] };
    }

    // Red-team demo: skip our own router and let the infrastructure prove it holds on its own.
    if (input.redTeam) {
      const forbiddenAtPrivy =
        (decision.route === 'BLOCKED' && decision.code === 'VENDOR_NOT_WHITELISTED') || toMicro(amount) > perTxLimitMicro;
      if (!forbiddenAtPrivy) {
        throw new AppError(400, 'REDTEAM_NOT_APPLICABLE', 'The red-team test needs a payment the wallet policy forbids: a non-approved address, or an amount over the per-payment limit.');
      }
      return redTeamAttempt(base, intent, amount, wallet);
    }

    if (decision.route === 'BLOCKED') {
      const tx = await prisma.transactionLog.create({
        data: { ...base, route: 'BLOCKED', status: 'BLOCKED', blockedBy: 'APP_POLICY', reason: `${decision.code}: ${decision.reason}` },
      });
      await audit('AGENT_BLOCKED', { actor, txId: tx.id, detail: { layer: 'APP_POLICY', code: decision.code, reason: decision.reason, intent } });
      return outcome(tx, intent);
    }

    if (decision.route === 'HITL') {
      const tx = await prisma.transactionLog.create({
        data: { ...base, route: 'HITL', status: 'PENDING_HITL', reason: decision.reasons.join(' ') },
      });
      await audit('AGENT_ESCALATED_TO_HUMAN', { actor, txId: tx.id, detail: { reasons: decision.reasons, intent } });
      return outcome(tx, intent);
    }

    // 3. Backend verification gate (between app-policy router and payment execution)
    const vr = await verifyProposal({
      intent,
      actor,
      privyToken: input.privyToken ?? null,
      skipPrivyAuth: !input.privyToken && Boolean(input.userId),
      userId: input.userId ?? null,
    });
    if (!vr.passed) {
      const tx = await prisma.transactionLog.create({
        data: { ...base, route: 'BLOCKED', status: 'BLOCKED', blockedBy: 'BACKEND_VERIFICATION', reason: vr.userMessage },
      });
      await prisma.proposalVerification.update({ where: { id: vr.proposalVerificationId }, data: { txId: tx.id } });
      await audit('AGENT_BLOCKED', { actor, txId: tx.id, detail: { layer: 'BACKEND_VERIFICATION', failedCheck: vr.failedCheck } });
      return outcome(tx, intent);
    }

    // 4. Autonomous execution
    const tx = await prisma.transactionLog.create({
      data: { ...base, route: 'AUTONOMOUS', status: 'PENDING' },
    });
    const invoiceId = `DF-${tx.id}`;
    await prisma.transactionLog.update({ where: { id: tx.id }, data: { invoiceId } });
    await audit('AGENT_AUTHORISED', { actor, txId: tx.id, detail: { intent, spentTodayBefore: fromMicro(spent) } });
    return outcome(await executeAutonomous(tx.id, intent, amount, wallet, actor), intent);
  });
}

async function executeAutonomous(
  txId: string,
  intent: Intent,
  amount: string,
  wallet: AgentWallet | null,
  actor: string,
): Promise<TransactionLog> {
  const finish = (data: Partial<TransactionLog>) => prisma.transactionLog.update({ where: { id: txId }, data: data as never });
  try {
    if (!wallet) throw new AppError(409, 'AGENT_WALLET_MISSING', 'The agent wallet has not been set up yet. An admin can do this from the dashboard.');

    // Pre-flight: confirm the vendor has an RLUSD trust line so we give a clear error instead of tecPATH_DRY.
    const vendorStatus = await getAccountStatus(intent.merchant_address);
    if (!vendorStatus.activated) {
      const reason = `Vendor account ${intent.merchant_address} is not activated on the XRP Ledger. They need XRP to cover the base reserve.`;
      await audit('AGENT_PAYMENT_FAILED', { actor, txId, detail: { reason } });
      return finish({ status: 'FAILED', reason });
    }
    if (!vendorStatus.rlusdTrustline) {
      const reason = `Vendor ${intent.merchant_address} has not set up an RLUSD trust line. They must do so before receiving RLUSD payments.`;
      await audit('AGENT_PAYMENT_FAILED', { actor, txId, detail: { reason } });
      return finish({ status: 'FAILED', reason });
    }

    const settled = await payViaX402({
      url: `${env.internalUrl}/api/x402/settle/${txId}`,
      headers: { 'x-internal-key': env.agentApiKey },
      expect: { payTo: intent.merchant_address, amount },
      sign: async (req) => {
        const payment = await buildRlusdPayment({
          from: wallet.address,
          to: req.payTo,
          amount: req.amount,
          invoiceId: req.extra.invoiceId,
          sourceTag: req.extra.sourceTag,
          destinationTag: req.extra.destinationTag,
        });
        return signXrplTransaction(wallet, payment);
      },
    });

    const hash = settled.transaction as string;
    const confirmed = await confirmRlusdPayment(hash, { to: intent.merchant_address, amount });
    if (confirmed.validated && confirmed.result === 'tesSUCCESS') {
      await audit('AGENT_PAYMENT_EXECUTED', { actor, txId, detail: { hash, amount, to: intent.merchant_address, settledVia: settled.settledVia } });
      return finish({ status: 'EXECUTED', txHash: hash, settledVia: settled.settledVia ?? 'T54_FACILITATOR', reason: null });
    }
    const reason = confirmed.validated
      ? `Ledger rejected the payment: ${confirmed.result}`
      : 'Submitted, but not yet validated on the ledger. Check the transaction hash.';
    await audit('AGENT_PAYMENT_FAILED', { actor, txId, detail: { hash, reason } });
    return finish({ status: 'FAILED', txHash: confirmed.validated ? null : hash, reason });
  } catch (e) {
    if (e instanceof PrivyPolicyDenied || e instanceof X402Denied) {
      const layer = e instanceof PrivyPolicyDenied ? 'PRIVY_POLICY' : e.layer;
      await audit('AGENT_BLOCKED', { actor, txId, detail: { layer, reason: e.message, intent } });
      return finish({ route: 'BLOCKED', status: 'BLOCKED', blockedBy: layer, reason: e.message });
    }
    const reason = errorMessage(e);
    await audit('AGENT_PAYMENT_FAILED', { actor, txId, detail: { reason } });
    return finish({ status: 'FAILED', reason });
  }
}

/**
 * Sends a forbidden payment straight to the signer, skipping the app router and the gateway.
 * Expected result: Privy refuses to sign. Nothing is ever submitted from this path, whatever happens.
 */
async function redTeamAttempt(
  base: Record<string, unknown>,
  intent: Intent,
  amount: string,
  wallet: AgentWallet | null,
): Promise<AgentOutcome> {
  if (!wallet) throw new AppError(409, 'AGENT_WALLET_MISSING', 'Set up the agent wallet before running the red-team test.');
  const actor = String(base.actor);
  const prefix = 'Red-team test (app router bypassed). ';
  let data: { status: 'BLOCKED' | 'FAILED'; blockedBy?: 'PRIVY_POLICY'; reason: string };
  try {
    const payment = await buildRlusdPayment({ from: wallet.address, to: intent.merchant_address, amount });
    await signXrplTransaction(wallet, payment); // signed blob is discarded on purpose
    data = {
      status: 'FAILED',
      reason: `${prefix}CRITICAL: Privy signed a payment the mandate forbids. The wallet policy is missing or stale — re-sync it. The signed transaction was discarded and nothing was submitted.`,
    };
  } catch (e) {
    if (!(e instanceof PrivyPolicyDenied)) throw e;
    data = { status: 'BLOCKED', blockedBy: 'PRIVY_POLICY', reason: `${prefix}Privy's policy engine refused to sign: ${e.message}` };
  }
  const tx = await prisma.transactionLog.create({ data: { ...base, route: 'BLOCKED', ...data } as never });
  await audit(data.status === 'BLOCKED' ? 'AGENT_BLOCKED' : 'REDTEAM_POLICY_GAP', {
    actor,
    txId: tx.id,
    detail: { layer: 'PRIVY_POLICY', redTeam: true, reason: data.reason, intent },
  });
  return outcome(tx, intent);
}

export async function agentWalletStatus() {
  const wallet = await prisma.agentWallet.findUnique({ where: { id: AGENT_WALLET_ID } });
  if (!wallet) return null;
  try {
    return { address: wallet.address, ...(await getAccountStatus(wallet.address)), reachable: true };
  } catch {
    return { address: wallet.address, activated: false, xrpBalance: '0', rlusdTrustline: wallet.trustlineSet, rlusdBalance: '0', reachable: false };
  }
}
