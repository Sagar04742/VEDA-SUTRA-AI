import { nikhilam } from './nikhilam.js';
import { urdhva } from './urdhva.js';
import { toBigInt, abs, pickBaseExponent, pow10 } from './util.js';

export { nikhilam, urdhva };
export { square } from './squaring.js';
export { toVinculum, fromVinculum } from './vinculum.js';
export { digitSum, divisibility, checkProduct, SUPPORTED_DIVISORS } from './checks.js';
export { SolverError } from './util.js';

// Multiply with the best Vedic technique: Nikhilam when both numbers are near a power of ten,
// otherwise Urdhva-Tiryagbhyam (which works for any numbers). Signs are handled here.
export function multiply(aIn, bIn, method = 'auto') {
  const a = toBigInt(aIn, 'a', { allowNegative: true });
  const b = toBigInt(bIn, 'b', { allowNegative: true });
  const negative = (a < 0n) !== (b < 0n) && a !== 0n && b !== 0n;
  const x = abs(a);
  const y = abs(b);

  let useNikhilam = method === 'nikhilam';
  if (method === 'auto' && x !== 0n && y !== 0n) {
    const base = pow10(pickBaseExponent([x, y]));
    useNikhilam = abs(x - base) * 5n <= base && abs(y - base) * 5n <= base;
  }
  if (x === 0n || y === 0n) useNikhilam = false; // nikhilam needs positive numbers

  const result = useNikhilam ? nikhilam(x, y) : urdhva(x, y);
  if (negative) {
    result.steps.push(`One number is negative and the other positive, so the product is negative: -${result.answer}.`);
    result.answer = `-${result.answer}`;
  } else if (a < 0n && b < 0n) {
    result.steps.push('Both numbers are negative, so the product is positive.');
  }
  return result;
}
