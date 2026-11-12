// Exact decimal arithmetic for RLUSD amounts (6 decimal places) using bigint micro-units.
// Pure module: no framework or network dependencies.

const SCALE = 6;
const UNIT = 1_000_000n;
export const MAX_AMOUNT = 1_000_000_000; // sanity ceiling for a single instruction

/** Converts a decimal string or number to micro-units. Throws on anything that is not a plain non-negative decimal. */
export function toMicro(value: string | number): bigint {
  const s = typeof value === 'number' ? numberToDecimalString(value) : value.trim();
  if (!/^\d{1,15}(\.\d{1,6})?$/.test(s)) throw new Error(`Invalid amount: ${String(value)}`);
  const [int, frac = ''] = s.split('.');
  return BigInt(int) * UNIT + BigInt(frac.padEnd(SCALE, '0'));
}

export function fromMicro(micro: bigint): string {
  const int = micro / UNIT;
  const frac = (micro % UNIT).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : `${int}`;
}

/** Number → canonical decimal string with at most 6 decimals (no exponent notation). */
export function numberToDecimalString(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) throw new Error(`Invalid amount: ${n}`);
  const fixed = n.toFixed(SCALE);
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

/** True when the number has more than 6 decimal places of real precision. */
export function hasExcessPrecision(n: number): boolean {
  return Math.abs(n * 1e6 - Math.round(n * 1e6)) > 1e-6;
}
