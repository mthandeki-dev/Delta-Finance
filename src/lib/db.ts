import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { decryptField, encryptField } from './crypto/field-encryption'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// ── Encrypted field registry ──────────────────────────────────────────────────
// Keys are Prisma model names exactly as they appear in schema.prisma (PascalCase).
const ENCRYPTED: Record<string, string[]> = {
  TransactionLog: ['prompt', 'reason', 'intentJson'],
  AuditLog: ['detail'],
  User: ['xamanUserToken'],
  Vendor: ['label'],
}

// Relations whose target models also contain encrypted fields.
// Used to recursively decrypt nested include results.
const RELATIONS: Record<string, Record<string, string>> = {
  AuditLog: { tx: 'TransactionLog' },
  TransactionLog: { approvedBy: 'User', auditLogs: 'AuditLog' },
}

async function encryptDataFields(model: string, data: Record<string, unknown>) {
  const fields = ENCRYPTED[model]
  if (!fields) return
  for (const field of fields) {
    const val = data[field]
    if (val == null) continue
    if (typeof val === 'string') {
      data[field] = await encryptField(val, { table: model, column: field })
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      // Prisma UpdateInput wraps scalars in { set: value }
      const obj = val as Record<string, unknown>
      if (typeof obj.set === 'string') {
        obj.set = await encryptField(obj.set, { table: model, column: field })
      }
    }
  }
}

async function decryptResultFields(model: string, row: Record<string, unknown>) {
  const fields = ENCRYPTED[model]
  if (fields) {
    for (const field of fields) {
      const val = row[field]
      if (typeof val === 'string') {
        row[field] = await decryptField(val, { table: model, column: field })
      }
    }
  }
  const rels = RELATIONS[model]
  if (rels) {
    for (const [key, relModel] of Object.entries(rels)) {
      const rel = row[key]
      if (Array.isArray(rel)) {
        for (const item of rel) {
          if (item && typeof item === 'object') {
            await decryptResultFields(relModel, item as Record<string, unknown>)
          }
        }
      } else if (rel && typeof rel === 'object') {
        await decryptResultFields(relModel, rel as Record<string, unknown>)
      }
    }
  }
}

const WRITE_OPS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert'])
const READ_OPS  = new Set(['findUnique', 'findFirst', 'findMany', 'findUniqueOrThrow', 'findFirstOrThrow'])

function createPrismaClient(): PrismaClient {
  const pool    = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  const adapter = new PrismaPg(pool)
  const base    = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (model && WRITE_OPS.has(operation) && ENCRYPTED[model]) {
            const a = args as Record<string, unknown>

            if (operation === 'upsert') {
              if (a.create && typeof a.create === 'object')
                await encryptDataFields(model, a.create as Record<string, unknown>)
              if (a.update && typeof a.update === 'object')
                await encryptDataFields(model, a.update as Record<string, unknown>)
            } else if (operation === 'createMany') {
              const d = a.data
              if (Array.isArray(d)) {
                for (const item of d)
                  if (item && typeof item === 'object')
                    await encryptDataFields(model, item as Record<string, unknown>)
              } else if (d && typeof d === 'object') {
                await encryptDataFields(model, d as Record<string, unknown>)
              }
            } else {
              if (a.data && typeof a.data === 'object')
                await encryptDataFields(model, a.data as Record<string, unknown>)
            }
          }

          const result = await query(args)

          if (model && READ_OPS.has(operation)) {
            if (Array.isArray(result)) {
              for (const item of result)
                if (item && typeof item === 'object')
                  await decryptResultFields(model, item as Record<string, unknown>)
            } else if (result && typeof result === 'object') {
              await decryptResultFields(model, result as Record<string, unknown>)
            }
          }

          return result
        },
      },
    },
  }) as unknown as PrismaClient
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export const POLICY_ID = 'default'
export const AGENT_WALLET_ID = 'agent'

/** The treasury mandate always exists; create the conservative default on first use. */
export function ensurePolicy() {
  return prisma.treasuryPolicy.upsert({ where: { id: POLICY_ID }, update: {}, create: { id: POLICY_ID } })
}
