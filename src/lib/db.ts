import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const POLICY_ID = 'default';
export const AGENT_WALLET_ID = 'agent';

/** The treasury mandate always exists; create the conservative default on first use. */
export function ensurePolicy() {
  return prisma.treasuryPolicy.upsert({ where: { id: POLICY_ID }, update: {}, create: { id: POLICY_ID } });
}
