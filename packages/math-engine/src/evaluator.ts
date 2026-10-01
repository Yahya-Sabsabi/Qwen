import { MathError } from './errors';
import { Node, NumNode } from './ast';
import { CONSTANTS, parse } from './parser';

export type Scope = Record<string, number | ((...args: number[]) => number)>;

/** Lanczos approximation of Γ(z), accurate ~1e-13 on tested domain. */
export function gammaFn(z: number): number {
  if (Number.isNaN(z)) return NaN;
  if (z <= 0 && Number.isInteger(z)) return NaN; // poles
  // reflection for negative non-integers
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  }
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.501539990855557, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  const x = z - 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

export function factorialInt(n: number): number {
  if (!Number.isInteger(n) || n < 0) {
    // extend via gamma for non-integers
    if (n < 0 && Number.isInteger(n)) throw new MathError('domain_error', `factorial is undefined for ${n}`);
    return gammaFn(n + 1);
  }
  if (n > 170) return Infinity;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

export const BUILTINS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: (x) => Math.tan(x),
  cot: (x) => 1 / Math.tan(x),
  sec: (x) => 1 / Math.cos(x),
  csc: (x) => 1 / Math.sin(x),
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  coth: (x) => Math.cosh(x) / Math.sinh(x),
  exp: Math.exp,
  ln: Math.log,
  log: (x, base) => (base === undefined ? Math.log10(x) : Math.log(x) / Math.log(base)),
  log2: Math.log2,
  log10: Math.log10,
  logb: (base, x) => Math.log(x) / Math.log(base),
  sqrt: (x) => (x < 0 ? NaN : Math.sqrt(x)),
  cbrt: Math.cbrt,
  abs: Math.abs,
  sign: Math.sign,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  mod: (a, b) => (b === 0 ? NaN : ((a % b) + b) % b),
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
  hypot: (...xs) => Math.hypot(...xs),
  gcd: (...xs) => xs.reduce((a, b) => gcd(a, b)),
  lcm: (a, b) => (a === 0 || b === 0 ? 0 : Math.abs(Math.trunc(a) * Math.trunc(b)) / gcd(a, b)),
  gamma: gammaFn,
  lgamma: (x) => Math.log(Math.abs(gammaFn(x))),
  factorial: factorialInt,
  re: () => NaN,
  im: () => NaN,
};

const DOMAIN_FUNCS = new Set(['sqrt', 'ln', 'log', 'log2', 'log10', 'asin', 'acos']);

function checkDomain(name: string, args: number[], value: number): void {
  if (DOMAIN_FUNCS.has(name)) {
    if (name.startsWith('log') || name === 'ln') {
      if (args.some((a) => a <= 0)) {
        throw new MathError('domain_error', `${name}() requires a positive argument`, undefined, `Try ${name}(abs(x)) or restrict the domain.`);
      }
    } else if (name === 'asin' || name === 'acos') {
      if (args.some((a) => a < -1 || a > 1)) {
        throw new MathError('domain_error', `${name}() requires an argument in [-1, 1]`);
      }
    } else if (name === 'sqrt') {
      if (args.some((a) => a < 0)) {
        throw new MathError('domain_error', 'square root of a negative number', undefined, 'Use complex mode or restrict the domain.');
      }
    }
  }
  if (Number.isNaN(value) && !DOMAIN_FUNCS.has(name)) {
    // propagate NaN silently — renderers treat as gap
  }
}

