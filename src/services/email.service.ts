import nodemailer from 'nodemailer';
import path from 'path';

export type RestockEmailPayload = {
  itemName: string;
  vendorName: string;
  quantityOrdered: number;
  unit: string;
  amountRlusd: number;
  txHash?: string | null;
  orderId?: string | null;
  screenshotPath?: string | null;
  success: boolean;
  errorMessage?: string | null;
};

function getTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set.');
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

function getRecipients(): string[] {
  const raw = process.env.FINANCE_ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function sendRestockNotification(payload: RestockEmailPayload): Promise<void> {
  const recipients = getRecipients();
  if (recipients.length === 0) return; // no-op if not configured

  const transport = getTransport();
  const subject = payload.success
    ? `[Delta Finance] Restock complete: ${payload.itemName}`
    : `[Delta Finance] Restock failed: ${payload.itemName}`;

  const statusRow = payload.success
    ? `<tr><td style="color:#22c55e;font-weight:600;">Status</td><td>Completed successfully</td></tr>`
    : `<tr><td style="color:#ef4444;font-weight:600;">Status</td><td>Failed — ${payload.errorMessage ?? 'unknown error'}</td></tr>`;

  const txRow = payload.txHash
    ? `<tr><td>XRPL Tx Hash</td><td><a href="https://testnet.xrpl.org/transactions/${payload.txHash}">${payload.txHash}</a></td></tr>`
    : '';
  const orderRow = payload.orderId
    ? `<tr><td>Order ID</td><td>${payload.orderId}</td></tr>`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; background: #0b0b0b; color: #e5e5e5; margin: 0; padding: 24px; }
  .card { background: #111; border: 1px solid #262626; border-radius: 8px; padding: 24px; max-width: 560px; margin: 0 auto; }
  h2 { color: #FFD60A; margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  td { padding: 8px 4px; border-bottom: 1px solid #262626; font-size: 14px; }
  td:first-child { color: #8A8A8A; width: 40%; }
  .footer { margin-top: 20px; font-size: 12px; color: #8A8A8A; text-align: center; }
</style></head>
<body>
<div class="card">
  <h2>Delta Finance — Restock Notification</h2>
  <table>
    ${statusRow}
    <tr><td>Item</td><td>${payload.itemName}</td></tr>
    <tr><td>Vendor</td><td>${payload.vendorName}</td></tr>
    <tr><td>Quantity</td><td>${payload.quantityOrdered} ${payload.unit}</td></tr>
    <tr><td>Amount</td><td>${payload.amountRlusd.toFixed(6)} RLUSD</td></tr>
    ${txRow}
    ${orderRow}
  </table>
</div>
<p class="footer">Delta Finance autonomous treasury agent</p>
</body>
</html>`;

  const attachments: { filename: string; path: string; cid: string }[] = [];
  if (payload.screenshotPath) {
    attachments.push({
      filename: path.basename(payload.screenshotPath),
      path: payload.screenshotPath,
      cid: 'screenshot',
    });
  }

  await transport.sendMail({
    from: `"Delta Finance" <${process.env.GMAIL_USER}>`,
    to: recipients.join(', '),
    subject,
    html,
    attachments,
  });
}
