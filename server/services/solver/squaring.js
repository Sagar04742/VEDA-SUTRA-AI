import { abs, br, normalise, pickBaseExponent, pow10, SolverError, toBigInt, verify } from './util.js';
import { urdhva } from './urdhva.js';

// Squares via Ekadhikena Purvena (numbers ending in 5) or Yavadunam (numbers near a power of ten).
export function square(nIn, method = 'auto') {
  const signed = toBigInt(nIn, 'n', { allowNegative: true });
  const n = abs(signed);

  const endsIn5 = n % 10n === 5n;
  const k = pickBaseExponent([n]);
  const base = pow10(k);
  const d = n - base;
  const nearBase = abs(d) * 4n <= base;

  if (method === 'ends_in_5' && !endsIn5) throw new SolverError('That number does not end in 5');
  if (method === 'near_base' && !nearBase) throw new SolverError('That number is not close enough to a power of ten');

  let result;
  if ((method === 'auto' && endsIn5) || method === 'ends_in_5') result = endsIn5Square(n);
  else if ((method === 'auto' && nearBase) || method === 'near_base') result = nearBaseSquare(n, base, k, d);
  else {
    const u = urdhva(n, n);
    result = {
      method: 'urdhva-tiryagbhyam (general)',
      answer: u.answer,
      steps: [`${n} does not end in 5 and is not near a power of ten, so there is no special shortcut; multiply it by itself vertically and crosswise.`, ...u.steps],
    };
  }
  verify(BigInt(result.answer), n * n, 'square');
  if (signed < 0n) result.steps.unshift(`${signed} squared equals ${n} squared, because a negative times a negative is positive.`);
  return result;
}

// Ekadhikena Purvena: for a number P5, the square is P×(P+1) followed by 25.
function endsIn5Square(n) {
  const p = n / 10n;
  const left = p * (p + 1n);
  const answer = left * 100n + 25n;
  return {
    method: 'ekadhikena-purvena (squares ending in 5)',
    answer: answer.toString(),
    steps: [
      `${n} ends in 5. Remove the 5 to get the prefix ${p}.`,
      `Multiply the prefix by one more than itself: ${p} × ${p + 1n} = ${left}.`,
      `Write 25 after it (5 × 5 = 25): ${left} | 25 = ${answer}.`,
    ],
  };
}

// Yavadunam ("whatever the deficiency"): n^2 = (n + d) | d^2, where d = n - base.
function nearBaseSquare(n, base, k, d) {
  const cross = n + d;
  const { left, right, carry } = normalise(cross, d * d, base);
  const answer = left * base + right;
  const steps = [
    `Choose the base ${base} (10^${k}), the power of ten closest to ${n}.`,
    `Deviation: ${n} - ${base} = ${d}.`,
    `Left part: ${n} + ${br(d)} = ${cross}.`,
    `Right part: the deviation squared, ${br(d)}² = ${d * d}.`,
  ];
  if (carry !== 0n) steps.push(`The right part must have ${k} digit(s), so carry ${carry} to the left: left = ${left}, right = ${right.toString().padStart(k, '0')}.`);
  steps.push(`Join the parts: ${left} | ${right.toString().padStart(k, '0')} = ${answer}.`);
  return { method: 'yavadunam (squares near a base)', answer: answer.toString(), steps };
}
