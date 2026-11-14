import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

// Generate key pairs BEFORE any import that calls env getters.
// env.ts uses lazy getters, so as long as we set process.env here — in module
// scope, before any test body runs — the getters will see these values.
const currentKeys  = ml_kem768.keygen();
const previousKeys = ml_kem768.keygen();
const wrongKeys    = ml_kem768.keygen();

process.env.PQ_PUBLIC_KEY          = Buffer.from(currentKeys.publicKey).toString('base64');
process.env.PQ_SECRET_KEY          = Buffer.from(currentKeys.secretKey).toString('base64');
process.env.PQ_KEY_ID              = '7';
process.env.PQ_SECRET_KEY_PREVIOUS = Buffer.from(previousKeys.secretKey).toString('base64');
process.env.PQ_KEY_ID_PREVIOUS     = '3';

// Static import is fine: encryptField/decryptField only call env.pqKeyId etc.
// inside their function bodies, not at module load time.
import { encryptField, decryptField } from '../src/lib/crypto/field-encryption';

const CTX  = { table: 'TransactionLog', column: 'prompt' } as const;
const CTX2 = { table: 'Vendor',         column: 'label'  } as const;

// ── Round trips ───────────────────────────────────────────────────────────────

test('encrypts and decrypts a plain string', async () => {
  const plaintext = 'Pay Lagos Textiles 12.50 RLUSD for invoice 884';
  const stored    = await encryptField(plaintext, CTX);
  assert.ok(stored.startsWith('pq1:'), 'stored value must start with pq1:');
  assert.notEqual(stored, plaintext);
  const recovered = await decryptField(stored, CTX);
  assert.equal(recovered, plaintext);
});

test('encrypts and decrypts a JSON payload (round-tripped as a string)', async () => {
  const obj    = { action: 'PAY', amount: 12.5, merchant_address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', is_payroll: false };
  const stored = await encryptField(JSON.stringify(obj), CTX);
  assert.ok(stored.startsWith('pq1:'));
  const recovered = JSON.parse(await decryptField(stored, CTX));
  assert.deepEqual(recovered, obj);
});

test('each encryption of the same plaintext produces a different ciphertext (probabilistic)', async () => {
  const c1 = await encryptField('hello', CTX);
  const c2 = await encryptField('hello', CTX);
  assert.notEqual(c1, c2);
});

// ── Legacy passthrough ────────────────────────────────────────────────────────

test('decryptField returns plaintext rows unchanged (passthrough for pre-encryption data)', async () => {
  const legacy = 'Pay Acme Corp 5 RLUSD';
  assert.equal(await decryptField(legacy, CTX), legacy);
});

test('decryptField passes through values that do not start with pq1:', async () => {
  assert.equal(await decryptField('', CTX), '');
  assert.equal(await decryptField('some plain text', CTX), 'some plain text');
  assert.equal(await decryptField('{"key":"value"}', CTX), '{"key":"value"}');
});

// ── Failure modes ─────────────────────────────────────────────────────────────

test('tampered ciphertext fails authentication', async () => {
  const stored  = await encryptField('sensitive', CTX);
  const tampered = stored.slice(0, -4) + 'XXXX';
  await assert.rejects(() => decryptField(tampered, CTX), /Unsupported state|bad decrypt|auth|tag/i);
});

test('a value moved to a different column fails AAD verification', async () => {
  const stored = await encryptField('label value', CTX2);
  // Decrypt using a different model/column — the AAD won't match.
  await assert.rejects(
    () => decryptField(stored, CTX),
    /Unsupported state|bad decrypt|auth|tag/i,
  );
});

// ── Key rotation ──────────────────────────────────────────────────────────────

test('value encrypted with the previous key decrypts after key rotation', async () => {
  // Temporarily activate previousKeys as the current key to produce an old-style ciphertext.
  const savedPub = process.env.PQ_PUBLIC_KEY;
  const savedSec = process.env.PQ_SECRET_KEY;
  const savedId  = process.env.PQ_KEY_ID;

  process.env.PQ_PUBLIC_KEY = Buffer.from(previousKeys.publicKey).toString('base64');
  process.env.PQ_SECRET_KEY = Buffer.from(previousKeys.secretKey).toString('base64');
  process.env.PQ_KEY_ID     = '3';

  const stored = await encryptField('old secret', CTX);

  // Rotation: restore the new current key; old key remains in PREVIOUS (kid 3).
  process.env.PQ_PUBLIC_KEY = savedPub;
  process.env.PQ_SECRET_KEY = savedSec;
  process.env.PQ_KEY_ID     = savedId;

  const recovered = await decryptField(stored, CTX);
  assert.equal(recovered, 'old secret');
});

test('ciphertext produced under an entirely unknown key ID cannot be decrypted', async () => {
  const savedPub = process.env.PQ_PUBLIC_KEY;
  const savedId  = process.env.PQ_KEY_ID;

  process.env.PQ_PUBLIC_KEY = Buffer.from(wrongKeys.publicKey).toString('base64');
  process.env.PQ_KEY_ID     = '99'; // neither 7 (current) nor 3 (previous)

  const stored = await encryptField('secret data', CTX);

  process.env.PQ_PUBLIC_KEY = savedPub;
  process.env.PQ_KEY_ID     = savedId;

  await assert.rejects(() => decryptField(stored, CTX), /Unknown key ID/);
});

// ── Truncation guard ──────────────────────────────────────────────────────────

test('truncated pq1: blob throws', async () => {
  await assert.rejects(() => decryptField('pq1:aGVsbG8=', CTX), /Truncated/);
});