/** Evaluate AST numerically with scope. Throws MathError on hard errors. */
export function evaluate(node: Node, scope: Scope = {}): number {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'const': {
      const v = CONSTANTS[node.name];
      if (v === undefined) throw new MathError('unknown_identifier', `Unknown constant "${node.name}"`);
      return v;
    }
    case 'var': {
      const v = scope[node.name];
      if (v === undefined) {
        if (node.name in CONSTANTS) return CONSTANTS[node.name];
        throw new MathError('unknown_identifier', `Unknown variable "${node.name}"`, undefined, 'Define it first (e.g. `' + node.name + '=1`) or add a slider.');
      }
      if (typeof v === 'function') {
        throw new MathError('invalid_syntax', `"${node.name}" is a function — call it like ${node.name}(x)`);
      }
      return v;
    }
    case 'add': {
      let s = 0;
      for (const t of node.terms) s += evaluate(t, scope);
      return s;
    }
    case 'mul': {
      // IEEE semantics: 0 * inf is NaN, not a silent 0 — guard mixed cases
      let p = 1;
      let sawZero = false;
      let sawInf = false;
      for (const f of node.factors) {
        const v = evaluate(f, scope);
        if (v === 0) sawZero = true;
        if (!Number.isFinite(v)) sawInf = true;
        p *= v;
      }
      if (sawZero && sawInf) return NaN;
      return p;
    }
    case 'pow': {
      const b = evaluate(node.base, scope);
      const e = evaluate(node.exp, scope);
      if (b === 0 && e < 0) throw new MathError('division_by_zero', '0 raised to a negative power');
      if (b < 0 && !Number.isInteger(e) && Number.isFinite(e)) {
        // (-8)^(1/3) style: handle rational thirds when representable
        const inv = 1 / e;
        if (Math.abs(inv - Math.round(inv)) < 1e-9 && Math.round(inv) % 2 !== 0) {
          return -Math.pow(-b, e);
        }
        return NaN;
      }
      return Math.pow(b, e);
    }
    case 'neg':
      return -evaluate(node.arg, scope);
    case 'fact': {
      const v = evaluate(node.arg, scope);
      return factorialInt(v);
    }
    case 'func': {
      const user = scope[node.name];
      if (typeof user === 'function') {
        const vals = node.args.map((a) => evaluate(a, scope));
        try {
          return user(...vals);
        } catch (err) {
          if (err instanceof MathError) throw err;
          throw new MathError('domain_error', `Error evaluating ${node.name}(${vals.join(', ')})`);
        }
      }
      const builtin = BUILTINS[node.name];
      if (!builtin) {
        throw new MathError('unknown_function', `Unknown function "${node.name}"`, undefined, 'Supported: sin, cos, tan, ln, log, exp, sqrt, abs, …');
      }
      const vals = node.args.map((a) => evaluate(a, scope));
      if (node.name === 'piecewise') {
        throw new MathError('not_supported', 'piecewise() must be used with condition objects');
      }
      if (node.name === 'if') {
        // if(cond, a, b) where cond evaluates truthy (nonzero)
        return vals[0] !== 0 ? vals[1] : vals[2] ?? NaN;
      }
      const out = builtin(...vals);
      checkDomain(node.name, vals, out);
      return out;
    }
    case 'eq': {
      const l = evaluate(node.lhs, scope);
      const r = evaluate(node.rhs, scope);
      return Math.abs(l - r) < 1e-12 ? 1 : 0;
    }
    case 'cmp': {
      const l = evaluate(node.lhs, scope);
      const r = evaluate(node.rhs, scope);
      const ok = node.op === '<' ? l < r : node.op === '<=' ? l <= r : node.op === '>' ? l > r : l >= r;
      return ok ? 1 : 0;
    }
    case 'piecewise': {
      for (const cse of node.cases) {
        if (evaluate(cse.cond, scope) === 1) return evaluate(cse.value, scope);
      }
      return NaN;
    }
  }
}

/** Compile once → fast repeated evaluation (used heavily by graph sampling). */
export interface CompiledFn {
  (vars: Record<string, number>): number;
  node: Node;
  source: string;
}

const compileCache = new Map<string, { node: Node; source: string }>();

export function compile(node: Node, source: string): CompiledFn {
  compileCache.set(source, { node, source });
  const fn = ((vars: Record<string, number>) => evaluate(node, vars as Scope)) as CompiledFn;
  fn.node = node;
  fn.source = source;
  return fn;
}

export function evalString(src: string, scope: Scope = {}): number {
  return evaluate(parse(src), scope);
}

export function isNumNode(n: Node): n is NumNode {
  return n.type === 'num';
}
