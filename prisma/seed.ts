import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { config } from 'dotenv';

config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

/**
 * Bootstrap the demo Administrator. The documented demo password is "robotman".
 * For any deployed environment, explicitly provide ADMIN_SEED_PASSWORD as an
 * environment variable. No plaintext password is ever written to PostgreSQL.
 *
 * Do not reset an existing administrator's password on subsequent seed runs.
 */
async function main(): Promise<void> {
  const password = process.env.ADMIN_SEED_PASSWORD ?? (process.env.NODE_ENV === 'production' ? undefined : 'robotman');
  if (!password) {
    throw new Error('Set ADMIN_SEED_PASSWORD before seeding a production database.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      role: Role.ADMIN,
      active: true,
    },
    create: {
      username: 'admin',
      fullName: 'Delta Finance Administrator',
      email: 'admin',
      passwordHash,
      passwordSalt: null,
      role: Role.ADMIN,
      active: true,
      requirePasswordChange: false,
    },
  });

  console.log(`Administrator account ready: ${admin.id} (role: ${admin.role})`);
}

main()
  .catch((error: unknown) => {
    console.error('Administrator seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
