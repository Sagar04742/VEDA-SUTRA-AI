// Shared helpers for the Vedic solver. All maths uses BigInt so large products stay exact.

export class SolverError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SolverError';
  }
}

const MAX_DIGITS = 18;

// Accepts an integer number, bigint, or numeric string ("1,234" is fine). Returns a BigInt.
export function toBigInt(value, name = 'value', { allowNegative = false, allowZero = true } = {}) {
  let s;
  if (typeof value === 'bigint') s = value.toString();
  else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new SolverError(`${name} must be a whole number (pass very large values as text)`);
    s = String(value);
  } else if (typeof value === 'string') s = value.trim().replace(/[,_\s]/g, '');
  else throw new SolverError(`${name} is required`);

  if (!/^-?\d+$/.test(s)) throw new SolverError(`${name} must be a whole number`);
  const n = BigInt(s);
  if (n < 0n && !allowNegative) throw new SolverError(`${name} must not be negative`);
  if (n === 0n && !allowZero) throw new SolverError(`${name} must not be zero`);
  if ((n < 0n ? -n : n).toString().length > MAX_DIGITS) throw new SolverError(`${name} has too many digits (max ${MAX_DIGITS})`);
  return n;
}

export const abs = (n) => (n < 0n ? -n : n);
export const pow10 = (k) => 10n ** BigInt(k);
export const digitCount = (n) => abs(n).toString().length;

// Floor division for a positive divisor (BigInt "/" truncates toward zero).
export function floorDiv(a, b) {
  const q = a / b;
  return a % b !== 0n && a < 0n ? q - 1n : q;
}

// Every result is checked against ordinary arithmetic before it is returned.
export function verify(actual, expected, what) {
  if (actual !== expected) throw new Error(`Internal check failed for ${what}: got ${actual}, expected ${expected}`);
}

// Print negatives in brackets so working reads clearly, e.g. 98 + (-3).
export const br = (n) => (n < 0n ? `(${n})` : `${n}`);

// Pick the power of ten (10^k) closest to all the given numbers.
export function pickBaseExponent(nums) {
  const maxLen = Math.max(...nums.map(digitCount));
  let best = 1;
  let bestCost = null;
  for (let k = 1; k <= maxLen + 1; k++) {
    const base = pow10(k);
    const cost = nums.reduce((s, n) => s + abs(n - base), 0n);
    if (bestCost === null || cost < bestCost) {
      best = k;
      bestCost = cost;
    }
  }
  return best;
}

// Split value = left*base + right so that 0 <= right < base (handles carry and borrow).
export function normalise(left, right, base) {
  const carry = floorDiv(right, base);
  return { left: left + carry, right: right - carry * base, carry };
}
