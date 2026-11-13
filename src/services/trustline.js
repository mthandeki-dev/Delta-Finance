/**
 * Standalone script: sets the RLUSD trust line on the agent wallet stored in Supabase.
 * Run from the project root:  node src/services/trustline.js
 *
 * What it does:
 *   1. Loads .env.local
 *   2. Reads the AgentWallet row from the database
 *   3. Checks whether the trust line already exists (skips if so)
 *   4. Builds and autofills a TrustSet transaction
 *   5. Signs it via the Privy REST API
 *   6. Submits to XRPL Testnet and waits for validation
 *   7. Marks trustlineSet = true in the database
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config } from 'dotenv';
import { Pool } from 'pg';
import { Client, encodeForSigning } from 'xrpl';

// Load .env.local relative to this file (works from any cwd)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env.local') });

const {
  DATABASE_URL,
  PRIVY_APP_ID,
  PRIVY_APP_SECRET,
  XRPL_WSS       = 'wss://s.altnet.rippletest.net:51233',
  RLUSD_ISSUER   = 'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV',
} = process.env;

if (!DATABASE_URL)       throw new Error('DATABASE_URL is not set in .env.local');
if (!PRIVY_APP_ID)       throw new Error('PRIVY_APP_ID is not set in .env.local');
if (!PRIVY_APP_SECRET)   throw new Error('PRIVY_APP_SECRET is not set in .env.local');

const RLUSD_HEX = '524C555344000000000000000000000000000000';

// ── 1. Read agent wallet from the database ────────────────────────────────────
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const { rows } = await pool.query(
  `SELECT "privyWalletId", address, "publicKey", "trustlineSet" FROM "AgentWallet" WHERE id = 'agent' LIMIT 1`
);

if (!rows.length) {
  await pool.end();
  throw new Error('No AgentWallet record found. Click "Set up agent wallet" on the dashboard first.');
}

const { privyWalletId, address, publicKey, trustlineSet } = rows[0];
console.log(`Agent wallet : ${address}`);
console.log(`Privy ID     : ${privyWalletId}`);

// ── 2. Check whether the trust line already exists ────────────────────────────
const checkClient = new Client(XRPL_WSS, { connectionTimeout: 10_000 });
await checkClient.connect();

const lines = await checkClient.request({
  command: 'account_lines',
  account: address,
  peer: RLUSD_ISSUER,
  ledger_index: 'validated',
});
await checkClient.disconnect();

const existing = lines.result.lines.find((l) => l.currency === RLUSD_HEX);
if (existing) {
  console.log('Trust line already set — nothing to do.');
  await pool.end();
  process.exit(0);
}

// ── 3. Build and autofill the TrustSet transaction ───────────────────────────
const buildClient = new Client(XRPL_WSS, { connectionTimeout: 10_000 });
await buildClient.connect();

const prepared = await buildClient.autofill({
  TransactionType: 'TrustSet',
  Account: address,
  LimitAmount: { currency: RLUSD_HEX, issuer: RLUSD_ISSUER, value: '1000000000' },
  Flags: 131072, // tfSetNoRipple
});
await buildClient.disconnect();

console.log('TrustSet prepared — Sequence:', prepared.Sequence);

// ── 4. Sign via Privy REST API ────────────────────────────────────────────────
const withKey = { ...prepared, SigningPubKey: publicKey.replace(/^0x/, '').toUpperCase() };
const encoded = encodeForSigning(withKey);

const auth = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString('base64');
const signRes = await fetch(`https://api.privy.io/v1/wallets/${privyWalletId}/rpc`, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${auth}`,
    'privy-app-id': PRIVY_APP_ID,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    method: 'xrpl_signTransaction',
    params: { transaction: encoded, encoding: 'hex' },
  }),
  signal: AbortSignal.timeout(20_000),
});

const signJson = await signRes.json();
if (!signRes.ok) {
  throw new Error(`Privy signing failed (${signRes.status}): ${JSON.stringify(signJson)}`);
}

const blob = signJson.data?.signed_transaction?.replace(/^0x/, '').toUpperCase();
if (!blob) throw new Error('Privy did not return a signed_transaction');
console.log('Signed by Privy — submitting to XRPL Testnet…');

// ── 5. Submit and wait for validation ────────────────────────────────────────
const submitClient = new Client(XRPL_WSS, { connectionTimeout: 10_000, timeout: 30_000 });
await submitClient.connect();

const result = await submitClient.submitAndWait(blob);
await submitClient.disconnect();

const txResult = result.result.meta?.TransactionResult ?? 'unknown';
console.log('TrustSet result:', txResult);

if (txResult !== 'tesSUCCESS') {
  await pool.end();
  throw new Error(`TrustSet failed: ${txResult}`);
}

// ── 6. Mark trustlineSet = true in the database ───────────────────────────────
await pool.query(`UPDATE "AgentWallet" SET "trustlineSet" = true WHERE id = 'agent'`);
await pool.end();

console.log('Done — RLUSD trust line is set and database updated.');
