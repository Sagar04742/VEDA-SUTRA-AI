import { nikhilam } from './nikhilam.js';
import { urdhva } from './urdhva.js';
import { ekanyunena } from './ekanyunena.js';
import { antyayorDashake } from './antyayor.js';
import { toBigInt, abs, pickBaseExponent, pow10, SolverError } from './util.js';

export { nikhilam, urdhva };
export { square } from './squaring.js';
export { ekanyunena } from './ekanyunena.js';
export { antyayorDashake } from './antyayor.js';
export { divideBy9 } from './divide9.js';
export { toVinculum, fromVinculum } from './vinculum.js';
export { digitSum, divisibility, checkProduct, SUPPORTED_DIVISORS } from './checks.js';
export { SolverError } from './util.js';

// Multiply with the best Vedic technique. method = 'auto' picks: Nikhilam when both numbers are near a
// power of ten, Antyayor Dashake'pi when the last digits add to 10 and the rest match, Ekanyunena when one
// number is all 9s, otherwise Urdhva-Tiryagbhyam (works for any numbers). Signs are handled here.
export function multiply(aIn, bIn, method = 'auto') {
  const a = toBigInt(aIn, 'a', { allowNegative: true });
  const b = toBigInt(bIn, 'b', { allowNegative: true });
  const negative = (a < 0n) !== (b < 0n) && a !== 0n && b !== 0n;
  const x = abs(a);
  const y = abs(b);

  const zero = x === 0n || y === 0n; // the shortcuts below need positive numbers
  const nines = (n) => /^9+$/.test(n.toString());
  const tens = x !== 0n && y !== 0n && x / 10n === y / 10n && (x % 10n) + (y % 10n) === 10n;

  let chosen = method;
  if (method === 'auto') {
    chosen = 'urdhva';
    if (!zero) {
      const base = pow10(pickBaseExponent([x, y]));
      if (abs(x - base) * 5n <= base && abs(y - base) * 5n <= base) chosen = 'nikhilam';
      else if (tens) chosen = 'antyayor';
      else if (nines(x) || nines(y)) chosen = 'ekanyunena';
    }
  }
  if (zero) chosen = 'urdhva';

  const run = { nikhilam: () => nikhilam(x, y), antyayor: () => antyayorDashake(x, y), ekanyunena: () => ekanyunena(x, y), urdhva: () => urdhva(x, y) };
  if (!run[chosen]) throw new SolverError(`Unknown method "${method}"`);
  const result = run[chosen]();
  if (negative) {
    result.steps.push(`One number is negative and the other positive, so the product is negative: -${result.answer}.`);
    result.answer = `-${result.answer}`;
  } else if (a < 0n && b < 0n) {
    result.steps.push('Both numbers are negative, so the product is positive.');
  }
  return result;
}
