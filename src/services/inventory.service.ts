// Inventory restock orchestrator.
// Scans active items, identifies those below threshold, and executes the appropriate payment channel.
// XRPL_VENDOR  → Privy-signed RLUSD payment directly to the vendor
// EXTERNAL_WEB → Playwright browser automation to place the order

import type { Inventory } from '@prisma/client';
import { audit } from '@/lib/audit';
import { AGENT_WALLET_ID, prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { numberToDecimalString } from '@/lib/money';
import { sendRestockNotification } from './email.service';
import { placeExternalOrder } from './playwright.service';
import { signXrplTransaction } from './privy.service';
import { buildRlusdPayment, confirmRlusdPayment, submitSignedBlob } from './xrpl.service';

const ACTOR = 'inventory-agent';

export type RestockResult = {
  itemId: string;
  itemName: string;
  success: boolean;
  txHash: string | null;
  orderId: string | null;
  screenshotPath: string | null;
  errorMessage: string | null;
};

/** Check all active items and restock any that are below their minimum threshold. */
export async function checkAndRestock(): Promise<RestockResult[]> {
  const items = await prisma.inventory.findMany({
    where: { active: true, restockStatus: 'IDLE' },
  });

  const belowThreshold = items.filter((item) => Number(item.currentStock) < Number(item.minimumThreshold));
  if (belowThreshold.length === 0) return [];

  const wallet = await prisma.agentWallet.findUnique({ where: { id: AGENT_WALLET_ID } });
  const results: RestockResult[] = [];

  for (const item of belowThreshold) {
    const result = await restockItem(item, wallet);
    results.push(result);
  }
  return results;
}

async function restockItem(
  item: Inventory,
  wallet: Awaited<ReturnType<typeof prisma.agentWallet.findUnique>>,
): Promise<RestockResult> {
  const amountRlusd = Number(item.restockQuantity) * Number(item.unitPriceRlusd);

  // Guard: never spend more than the per-item cap
  if (amountRlusd > Number(item.maxSpendLimit)) {
    const msg = `Restock cost ${amountRlusd.toFixed(6)} RLUSD exceeds the item spend limit of ${Number(item.maxSpendLimit).toFixed(6)} RLUSD.`;
    await audit('INVENTORY_RESTOCK_SKIPPED', {
      actor: ACTOR,
      detail: { itemId: item.id, itemName: item.itemName, reason: msg },
    });
    return { itemId: item.id, itemName: item.itemName, success: false, txHash: null, orderId: null, screenshotPath: null, errorMessage: msg };
  }

  // Lock the row to prevent double-restocking
  await prisma.inventory.update({ where: { id: item.id }, data: { restockStatus: 'PENDING_PAYMENT' } });

  try {
    if (item.fulfillmentChannel === 'XRPL_VENDOR') {
      return await processXrplRestock(item, amountRlusd, wallet);
    } else {
      return await processExternalRestock(item, amountRlusd);
    }
  } catch (err) {
    const msg = errorMessage(err);
    await prisma.inventory.update({ where: { id: item.id }, data: { restockStatus: 'MANUAL_REVIEW' } });
    await audit('INVENTORY_RESTOCK_FAILED', { actor: ACTOR, detail: { itemId: item.id, itemName: item.itemName, error: msg } });
    await sendRestockNotification({
      itemName: item.itemName,
      vendorName: item.vendorName,
      quantityOrdered: Number(item.restockQuantity),
      unit: item.unit,
      amountRlusd,
      success: false,
      errorMessage: msg,
    }).catch(() => null);
    return { itemId: item.id, itemName: item.itemName, success: false, txHash: null, orderId: null, screenshotPath: null, errorMessage: msg };
  }
}

async function processXrplRestock(
  item: Inventory,
  amountRlusd: number,
  wallet: Awaited<ReturnType<typeof prisma.agentWallet.findUnique>>,
): Promise<RestockResult> {
  if (!wallet) throw new Error('Agent wallet not set up. Run agent setup from the dashboard first.');
  if (!item.vendorWalletAddress) throw new Error(`Vendor XRPL address is not set for "${item.itemName}".`);

  const amountStr = numberToDecimalString(amountRlusd);
  const invoiceId = `INV-${item.id}-${Date.now()}`;

  const payment = await buildRlusdPayment({
    from: wallet.address,
    to: item.vendorWalletAddress,
    amount: amountStr,
    invoiceId,
  });
  const blob = await signXrplTransaction(wallet, payment);
  const submitted = await submitSignedBlob(blob);

  if (submitted.result !== 'tesSUCCESS') {
    throw new Error(`XRPL payment returned ${submitted.result}`);
  }

  const confirmed = await confirmRlusdPayment(submitted.hash, { to: item.vendorWalletAddress, amount: amountStr });
  if (!confirmed.validated || confirmed.result !== 'tesSUCCESS') {
    throw new Error(`Payment submitted (${submitted.hash}) but not confirmed on ledger: ${confirmed.result ?? 'pending'}`);
  }

  // Record the outgoing ledger entry
  await prisma.ledgerLog.create({
    data: {
      direction: 'OUTGOING',
      amountRlusd: amountRlusd,
      vendorName: item.vendorName,
      itemName: item.itemName,
      txHash: submitted.hash,
    },
  });

  await prisma.inventory.update({
    where: { id: item.id },
    data: {
      restockStatus: 'ORDERED',
      lastRestockAt: new Date(),
      lastRestockTxHash: submitted.hash,
    },
  });

  await audit('INVENTORY_RESTOCK_PAID', {
    actor: ACTOR,
    detail: {
      itemId: item.id,
      itemName: item.itemName,
      amountRlusd,
      txHash: submitted.hash,
      vendor: item.vendorName,
    },
  });

  await sendRestockNotification({
    itemName: item.itemName,
    vendorName: item.vendorName,
    quantityOrdered: Number(item.restockQuantity),
    unit: item.unit,
    amountRlusd,
    txHash: submitted.hash,
    success: true,
  }).catch(() => null);

  return {
    itemId: item.id,
    itemName: item.itemName,
    success: true,
    txHash: submitted.hash,
    orderId: null,
    screenshotPath: null,
    errorMessage: null,
  };
}

async function processExternalRestock(item: Inventory, amountRlusd: number): Promise<RestockResult> {
  if (!item.externalProductUrl) throw new Error(`External product URL is not set for "${item.itemName}".`);

  const result = await placeExternalOrder({
    productUrl: item.externalProductUrl,
    itemName: item.itemName,
    quantity: Number(item.restockQuantity),
    maxSpendRlusd: Number(item.maxSpendLimit),
    rlusdRateZar: 18,
  });

  if (!result.success) {
    throw new Error(result.errorMessage ?? 'External order failed');
  }

  if (result.screenshotPath) {
    await prisma.inventory.update({ where: { id: item.id }, data: { screenshotPath: result.screenshotPath } });
  }

  await prisma.inventory.update({
    where: { id: item.id },
    data: {
      restockStatus: 'ORDERED',
      lastRestockAt: new Date(),
      lastRestockOrderId: result.orderId,
    },
  });

  await audit('INVENTORY_RESTOCK_ORDERED', {
    actor: ACTOR,
    detail: { itemId: item.id, itemName: item.itemName, orderId: result.orderId, amountRlusd },
  });

  await sendRestockNotification({
    itemName: item.itemName,
    vendorName: item.vendorName,
    quantityOrdered: Number(item.restockQuantity),
    unit: item.unit,
    amountRlusd,
    orderId: result.orderId,
    screenshotPath: result.screenshotPath,
    success: true,
  }).catch(() => null);

  return {
    itemId: item.id,
    itemName: item.itemName,
    success: true,
    txHash: null,
    orderId: result.orderId,
    screenshotPath: result.screenshotPath,
    errorMessage: null,
  };
}

/** Mark item stock as received (increases currentStock, resets status to IDLE). */
export async function receiveStock(itemId: string, quantityReceived: number): Promise<void> {
  const item = await prisma.inventory.findUniqueOrThrow({ where: { id: itemId } });
  const newStock = Number(item.currentStock) + quantityReceived;
  await prisma.inventory.update({
    where: { id: itemId },
    data: { currentStock: newStock, restockStatus: 'IDLE' },
  });

  await prisma.ledgerLog.create({
    data: {
      direction: 'INCOMING',
      amountRlusd: quantityReceived * Number(item.unitPriceRlusd),
      vendorName: item.vendorName,
      itemName: item.itemName,
    },
  });

  await audit('INVENTORY_STOCK_RECEIVED', {
    actor: ACTOR,
    detail: { itemId, itemName: item.itemName, quantityReceived, newStock },
  });
}
