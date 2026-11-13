'use client';

import { useState } from 'react';
import { api } from './api';
import type { InventoryItem } from '@/lib/types';

const STATUS_COLOR: Record<string, string> = {
  IDLE: 'text-df-mute',
  PENDING_PAYMENT: 'text-df-yellow',
  ORDERED: 'text-green-400',
  MANUAL_REVIEW: 'text-orange-400',
};

const STATUS_LABEL: Record<string, string> = {
  IDLE: 'Idle',
  PENDING_PAYMENT: 'Paying…',
  ORDERED: 'Ordered',
  MANUAL_REVIEW: 'Review needed',
};

function StockBar({ current, threshold }: { current: number; threshold: number }) {
  const pct = Math.min(100, (current / (threshold * 1.5)) * 100);
  const low = current < threshold;
  return (
    <div className="mt-1.5 h-1.5 w-full rounded-full bg-df-line overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${low ? 'bg-orange-400' : 'bg-green-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function InventoryPanel({ items: initial, isAdmin, onStockReceived }: { items: InventoryItem[]; isAdmin: boolean; onStockReceived?: () => void }) {
  const [items, setItems] = useState<InventoryItem[]>(initial);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState('');

  const belowThreshold = items.filter((i) => i.currentStock < i.minimumThreshold);

  async function triggerCheck() {
    setChecking(true);
    setCheckMsg(null);
    try {
      const r = await api<{ triggered: number; results: { itemName: string; success: boolean; errorMessage: string | null }[] }>(
        '/api/inventory/check',
        { method: 'POST' },
      );
      if (r.triggered === 0) {
        setCheckMsg('All items are above their minimum threshold — no restocks needed.');
      } else {
        const ok = r.results.filter((x) => x.success).map((x) => x.itemName);
        const fail = r.results.filter((x) => !x.success);
        const parts: string[] = [];
        if (ok.length) parts.push(`Restocked: ${ok.join(', ')}.`);
        if (fail.length) parts.push(`Failed: ${fail.map((x) => `${x.itemName} (${x.errorMessage})`).join(', ')}.`);
        setCheckMsg(parts.join(' '));
      }
      const refreshed = await api<InventoryItem[]>('/api/inventory');
      setItems(refreshed);
    } catch (err) {
      setCheckMsg((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function submitReceive(itemId: string) {
    const qty = Number(receiveQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    try {
      await api(`/api/inventory/${itemId}/receive`, { method: 'POST', body: { quantity: qty } });
      const refreshed = await api<InventoryItem[]>('/api/inventory');
      setItems(refreshed);
      onStockReceived?.();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setReceiving(null);
      setReceiveQty('');
    }
  }

  return (
    <section className="card" aria-labelledby="inv-h">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Inventory</p>
          <h2 id="inv-h" className="card-title">Stock levels</h2>
        </div>
        {isAdmin && (
          <button
            className="btn-primary shrink-0 text-sm py-1.5 px-4"
            onClick={triggerCheck}
            disabled={checking}
          >
            {checking ? 'Checking…' : 'Check & restock'}
          </button>
        )}
      </div>

      {belowThreshold.length > 0 && (
        <div className="mt-4 rounded-lg border border-orange-400/40 bg-orange-400/5 p-3 text-sm text-orange-300">
          <span className="font-semibold">{belowThreshold.length} item{belowThreshold.length > 1 ? 's' : ''} below threshold</span>
          {' — '}
          {belowThreshold.map((i) => i.itemName).join(', ')}
        </div>
      )}

      {checkMsg && (
        <p className="mt-3 text-sm text-neutral-300">{checkMsg}</p>
      )}

      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-df-line p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-white truncate">{item.itemName}</p>
                <p className="text-xs text-df-mute mt-0.5">{item.vendorName} · {item.fulfillmentChannel === 'XRPL_VENDOR' ? 'XRPL' : 'Web order'}</p>
              </div>
              <span className={`text-xs font-medium shrink-0 ${STATUS_COLOR[item.restockStatus]}`}>
                {STATUS_LABEL[item.restockStatus]}
              </span>
            </div>

            <div className="mt-3 flex items-end justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1 text-sm">
                  <span className={`font-semibold ${item.currentStock < item.minimumThreshold ? 'text-orange-400' : 'text-white'}`}>
                    {item.currentStock}
                  </span>
                  <span className="text-df-mute">/ {item.minimumThreshold} {item.unit} min</span>
                </div>
                <StockBar current={item.currentStock} threshold={item.minimumThreshold} />
              </div>

              <div className="text-right text-xs text-df-mute shrink-0">
                <p>{item.restockQuantity} {item.unit} @ {item.unitPriceRlusd} RLUSD</p>
                <p>Max spend: {item.maxSpendLimit} RLUSD</p>
              </div>
            </div>

            {item.lastRestockTxHash && (
              <a
                className="mt-2 inline-block text-xs text-df-yellow underline"
                href={`https://testnet.xrpl.org/transactions/${item.lastRestockTxHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Last restock tx
              </a>
            )}

            {isAdmin && item.restockStatus === 'ORDERED' && (
              receiving === item.id ? (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    className="input w-28 py-1 text-sm"
                    placeholder="Qty received"
                    value={receiveQty}
                    onChange={(e) => setReceiveQty(e.target.value)}
                  />
                  <button className="btn-primary text-xs py-1.5 px-3" onClick={() => submitReceive(item.id)}>Confirm</button>
                  <button className="text-xs text-df-mute hover:text-white" onClick={() => setReceiving(null)}>Cancel</button>
                </div>
              ) : (
                <button
                  className="mt-3 text-xs text-df-yellow hover:underline"
                  onClick={() => { setReceiving(item.id); setReceiveQty(String(item.restockQuantity)); }}
                >
                  Mark stock received
                </button>
              )
            )}
          </div>
        ))}

        {items.length === 0 && (
          <p className="hint text-center py-6">No inventory items yet.{isAdmin ? ' Use the API or seed script to add items.' : ''}</p>
        )}
      </div>
    </section>
  );
}
