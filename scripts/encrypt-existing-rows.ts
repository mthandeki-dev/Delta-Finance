/**
 * Encrypt plaintext values that were written before field-level encryption was
 * enabled.  Safe to re-run: rows whose value already starts with "pq1:" are skipped.
 *
 * Prerequisites:
 *   PQ_PUBLIC_KEY, PQ_SECRET_KEY and PQ_KEY_ID must be set in the environment.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/encrypt-existing-rows.ts
 *
 * If your keys are in a different file, replace .env.local with that path.
 * The --env-file flag loads the file before any module code runs, so the PQ
 * keys are available when the encryption functions initialise.
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { encryptField } from '../src/lib/crypto/field-encryption'

const pool    = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const adapter = new PrismaPg(pool)
const db      = new PrismaClient({ adapter })

const BATCH = 100

async function encryptColumn<T extends { id: string }>(
  label: string,
  fetchPage: (cursor: string | undefined) => Promise<T[]>,
  getField: (row: T) => string | null | undefined,
  updateRow: (id: string, encrypted: string) => Promise<void>,
  ctx: { table: string; column: string },
) {
  let cursor: string | undefined
  let total = 0
  let skipped = 0

  for (;;) {
    const rows = await fetchPage(cursor)
    if (!rows.length) break

    for (const row of rows) {
      const val = getField(row)
      if (!val || val.startsWith('pq1:')) { skipped++; continue }
      const encrypted = await encryptField(val, ctx)
      await updateRow(row.id, encrypted)
      total++
    }

    cursor = rows[rows.length - 1].id
  }

  console.log(`${label}: encrypted ${total}, skipped ${skipped}`)
}

async function main() {
  console.log('Starting row encryption…\n')

  await encryptColumn(
    'TransactionLog.prompt',
    (c) => db.transactionLog.findMany({ take: BATCH, skip: c ? 1 : 0, cursor: c ? { id: c } : undefined, orderBy: { id: 'asc' }, select: { id: true, prompt: true } }),
    (r) => r.prompt,
    (id, v) => db.transactionLog.update({ where: { id }, data: { prompt: v } }).then(() => undefined),
    { table: 'TransactionLog', column: 'prompt' },
  )

  await encryptColumn(
    'TransactionLog.reason',
    (c) => db.transactionLog.findMany({ take: BATCH, skip: c ? 1 : 0, cursor: c ? { id: c } : undefined, orderBy: { id: 'asc' }, select: { id: true, reason: true } }),
    (r) => r.reason,
    (id, v) => db.transactionLog.update({ where: { id }, data: { reason: v } }).then(() => undefined),
    { table: 'TransactionLog', column: 'reason' },
  )

  await encryptColumn(
    'TransactionLog.intentJson',
    (c) => db.transactionLog.findMany({ take: BATCH, skip: c ? 1 : 0, cursor: c ? { id: c } : undefined, orderBy: { id: 'asc' }, select: { id: true, intentJson: true } }),
    (r) => r.intentJson,
    (id, v) => db.transactionLog.update({ where: { id }, data: { intentJson: v } }).then(() => undefined),
    { table: 'TransactionLog', column: 'intentJson' },
  )

  await encryptColumn(
    'AuditLog.detail',
    (c) => db.auditLog.findMany({ take: BATCH, skip: c ? 1 : 0, cursor: c ? { id: c } : undefined, orderBy: { id: 'asc' }, select: { id: true, detail: true } }),
    (r) => r.detail,
    (id, v) => db.auditLog.update({ where: { id }, data: { detail: v } }).then(() => undefined),
    { table: 'AuditLog', column: 'detail' },
  )

  await encryptColumn(
    'User.xamanUserToken',
    (c) => db.user.findMany({ take: BATCH, skip: c ? 1 : 0, cursor: c ? { id: c } : undefined, orderBy: { id: 'asc' }, select: { id: true, xamanUserToken: true } }),
    (r) => r.xamanUserToken,
    (id, v) => db.user.update({ where: { id }, data: { xamanUserToken: v } }).then(() => undefined),
    { table: 'User', column: 'xamanUserToken' },
  )

  await encryptColumn(
    'Vendor.label',
    (c) => db.vendor.findMany({ take: BATCH, skip: c ? 1 : 0, cursor: c ? { id: c } : undefined, orderBy: { id: 'asc' }, select: { id: true, label: true } }),
    (r) => r.label,
    (id, v) => db.vendor.update({ where: { id }, data: { label: v } }).then(() => undefined),
    { table: 'Vendor', column: 'label' },
  )

  console.log('\nDone.')
  await db.$disconnect()
  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
