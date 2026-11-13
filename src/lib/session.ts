import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { User } from '@prisma/client';
import { prisma } from './db';
import { env } from './env';
import { AppError } from './errors';

export const SESSION_COOKIE = 'df_session';
export const LOGIN_COOKIE = 'df_login';
const SESSION_TTL = 60 * 60 * 8; // 8 hours

const mac = (data: string) => createHmac('sha256', env.sessionSecret).update(data).digest('base64url');

/** Signs a small JSON payload with an expiry. Stateless; role is always re-read from the database. */
export function seal(payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  return `${body}.${mac(body)}`;
}

export function unseal<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp: number };
    return data.exp > Date.now() / 1000 ? data : null;
  } catch {
    return null;
  }
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});

export async function startSession(user: User) {
  (await cookies()).set(SESSION_COOKIE, seal({ uid: user.id }, SESSION_TTL), cookieOptions(SESSION_TTL));
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Binds a pending Xaman sign-in to the browser that started it. */
export async function setLoginChallenge(uuid: string) {
  (await cookies()).set(LOGIN_COOKIE, seal({ uuid }, 600), cookieOptions(600));
}

export async function readLoginChallenge(): Promise<string | null> {
  return unseal<{ uuid: string }>((await cookies()).get(LOGIN_COOKIE)?.value)?.uuid ?? null;
}

export async function clearLoginChallenge() {
  (await cookies()).delete(LOGIN_COOKIE);
}

export async function getSessionUser(): Promise<User | null> {
  const session = unseal<{ uid: string }>((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return prisma.user.findUnique({ where: { id: session.uid } });
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  if (!user.active) throw new AppError(401, 'ACCOUNT_DISABLED', 'This account has been deactivated. Contact your administrator.');
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only administrators can do this.');
  return user;
}
