import { toBigInt, verify } from './util.js';

// Urdhva-Tiryagbhyam ("vertically and crosswise"): works for any two non-negative integers.
// Each column sums the cross products of digit pairs whose positions add up to the column index.
export function urdhva(aIn, bIn) {
  const a = toBigInt(aIn, 'a');
  const b = toBigInt(bIn, 'b');

  const da = a.toString().split('').reverse().map(Number); // units digit first
  const db = b.toString().split('').reverse().map(Number);
  const n = Math.max(da.length, db.length);
  while (da.length < n) da.push(0);
  while (db.length < n) db.push(0);

  const steps = [];
  const shownA = [...da].reverse().join('');
  const shownB = [...db].reverse().join('');
  steps.push(
    shownA !== a.toString() || shownB !== b.toString()
      ? `Pad with leading zeros so both have ${n} digits: ${shownA} × ${shownB}.`
      : `Write the numbers one under the other: ${shownA} × ${shownB}.`
  );

  const out = [];
  let carry = 0;
  for (let col = 0; col <= 2 * n - 2; col++) {
    const terms = [];
    let sum = 0;
    for (let i = Math.max(0, col - (n - 1)); i <= Math.min(col, n - 1); i++) {
      terms.push(`${da[i]}×${db[col - i]}`);
      sum += da[i] * db[col - i];
    }
    const total = sum + carry;
    const digit = total % 10;
    const next = Math.floor(total / 10);
    steps.push(
      `Column ${col + 1} (10^${col}): ${terms.join(' + ')} = ${sum}${carry ? ` + carry ${carry} = ${total}` : ''} → write ${digit}${next ? `, carry ${next}` : ''}.`
    );
    out.push(digit);
    carry = next;
  }
  if (carry > 0) {
    steps.push(`Remaining carry ${carry} goes in front.`);
    out.push(...String(carry).split('').reverse().map(Number));
  }

  const answer = out.reverse().join('').replace(/^0+(?=\d)/, '');
  verify(BigInt(answer), a * b, 'urdhva-tiryagbhyam multiplication');
  steps.push(`Read the digits from the last column to the first: ${answer}.`);
  return { method: 'urdhva-tiryagbhyam', answer, steps };
}
