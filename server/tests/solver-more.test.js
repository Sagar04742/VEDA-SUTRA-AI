import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ekanyunena, antyayorDashake, divideBy9, square, multiply, digitSum, SolverError } from '../services/solver/index.js';
import { executeTool } from '../services/tools.js';
import { parseCsv } from '../../data/ingest.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const rand = rng(777);
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const N = 300;

describe('ekanyunena (multiplying by 9s)', () => {
  it('handles the textbook cases', () => {
    expect(ekanyunena(46, 99).answer).toBe('4554');
    expect(ekanyunena(99, 46).answer).toBe('4554'); // order does not matter
    expect(ekanyunena(7, 99).answer).toBe('693');
    expect(ekanyunena(123, 999).answer).toBe('122877');
    expect(ekanyunena(123, 99).answer).toBe('12177'); // number longer than the nines: borrow
    expect(ekanyunena(5, 9).answer).toBe('45');
    expect(ekanyunena(1, 99).answer).toBe('99');
  });
  it('is correct for random inputs', () => {
    for (let i = 0; i < N; i++) {
      const nines = BigInt('9'.repeat(int(1, 6)));
      const n = BigInt(int(1, 5_000_000));
      expect(ekanyunena(n, nines).answer).toBe(String(n * nines));
    }
  });
  it('rejects numbers that are not all 9s', () => {
    expect(() => ekanyunena(46, 98)).toThrow(SolverError);
  });
});

describe("antyayor dashake'pi (last digits add to 10)", () => {
  it('handles the textbook cases', () => {
    expect(antyayorDashake(47, 43).answer).toBe('2021');
    expect(antyayorDashake(68, 62).answer).toBe('4216');
    expect(antyayorDashake(96, 94).answer).toBe('9024');
    expect(antyayorDashake(3, 7).answer).toBe('21'); // no tens part
    expect(antyayorDashake(55, 55).answer).toBe('3025');
    expect(antyayorDashake(101, 109).answer).toBe('11009');
  });
  it('is correct for random matching pairs', () => {
    for (let i = 0; i < N; i++) {
      const p = BigInt(int(0, 99999));
      const x = BigInt(int(1, 9));
      const a = p * 10n + x;
      const b = p * 10n + (10n - x);
      expect(antyayorDashake(a, b).answer).toBe(String(a * b));
    }
  });
  it('rejects pairs it does not apply to', () => {
    expect(() => antyayorDashake(47, 53)).toThrow(SolverError); // different tens
    expect(() => antyayorDashake(47, 44)).toThrow(SolverError); // last digits do not add to 10
  });
});

describe('division by 9', () => {
  it('matches the textbook examples', () => {
    expect(divideBy9(1234)).toMatchObject({ quotient: '137', remainder: '1' });
    expect(divideBy9(5678)).toMatchObject({ quotient: '630', remainder: '8' });
    expect(divideBy9(9)).toMatchObject({ quotient: '1', remainder: '0' });
    expect(divideBy9(0)).toMatchObject({ quotient: '0', remainder: '0' });
    expect(divideBy9(8)).toMatchObject({ quotient: '0', remainder: '8' });
    expect(divideBy9(99999)).toMatchObject({ quotient: '11111', remainder: '0' });
  });
  it('is correct for random numbers', () => {
    for (let i = 0; i < N * 2; i++) {
      const n = BigInt(int(0, 10 ** 9)) * BigInt(int(1, 10 ** 6)) + BigInt(int(0, 8));
      const r = divideBy9(n);
      expect(r.quotient).toBe(String(n / 9n));
      expect(r.remainder).toBe(String(n % 9n));
    }
  });
});

