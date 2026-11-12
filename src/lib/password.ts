import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const derived = Buffer.from(scryptSync(password, salt, 64).toString('hex'));
  const stored = Buffer.from(storedHash);
  return derived.length === stored.length && timingSafeEqual(derived, stored);
}
