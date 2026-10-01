import { Node, num, vari, add, mul, pow, neg, fn } from './ast';
import { simplify } from './simplify';
import { evaluate } from './evaluator';
import { MathError } from './errors';

/**
 * Symbolic differentiation. Returns simplified AST of d(node)/d(var).
 * Falls back to a numeric-difference placeholder node (ndiff) when no closed
 * form is derivable — the evaluator resolves ndiff via central differences.
 */
export function diff(node: Node, variable = 'x'): Node {
  return simplify(dnode(node, variable));
}

function dnode(node: Node, v: string): Node {
  switch (node.type) {
    case 'num':
      return num(0);
    case 'const':
      return num(0);
    case 'var':
      return node.name === v ? num(1) : num(0);
    case 'neg':
      return neg(dnode(node.arg, v));
    case 'add':
      return add(...node.terms.map((t) => dnode(t, v)));
    case 'mul': {
      // product rule generalized over n factors
      const terms: Node[] = [];
      for (let i = 0; i < node.factors.length; i++) {
        const parts: Node[] = [];
        for (let j = 0; j < node.factors.length; j++) {
          parts.push(j === i ? dnode(node.factors[j], v) : node.factors[j]);
        }
        terms.push(mul(...parts));
      }
      return add(...terms);
    }
    case 'pow': {
      const { base, exp } = node;
      const db = dnode(base, v);
      const de = dnode(exp, v);
      const hasBaseVar = dependsOn(base, v);
      const hasExpVar = dependsOn(exp, v);
      if (!hasExpVar) {
        // power rule: n * x^(n-1) * dx
        return mul(exp, pow(base, add(exp, num(-1))), db);
      }
      if (!hasBaseVar && base.type === 'num') {
        // a^g: a^g * ln(a) * dg
        return mul(node, fn('ln', base), de);
      }
      // general: f^g * (g' ln f + g f'/f)
      return mul(node, add(mul(de, fn('ln', base)), mul(de, divg(base))), mul(db, pow(base, add(exp, num(-1)))));
    }
    case 'fact':
      // derivative of factorial only numerically
      return fn('ndiff', node, vari(v));
    case 'func': {
      const du = dnode(node.args[0] ?? num(0), v);
      const outer = funcDerivative(node.name, node.args);
      if (outer) return mul(outer, du);
      // unknown / user-defined single-arg function: numeric derivative fallback
      if (node.args.length === 1) return fn('ndiff', node, vari(v));
      throw new MathError(
        'not_supported',
        `Cannot differentiate ${node.name}(…) with ${node.args.length} arguments symbolically or numerically w.r.t. a single variable`,
      );
    }
    default:
      return fn('ndiff', node, vari(v));
  }
}

function funcDerivative(name: string, args: Node[]): Node | null {
  const x = args[0];
  if (!x) return null;
  switch (name) {
    case 'sin': return fn('cos', x);
    case 'cos': return neg(fn('sin', x));
    case 'tan': return pow(fn('sec', x), num(2));
    case 'cot': return neg(pow(fn('csc', x), num(2)));
    case 'sec': return mul(fn('sec', x), fn('tan', x));
    case 'csc': return neg(mul(fn('csc', x), fn('cot', x)));
    case 'asin': return pow(sub1sq(x), num(-0.5));
    case 'acos': return neg(pow(sub1sq(x), num(-0.5)));
    case 'atan': return pow(add(num(1), mul(x, x)), num(-1));
    case 'sinh': return fn('cosh', x);
    case 'cosh': return fn('sinh', x);
    case 'tanh': return add(num(1), neg(pow(fn('tanh', x), num(2))));
    case 'exp': return fn('exp', x);
    case 'ln': return pow(x, num(-1));
    case 'log': return pow(mul(x, fn('ln', num(10))), num(-1));
    case 'log2': return pow(mul(x, fn('ln', num(2))), num(-1));
    case 'sqrt': return mul(num(0.5), pow(x, num(-0.5)));
    case 'cbrt': return mul(num(1 / 3), pow(x, num(-2 / 3)));
    case 'abs': return fn('sign', x);
    case 'sign': return num(0);
    case 'floor':
    case 'ceil':
    case 'round':
      return num(0);
    default:
      return null;
  }
}

export function dependsOn(node: Node, v: string): boolean {
  const seen = new Set<string>();
  collect(node, seen);
  return seen.has(v);
}
function collect(n: Node, out: Set<string>): void {
  switch (n.type) {
    case 'var':
      out.add(n.name);
      break;
    case 'add':
      n.terms.forEach((t) => collect(t, out));
      break;
    case 'mul':
      n.factors.forEach((f) => collect(f, out));
      break;
    case 'pow':
      collect(n.base, out);
      collect(n.exp, out);
      break;
    case 'neg':
    case 'fact':
      collect(n.arg, out);
      break;
    case 'func':
      n.args.forEach((a) => collect(a, out));
      break;
    case 'eq':
    case 'cmp':
      collect(n.lhs, out);
      collect(n.rhs, out);
      break;
    default:
      break;
  }
}

/** nth derivative symbolically (bounded n). */
export function diffN(node: Node, order: number, v = 'x'): Node {
  let cur = node;
  for (let k = 0; k < order; k++) cur = diff(cur, v);
  return cur;
}

