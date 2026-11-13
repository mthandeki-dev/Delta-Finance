import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

// Load .env.local so the Prisma CLI picks up DIRECT_URL / DATABASE_URL
config({ path: '.env.local' })

// Supabase's certificate chain is not always trusted by Windows' root store.
// This only affects the Prisma CLI process, not the running Next.js app.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // `prisma generate` (run on install and at build time) does not need a database
  // connection, so don't use prisma's strict `env()` helper here: it throws when the
  // variable is missing, which breaks `npm install` on CI/Netlify. Commands that do
  // connect (migrate, db push, seed) still need DIRECT_URL or DATABASE_URL set.
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
  migrations: {
    seed: 'ts-node --compiler-options {"module":"CommonJS","moduleResolution":"node"} prisma/seed.ts',
  },
})
