import { describe, it, expect } from 'vitest';
import {
  nikhilam,
  urdhva,
  square,
  multiply,
  toVinculum,
  fromVinculum,
  digitSum,
  divisibility,
  checkProduct,
  SolverError,
} from '../services/solver/index.js';

// Small seeded PRNG so "random" tests are reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const rand = rng(20240607);
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const N = 300;

describe('nikhilam', () => {
  it('matches the classic examples', () => {
    expect(nikhilam(98, 97).answer).toBe('9506');
    expect(nikhilam(102, 104).answer).toBe('10608');
    expect(nikhilam(998, 997).answer).toBe('995006');
    expect(nikhilam(12, 13).answer).toBe('156');
    expect(nikhilam(98, 103).answer).toBe('10094'); // mixed deficiency/excess (borrow)
    expect(nikhilam(88, 77).answer).toBe('6776'); // carry from the right part
  });

  it('is correct for random numbers near 10, 100, 1000', () => {
    for (const base of [10, 100, 1000, 10000]) {
      for (let i = 0; i < N; i++) {
        const spread = Math.floor(base / 4);
        const a = Math.max(1, base + int(-spread, spread));
        const b = Math.max(1, base + int(-spread, spread));
        expect(nikhilam(a, b).answer).toBe(String(BigInt(a) * BigInt(b)));
      }
    }
  });

  it('is still correct far from a base, and for edge cases', () => {
    for (let i = 0; i < N; i++) {
      const a = int(1, 999999);
      const b = int(1, 999999);
      expect(nikhilam(a, b).answer).toBe(String(BigInt(a) * BigInt(b)));
    }
    expect(nikhilam(1, 1).answer).toBe('1');
    expect(nikhilam(10, 10).answer).toBe('100');
    expect(nikhilam(100, 100).answer).toBe('10000');
    expect(nikhilam(9, 9).answer).toBe('81');
  });

  it('returns steps and rejects bad input', () => {
    const r = nikhilam(98, 97);
    expect(r.steps.length).toBeGreaterThanOrEqual(4);
    expect(r.steps.join(' ')).toContain('100');
    expect(() => nikhilam(0, 5)).toThrow(SolverError);
    expect(() => nikhilam(-3, 5)).toThrow(SolverError);
    expect(() => nikhilam('abc', 5)).toThrow(SolverError);
    expect(() => nikhilam(1.5, 5)).toThrow(SolverError);
  });
});

describe('urdhva-tiryagbhyam', () => {
  it('is correct for random numbers of any length', () => {
    for (let i = 0; i < N * 2; i++) {
      const a = BigInt(int(0, 10 ** 9)) * BigInt(int(1, 10 ** 6));
      const b = BigInt(int(0, 10 ** 9));
      expect(urdhva(a, b).answer).toBe(String(a * b));
    }
  });

  it('handles edge cases', () => {
    expect(urdhva(0, 0).answer).toBe('0');
    expect(urdhva(0, 12345).answer).toBe('0');
    expect(urdhva(1, 1).answer).toBe('1');
    expect(urdhva(9, 9).answer).toBe('81');
    expect(urdhva(99999, 99999).answer).toBe('9999800001');
    expect(urdhva(12, 345).answer).toBe('4140'); // different lengths
    expect(urdhva('123456789012', '987654321098').answer).toBe(String(123456789012n * 987654321098n));
    expect(urdhva(23, 14).steps.length).toBeGreaterThan(3);
  });
});

describe('square', () => {
  it('squares numbers ending in 5', () => {
    expect(square(25).answer).toBe('625');
    expect(square(5).answer).toBe('25');
    expect(square(105).answer).toBe('11025');
    for (let i = 0; i < N; i++) {
      const n = BigInt(int(0, 99999) * 10 + 5);
      const r = square(n);
      expect(r.answer).toBe(String(n * n));
      expect(r.method).toMatch(/ekadhikena/);
    }
  });

  it('squares numbers near a base', () => {
    expect(square(98).answer).toBe('9604');
    expect(square(103).answer).toBe('10609');
    expect(square(88).answer).toBe('7744'); // right part carries
    expect(square(998, 'near_base').answer).toBe('996004');
    for (let i = 0; i < N; i++) {
      const base = [100, 1000, 10000][int(0, 2)];
      const n = base + int(-Math.floor(base / 4), Math.floor(base / 4));
      if (n % 10 === 5) continue;
      expect(square(n).answer).toBe(String(BigInt(n) ** 2n));
    }
  });

  it('falls back to a general method and handles other inputs', () => {
    expect(square(37).answer).toBe('1369');
    expect(square(0).answer).toBe('0');
    expect(square(1).answer).toBe('1');
    expect(square(-12).answer).toBe('144');
    for (let i = 0; i < N; i++) {
      const n = int(1, 10 ** 8);
      expect(square(n).answer).toBe(String(BigInt(n) ** 2n));
    }
  });

  it('rejects a forced method that does not apply', () => {
    expect(() => square(37, 'ends_in_5')).toThrow(SolverError);
    expect(() => square(37, 'near_base')).toThrow(SolverError);
  });
});

