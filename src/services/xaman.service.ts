// Xaman (formerly Xumm): the human side. Admins sign in and approve escalated payments by signing on
// their own phone. The backend never sees an admin key.

import { XummSdk } from 'xumm-sdk';
import { env } from '@/lib/env';
import { AppError, errorMessage } from '@/lib/errors';
import { rlusdAmount } from './xrpl.service';

let sdk: XummSdk | null = null;
function xaman(): XummSdk {
  if (!sdk) {
    try {
      sdk = new XummSdk(env.xamanKey, env.xamanSecret);
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(500, 'XAMAN_CONFIG', `Xaman credentials are invalid: ${errorMessage(e)}`);
    }
  }
  return sdk;
}

export type SignRequest = { uuid: string; qrPng: string; deeplink: string; pushed: boolean };

async function create(payload: Record<string, unknown>): Promise<SignRequest> {
  let created;
  try {
    created = await xaman().payload.create(payload as never);
  } catch (e) {
    throw new AppError(502, 'XAMAN_ERROR', `Xaman rejected the sign request: ${errorMessage(e)}`);
  }
  if (!created) throw new AppError(502, 'XAMAN_ERROR', 'Xaman did not create the sign request.');
  return { uuid: created.uuid, qrPng: created.refs.qr_png, deeplink: created.next.always, pushed: Boolean(created.pushed) };
}

/** Sign-in: a zero-value "SignIn" pseudo-transaction that proves control of an XRPL account. */
export function createSignIn(): Promise<SignRequest> {
  return create({
    txjson: { TransactionType: 'SignIn' },
    options: { expire: 5, return_url: { web: `${env.appUrl}/` } },
    custom_meta: { instruction: 'Sign in to Delta Finance' },
  });
}

/** HITL approval: an RLUSD Payment the admin signs natively in Xaman. Pushed to their phone when possible. */
export function createPaymentRequest(p: {
  txId: string;
  destination: string;
  amount: string;
  userToken?: string | null;
  memo: string;
}): Promise<SignRequest> {
  const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex').toUpperCase();
  return create({
    ...(p.userToken ? { user_token: p.userToken } : {}),
    txjson: {
      TransactionType: 'Payment',
      Destination: p.destination,
      Amount: rlusdAmount(p.amount),
      Memos: [{ Memo: { MemoType: hex('delta-finance/hitl'), MemoData: hex(p.memo) } }],
    },
    options: { submit: true, expire: 10, force_network: 'TESTNET' },
    custom_meta: {
      identifier: p.txId.slice(0, 40),
      instruction: `Delta Finance: approve ${p.amount} RLUSD to ${p.destination}`,
    },
  });
}

export type SignResult = {
  resolved: boolean;
  signed: boolean;
  expired: boolean;
  account?: string;
  txid?: string;
  userToken?: string;
};

/** Cancels an open Xaman payload so it can no longer be signed. Errors are silently ignored (already expired / resolved). */
export async function cancelPayload(uuid: string): Promise<void> {
  try {
    await xaman().payload.cancel(uuid);
  } catch {
    // Payload may have already expired or been resolved — that is fine.
  }
}

export async function getSignResult(uuid: string): Promise<SignResult> {
  let p;
  try {
    p = await xaman().payload.get(uuid);
  } catch (e) {
    throw new AppError(502, 'XAMAN_ERROR', `Could not read the Xaman sign request: ${errorMessage(e)}`);
  }
  if (!p) throw new AppError(404, 'XAMAN_NOT_FOUND', 'Sign request not found.');
  return {
    resolved: Boolean(p.meta.resolved),
    signed: Boolean(p.meta.signed),
    expired: Boolean(p.meta.expired),
    account: p.response.account ?? undefined,
    txid: p.response.txid ?? undefined,
    userToken: p.application.issued_user_token ?? undefined,
  };
}
