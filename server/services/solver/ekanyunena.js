import { SolverError, normalise, pow10, toBigInt, verify } from './util.js';

// Ekanyunena Purvena ("by one less than the previous one"): multiply by 9, 99, 999...
//   n x (10^k - 1) = (n - 1) | (10^k - n)
// Either argument may be the all-nines number.
export function ekanyunena(aIn, bIn) {
  const a = toBigInt(aIn, 'a', { allowZero: false });
  const b = toBigInt(bIn, 'b', { allowZero: false });
  const isNines = (n) => /^9+$/.test(n.toString());
  let nines, n;
  if (isNines(b)) [n, nines] = [a, b];
  else if (isNines(a)) [n, nines] = [b, a];
  else throw new SolverError('One of the numbers must be made only of 9s (9, 99, 999, ...)');

  const k = nines.toString().length;
  const base = pow10(k);
  const rawRight = base - n; // the complement of n
  const { left, right, carry } = normalise(n - 1n, rawRight, base);
  const product = left * base + right;
  verify(product, a * b, 'ekanyunena multiplication');

  const steps = [
    `${nines} is made of ${k} nine${k > 1 ? 's' : ''}, so work with the base ${base}.`,
    `Left part, one less than ${n}: ${n} - 1 = ${n - 1n}.`,
    `Right part, the complement of ${n} from ${base}: ${base} - ${n} = ${rawRight}${rawRight < 0n ? ' (negative, so borrow)' : ''}.`,
  ];
  if (carry !== 0n) steps.push(`The right part must have exactly ${k} digit(s), so ${carry > 0n ? 'carry' : 'borrow'} ${carry < 0n ? -carry : carry}: left = ${left}, right = ${right.toString().padStart(k, '0')}.`);
  steps.push(`Join the parts: ${left} | ${right.toString().padStart(k, '0')} = ${product}.`);
  return { method: 'ekanyunena-purvena (multiplying by 9s)', answer: product.toString(), steps };
}
