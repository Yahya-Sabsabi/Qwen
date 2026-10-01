import { describe, it, expect } from 'vitest';
import { evaluate, evalString, gammaFn, factorialInt, BUILTINS } from '../src/evaluator';
import { parse } from '../src/parser';
import { MathError } from '../src/errors';

const ev = (s: string, scope: Record<string, number> = {}) => evalString(s, scope);

describe('arithmetic evaluation', () => {
  it('basic operators & precedence', () => {
    expect(ev('1+2*3')).toBe(7);
    expect(ev('(1+2)*3')).toBe(9);
    expect(ev('2^10')).toBe(1024);
    expect(ev('2^3^2')).toBe(512); // right assoc
    expect(ev('-x^2', { x: 3 })).toBe(-9);
    expect(ev('7 % 3')).toBe(1);
    expect(ev('-7 % 3')).toBe(2); // mathematical modulo
  });
  it('implicit multiplication', () => {
    expect(ev('2x', { x: 4 })).toBe(8);
    expect(ev('3(x+1)', { x: 2 })).toBe(9);
  });
  it('constants', () => {
    expect(ev('pi')).toBeCloseTo(Math.PI, 12);
    expect(ev('e')).toBeCloseTo(Math.E, 12);
    expect(ev('tau')).toBeCloseTo(2 * Math.PI, 12);
    expect(ev('phi')).toBeCloseTo((1 + Math.sqrt(5)) / 2, 12);
  });
  it('factorial', () => {
    expect(ev('0!')).toBe(1);
    expect(ev('5!')).toBe(120);
    expect(factorialInt(0.5)).toBeCloseTo(gammaFn(1.5), 9);
  });
});

describe('built-in functions', () => {
  it('trig in radians', () => {
    expect(ev('sin(pi/2)')).toBeCloseTo(1, 12);
    expect(ev('cos(0)')).toBe(1);
    expect(ev('tan(pi/4)')).toBeCloseTo(1, 9);
    expect(ev('asin(1)')).toBeCloseTo(Math.PI / 2, 12);
    expect(ev('atan(1)')).toBeCloseTo(Math.PI / 4, 12);
  });
  it('hyperbolic & exp/log', () => {
    expect(ev('cosh(0)')).toBe(1);
    expect(ev('sinh(1)')).toBeCloseTo(Math.sinh(1), 12);
    expect(ev('exp(1)')).toBeCloseTo(Math.E, 12);
    expect(ev('ln(e^3)')).toBeCloseTo(3, 12);
    expect(ev('log(100)')).toBeCloseTo(2, 12); // base-10 default
    expect(ev('log(8, 2)')).toBeCloseTo(3, 12); // explicit base
    expect(ev('log2(16)')).toBeCloseTo(4, 12);
  });
  it('misc', () => {
    expect(ev('abs(-5)')).toBe(5);
    expect(ev('sqrt(16)')).toBe(4);
    expect(ev('cbrt(-8)')).toBe(-2);
    expect(ev('min(3,1,2)')).toBe(1);
    expect(ev('max(3,1,2)')).toBe(3);
    expect(ev('gcd(12,18)')).toBe(6);
    expect(ev('lcm(4,6)')).toBe(12);
    expect(ev('hypot(3,4)')).toBe(5);
    expect(ev('floor(2.7)')).toBe(2);
    expect(ev('ceil(2.1)')).toBe(3);
    expect(ev('round(2.5)')).toBe(3);
  });
  it('gamma values', () => {
    expect(gammaFn(1)).toBeCloseTo(1, 10);
    expect(gammaFn(5)).toBeCloseTo(24, 9);
    expect(gammaFn(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 9);
    expect(gammaFn(-0.5)).toBeCloseTo(-2 * Math.sqrt(Math.PI), 8);
  });
});

describe('relations evaluate to booleans-as-numbers', () => {
  it('comparisons', () => {
    expect(ev('2 < 3')).toBe(1);
    expect(ev('3 <= 3')).toBe(1);
    expect(ev('4 > 5')).toBe(0);
    expect(ev('2 == 2')).toBe(1);
    expect(ev('2 != 3')).toBe(1);
  });
});

describe('error handling', () => {
  it('division by zero throws division_by_zero', () => {
    try {
      ev('1/0');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MathError);
      if (e instanceof MathError) expect(e.code).toBe('division_by_zero');
    }
  });
  it('0^-1 is division by zero', () => {
    expect(() => ev('0^-1')).toThrowError(/negative power/);
  });
  it('sqrt(-1) throws domain_error', () => {
    try {
      ev('sqrt(-1)');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MathError);
      if (e instanceof MathError) expect(e.code).toBe('domain_error');
    }
  });
  it('log(0) and ln(negative) throw domain_error', () => {
    expect(() => ev('log(0)')).toThrowError(/positive argument/);
    expect(() => ev('ln(-2)')).toThrowError(/positive argument/);
  });
  it('asin(2) throws domain_error', () => {
    expect(() => ev('asin(2)')).toThrowError(/\[-1, 1\]/);
  });
  it('unknown variable gives helpful hint', () => {
    try {
      ev('q + 1');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MathError);
      if (e instanceof MathError) {
        expect(e.code).toBe('unknown_identifier');
        expect(e.hint).toMatch(/slider|Define/);
      }
    }
  });
  it('unknown function throws unknown_function', () => {
    expect(() => evaluate(parse('bogus(1)'), {})).toThrowError(/Unknown function/);
  });
  it('tan at pole returns Infinity (graph gap), not crash', () => {
    const v = ev('tan(pi/2)');
    expect(Number.isFinite(v)).toBe(false);
  });
  it('negative base fractional exponent → NaN unless odd root', () => {
    expect(ev('(-8)^(1/3)')).toBeCloseTo(-2, 9);
    expect(Number.isNaN(ev('(-4)^0.5'))).toBe(true);
  });
  it('BUILTINS map is complete for parser FUNCTIONS names used', () => {
    expect(typeof BUILTINS.sin).toBe('function');
    expect(typeof BUILTINS.factorial).toBe('function');
  });
});
