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

  // ── Inventory seed ────────────────────────────────────────────────────────
  // Both items start below their minimum threshold so the restock agent fires immediately in demo mode.

  const coal = await prisma.inventory.upsert({
    where: { id: 'seed-coal' },
    update: { currentStock: 105, restockQuantity: 5 },
    create: {
      id: 'seed-coal',
      itemName: 'Coal',
      unit: 'kg',
      currentStock: 105,        // above threshold of 100
      minimumThreshold: 100,
      restockQuantity: 5,
      unitPriceRlusd: 0.5,
      fulfillmentChannel: 'XRPL_VENDOR',
      vendorName: 'Mthandeki Ndlambuzi',
      vendorWalletAddress: null, // set once the vendor's XRPL address is known
      maxSpendLimit: 15,         // 5 kg × 0.5 = 2.5 RLUSD, well under 15
    },
  });
  console.log(`Inventory: ${coal.itemName} (stock=${coal.currentStock}/${coal.minimumThreshold})`);

  const water = await prisma.inventory.upsert({
    where: { id: 'seed-water' },
    update: { currentStock: 69, restockQuantity: 5 },
    create: {
      id: 'seed-water',
      itemName: 'Bottled Water',
      unit: 'bottle',
      currentStock: 69,          // above threshold of 60
      minimumThreshold: 60,
      restockQuantity: 5,
      unitPriceRlusd: 0.15,
      fulfillmentChannel: 'XRPL_VENDOR',
      vendorName: 'Lemogang Nthlaide',
      vendorWalletAddress: null,
      maxSpendLimit: 5,          // 5 × 0.15 = 0.75 RLUSD, well under 5
    },
  });
  console.log(`Inventory: ${water.itemName} (stock=${water.currentStock}/${water.minimumThreshold})`);

  // ── Sample LedgerLog entries for Analytics charts ─────────────────────────
  const existingLogs = await prisma.ledgerLog.count();
  if (existingLogs === 0) {
    const now = new Date();
    const monthAgo = (n: number) => { const d = new Date(now); d.setMonth(d.getMonth() - n); return d; };

    await prisma.ledgerLog.createMany({
      data: [
        { direction: 'OUTGOING', amountRlusd: 10, vendorName: 'Mthandeki Ndlambuzi', itemName: 'Coal', createdAt: monthAgo(5) },
        { direction: 'OUTGOING', amountRlusd: 3, vendorName: 'Lemogang Nthlaide', itemName: 'Bottled Water', createdAt: monthAgo(5) },
        { direction: 'INCOMING', amountRlusd: 500, createdAt: monthAgo(4) },
        { direction: 'OUTGOING', amountRlusd: 10, vendorName: 'Mthandeki Ndlambuzi', itemName: 'Coal', createdAt: monthAgo(4) },
        { direction: 'OUTGOING', amountRlusd: 3, vendorName: 'Lemogang Nthlaide', itemName: 'Bottled Water', createdAt: monthAgo(3) },
        { direction: 'OUTGOING', amountRlusd: 10, vendorName: 'Mthandeki Ndlambuzi', itemName: 'Coal', createdAt: monthAgo(3) },
        { direction: 'INCOMING', amountRlusd: 300, createdAt: monthAgo(2) },
        { direction: 'OUTGOING', amountRlusd: 3, vendorName: 'Lemogang Nthlaide', itemName: 'Bottled Water', createdAt: monthAgo(2) },
        { direction: 'OUTGOING', amountRlusd: 10, vendorName: 'Mthandeki Ndlambuzi', itemName: 'Coal', createdAt: monthAgo(1) },
        { direction: 'OUTGOING', amountRlusd: 3, vendorName: 'Lemogang Nthlaide', itemName: 'Bottled Water', createdAt: monthAgo(1) },
      ],
    });
    console.log('LedgerLog: sample analytics data seeded');
  }
}

main()
  .catch((error: unknown) => {
    console.error('Administrator seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
