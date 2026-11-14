/**
 * Generate a fresh ML-KEM-768 key pair for field-level encryption.
 *
 * Usage:
 *   npx tsx scripts/generate-pq-keys.ts
 *
 * Copy the printed values into your .env.local (local dev) or your hosting
 * platform's secret store (production).  Never commit real keys to the repo.
 *
 * PQ_KEY_ID can be any non-empty string — use something memorable like "v1",
 * "v2", "2025-01".  Increment it each time you rotate keys.
 */

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js'

const { publicKey, secretKey } = ml_kem768.keygen()

// Suggest a simple date-based key ID (easy to understand rotation history).
const keyId = `v${new Date().toISOString().slice(0, 7).replace('-', '.')}`

console.log('# ── Add these to .env.local / hosting secrets ───────────────────────────')
console.log(`PQ_PUBLIC_KEY="${Buffer.from(publicKey).toString('base64')}"`)
console.log(`PQ_SECRET_KEY="${Buffer.from(secretKey).toString('base64')}"`)
console.log(`PQ_KEY_ID="${keyId}"`)
console.log()
console.log('# ── When rotating: move the current key/ID here before generating a new one ─')
console.log('# PQ_SECRET_KEY_PREVIOUS=""')
console.log('# PQ_KEY_ID_PREVIOUS=""')
console.log()
console.log('Public key size :', publicKey.length, 'bytes')
console.log('Secret key size :', secretKey.length, 'bytes')
console.log('Key ID          :', keyId, '  (any non-empty string is valid)')
