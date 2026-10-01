import { Node, num, vari, konst, add, mul, pow, neg, fn, isNum } from './ast';
import { evaluate } from './evaluator';

const EPS = 1e-12;

function isZero(n: Node): boolean {
  return n.type === 'num' && Math.abs(n.value) < EPS;
}
function isOne(n: Node): boolean {
  return n.type === 'num' && Math.abs(n.value - 1) < EPS;
}

/** Recursively simplify an AST: constant folding, identities, like terms. */
export function simplify(node: Node): Node {
  switch (node.type) {
    case 'add': {
      const terms = node.terms.map(simplify);
      let constSum = 0;
      const rest: Node[] = [];
      for (const t of terms) {
        if (isNum(t)) constSum += t.value;
        else rest.push(t);
      }
      // collect like terms (same structural key)
      const coeffMap = new Map<string, { coeff: number; base: Node }>();
      const others: Node[] = [];
      for (const t of rest) {
        const { coeff, base } = splitCoeff(t);
        const key = nodeKey(base);
        if (key !== null) {
          const cur = coeffMap.get(key);
          if (cur) cur.coeff += coeff;
          else coeffMap.set(key, { coeff, base });
        } else others.push(t);
      }
      const outTerms: Node[] = [];
      for (const [, v] of coeffMap) {
        if (Math.abs(v.coeff) < EPS) continue;
        if (isOne(num(v.coeff))) outTerms.push(v.base);
        else outTerms.push(mul(num(v.coeff), v.base));
      }
      outTerms.push(...others);
      if (Math.abs(constSum) > EPS || outTerms.length === 0) outTerms.push(num(constSum));
      if (outTerms.length === 0) return num(0);
      if (outTerms.length === 1) return outTerms[0];
      return add(...outTerms);
    }
    case 'mul': {
      const factors = node.factors.map(simplify);
      let prod = 1;
      let hasZero = false;
      const rest: Node[] = [];
      for (const f of factors) {
        if (isNum(f)) {
          prod *= f.value;
          if (f.value === 0) hasZero = true;
        } else rest.push(f);
      }
      if (hasZero) return num(0);
      // merge powers with same base
      const powMap = new Map<string, { base: Node; exp: number; symExps: Node[] }>();
      const others: Node[] = [];
      for (const f of rest) {
        if (f.type === 'pow') {
          const key = nodeKey(f.base);
          if (key !== null && isNum(f.exp)) {
            const cur = powMap.get(key);
            if (cur) cur.exp += f.exp.value;
            else powMap.set(key, { base: f.base, exp: f.exp.value, symExps: [] });
            continue;
          }
        }
        const key = nodeKey(f);
        if (key !== null) {
          const cur = powMap.get(key);
          if (cur) cur.exp += 1;
          else powMap.set(key, { base: f, exp: 1, symExps: [] });
        } else others.push(f);
      }
      const outFactors: Node[] = [];
      if (Math.abs(prod) > EPS || (powMap.size === 0 && others.length === 0)) outFactors.push(num(prod));
      for (const [, v] of powMap) {
        if (Math.abs(v.exp) < EPS) continue; // x^0 = 1
        if (Math.abs(v.exp - 1) < EPS) outFactors.push(v.base);
        else outFactors.push(pow(v.base, num(v.exp)));
      }
      outFactors.push(...others);
      if (outFactors.length === 0) return num(1);
      if (outFactors.length === 1) return outFactors[0];
      return mul(...outFactors);
    }
    case 'pow': {
      const b = simplify(node.base);
      const e = simplify(node.exp);
      if (isNum(b) && isNum(e)) {
        if (b < 0 && !Number.isInteger(e.value)) return pow(b, e);
        return num(Math.pow(b.value, e.value));
      }
      if (isZero(e)) return num(1); // x^0
      if (isOne(e)) return b; // x^1
      if (b.type === 'num' && b.value === 1) return num(1);
      if (b.type === 'pow' && isNum(b.exp) && isNum(e)) return pow(b.base, num(b.exp.value * e.value));
      return pow(b, e);
    }
    case 'neg': {
      const a = simplify(node.arg);
      if (isNum(a)) return num(-a.value);
      if (a.type === 'neg') return a.arg;
      if (a.type === 'add') return add(...a.terms.map((t) => neg(t)));
      return neg(a);
    }
    case 'fact': {
      const a = simplify(node.arg);
      if (isNum(a) && Number.isInteger(a.value) && a.value >= 0 && a.value <= 170) {
        let r = 1;
        for (let k = 2; k <= a.value; k++) r *= k;
        return num(r);
      }
      return fn('factorial', a);
    }
    case 'func': {
      const args = node.args.map(simplify);
      // fold numeric builtins
      if (args.every(isNum)) {
        try {
          const v = evaluate(fn(node.name, ...args), {});
          if (Number.isFinite(v) || Number.isNaN(v)) return num(v);
        } catch {
          /* keep symbolic */
        }
      }
      return fn(node.name, ...args);
    }
    case 'eq':
      return { type: 'eq', lhs: simplify(node.lhs), rhs: simplify(node.rhs) };
    case 'cmp':
      return { type: 'cmp', op: node.op, lhs: simplify(node.lhs), rhs: simplify(node.rhs) };
    case 'piecewise':
      return { type: 'piecewise', cases: node.cases.map((c) => ({ value: simplify(c.value), cond: c.cond })) };
    default:
      return node;
  }
}

