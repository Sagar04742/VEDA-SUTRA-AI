import { abs, SolverError, toBigInt, verify } from './util.js';

const digitsOf = (n) => abs(n).toString().split('').map(Number);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// Digital root (repeated digit sum), also called the navashesha / casting-out-nines value.
export function digitSum(nIn) {
  const n = abs(toBigInt(nIn, 'number', { allowNegative: true }));
  let cur = n;
  const steps = [];
  while (cur >= 10n) {
    const ds = digitsOf(cur);
    const total = sum(ds);
    steps.push(`${ds.join(' + ')} = ${total}`);
    cur = BigInt(total);
  }
  if (steps.length === 0) steps.push(`${n} is already a single digit.`);
  const root = cur;
  verify(root, n === 0n ? 0n : 1n + ((n - 1n) % 9n), 'digit sum');
  steps.push(`Digit sum (digital root) of ${n} is ${root}. It equals ${n} mod 9 (with 9 written when the remainder is 0).`);
  return { method: 'digit sum', answer: root.toString(), steps };
}

export const SUPPORTED_DIVISORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// Divisibility tests using the digit-based rules.
export function divisibility(nIn, dIn) {
  const n = abs(toBigInt(nIn, 'number', { allowNegative: true }));
  const d = Number(dIn);
  if (!SUPPORTED_DIVISORS.includes(d)) throw new SolverError(`divisor must be one of ${SUPPORTED_DIVISORS.join(', ')}`);

  const ds = digitsOf(n);
  const lastN = (k) => BigInt(ds.slice(-k).join(''));
  const steps = [];
  let ok;

  switch (d) {
    case 2:
      ok = ds.at(-1) % 2 === 0;
      steps.push(`Last digit is ${ds.at(-1)}, which is ${ok ? 'even' : 'odd'}.`);
      break;
    case 5:
      ok = [0, 5].includes(ds.at(-1));
      steps.push(`Last digit is ${ds.at(-1)}; a number is divisible by 5 only if it ends in 0 or 5.`);
      break;
    case 10:
      ok = ds.at(-1) === 0;
      steps.push(`Last digit is ${ds.at(-1)}; a number is divisible by 10 only if it ends in 0.`);
      break;
    case 3:
    case 9: {
      const total = sum(ds);
      ok = total % d === 0;
      steps.push(`Digit sum: ${ds.join(' + ')} = ${total}.`, `${total} ${ok ? 'is' : 'is not'} divisible by ${d}.`);
      break;
    }
    case 4:
    case 8: {
      const k = d === 4 ? 2 : 3;
      const tail = lastN(k);
      ok = tail % BigInt(d) === 0n;
      steps.push(`Look at the last ${k} digits: ${tail}.`, `${tail} ${ok ? 'is' : 'is not'} divisible by ${d}.`);
      break;
    }
    case 6: {
      const even = ds.at(-1) % 2 === 0;
      const total = sum(ds);
      const by3 = total % 3 === 0;
      ok = even && by3;
      steps.push(`Divisible by 6 needs divisibility by 2 and by 3.`, `By 2: last digit ${ds.at(-1)} is ${even ? 'even' : 'odd'}.`, `By 3: digit sum ${total} ${by3 ? 'is' : 'is not'} divisible by 3.`);
      break;
    }
    case 7: {
      let cur = n;
      steps.push('Repeat: remove the last digit and subtract twice that digit from the rest.');
      while (cur >= 70n) {
        const last = cur % 10n;
        const rest = cur / 10n;
        const next = abs(rest - 2n * last);
        steps.push(`${cur} → ${rest} - 2×${last} = ${rest - 2n * last}${rest - 2n * last < 0n ? ` (use ${next})` : ''}`);
        cur = next;
      }
      ok = cur % 7n === 0n;
      steps.push(`${cur} ${ok ? 'is' : 'is not'} a multiple of 7.`);
      break;
    }
    case 11: {
      const rev = [...ds].reverse();
      const odd = sum(rev.filter((_, i) => i % 2 === 0));
      const even = sum(rev.filter((_, i) => i % 2 === 1));
      ok = (odd - even) % 11 === 0;
      steps.push(`Add digits in odd places from the right: ${odd}. Add digits in even places: ${even}.`, `Difference: ${odd} - ${even} = ${odd - even}, which ${ok ? 'is' : 'is not'} a multiple of 11.`);
      break;
    }
  }

  verify(ok, n % BigInt(d) === 0n, `divisibility by ${d}`);
  steps.push(`So ${n} is ${ok ? '' : 'not '}divisible by ${d}.`);
  return { method: `divisibility by ${d}`, answer: ok ? 'yes' : 'no', divisible: ok, steps };
}

// Casting out nines: compare digital roots of a, b and a claimed product.
// A mismatch proves the product is wrong; a match only suggests it is right.
export function checkProduct(aIn, bIn, claimedIn) {
  const a = toBigInt(aIn, 'a');
  const b = toBigInt(bIn, 'b');
  const claimed = toBigInt(claimedIn, 'claimed product');
  const root = (n) => (n === 0n ? 0n : 1n + ((n - 1n) % 9n));
  const ra = root(a);
  const rb = root(b);
  const expected = root(ra * rb);
  const got = root(claimed);
  const consistent = expected === got;
  const steps = [
    `Digit sum of ${a} is ${ra}; digit sum of ${b} is ${rb}.`,
    `Multiply them: ${ra} × ${rb} = ${ra * rb}, whose digit sum is ${expected}.`,
    `Digit sum of the claimed product ${claimed} is ${got}.`,
    consistent
      ? 'They match, so the product passes the check (this does not prove it is correct, but it is a good sign).'
      : 'They do not match, so the claimed product is definitely wrong.',
  ];
  if (a * b === claimed) verify(consistent, true, 'casting-out-nines on a correct product');
  return { method: 'casting out nines', answer: consistent ? 'consistent' : 'mismatch', consistent, steps };
}