/** Numeric derivative with h chosen by step-size heuristics (5-point stencil). */
export function numericDerivative(f: (x: number) => number, x: number, order = 1): number {
  if (order === 1) {
    const h = Math.max(1e-6, Math.abs(x) * 1e-6);
    const fm2 = safe(f, x - 2 * h);
    const fm1 = safe(f, x - h);
    const fp1 = safe(f, x + h);
    const fp2 = safe(f, x + 2 * h);
    return (-fm2 + 8 * fm1 - 8 * fp1 + fp2) / (12 * h);
  }
  if (order === 2) {
    // Richardson-extrapolated central second difference: combine h and h/2
    // estimates to cancel the O(h²) error term → O(h⁴) accuracy.
    const h = Math.max(1e-3, Math.abs(x) * 1e-3);
    const d2 = (step: number) => (safe(f, x - step) - 2 * safe(f, x) + safe(f, x + step)) / (step * step);
    const big = d2(h);
    const small = d2(h / 2);
    return (16 * small - big) / 15;
  }
  // generic: recursive central difference
  const step = (fn2: (t: number) => number, pt: number, k: number): number => {
    const h = Math.max(1e-3, Math.abs(pt) * 1e-3);
    return (stepDiff(fn2, pt + h, k - 1) - stepDiff(fn2, pt - h, k - 1)) / (2 * h);
  };
  const stepDiff = (fn2: (t: number) => number, pt: number, k: number): number =>
    k === 0 ? fn2(pt) : step(fn2, pt, k);
  return stepDiff(f, x, order);
}

function safe(f: (x: number) => number, x: number): number {
  try {
    return f(x);
  } catch {
    return NaN;
  }
}

/** Compile node to closure over one variable; ndiff resolved numerically. */
export function compileFn(node: Node, variable = 'x'): (t: number) => number {
  return (t: number) => {
    try {
      return evalWithNdiff(node, { [variable]: t });
    } catch (err) {
      if (err instanceof MathError) throw err;
      return NaN;
    }
  };
}

/** evaluate() wrapper that resolves ndiff(expr, var) nodes numerically. */
export function evalWithNdiff(node: Node, scope: Record<string, number>): number {
  if (node.type === 'func' && node.name === 'ndiff') {
    const inner = node.args[0];
    const vname = node.args[1]?.type === 'var' ? node.args[1].name : 'x';
    const x = scope[vname];
    if (typeof x !== 'number') throw new MathError('unknown_identifier', `ndiff requires numeric "${vname}"`);
    const f = (t: number) => evalWithNdiff(inner, { ...scope, [vname]: t });
    return numericDerivative(f, x);
  }
  // recurse through plain nodes so nested ndiffs inside funcs get handled
  const hasNdiff = (n: Node): boolean => {
    if (n.type === 'func' && n.name === 'ndiff') return true;
    switch (n.type) {
      case 'add': return n.terms.some(hasNdiff);
      case 'mul': return n.factors.some(hasNdiff);
      case 'pow': return hasNdiff(n.base) || hasNdiff(n.exp);
      case 'neg': return hasNdiff(n.arg);
      case 'func': return n.args.some(hasNdiff);
      default: return false;
    }
  };
  if (!hasNdiff(node)) return evaluate(node, scope);
  switch (node.type) {
    case 'add':
      return node.terms.reduce((s, t) => s + evalWithNdiff(t, scope), 0);
    case 'mul':
      return node.factors.reduce((p, f) => p * evalWithNdiff(f, scope), 1);
    case 'neg':
      return -evalWithNdiff(node.arg, scope);
    case 'pow':
      return evaluate(powOf(node, scope), scope);
    case 'func':
      return evaluate(funcResolved(node, scope), scope);
    default:
      return evaluate(node, scope);
  }
}

function powOf(node: Node & { type: 'pow' }, scope: Record<string, number>): Node {
  const b = evalWithNdiff(node.base, scope);
  const e = evalWithNdiff(node.exp, scope);
  return pow(num(b), num(e));
}

function funcResolved(node: Node & { type: 'func' }, scope: Record<string, number>): Node {
  const args = node.args.map((a) => {
    if (hasNdiffAny(a)) return a; // keep symbolic args for user funcs like sum()
    return num(evalWithNdiff(a, scope));
  });
  return fn(node.name, ...args);
}

function hasNdiffAny(n: Node): boolean {
  if (n.type === 'func' && n.name === 'ndiff') return true;
  switch (n.type) {
    case 'add': return n.terms.some(hasNdiffAny);
    case 'mul': return n.factors.some(hasNdiffAny);
    case 'pow': return hasNdiffAny(n.base) || hasNdiffAny(n.exp);
    case 'neg': return hasNdiffAny(n.arg);
    case 'func': return n.args.some(hasNdiffAny);
    default: return false;
  }
}

/** 1 - x² (for asin/acos derivatives) */
function sub1sq(x: Node): Node {
  return add(num(1), neg(mul(x, x)));
}
/** 1/x without depending on simplify's normalization order */
function divg(base: Node): Node {
  return pow(base, num(-1));
}
