import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

// Load .env.local so the Prisma CLI picks up DIRECT_URL / DATABASE_URL
config({ path: '.env.local' })

// Supabase's certificate chain is not always trusted by Windows' root store.
// This only affects the Prisma CLI process, not the running Next.js app.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DIRECT_URL'),
  },
  migrations: {
    seed: 'ts-node --compiler-options {"module":"CommonJS","moduleResolution":"node"} prisma/seed.ts',
  },
})
