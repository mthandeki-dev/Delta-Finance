import { AppError } from './errors';

// Sliding-window rate limiter. In-memory only — resets on restart, good enough for single-instance MVP.
const store = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    throw new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a moment and try again.');
  }
  hits.push(now);
  store.set(key, hits);
}