describe('multiply (auto method choice)', () => {
  it('picks nikhilam near a base and urdhva otherwise', () => {
    expect(multiply(98, 97).method).toBe('nikhilam');
    expect(multiply(47, 83).method).toMatch(/urdhva/);
    expect(multiply(98, 97, 'urdhva').method).toMatch(/urdhva/);
  });

  it('handles signs and zero', () => {
    expect(multiply(-12, 13).answer).toBe('-156');
    expect(multiply(-12, -13).answer).toBe('156');
    expect(multiply(0, 13).answer).toBe('0');
    expect(multiply(-0, 13).answer).toBe('0');
  });

  it('is correct for random inputs', () => {
    for (let i = 0; i < N * 2; i++) {
      const a = int(-100000, 100000);
      const b = int(-100000, 100000);
      expect(multiply(a, b).answer).toBe(String(BigInt(a) * BigInt(b)));
    }
  });
});

describe('vinculum', () => {
  it('converts known examples', () => {
    expect(toVinculum(68).digits).toEqual([1, -3, -2]);
    expect(toVinculum(9).digits).toEqual([1, -1]);
    expect(toVinculum(19).digits).toEqual([2, -1]);
    expect(toVinculum(123).digits).toEqual([1, 2, 3]); // nothing above 5
    expect(toVinculum(5).digits).toEqual([5]);
    expect(toVinculum(6).digits).toEqual([1, -4]);
    expect(toVinculum(68).answer).toBe('13̄' + '2̄');
  });

  it('round-trips for random numbers', () => {
    for (let i = 0; i < N * 3; i++) {
      const n = BigInt(int(1, 10 ** 9)) * BigInt(int(1, 1000));
      const v = toVinculum(n);
      expect(fromVinculum(v.digits).answer).toBe(String(n));
      // No digit is above 5 in magnitude after conversion.
      expect(v.digits.every((d) => d >= -5 && d <= 5)).toBe(true);
    }
  });

  it('converts a barred-digit list and validates input', () => {
    expect(fromVinculum([1, -3, -2]).answer).toBe('68');
    expect(fromVinculum([-1, 0]).answer).toBe('-10');
    expect(() => fromVinculum([])).toThrow(SolverError);
    expect(() => fromVinculum([1, 12])).toThrow(SolverError);
    expect(() => toVinculum(0)).toThrow(SolverError);
  });
});

describe('digit sum and divisibility', () => {
  it('computes digital roots', () => {
    expect(digitSum(456).answer).toBe('6');
    expect(digitSum(999).answer).toBe('9');
    expect(digitSum(0).answer).toBe('0');
    expect(digitSum(7).answer).toBe('7');
    expect(digitSum(-18).answer).toBe('9');
    for (let i = 0; i < N; i++) {
      const n = BigInt(int(1, 10 ** 9)) * BigInt(int(1, 10 ** 6));
      expect(Number(digitSum(n).answer)).toBe(Number(1n + ((n - 1n) % 9n)));
    }
  });

  it('matches real divisibility for every supported divisor', () => {
    for (let d = 2; d <= 11; d++) {
      for (let i = 0; i < N; i++) {
        const n = BigInt(int(0, 10 ** 9)) * BigInt(int(1, 10 ** 5));
        expect(divisibility(n, d).divisible).toBe(n % BigInt(d) === 0n);
      }
      // guaranteed multiples
      for (let i = 0; i < 50; i++) {
        const n = BigInt(d) * BigInt(int(0, 10 ** 8));
        expect(divisibility(n, d).answer).toBe('yes');
      }
    }
  });

  it('handles edge cases', () => {
    expect(divisibility(0, 7).divisible).toBe(true);
    expect(divisibility(7, 7).divisible).toBe(true);
    expect(divisibility(1001, 7).divisible).toBe(true);
    expect(divisibility(121, 11).divisible).toBe(true);
    expect(divisibility(-121, 11).divisible).toBe(true);
    expect(divisibility(123456789, 9).divisible).toBe(true);
    expect(() => divisibility(10, 12)).toThrow(SolverError);
  });
});

describe('casting out nines', () => {
  it('always accepts correct products and flags most wrong ones', () => {
    let caught = 0;
    for (let i = 0; i < N; i++) {
      const a = int(1, 99999);
      const b = int(1, 99999);
      const good = BigInt(a) * BigInt(b);
      expect(checkProduct(a, b, good).consistent).toBe(true);
      if (!checkProduct(a, b, good + 1n).consistent) caught++; // off by one is always caught
    }
    expect(caught).toBe(N);
    expect(checkProduct(98, 97, 9507).answer).toBe('mismatch');
  });
});
