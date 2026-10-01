import { describe, it, expect } from 'vitest';
import { tokenize, normalizeInput } from '../src/tokenizer';
import { MathError } from '../src/errors';

describe('normalizeInput', () => {
  it('maps unicode operators and constants', () => {
    expect(normalizeInput('π')).toBe('pi');
    expect(normalizeInput('3×4÷2')).toBe('3*4/2');
    expect(normalizeInput('−5')).toBe('-5');
    expect(normalizeInput('a≤b')).toBe('a<=b');
    expect(normalizeInput('x≠y')).toBe('x!=y');
    expect(normalizeInput('√x')).toBe('sqrtx');
  });

  it('converts superscript exponents into ^ groups', () => {
    expect(normalizeInput('x²')).toBe('x^2');
    expect(normalizeInput('x⁻³')).toBe('x^-3');
    expect(normalizeInput('2¹⁰')).toBe('2^10');
  });
});

describe('tokenize', () => {
  it('produces typed tokens with positions', () => {
    const t = tokenize('2 + x');
    expect(t.map((x) => x.type)).toEqual(['num', 'op', 'ident', 'eof']);
    expect(t[2].pos).toBe(4);
  });

  it('parses decimals and scientific notation', () => {
    expect(tokenize('1.5e-3')[0]).toMatchObject({ type: 'num', value: '1.5e-3' });
    expect(tokenize('.5')[0].value).toBe('.5');
    expect(tokenize('2E+10')[0].value).toBe('2E+10');
  });

  it('distinguishes = , == and comparisons', () => {
    const t = tokenize('a=b==c<d>=e!=f');
    expect(t.filter((x) => x.type === 'eq').length).toBe(1);
    expect(t.filter((x) => x.type === 'cmp').map((x) => x.value)).toEqual(['==', '<', '>=', '!=']);
  });

  it('treats [ ] as parentheses and ! as operator', () => {
    const t = tokenize('[3!]');
    expect(t.map((x) => x.type)).toEqual(['lparen', 'num', 'op', 'rparen', 'eof']);
  });

  it('rejects malformed numbers', () => {
    expect(() => tokenize('1.2.3')).toThrowError(/Malformed number/);
  });

  it('rejects unknown characters with position info', () => {
    try {
      tokenize('2 $ 3');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MathError);
      const me = e as MathError;
      expect(me.code).toBe('unexpected_token');
      expect(me.position).toBe(2);
    }
  });

  it('handles empty input as just eof', () => {
    expect(tokenize('   ')).toEqual([{ type: 'eof', value: '', pos: 3 }]);
  });
});
