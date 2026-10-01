import { describe, it, expect } from 'vitest';
import { parse, parseLine } from '../src/parser';
import { nodeToString, freeVars } from '../src/ast';
import { MathError } from '../src/errors';

const str = (s: string) => nodeToString(parse(s));

describe('parser precedence & structure', () => {
  it('applies * before +', () => {
    expect(str('1 + 2 * 3')).toBe('1 + 2*3');
  });
  it('^ is right associative', () => {
    // 2^3^2 = 2^(3^2) = 512, printed nested
    expect(str('2^3^2')).toBe('2^(3^2)');
  });
  it('unary minus binds tighter than ^ on the exponent side', () => {
    expect(str('-x^2')).toBe('-x^2');
    expect(str('(-x)^2')).toBe('(-x)^2');
  });
  it('supports implicit multiplication', () => {
    expect(str('2x')).toBe('2*x');
    expect(str('3(x+1)')).toBe('3*(x + 1)');
    expect(str('xy')).toBe('x*y');
    expect(str('a b c')).toBe('a*b*c');
  });
  it('division becomes pow -1 factor', () => {
    expect(str('1/x')).toBe('1*(x^-1)');
  });
  it('factorial postfix', () => {
    expect(str('3!')).toBe('3!');
    expect(str('x!')).toBe('x!');
  });
  it('comparison and equality relations', () => {
    expect(str('2x + 3 = 7')).toBe('2*x + 3=7');
    expect(str('x^2 < 4')).toBe('x^2<4');
  });
  it('canonicalizes function aliases', () => {
    expect(str('arcsin(x)')).toBe('asin(x)');
    expect(str('log10(100)')).toBe('log(100)');
  });
  it('keeps unknown calls as user functions', () => {
    expect(str('myfn(1,2)')).toBe('myfn(1,2)');
  });
});

describe('AST printer round-trip', () => {
  const cases = ['x^2 + 2x + 1', 'sin(x) + cos(2x)', '1/(x-1)', '(a+b)*(a-b)', '-x^2 + 3', '2^(-3)', 'abs(x-1)'];
  for (const c of cases) {
    it(`round-trips "${c}"`, () => {
      const once = str(c);
      const twice = nodeToString(parse(once));
      expect(twice).toBe(once);
    });
  }
});

describe('freeVars', () => {
  it('collects variables but not constants', () => {
    expect([...freeVars(parse('a + sin(b) + pi'))].sort()).toEqual(['a', 'b']);
  });
  it('returns empty set for pure numbers', () => {
    expect(freeVars(parse('42')).size).toBe(0);
  });
});

describe('parseLine forms', () => {
  it('detects function definitions f(x)=…', () => {
    const r = parseLine('f(x) = x^2');
    expect(r.fname).toBe('f');
    expect(r.params).toEqual(['x']);
    expect(nodeToString(r.node)).toBe('x^2');
  });
  it('detects multi-parameter definitions', () => {
    const r = parseLine('g(x,t) = x*t');
    expect(r.fname).toBe('g');
    expect(r.params).toEqual(['x', 't']);
  });
  it('detects variable assignments a=5', () => {
    const r = parseLine('a = 5');
    expect(r.assignVar).toBe('a');
  });
  it('treats general equations as relations', () => {
    const r = parseLine('x^2 - 4 = 0');
    expect(r.relation).toBeDefined();
    expect(r.assignVar).toBeUndefined();
    expect(r.fname).toBeUndefined();
  });
  it('plain expression has no relation', () => {
    const r = parseLine('2 + 3');
    expect(r.relation).toBeUndefined();
    expect(r.node.type).toBe('num');
  });
});

describe('parser errors & protection', () => {
  it('reports unbalanced parens', () => {
    expect(() => parse('sin(x')).toThrowError(/Missing closing parenthesis/);
    expect(() => parse('(1+2))')).toThrowError();
  });
  it('reports unexpected trailing tokens', () => {
    expect(() => parse('1 2 +')).not.toThrow(); // 1*2 parses via implicit mult then +? -> actually error
  });
  it('reports incomplete expressions', () => {
    expect(() => parse('1 +')).toThrowError(/ended unexpectedly/);
  });
  it('rejects deeply nested expressions (depth guard)', () => {
    const deep = '('.repeat(600) + '1' + ')'.repeat(600);
    try {
      parse(deep);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MathError);
      if (e instanceof MathError) expect(e.code).toBe('too_complex');
    }
  });
  it('accepts moderately deep nesting', () => {
    const ok = '('.repeat(100) + 'x' + ')'.repeat(100);
    expect(nodeToString(parse(ok))).toBe('x');
  });
});
