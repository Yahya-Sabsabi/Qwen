import { MathError } from './errors';
import { tokenize, Token } from './tokenizer';
import {
  Node,
  num,
  vari,
  konst,
  add,
  mul,
  pow,
  neg,
  fn,
  eq,
  cmp,
  AddNode,
  MulNode,
  CmpNode,
} from './ast';

export const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'asin', 'acos', 'atan', 'atan2', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'coth',
  'exp', 'ln', 'log', 'log2', 'log10', 'logb',
  'sqrt', 'cbrt', 'abs', 'sign', 'floor', 'ceil', 'round', 'mod',
  'min', 'max', 'gcd', 'lcm', 'gamma', 'lgamma', 'factorial', 'fact',
  'piecewise', 'if', 'sum', 'product', 'hypot', 're', 'im',
]);

export const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: 2 * Math.PI,
  phi: (1 + Math.sqrt(5)) / 2,
  inf: Infinity,
};

const MAX_DEPTH = 512;

/**
 * Pratt-style recursive descent parser.
 * Grammar highlights:
 *   expr    := cmpExpr ((< <= > >=) cmpExpr)?
 *   sum     := prod (('+'|'-') prod)*        → flattened add node
 *   prod    := unary (('*'|'/'|'%')? unary)* → implicit multiplication
 *   unary   := ('-'|'+')* postfix
 *   postfix := primary ('^' unary)? '!'*
 *   primary := number | ident | ident '(' args ')' | '(' expr ')'
 */
class Parser {
  toks: Token[];
  i = 0;
  depth = 0;

  constructor(src: string) {
    this.toks = tokenize(src);
  }

  peek(): Token {
    return this.toks[this.i];
  }
  next(): Token {
    return this.toks[this.i++];
  }
  expect(type: string, value?: string): Token {
    const t = this.peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new MathError('unexpected_token', `Expected ${value ? `"${value}"` : type} but found "${t.value || 'end of input'}"`, t.pos);
    }
    return this.next();
  }

  parseTop(): Node {
    const node = this.parseComparisonLevel();
    if (this.peek().type !== 'eof') {
      const t = this.peek();
      throw new MathError('invalid_syntax', `Unexpected "${t.value}" after expression`, t.pos, 'Check for a missing operator or parenthesis.');
    }
    return node;
  }

  /** lhs of an assignment/definition must be a bare identifier or call form */
  parseAssignTarget(): { name: string; params: string[] | null } {
    const t = this.peek();
    if (t.type !== 'ident') {
      throw new MathError('invalid_syntax', `Expected a name before "="`, t.pos);
    }
    this.next();
    if (this.peek().type === 'lparen') {
      this.next();
      const params: string[] = [];
      if (this.peek().type === 'ident') {
        params.push(this.next().value);
        while (this.peek().type === 'comma') {
          this.next();
          params.push(this.expect('ident').value);
        }
      }
      if (this.peek().type !== 'rparen') {
        throw new MathError('unbalanced_paren', 'Missing ")" in function definition', this.peek().pos);
      }
      this.next();
      return { name: t.value, params };
    }
    return { name: t.value, params: null };
  }

  parseComparisonLevel(): Node {
    // top-level assignment: f(x)=…, y=…, a=…
    const save = this.i;
    if (this.peek().type === 'ident') {
      try {
        const target = this.parseAssignTarget();
        if (this.peek().type === 'eq') {
          this.next();
          const rhs = this.parseSum();
          const lhsNode: Node = target.params ? fn(target.name, ...target.params.map(vari)) : vari(target.name);
          return eq(lhsNode, rhs);
        }
        // not an assignment — rewind and parse normally
        this.i = save;
      } catch {
        this.i = save;
      }
    }
    const lhs = this.parseSum();
    const t = this.peek();
    if (t.type === 'cmp' && ['<', '<=', '>', '>='].includes(t.value)) {
      this.next();
      const rhs = this.parseSum();
      return cmp(t.value as CmpNode['op'], lhs, rhs);
    }
    if (t.type === 'eq') {
      this.next();
      const rhs = this.parseSum();
      return eq(lhs, rhs);
    }
    return lhs;
  }

  parseSum(): Node {
    const terms: Node[] = [this.parseProduct()];
    while (true) {
      const t = this.peek();
      if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
        this.next();
        const rhs = this.parseProduct();
        terms.push(t.value === '-' ? negTerm(rhs) : rhs);
      } else break;
    }
    return terms.length === 1 ? terms[0] : flattenAdd(terms);
  }

  parseProduct(): Node {
    const factors: Node[] = [this.parseUnary()];
    while (true) {
      const t = this.peek();
      if (t.type === 'op' && (t.value === '*' || t.value === '/' || t.value === '%')) {
        this.next();
        const rhs = this.parseUnary();
        if (t.value === '/') factors.push(pow(rhs, num(-1)));
        else if (t.value === '%') factors.push(fn('mod', popFactors(factors), rhs));
        else factors.push(rhs);
      } else if (canStartImplicitProduct(t)) {
        factors.push(this.parseUnary());
      } else break;
    }
    return factors.length === 1 ? factors[0] : flattenMul(factors);
  }

  parseUnary(): Node {
    const t = this.peek();
    if (t.type === 'op' && (t.value === '-' || t.value === '+')) {
      this.next();
      const arg = this.parseUnary();
      return t.value === '-' ? negTerm(arg) : arg;
    }
    return this.parseFactorWithPower();
  }

  private parseUnaryForExp(): Node {
    const t = this.peek();
    if (t.type === 'op' && (t.value === '-' || t.value === '+')) {
      this.next();
      const arg = this.parseUnaryForExp();
      return t.value === '-' ? negTerm(arg) : arg;
    }
    return this.parseFactorWithPower();
  }

  /** power-aware primary: base with factorials, optional right-assoc ^ */
  parseFactorWithPower(): Node {
    let node = this.parsePrimaryNoPow();
    while (this.peek().type === 'op' && this.peek().value === '!') {
      this.next();
      node = { type: 'fact', arg: node };
    }
    const t = this.peek();
    if (t.type === 'op' && t.value === '^') {
      this.next();
      const exp = this.parseUnaryForExp();
      node = pow(node, exp);
    }
    return node;
  }

  parsePrimaryNoPow(): Node {
    if (++this.depth > MAX_DEPTH) {
      throw new MathError('too_complex', 'Expression is too deeply nested', this.peek().pos, 'Break it into smaller parts.');
    }
    const t = this.peek();
    try {
      if (t.type === 'num') {
        this.next();
        return num(parseFloat(t.value));
      }
      if (t.type === 'ident') {
        this.next();
        const name = t.value;
        if (this.peek().type === 'lparen') {
          this.next();
          const args: Node[] = [];
          if (this.peek().type !== 'rparen') {
            args.push(this.parseComparisonLevel());
            while (this.peek().type === 'comma') {
              this.next();
              args.push(this.parseComparisonLevel());
            }
          }
          const close = this.peek();
          if (close.type !== 'rparen') {
            throw new MathError('unbalanced_paren', `Missing closing parenthesis for "${name}("`, close.pos);
          }
          this.next();
          if (!FUNCTIONS.has(name) && !(name in CONSTANTS)) {
            // treat unknown(...) as user-defined function reference — allowed at eval scope
            return fn(name, args);
          }
          return canonicalFunc(name, args);
        }
        if (name in CONSTANTS) {
          return konst(name);
        }
        // multi-letter "user functions" referenced without parens are variables
        return vari(name);
      }
      if (t.type === 'lparen') {
        this.next();
        const inner = this.parseComparisonLevel();
        const close = this.peek();
        if (close.type !== 'rparen') {
          throw new MathError('unbalanced_paren', 'Missing closing parenthesis', close.pos);
        }
        this.next();
        return inner;
      }
      if (t.type === 'eof') {
        throw new MathError('invalid_syntax', 'Expression ended unexpectedly', t.pos, 'Complete the expression.');
      }
      throw new MathError('unexpected_token', `Unexpected "${t.value}"`, t.pos);
    } finally {
      this.depth--;
    }
  }
}