describe('squares near a half base (50, 500, ...)', () => {
  it('handles the textbook cases and picks the method automatically', () => {
    expect(square(48).answer).toBe('2304');
    expect(square(53).answer).toBe('2809');
    expect(square(47).answer).toBe('2209');
    expect(square(48).method).toMatch(/half base/);
    expect(square(52, 'half_base').answer).toBe('2704');
    expect(square(480).answer).toBe('230400');
    expect(square(5100).answer).toBe(String(5100n ** 2n));
    expect(square(97).method).toMatch(/yavadunam \(squares near a base\)/); // power-of-ten base still preferred
  });
  it('is correct for random numbers near 50, 500, 5000', () => {
    for (let i = 0; i < N; i++) {
      const half = [50, 500, 5000][int(0, 2)];
      const n = half + int(-Math.floor(half / 5), Math.floor(half / 5));
      if (n % 10 === 5) continue;
      expect(square(n, 'half_base').answer).toBe(String(BigInt(n) ** 2n));
    }
  });
  it('refuses when the number is not near a half base', () => {
    expect(() => square(30, 'half_base')).toThrow(SolverError);
  });
});

describe('multiply picks the technique that fits', () => {
  it('chooses a named technique automatically and honours an explicit one', () => {
    expect(multiply(47, 43).method).toMatch(/antyayor/);
    expect(multiply(46, 99).method).toMatch(/ekanyunena/);
    expect(multiply(98, 97).method).toBe('nikhilam');
    expect(multiply(31, 42).method).toMatch(/urdhva/);
    expect(multiply(47, 43, 'urdhva').answer).toBe('2021');
    expect(multiply(-46, 99).answer).toBe('-4554');
    expect(() => multiply(3, 4, 'magic')).toThrow(SolverError);
    expect(() => multiply(46, 98, 'ekanyunena')).toThrow(SolverError);
  });
  it('is still correct for random numbers whichever technique is chosen', () => {
    for (let i = 0; i < N * 2; i++) {
      const a = int(1, 100000);
      const b = i % 3 === 0 ? 10 ** int(1, 4) - 1 : i % 3 === 1 ? a - (a % 10) + (10 - (a % 10 || 5)) : int(1, 100000);
      expect(multiply(a, b).answer).toBe(String(BigInt(a) * BigInt(b)));
    }
  });
  it('exposes the new techniques through the tool layer', async () => {
    expect(await executeTool('vedic_multiply', { a: '46', b: '99', method: 'ekanyunena' })).toMatchObject({ answer: '4554' });
    expect(await executeTool('vedic_divide_by_9', { number: '1234' })).toMatchObject({ answer: '137 remainder 1', quotient: '137', remainder: '1' });
    expect((await executeTool('vedic_multiply', { a: '46', b: '98', method: 'ekanyunena' })).error).toMatch(/9s/);
  });
});

// The question bank supplied with the project (data/raw/questions_extended.csv) has reference answers
// for 47 "exact" calculation questions. Every one must be answered correctly by the solver using the
// technique the question names.
describe('project question bank: exact calculation questions', () => {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/raw/questions_extended.csv');
  const [, ...rows] = parseCsv(readFileSync(file, 'utf8'));
  const exact = rows.filter((r) => r[1] === 'Calculation' && r[2] === 'exact');

  const solve = (q) => {
    const nums = q.replace(/\(base \d+\)|\(base 50 or 100\)/g, '').match(/\d+/g).map(Number);
    if (/digit sum/i.test(q)) return digitSum(nums[0]).answer;
    if (/squared/.test(q)) return square(nums[0], /Ekadhikena/.test(q) ? 'ends_in_5' : 'auto').answer;
    const method = /Nikhilam/.test(q) ? 'nikhilam' : /Urdhva/.test(q) ? 'urdhva' : /Ekanyunena/.test(q) ? 'ekanyunena' : /Antyayor/.test(q) ? 'antyayor' : 'auto';
    return multiply(nums[0], nums[1], method).answer;
  };

  it('has the expected 47 questions', () => {
    expect(exact).toHaveLength(47);
  });
  it.each(exact.map((r) => [r[0], r[4], r[5]]))('%s  %s', (_id, question, expected) => {
    expect(solve(question)).toBe(expected.trim());
  });
  it('division by 9 questions (C48, C49)', () => {
    const judge = rows.filter((r) => ['C48', 'C49'].includes(r[0]));
    for (const r of judge) {
      const n = Number(r[4].match(/Divide (\d+)/)[1]);
      const d = divideBy9(n);
      expect(r[5]).toBe(`Quotient ${d.quotient}, remainder ${d.remainder}`);
    }
  });
});