// avoid static circular import at module-init time

/** split node into numeric coefficient and structural base */
function splitCoeff(n: Node): { coeff: number; base: Node } {
  if (n.type === 'num') return { coeff: n.value, base: num(1) };
  if (n.type === 'mul') {
    let coeff = 1;
    const rest: Node[] = [];
    for (const f of n.factors) {
      if (isNum(f)) coeff *= f.value;
      else rest.push(f);
    }
    if (rest.length === 0) return { coeff, base: num(1) };
    if (rest.length === 1) return { coeff, base: rest[0] };
    return { coeff, base: mul(...rest) };
  }
  if (n.type === 'neg') {
    const inner = splitCoeff(n.arg);
    return { coeff: -inner.coeff, base: inner.base };
  }
  return { coeff: 1, base: n };
}

/** stable structural key for like-term detection (variables/consts/powers of them) */
function nodeKey(n: Node): string | null {
  switch (n.type) {
    case 'var':
      return 'v:' + n.name;
    case 'const':
      return 'c:' + n.name;
    case 'pow': {
      const bk = nodeKey(n.base);
      const ek = nodeKey(n.exp);
      if (bk === null || ek === null) return null;
      return `p(${bk})^(${ek})`;
    }
    case 'mul': {
      const ks = n.factors.map(nodeKey);
      if (ks.some((k) => k === null)) return null;
      return 'm[' + ks.sort().join('*') + ']';
    }
    default:
      return null;
  }
}

/** Expand products over sums (and integer powers of sums). */
export function expand(node: Node): Node {
  const s = simplify(node);
  const result = expandOnce(s);
  if (structuralEqual(result, s)) return s;
  return simplify(expand(result));
}

function expandOnce(node: Node): Node {
  switch (node.type) {
    case 'add':
      return add(...node.terms.map(expandOnce));
    case 'mul': {
      let acc: Node[] = [expandOnce(node.factors[0])];
      for (let i = 1; i < node.factors.length; i++) {
        const other = expandToSummands(expandOnce(node.factors[i]));
        const next: Node[] = [];
        for (const a of acc) for (const b of other) next.push(distributePair(a, b));
        acc = next;
      }
      return add(...acc);
    }
    case 'pow': {
      const base = expandOnce(node.base);
      if (isNum(node.exp) && Number.isInteger(node.exp.value) && node.exp.value >= 2 && node.exp.value <= 8) {
        const summands = expandToSummands(base);
        let acc: Node[] = [num(1)];
        for (let k = 0; k < node.exp.value; k++) {
          const next: Node[] = [];
          for (const a of acc) for (const b of summands) next.push(distributePair(a, b));
          acc = next;
        }
        return add(...acc);
      }
      return pow(base, node.exp);
    }
    case 'neg':
      return neg(expandOnce(node.arg));
    default:
      return node;
  }
}

