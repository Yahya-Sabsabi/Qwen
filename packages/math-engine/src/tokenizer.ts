import { MathError } from './errors';

export type TokenType =
  | 'num'
  | 'ident'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'eq'
  | 'cmp'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const UNICODE_MAP: Record<string, string> = {
  'π': 'pi',
  'θ': 'theta',
  'φ': 'phi',
  'α': 'alpha',
  'β': 'beta',
  'ω': 'omega',
  '√': 'sqrt',
  '∛': 'cbrt',
  '·': '*',
  '×': '*',
  '÷': '/',
  '−': '-',
  '’': "'",
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  '，': ',',
};

const SUPERSCRIPTS: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };

export function normalizeInput(src: string): string {
  let out = '';
  let prevWasSup = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch in SUPERSCRIPTS) {
      if (!prevWasSup) out += '^';
      out += SUPERSCRIPTS[ch];
      prevWasSup = true;
      continue;
    }
    prevWasSup = false;
    out += ch in UNICODE_MAP ? UNICODE_MAP[ch] : ch;
  }
  return out;
}

export function tokenize(raw: string): Token[] {
  const src = normalizeInput(raw);
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;

  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
  const isIdent = (c: string) => /[A-Za-z0-9_]/.test(c);

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      let j = i;
      while (j < n && (isDigit(src[j]) || src[j] === '.')) j++;
      // scientific notation
      if (src[j] === 'e' || src[j] === 'E') {
        const sign = src[j + 1];
        if ((sign === '+' || sign === '-') && isDigit(src[j + 2] ?? '')) {
          j += 2;
          while (j < n && isDigit(src[j])) j++;
        }
      }
      const value = src.slice(i, j);
      if ((value.match(/\./g) ?? []).length > 1) {
        throw new MathError('invalid_syntax', `Malformed number "${value}"`, i, 'A number can contain only one decimal point.');
      }
      tokens.push({ type: 'num', value, pos: i });
      i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (j < n && isIdent(src[j])) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (c === '(' || c === '[') {
      tokens.push({ type: 'lparen', value: c, pos: i });
      i++;
      continue;
    }
    if (c === ')' || c === ']') {
      tokens.push({ type: 'rparen', value: c, pos: i });
      i++;
      continue;
    }
    if (c === ',') {
      tokens.push({ type: 'comma', value: c, pos: i });
      i++;
      continue;
    }
    if (c === '=' ) {
      if (src[i + 1] === '=') {
        tokens.push({ type: 'cmp', value: '==', pos: i });
        i += 2;
      } else {
        tokens.push({ type: 'eq', value: '=', pos: i });
        i++;
      }
      continue;
    }
    if (c === '<' || c === '>') {
      if (src[i + 1] === '=') {
        tokens.push({ type: 'cmp', value: c + '=', pos: i });
        i += 2;
      } else {
        tokens.push({ type: 'cmp', value: c, pos: i });
        i++;
      }
      continue;
    }
    if (c === '!') {
      if (src[i + 1] === '=') {
        tokens.push({ type: 'cmp', value: '!=', pos: i });
        i += 2;
      } else {
        tokens.push({ type: 'op', value: '!', pos: i });
        i++;
      }
      continue;
    }
    if ('+-*/^%'.includes(c)) {
      tokens.push({ type: 'op', value: c, pos: i });
      i++;
      continue;
    }
    throw new MathError('unexpected_token', `Unexpected character "${c}"`, i, 'Remove it or use a supported symbol (+ - * / ^ % ! ( ) , = < >).');
  }
  tokens.push({ type: 'eof', value: '', pos: n });
  return tokens;
}
