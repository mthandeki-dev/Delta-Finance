import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { env } from '../env';

export type FieldContext = { table: string; column: string };

const HKDF_INFO = Buffer.from('delta-finance/field/v1', 'utf8');
const PREFIX = 'pq1:';

// Fixed sizes for ML-KEM-768
const KEM_CT_BYTES  = 1088;
const SALT_BYTES    = 16;
const IV_BYTES      = 12;
const TAG_BYTES     = 16;
const KID_BYTES     = 1;
const FIXED_BYTES   = KID_BYTES + KEM_CT_BYTES + SALT_BYTES + IV_BYTES + TAG_BYTES;

/** Derive a stable 1-byte kid from an arbitrary key-ID string. */
function kidByte(keyId: string): number {
  return createHash('sha256').update(keyId, 'utf8').digest()[0];
}

function aad(ctx: FieldContext): Buffer {
  return Buffer.from(`${ctx.table}:${ctx.column}`, 'utf8');
}

function loadPublicKey(): Uint8Array {
  return Buffer.from(env.pqPublicKey, 'base64');
}

function loadSecretKey(kid: number): Uint8Array {
  if (kid === kidByte(env.pqKeyId)) {
    return Buffer.from(env.pqSecretKey, 'base64');
  }
  const prevId  = env.pqKeyIdPrevious;
  const prevKey = env.pqSecretKeyPrevious;
  if (prevId !== null && prevKey !== null && kid === kidByte(prevId)) {
    return Buffer.from(prevKey, 'base64');
  }
  throw new Error(`Unknown key ID ${kid}: no matching PQ_SECRET_KEY found.`);
}

export async function encryptField(plaintext: string, ctx: FieldContext): Promise<string> {
  const publicKey = loadPublicKey();
  const { cipherText: kemCT, sharedSecret } = ml_kem768.encapsulate(publicKey);

  const salt = randomBytes(SALT_BYTES);
  const iv   = randomBytes(IV_BYTES);
  const key  = Buffer.from(hkdfSync('sha256', sharedSecret, salt, HKDF_INFO, 32));

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(ctx));
  const ct  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const kid = kidByte(env.pqKeyId);
  const blob = Buffer.alloc(FIXED_BYTES + ct.length);
  let offset = 0;
  blob.writeUInt8(kid, offset); offset += KID_BYTES;
  Buffer.from(kemCT).copy(blob, offset); offset += KEM_CT_BYTES;
  salt.copy(blob, offset); offset += SALT_BYTES;
  iv.copy(blob, offset); offset += IV_BYTES;
  tag.copy(blob, offset); offset += TAG_BYTES;
  ct.copy(blob, offset);

  return PREFIX + blob.toString('base64');
}

export async function decryptField(stored: string, ctx: FieldContext): Promise<string> {
  if (!stored.startsWith(PREFIX)) return stored;

  const blob = Buffer.from(stored.slice(PREFIX.length), 'base64');
  if (blob.length < FIXED_BYTES) throw new Error('Truncated field-encryption blob.');

  let offset = 0;
  const kid   = blob.readUInt8(offset); offset += KID_BYTES;
  const kemCT = blob.subarray(offset, offset + KEM_CT_BYTES); offset += KEM_CT_BYTES;
  const salt  = blob.subarray(offset, offset + SALT_BYTES);  offset += SALT_BYTES;
  const iv    = blob.subarray(offset, offset + IV_BYTES);    offset += IV_BYTES;
  const tag   = blob.subarray(offset, offset + TAG_BYTES);   offset += TAG_BYTES;
  const ct    = blob.subarray(offset);

  const secretKey    = loadSecretKey(kid);
  const sharedSecret = ml_kem768.decapsulate(kemCT, secretKey);
  const key          = Buffer.from(hkdfSync('sha256', sharedSecret, salt, HKDF_INFO, 32));

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(aad(ctx));
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString('utf8');
}