function canStartImplicitProduct(t: Token): boolean {
  if (t.type === 'num' || t.type === 'ident' || t.type === 'lparen') return true;
  return false;
}

function negTerm(n: Node): Node {
  if (n.type === 'neg') return n.arg;
  if (n.type === 'num') return num(-n.value);
  return neg(n);
}

/** flatten nested adds, distribute sign */
function flattenAdd(terms: Node[]): AddNode {
  const out: Node[] = [];
  for (const t of terms) {
    if (t.type === 'add') out.push(...t.terms);
    else out.push(t);
  }
  return add(...out);
}

function flattenMul(factors: Node[]): MulNode {
  const out: Node[] = [];
  for (const f of factors) {
    if (f.type === 'mul') out.push(...f.factors);
    else out.push(f);
  }
  return mul(...out);
}

function popFactors(factors: Node[]): Node {
  // helper for % mod: combine current factors into product then mod
  const last = factors.pop()!;
  if (factors.length === 0) return last;
  return flattenMul([...factors, last]);
}

function canonicalFunc(name: string, args: Node[]): Node {
  switch (name) {
    case 'arcsin': return fn('asin', ...args);
    case 'arccos': return fn('acos', ...args);
    case 'arctan': return fn('atan', ...args);
    case 'log10': return fn('log', ...args);
    case 'fact': return fn('factorial', ...args);
    default: return fn(name, ...args);
  }
}

// ---------- public API ----------

export interface ParsedDefinition {
  /** function name when input was `f(x)=…` */
  fname?: string;
  /** parameter list for definitions */
  params?: string[];
  /** plain variable assignment when input was `a=5` */
  assignVar?: string;
  /** expression body (rhs) */
  node: Node;
  /** top-level relation (eq/cmp) if present */
  relation?: Node;
}

export function parse(src: string): Node {
  const p = new Parser(src);
  return p.parseTop();
}

/**
 * Parse a workspace line. Handles:
 *   f(x) = expr       → definition (node is eq with func lhs)
 *   a = 5             → assignment
 *   y = expr          → assignment (plot helper treats as function body)
 *   expr = expr       → equation (relation)
 *   expr < 0          → inequality
 *   expr              → expression
 */
export function parseLine(src: string): ParsedDefinition {
  const node = parse(src);
  if (node.type === 'eq') {
    const lhs = node.lhs;
    if (lhs.type === 'var' && !(lhs.name in CONSTANTS)) {
      return { assignVar: lhs.name, node: node.rhs, relation: node };
    }
    if (lhs.type === 'func' && lhs.args.every((a) => a.type === 'var')) {
      return { fname: lhs.name, params: lhs.args.map((a) => (a as { type: 'var'; name: string }).name), node: node.rhs, relation: node };
    }
    return { node, relation: node };
  }
  if (node.type === 'cmp') return { node, relation: node };
  return { node };
}
