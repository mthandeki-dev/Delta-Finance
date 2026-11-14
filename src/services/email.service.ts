import nodemailer from 'nodemailer';
import path from 'path';

// Always notified on every payment and restock event.
const HARDCODED_RECIPIENTS = ['mthandekidev@gmail.com'];

function getTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set.');
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

function getRecipients(): string[] {
  const fromEnv = (process.env.FINANCE_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Merge env-configured addresses with the hardcoded ones, deduplicated.
  return [...new Set([...HARDCODED_RECIPIENTS, ...fromEnv])];
}

/** Converts the raw actor string stored in audit logs into a human-readable label. */
function formatActor(actor: string): string {
  if (actor === 'inventory-agent') return 'Autonomous inventory restock';
  if (actor === 'agent-api')       return 'External API caller';
  const [role, identity] = actor.split(':');
  if (!identity) return actor;
  const roleLabel = role === 'admin' ? 'Administrator' : role === 'viewer' ? 'Viewer' : role;
  return `${roleLabel} — ${identity}`;
}

// ─── Restock notification ─────────────────────────────────────────────────────

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

export async function sendRestockNotification(payload: RestockEmailPayload): Promise<void> {
  const recipients = getRecipients();
  if (recipients.length === 0) return;

  const transport = getTransport();
  const subject = payload.success
    ? `[Delta Finance] Restock complete: ${payload.itemName}`
    : `[Delta Finance] Restock failed: ${payload.itemName}`;

  const statusRow = payload.success
    ? `<tr><td>Status</td><td style="color:#22c55e;font-weight:600;">Completed successfully</td></tr>`
    : `<tr><td>Status</td><td style="color:#ef4444;font-weight:600;">Failed — ${payload.errorMessage ?? 'unknown error'}</td></tr>`;

  const txRow = payload.txHash
    ? `<tr><td>XRPL Tx Hash</td><td><a href="https://testnet.xrpl.org/transactions/${payload.txHash}" style="color:#FFD60A;">${payload.txHash}</a></td></tr>`
    : '';
  const orderRow = payload.orderId
    ? `<tr><td>Order ID</td><td>${payload.orderId}</td></tr>`
    : '';

  const html = buildHtml(`Delta Finance — Inventory Restock`, `
    ${statusRow}
    <tr><td>Item</td><td>${payload.itemName}</td></tr>
    <tr><td>Vendor</td><td>${payload.vendorName}</td></tr>
    <tr><td>Quantity ordered</td><td>${payload.quantityOrdered} ${payload.unit}</td></tr>
    <tr><td>Amount</td><td>${payload.amountRlusd.toFixed(6)} RLUSD</td></tr>
    <tr><td>Triggered by</td><td>Autonomous inventory restock</td></tr>
    ${txRow}
    ${orderRow}
    <tr><td>Timestamp</td><td>${new Date().toUTCString()}</td></tr>
  `);

  const attachments: { filename: string; path: string; cid: string }[] = [];
  if (payload.screenshotPath) {
    attachments.push({ filename: path.basename(payload.screenshotPath), path: payload.screenshotPath, cid: 'screenshot' });
  }

  await transport.sendMail({
    from: `"Delta Finance" <${process.env.GMAIL_USER}>`,
    to: recipients.join(', '),
    subject,
    html,
    attachments,
  });
}

// ─── Payment notification ─────────────────────────────────────────────────────

export type PaymentNotificationPayload = {
  status: 'EXECUTED' | 'PENDING_HITL';
  actorIdentity: string;
  vendorName: string | null;
  vendorAddress: string;
  amountRlusd: number;
  isPayroll: boolean;
  txId: string;
  txHash?: string | null;
  timestamp: string;
};

export async function sendPaymentNotification(payload: PaymentNotificationPayload): Promise<void> {
  const recipients = getRecipients();
  if (recipients.length === 0) return;

  const transport = getTransport();

  const isExecuted = payload.status === 'EXECUTED';
  const subject = isExecuted
    ? `[Delta Finance] Payment executed — ${payload.vendorName ?? payload.vendorAddress}`
    : `[Delta Finance] Payment pending approval — ${payload.vendorName ?? payload.vendorAddress}`;

  const statusCell = isExecuted
    ? `<td style="color:#22c55e;font-weight:600;">Executed on XRPL</td>`
    : `<td style="color:#FFD60A;font-weight:600;">Pending human approval</td>`;

  const vendorCell = payload.vendorName
    ? `${payload.vendorName}<br><span style="color:#8A8A8A;font-size:12px;">${payload.vendorAddress}</span>`
    : payload.vendorAddress;

  const txRow = payload.txHash
    ? `<tr><td>XRPL Tx Hash</td><td><a href="https://testnet.xrpl.org/transactions/${payload.txHash}" style="color:#FFD60A;">${payload.txHash}</a></td></tr>`
    : '';

  const html = buildHtml(`Delta Finance — Payment ${isExecuted ? 'Executed' : 'Pending Approval'}`, `
    <tr><td>Status</td>${statusCell}</tr>
    <tr><td>Vendor paid</td><td>${vendorCell}</td></tr>
    <tr><td>Amount</td><td style="font-weight:600;">${payload.amountRlusd.toFixed(6)} RLUSD</td></tr>
    <tr><td>Payment type</td><td>${payload.isPayroll ? 'Payroll / salary' : 'Supplier payment'}</td></tr>
    <tr><td>Instructed by</td><td>${formatActor(payload.actorIdentity)}</td></tr>
    <tr><td>Route</td><td>${isExecuted ? 'Autonomous — no human approval required' : 'Escalated — waiting for admin approval'}</td></tr>
    ${txRow}
    <tr><td>Transaction ID</td><td style="font-family:monospace;font-size:12px;">${payload.txId}</td></tr>
    <tr><td>Timestamp</td><td>${new Date(payload.timestamp).toUTCString()}</td></tr>
  `);

  await transport.sendMail({
    from: `"Delta Finance" <${process.env.GMAIL_USER}>`,
    to: recipients.join(', '),
    subject,
    html,
  });
}

// ─── Shared HTML shell ────────────────────────────────────────────────────────

function buildHtml(heading: string, tableRows: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; background: #0b0b0b; color: #e5e5e5; margin: 0; padding: 24px; }
  .card { background: #111; border: 1px solid #262626; border-radius: 8px; padding: 24px; max-width: 580px; margin: 0 auto; }
  h2 { color: #FFD60A; margin-top: 0; font-size: 18px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  td { padding: 9px 4px; border-bottom: 1px solid #1f1f1f; font-size: 14px; vertical-align: top; }
  td:first-child { color: #8A8A8A; width: 38%; white-space: nowrap; }
  .footer { margin-top: 20px; font-size: 12px; color: #555; text-align: center; }
</style></head>
<body>
<div class="card">
  <h2>${heading}</h2>
  <table>${tableRows}</table>
</div>
<p class="footer">Delta Finance autonomous treasury agent · XRPL Testnet</p>
</body>
</html>`;
}
