import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

// Human-friendly alphabet: no 0/O/1/I/L
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const pick = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

const hash = (secret: string, salt: string) => scryptSync(secret, salt, 32).toString('hex');

/** Generates `DF-<prefix>-<secret>`. Only prefix, salt and hash are stored; the full code is shown once. */
export function generateSecretCode() {
  const prefix = pick(6);
  const secret = `${pick(5)}-${pick(5)}-${pick(5)}`;
  const salt = randomBytes(16).toString('hex');
  return { display: `DF-${prefix}-${secret}`, prefix, salt, codeHash: hash(secret, salt) };
}

export function parseSecretCode(input: string): { prefix: string; secret: string } | null {
  const m = /^DF-([A-Z2-9]{6})-([A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5})$/.exec(input.trim().toUpperCase());
  return m ? { prefix: m[1], secret: m[2] } : null;
}

export function verifySecret(secret: string, salt: string, codeHash: string): boolean {
  const a = Buffer.from(hash(secret, salt), 'hex');
  const b = Buffer.from(codeHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
