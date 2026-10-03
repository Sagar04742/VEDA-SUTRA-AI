import { SolverError, toBigInt, verify } from './util.js';

// Antyayor Dashake'pi (sub-sutra: "the last digits add up to ten"):
// when the tens-and-above parts are equal and the last digits add to 10,
//   (10p + x)(10p + y) = p(p + 1) | x*y     (x*y written with two digits)
export function antyayorDashake(aIn, bIn) {
  const a = toBigInt(aIn, 'a');
  const b = toBigInt(bIn, 'b');
  const [p, x] = [a / 10n, a % 10n];
  const [q, y] = [b / 10n, b % 10n];
  if (p !== q || x + y !== 10n) {
    throw new SolverError('This shortcut needs numbers whose last digits add up to 10 and whose other digits are equal (such as 47 x 43)');
  }

  const left = p * (p + 1n);
  const right = x * y;
  const product = left * 100n + right;
  verify(product, a * b, "antyayor dashake'pi multiplication");

  return {
    method: "antyayor-dashake'pi (last digits add to 10)",
    answer: product.toString(),
    steps: [
      `The last digits are ${x} and ${y}, and ${x} + ${y} = 10. The rest of each number is ${p}, the same for both.`,
      `Left part: the common part times one more than itself: ${p} × ${p + 1n} = ${left}.`,
      `Right part: the product of the last digits: ${x} × ${y} = ${right}, written with two digits: ${right.toString().padStart(2, '0')}.`,
      `Join the parts: ${left} | ${right.toString().padStart(2, '0')} = ${product}.`,
    ],
  };
}
