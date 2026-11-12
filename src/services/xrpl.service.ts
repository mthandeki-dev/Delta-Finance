// XRP Ledger access (Testnet): connection, faucet funding, RLUSD trust line, payment construction,
// submission and validated-ledger verification.

import { createHash } from 'node:crypto';
import { Client, isValidClassicAddress, type Payment, type TrustSet } from 'xrpl';
import { env, RLUSD_HEX } from '@/lib/env';
import { AppError, errorMessage } from '@/lib/errors';
import { toMicro } from '@/lib/money';

export { isValidClassicAddress };

/** Opens a connection for the duration of `fn`. Simple and leak-free; XRPL connects in ~200 ms. */
export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(env.xrplWss, { connectionTimeout: 10_000, timeout: 20_000 });
  try {
    await client.connect();
  } catch (e) {
    throw new AppError(503, 'XRPL_UNAVAILABLE', `Could not reach the XRP Ledger Testnet: ${errorMessage(e)}`);
  }
  try {
    return await fn(client);
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

export const rlusdAmount = (value: string) => ({ currency: RLUSD_HEX, issuer: env.rlusdIssuer, value });

const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex').toUpperCase();

/** x402 invoice binding, method B: InvoiceID = SHA-256(invoiceId). */
export const invoiceHash = (invoiceId: string) => createHash('sha256').update(invoiceId, 'utf8').digest('hex').toUpperCase();

export type AccountStatus = {
  activated: boolean;
  xrpBalance: string;
  rlusdTrustline: boolean;
  rlusdBalance: string;
};

export async function getAccountStatus(address: string): Promise<AccountStatus> {
  return withClient(async (client) => {
    let xrpDrops: string;
    try {
      const info = await client.request({ command: 'account_info', account: address, ledger_index: 'validated' });
      xrpDrops = String(info.result.account_data.Balance);
    } catch (e) {
      if ((e as { data?: { error?: string } })?.data?.error === 'actNotFound') {
        return { activated: false, xrpBalance: '0', rlusdTrustline: false, rlusdBalance: '0' };
      }
      throw e;
    }
    const lines = await client.request({ command: 'account_lines', account: address, peer: env.rlusdIssuer, ledger_index: 'validated' });
    const line = lines.result.lines.find((l) => l.currency === RLUSD_HEX);
    return {
      activated: true,
      xrpBalance: (Number(xrpDrops) / 1_000_000).toString(),
      rlusdTrustline: Boolean(line),
      rlusdBalance: line?.balance ?? '0',
    };
  });
}

/** Testnet faucet: activates the account with test XRP (covers the 1 XRP base reserve + trust line reserve). */
export async function fundFromFaucet(address: string): Promise<void> {
  const res = await fetch(env.faucetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination: address }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new AppError(502, 'FAUCET_FAILED', `Testnet faucet returned ${res.status}. Try again in a minute.`);
  // Wait for the funding payment to validate
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    if ((await getAccountStatus(address)).activated) return;
  }
  throw new AppError(504, 'FAUCET_TIMEOUT', 'Faucet funding did not validate in time.');
}

/** TrustSet so the account can hold RLUSD (tfSetNoRipple, as in Ripple's RLUSD guide). */
export async function buildRlusdTrustSet(account: string): Promise<TrustSet> {
  const tx: TrustSet = {
    TransactionType: 'TrustSet',
    Account: account,
    LimitAmount: rlusdAmount('1000000000'),
    Flags: 131072,
  };
  return withClient((client) => client.autofill(tx));
}

/** An RLUSD Payment. Direct IOU transfer only: no paths, no partial payment, bounded by LastLedgerSequence. */
export async function buildRlusdPayment(p: {
  from: string;
  to: string;
  amount: string;
  invoiceId?: string;
  sourceTag?: number;
  destinationTag?: number;
}): Promise<Payment> {
  if (!isValidClassicAddress(p.to)) throw new AppError(400, 'INVALID_ADDRESS', 'Destination is not a valid XRPL address.');
  if (toMicro(p.amount) <= 0n) throw new AppError(400, 'INVALID_AMOUNT', 'Amount must be positive.');
  const tx: Payment = {
    TransactionType: 'Payment',
    Account: p.from,
    Destination: p.to,
    Amount: rlusdAmount(p.amount),
    ...(p.sourceTag !== undefined ? { SourceTag: p.sourceTag } : {}),
    ...(p.destinationTag !== undefined ? { DestinationTag: p.destinationTag } : {}),
    ...(p.invoiceId
      ? {
          InvoiceID: invoiceHash(p.invoiceId),
          Memos: [{ Memo: { MemoType: hex('x402/invoice'), MemoData: hex(p.invoiceId) } }],
        }
      : {}),
  };
  return withClient((client) => client.autofill(tx));
}

/** Submit a signed blob and wait for a validated result. */
export async function submitSignedBlob(blob: string): Promise<{ hash: string; result: string }> {
  return withClient(async (client) => {
    const res = await client.submitAndWait(blob);
    const meta = res.result.meta;
    const result = typeof meta === 'object' && meta !== null ? meta.TransactionResult : 'unknown';
    return { hash: res.result.hash, result };
  });
}

export type LedgerPayment = {
  validated: boolean;
  result?: string;
  account?: string;
  destination?: string;
  amount?: unknown;
  deliveredAmount?: unknown;
};

/** Looks a transaction up on the ledger. Returns validated=false while it is still pending or unknown. */
export async function lookupPayment(hash: string): Promise<LedgerPayment> {
  return withClient(async (client) => {
    try {
      const res = await client.request({ command: 'tx', transaction: hash });
      // xrpl.js v4 (API v2) nests fields under tx_json; older responses are flat.
      const r = res.result as unknown as Record<string, any>;
      const tx = (r.tx_json ?? r) as Record<string, any>;
      const meta = (r.meta ?? {}) as Record<string, any>;
      return {
        validated: Boolean(r.validated),
        result: meta.TransactionResult,
        account: tx.Account,
        destination: tx.Destination,
        amount: tx.DeliverMax ?? tx.Amount,
        deliveredAmount: meta.delivered_amount,
      };
    } catch (e) {
      if ((e as { data?: { error?: string } })?.data?.error === 'txnNotFound') return { validated: false };
      throw e;
    }
  });
}

/** Polls until the transaction is validated. Confirms destination and RLUSD amount match what was authorised. */
export async function confirmRlusdPayment(hash: string, expect: { to: string; amount: string }, attempts = 10): Promise<LedgerPayment> {
  let last: LedgerPayment = { validated: false };
  for (let i = 0; i < attempts; i++) {
    last = await lookupPayment(hash);
    if (last.validated) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!last.validated) return last;
  const delivered = (last.deliveredAmount ?? last.amount) as { currency?: string; issuer?: string; value?: string } | string | undefined;
  const matches =
    last.result === 'tesSUCCESS' &&
    last.destination === expect.to &&
    typeof delivered === 'object' &&
    delivered?.currency === RLUSD_HEX &&
    delivered?.issuer === env.rlusdIssuer &&
    toMicro(normaliseIouValue(delivered.value ?? '0')) === toMicro(expect.amount);
  if (!matches && last.result === 'tesSUCCESS') {
    throw new AppError(500, 'LEDGER_MISMATCH', `Transaction ${hash} validated but does not match the authorised payment.`);
  }
  return last;
}

/** Ledger IOU values may carry more than 6 decimals or exponent notation; normalise for comparison. */
function normaliseIouValue(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return '0';
  return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}
