import { SolverError, toBigInt, verify } from './util.js';

const BAR = '̄'; // combining overline, renders as a bar over the digit

// Show a digit list such as [1,-3,2] as "1 3̄ 2".
const show = (digits) => digits.map((d) => (d < 0 ? `${-d}${BAR}` : `${d}`)).join(' ');

// Vinculum: rewrite digits above 5 as (10 - digit) with a bar and add 1 to the digit on the left.
// Example: 68 -> 8 becomes 2̄ (carry 1) -> 6+1 = 7 becomes 3̄ (carry 1) -> 1 3̄ 2̄, i.e. 100 - 30 - 2 = 68.
export function toVinculum(nIn) {
  const n = toBigInt(nIn, 'number', { allowZero: false });
  const src = n.toString().split('').reverse().map(Number); // units first
  const out = [];
  const steps = [`Work from the right. A digit above 5 becomes (10 - digit) with a bar, and 1 is added to the digit on its left.`];

  let carry = 0;
  src.forEach((digit, i) => {
    const d = digit + carry;
    const place = 10 ** i;
    if (d > 5) {
      const v = d - 10; // 6..10 -> -4..0
      steps.push(
        `${carry ? `${digit} + carry 1 = ${d}` : `${d}`} is above 5: write ${v === 0 ? '0' : `${-v}${BAR}`} (that is 10 - ${d}) and carry 1 to the next place (place value ${place}).`
      );
      out.push(v);
      carry = 1;
    } else {
      steps.push(`${carry ? `${digit} + carry 1 = ${d}` : `${d}`} is 5 or less: keep ${d}.`);
      out.push(d);
      carry = 0;
    }
  });
  if (carry) {
    steps.push('A final carry of 1 becomes a new leading digit 1.');
    out.push(1);
  }

  const digits = out.reverse();
  const check = digits.reduce((acc, d) => acc * 10n + BigInt(d), 0n);
  verify(check, n, 'vinculum conversion');
  const unchanged = digits.every((d) => d >= 0) && digits.join('') === n.toString();
  steps.push(unchanged ? `No digit above 5, so ${n} is already in its simplest form.` : `Result: ${n} = ${show(digits)} (check: ${digits.map((d, i) => `${d}×10^${digits.length - 1 - i}`).join(' + ')} = ${n}).`);
  return { method: 'vinculum', answer: show(digits).replace(/ /g, ''), digits, steps };
}

// Reverse: turn a digit list that may contain negative (barred) digits into an ordinary number.
export function fromVinculum(digitsIn) {
  if (!Array.isArray(digitsIn) || digitsIn.length === 0 || digitsIn.length > 18) throw new SolverError('digits must be a list of 1 to 18 integers');
  const digits = digitsIn.map((d) => Number(d));
  if (digits.some((d) => !Number.isInteger(d) || d < -9 || d > 9)) throw new SolverError('each digit must be an integer from -9 to 9 (use a negative number for a barred digit)');

  let value = 0n;
  const parts = [];
  digits.forEach((d, i) => {
    const power = digits.length - 1 - i;
    value += BigInt(d) * 10n ** BigInt(power);
    parts.push(`${d}×10^${power}`);
  });
  const steps = [
    `Read ${show(digits)} with negative (barred) digits subtracting.`,
    `Value: ${parts.join(' + ')} = ${value}.`,
  ];
  return { method: 'vinculum (to ordinary number)', answer: value.toString(), steps };
}
