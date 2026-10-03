import { toBigInt, verify } from './util.js';

// Division by 9 the Vedic way: the quotient digits are running totals of the digits,
// and the last running total is the remainder (which may need one more pass if it reaches 9).
export function divideBy9(nIn) {
  const n = toBigInt(nIn, 'number');
  const digits = n.toString().split('').map(Number);

  const steps = [`Write the digits of ${n}: ${digits.join(', ')}. The first quotient digit is the first digit, and each next one is the previous quotient digit plus the next digit.`];
  const running = [];
  let total = 0;
  digits.forEach((d, i) => {
    total += d;
    running.push(total);
    steps.push(i === 0 ? `Running total after ${d}: ${total}.` : `Running total: ${total - d} + ${d} = ${total}.`);
  });

  // All running totals except the last are quotient digits; the last is the remainder.
  const qDigits = running.slice(0, -1);
  let quotient = qDigits.reduce((acc, d) => acc * 10n + BigInt(d), 0n);
  let remainder = BigInt(running.at(-1));
  if (qDigits.length) steps.push(`Quotient so far (running totals as digits, carrying where a total is above 9): ${quotient}. Remainder so far: ${remainder}.`);

  if (remainder >= 9n) {
    const extra = remainder / 9n;
    steps.push(`The remainder ${remainder} is 9 or more, so divide it by 9 again: ${extra} more for the quotient and ${remainder % 9n} left over.`);
    quotient += extra;
    remainder %= 9n;
  }
  verify(quotient, n / 9n, 'division by 9 (quotient)');
  verify(remainder, n % 9n, 'division by 9 (remainder)');
  steps.push(`So ${n} ÷ 9 = ${quotient} remainder ${remainder}.`);
  return { method: 'division by 9 (running totals)', answer: `${quotient} remainder ${remainder}`, quotient: quotient.toString(), remainder: remainder.toString(), steps };
}
