'use client';

/** Client-side fetch helper. Throws an Error carrying the server's human-readable message. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown; okStatuses?: number[] }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !init?.okStatuses?.includes(res.status)) {
    if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/';
    throw new Error(data?.error?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

export const money = (v: string | number | null | undefined) => (v === null || v === undefined ? '—' : nf.format(Number(v)));

/** Indicative local-currency equivalent, e.g. "≈ ZAR 1,820.00". Display only. */
export function localEquivalent(v: string | number | null | undefined, fx: { code: string; rate: number } | null): string | null {
  if (!fx || v === null || v === undefined) return null;
  const n = Number(v) * fx.rate;
  if (!Number.isFinite(n)) return null;
  return `≈ ${fx.code} ${new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

export const shortAddress = (a: string | null | undefined) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');

export const timeAgo = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Paying…',
  PENDING_HITL: 'Needs approval',
  AWAITING_SIGNATURE: 'Waiting for signature',
  EXECUTED: 'Paid',
  BLOCKED: 'Blocked',
  REJECTED: 'Declined',
  FAILED: 'Failed',
};

export const LAYER_LABEL: Record<string, string> = {
  INTENT_VALIDATION: 'Instruction check',
  APP_POLICY: 'Treasury policy',
  BACKEND_VERIFICATION: 'Verification gate',
  X402_GATEWAY: 'Settlement gateway',
  PRIVY_POLICY: 'Privy wallet policy',
  T54_FACILITATOR: 't54 facilitator',
};