function distributePair(a: Node, b: Node): Node {
  const av = expandToSummands(a);
  const bv = expandToSummands(b);
  const out: Node[] = [];
  for (const x of av) for (const y of bv) out.push(simpleProduct(x, y));
  return add(...out);
}

function simpleProduct(a: Node, b: Node): Node {
  if (isNum(a) && isNum(b)) return num(a.value * b.value);
  if (isNum(a) && a.value === 1) return b;
  if (isNum(b) && b.value === 1) return a;
  // merge powers of same var
  const ka = nodeKey(a);
  const kb = nodeKey(b);
  if (ka !== null && ka === kb) {
    const ea = exponentOf(a);
    const eb = exponentOf(b);
    return pow(baseOf(a), num(ea + eb));
  }
  const fa = a.type === 'mul' ? a.factors : [a];
  const fb = b.type === 'mul' ? b.factors : [b];
  return mul(...fa, ...fb);
}

function expandToSummands(n: Node): Node[] {
  if (n.type === 'add') return n.terms;
  return [n];
}
function exponentOf(n: Node): number {
  if (n.type === 'pow' && isNum(n.exp)) return n.exp.value;
  return 1;
}
function baseOf(n: Node): Node {
  return n.type === 'pow' ? n.base : n;
}

function structuralEqual(a: Node, b: Node): boolean {
  return nodeKeyFull(a) === nodeKeyFull(b);
}
function nodeKeyFull(n: Node): string {
  switch (n.type) {
    case 'num':
      return `n${n.value}`;
    case 'var':
      return `v${n.name}`;
    case 'const':
      return `c${n.name}`;
    case 'add':
      return `A(${n.terms.map(nodeKeyFull).join('+')})`;
    case 'mul':
      return `M(${n.factors.map(nodeKeyFull).join('*')})`;
    case 'pow':
      return `P(${nodeKeyFull(n.base)},${nodeKeyFull(n.exp)})`;
    case 'neg':
      return `-(${nodeKeyFull(n.arg)})`;
    case 'fact':
      return `!(${nodeKeyFull(n.arg)})`;
    case 'func':
      return `${n.name}(${n.args.map(nodeKeyFull).join(',')})`;
    case 'eq':
      return `=${nodeKeyFull(n.lhs)}=${nodeKeyFull(n.rhs)}`;
    case 'cmp':
      return `${n.op}${nodeKeyFull(n.lhs)}${n.op}${nodeKeyFull(n.rhs)}`;
    case 'piecewise':
      return `pw(${n.cases.map((c) => nodeKeyFull(c.value)).join(';')})`;
  }
}

/** substitute variable name with value node */
export function substitute(node: Node, name: string, value: Node): Node {
  switch (node.type) {
    case 'var':
      return node.name === name ? value : node;
    case 'add':
      return add(...node.terms.map((t) => substitute(t, name, value)));
    case 'mul':
      return mul(...node.factors.map((f) => substitute(f, name, value)));
    case 'pow':
      return pow(substitute(node.base, name, value), substitute(node.exp, name, value));
    case 'neg':
      return neg(substitute(node.arg, name, value));
    case 'fact':
      return fn('factorial', substitute(node.arg, name, value));
    case 'func':
      return fn(node.name, ...node.args.map((a) => substitute(a, name, value)));
    case 'eq':
      return { type: 'eq', lhs: substitute(node.lhs, name, value), rhs: substitute(node.rhs, name, value) };
    case 'cmp':
      return { type: 'cmp', op: node.op, lhs: substitute(node.lhs, name, value), rhs: substitute(node.rhs, name, value) };
    default:
      return node;
  }
}

export function subValue(node: Node, name: string, value: number): Node {
  return substitute(node, name, num(value));
}

export { num as sNum, vari as sVar, konst as sConst };
