import { abs, br, normalise, pickBaseExponent, pow10, toBigInt, verify } from './util.js';

// Nikhilam Navatashcaramam Dashatah ("all from 9 and the last from 10"):
// multiply numbers near a power of ten using their deviations from that base.
//   A x B = (A + y) | (x * y)   where x = A - base, y = B - base
export function nikhilam(aIn, bIn) {
  const a = toBigInt(aIn, 'a', { allowZero: false });
  const b = toBigInt(bIn, 'b', { allowZero: false });

  const k = pickBaseExponent([a, b]);
  const base = pow10(k);
  const x = a - base;
  const y = b - base;
  const nearBase = abs(x) * 5n <= base && abs(y) * 5n <= base;

  const cross = a + y; // same as b + x
  const rawRight = x * y;
  const { left, right, carry } = normalise(cross, rawRight, base);
  const product = left * base + right;
  verify(product, a * b, 'nikhilam multiplication');

  const word = (d) => (d < 0n ? 'deficiency' : d > 0n ? 'excess' : 'no deviation');
  const steps = [
    `Choose the base ${base} (10^${k}), the power of ten closest to both numbers.${nearBase ? '' : ' (The numbers are not very close to it, so this shortcut is less convenient, but it still works.)'}`,
    `Deviations from the base: ${a} - ${base} = ${x} (${word(x)}), and ${b} - ${base} = ${y} (${word(y)}).`,
    `Left part, cross-add: ${a} + ${br(y)} = ${cross} (same as ${b} + ${br(x)}).`,
    `Right part, multiply the deviations: ${br(x)} × ${br(y)} = ${rawRight}.`,
  ];
  if (carry !== 0n) {
    steps.push(
      `The right part must have exactly ${k} digit(s), so ${carry > 0n ? 'carry' : 'borrow'} ${abs(carry)} from/to the left: left = ${cross} + ${br(carry)} = ${left}, right = ${right.toString().padStart(k, '0')}.`
    );
  }
  steps.push(`Join the parts: ${left} | ${right.toString().padStart(k, '0')} = ${product}.`);

  return { method: 'nikhilam', answer: product.toString(), steps, base: base.toString(), nearBase };
}
