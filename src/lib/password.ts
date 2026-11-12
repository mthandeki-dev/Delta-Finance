import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { prisma } from './db';

// Retained solely for verifying existing accounts created by older versions.
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

/**
 * Verify the bcrypt hash stored by the new seed/registration flow.
 * An older scrypt account is upgraded to bcrypt on a successful sign-in.
 */
export async function verifyUserPassword(
  user: Pick<User, 'id' | 'passwordHash' | 'passwordSalt'>,
  submittedPassword: string,
): Promise<boolean> {
  if (!user.passwordHash) return false;

  if (/^\$2[aby]\$\d{2}\$/.test(user.passwordHash)) {
    return bcrypt.compare(submittedPassword, user.passwordHash);
  }

  if (!user.passwordSalt || !verifyPassword(submittedPassword, user.passwordSalt, user.passwordHash)) {
    return false;
  }

  // Upgrade successful legacy sign-in in place; no plaintext is stored.
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(submittedPassword, 12), passwordSalt: null },
  });
  return true;
}
