import { Node, num, vari, add, mul, pow, nodeToString } from './ast';
import { simplify, expand, substitute } from './simplify';
import { evaluate } from './evaluator';

export interface PolyTerm {
  coeff: number;
  deg: number;
}

/**
 * Extract polynomial coefficients (descending order not used — index = degree).
 * Returns null when node is not a polynomial in v with numeric coefficients.
 */
export function toPolynomial(node: Node, v: string): number[] | null {
  const flat = expand(simplify(node));
  return polyOf(flat, v);
}

function polyOf(n: Node, v: string): number[] | null {
  switch (n.type) {
    case 'num':
      return [n.value];
    case 'var':
      if (n.name === v) return [0, 1];
      return null; // other variable → not univariate polynomial
    case 'const':
      return null;
    case 'neg': {
      const p = polyOf(n.arg, v);
      return p ? p.map((c) => -c) : null;
    }
    case 'add': {
      let acc: number[] | null = [0];
      for (const t of n.terms) {
        const p = polyOf(t, v);
        if (!p) return null;
        acc = polyAdd(acc, p);
      }
      return trimPoly(acc);
    }
    case 'mul': {
      let acc: number[] = [1];
      for (const f of n.factors) {
        const p = polyOf(f, v);
        if (!p) return null;
        acc = polyMul(acc, p);
      }
      return trimPoly(acc);
    }
    case 'pow': {
      const base = polyOf(n.base, v);
      if (!base) return null;
      if (n.exp.type !== 'num' || !Number.isInteger(n.exp.value) || n.exp.value < 0 || n.exp.value > 64) return null;
      let acc: number[] = [1];
      for (let k = 0; k < n.exp.value; k++) acc = polyMul(acc, base);
      return trimPoly(acc);
    }
    default:
      return null;
  }
}

export function polyAdd(a: number[], b: number[]): number[] {
  const out = new Array(Math.max(a.length, b.length)).fill(0);
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return trimPoly(out);
}

export function polyMul(a: number[], b: number[]): number[] {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return trimPoly(out);
}

export function trimPoly(p: number[]): number[] {
  let end = p.length - 1;
  while (end > 0 && Math.abs(p[end]) < 1e-14) end--;
  return p.slice(0, end + 1);
}

export function polyEval(p: number[], x: number): number {
  let s = 0;
  for (let i = p.length - 1; i >= 0; i--) s = s * x + p[i];
  return s;
}

export function polyDerivative(p: number[]): number[] {
  if (p.length <= 1) return [0];
  return trimPoly(p.map((c, i) => (i === 0 ? 0 : c * i)).slice(1));
}

export function polyDegree(p: number[]): number {
  return trimPoly(p).length - 1;
}

/** AST builder from coefficient list (index = degree). */
export function polyToNode(p: number[], v: string): Node {
  const terms: Node[] = [];
  for (let d = p.length - 1; d >= 0; d--) {
    const c = p[d];
    if (Math.abs(c) < 1e-14) continue;
    if (d === 0) terms.push(num(roundNice(c)));
    else {
      const base: Node = d === 1 ? vari(v) : pow(vari(v), num(d));
      if (Math.abs(Math.abs(c) - 1) < 1e-12) terms.push(c > 0 ? base : { type: 'neg', arg: base });
      else terms.push(mul(num(roundNice(c)), base));
    }
  }
  if (terms.length === 0) return num(0);
  return add(...terms);
}

function roundNice(x: number): number {
  const r = Math.round(x * 1e10) / 1e10;
  return Object.is(r, -0) ? 0 : r;
}

// ---------- solving ----------

export interface SolveResult {
  real: number[];
  complex?: { re: number; im: number }[];
  method: 'linear' | 'quadratic' | 'numeric' | 'identity' | 'none';
  steps: string[];
}

/** Solve equation lhs = rhs for variable v (all forms). Deterministic. */
export function solveEquation(lhs: Node, rhs: Node, v = 'x'): SolveResult {
  const diffNode = simplify(add(lhs, { type: 'neg', arg: rhs }));
  const steps: string[] = [`Move everything to one side: ${nodeStr(diffNode)} = 0`];
  const p = toPolynomial(diffNode, v);
  if (p) {
    return solvePolynomial(p, steps);
  }
  // general numeric solve over scan window
  steps.push('Not a polynomial — scanning [-50, 50] and refining sign changes.');
  const f = (t: number) => evaluate(diffNode, { [v]: t });
  const roots = findRootsBracketed(f, -50, 50, 4000);
  return { real: roots, method: 'numeric', steps };
}

function nodeStr(n: Node): string {
  return nodeToString(n);
}

export function solvePolynomial(coeffs: number[], steps: string[] = []): SolveResult {
  const p = trimPoly([...coeffs]);
  const deg = polyDegree(p);
  if (deg < 0 || (deg === 0)) {
    const constant = p[0] ?? 0;
    if (Math.abs(constant) < 1e-12) return { real: [], method: 'identity', steps: ['0 = 0 — true for all values.'] };
    return { real: [], method: 'none', steps: [`${constant} = 0 has no solution.`] };
  }
  if (deg === 1) {
    const root = -p[0] / p[1];
    steps.push(`Linear: ${fmtCoef(p)} = 0 → x = ${roundNice(root)}`);
    return { real: [roundNice(root)], method: 'linear', steps };
  }
  if (deg === 2) {
    const [c, b, a] = [p[0], p[1], p[2]];
    const disc = b * b - 4 * a * c;
    steps.push(`Quadratic formula with a=${roundNice(a)}, b=${roundNice(b)}, c=${roundNice(c)}.`);
    steps.push(`Discriminant Δ = b² − 4ac = ${roundNice(disc)}.`);
    if (disc > 1e-14) {
      // numerically stable form
      const q = -0.5 * (b + Math.sign(b || 1) * Math.sqrt(disc));
      const r1 = q / a;
      const r2 = c / q;
      const roots = [r1, r2].sort((x, y) => x - y).map(roundNice);
      steps.push(`Δ > 0 → two real roots: x = ${roots.join(', ')}`);
      return { real: roots, method: 'quadratic', steps };
    }
    if (Math.abs(disc) <= 1e-14) {
      const r = -b / (2 * a);
      steps.push(`Δ = 0 → double root x = ${roundNice(r)}`);
      return { real: [roundNice(r)], method: 'quadratic', steps };
    }
    const re = -b / (2 * a);
    const im = Math.sqrt(-disc) / (2 * a);
    steps.push(`Δ < 0 → no real roots; complex: ${roundNice(re)} ± ${roundNice(Math.abs(im))}i`);
    return { real: [], complex: [{ re: roundNice(re), im: roundNice(Math.abs(im)) }, { re: roundNice(re), im: roundNice(-Math.abs(im)) }], method: 'quadratic', steps };
  }
  // higher degree: bracket & polish on bounded interval using Cauchy bound
  const lead = Math.abs(p[deg]);
  let maxAbs = 0;
  for (let i = 0; i < deg; i++) maxAbs = Math.max(maxAbs, Math.abs(p[i]) / lead);
  const bound = 1 + maxAbs;
  steps.push(`Degree ${deg}: searching within |x| ≤ ${roundNice(bound)} (Cauchy bound).`);
  const f = (t: number) => polyEval(p, t);
  const roots = findRootsBracketed(f, -bound, bound, Math.min(20000, 2000 * (deg + 1)));
  steps.push(`Found ${roots.length} real root(s).`);
  return { real: roots, method: 'numeric', steps };
}

function fmtCoef(p: number[]): string {
  return polyToNode(p, 'x') && nodeStr(polyToNode(p, 'x'));
}

/** deterministic bracketing root finder: grid scan + bisection + Newton polish */
export function findRootsBracketed(f: (x: number) => number, a: number, b: number, samples = 2000): number[] {
  const roots: number[] = [];
  const dx = (b - a) / samples;
  let prevX = a;
  let prevY = safeVal(f, a);
  for (let i = 1; i <= samples; i++) {
    const x = a + i * dx;
    const y = safeVal(f, x);
    if (Number.isFinite(prevY) && Number.isFinite(y)) {
      if (prevY === 0) pushUnique(roots, prevX);
      else if (y === 0) pushUnique(roots, x);
      else if (prevY * y < 0) {
        // only accept genuine crossings (not asymptote jumps)
        const r = bisect(f, prevX, x);
        if (Math.abs(safeVal(f, r)) < 1e-6) pushUnique(roots, r);
      }
    }
    prevX = x;
    prevY = y;
  }
  return roots.sort((u, w) => u - w).map((r) => roundNice(r));
}

function safeVal(f: (x: number) => number, x: number): number {
  try {
    const v = f(x);
    return Number.isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
}

export function bisect(f: (x: number) => number, a: number, b: number, tol = 1e-12, maxIter = 200): number {
  let fa = f(a);
  for (let i = 0; i < maxIter; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0 || (b - a) / 2 < tol) return m;
    if (fa * fm < 0) {
      b = m;
    } else {
      a = m;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

/** Brent-lite: bisection then Newton polish with fallback. */
export function refineRoot(f: (x: number) => number, df: (x: number) => number, x0: number): number {
  let x = x0;
  for (let i = 0; i < 60; i++) {
    const fx = f(x);
    if (Math.abs(fx) < 1e-13) break;
    const d = df(x);
    if (!Number.isFinite(d) || Math.abs(d) < 1e-14) break;
    const nx = x - fx / d;
    if (!Number.isFinite(nx)) break;
    x = nx;
  }
  return x;
}

export function pushUnique(arr: number[], v: number, eps = 1e-7): void {
  if (!arr.some((a) => Math.abs(a - v) < eps)) arr.push(v);
}

// ---------- inequalities ----------

export interface Interval {
  open: boolean;
  a: number;
  b: number;
}

/** Solve polynomial inequality expr <op> 0 via critical points. */
export function solveInequality(node: Node, op: '<' | '<=' | '>' | '>=', v = 'x'): { intervals: Interval[]; steps: string[] } {
  const steps: string[] = [];
  const p = toPolynomial(node, v);
  let criticals: number[];
  if (p) {
    const sol = solvePolynomial(p, steps);
    criticals = sol.real;
  } else {
    const f = (t: number) => evaluate(node, { [v]: t });
    criticals = findRootsBracketed(f, -50, 50, 4000);
    steps.push(`Numeric roots of boundary: ${criticals.join(', ') || 'none found'}`);
  }
  const pts = [...new Set(criticals)].sort((a, b) => a - b);
  const testPoints: number[] = [];
  if (pts.length === 0) testPoints.push(0);
  else {
    testPoints.push(pts[0] - 1);
    for (let i = 1; i < pts.length; i++) testPoints.push((pts[i - 1] + pts[i]) / 2);
    testPoints.push(pts[pts.length - 1] + 1);
  }
  const signs = testPoints.map((t) => evaluate(node, { [v]: t }) > 0);
  const includeEndpoints = op === '<=' || op === '>=';
  const wantPositive = op === '>' || op === '>=';
  // intervals: (-inf,p0),(p0,p1),...,(pn-1,inf) — count = pts+1
  const intervals: Interval[] = [];
  for (let i = 0; i < testPoints.length; i++) {
    if (signs[i] !== wantPositive) continue;
    const leftFinite = i > 0;
    const rightFinite = i < testPoints.length - 1;
    const a = leftFinite ? pts[i - 1] : -Infinity;
    const b = rightFinite ? pts[i] : Infinity;
    // endpoints included only when non-strict operator AND finite (±∞ always open)
    intervals.push({ a, b, open: !includeEndpoints });
  }
  steps.push(`Test-point sign analysis → ${intervals.length} solution interval(s).`);
  return { intervals, steps };
}

export function intervalToString(intervals: Interval[]): string {
  if (intervals.length === 0) return '∅ (no solution)';
  return intervals.map(intervalString).join(' ∪ ');
}

/** Bracket notation: [a, b] closed, (a, b) open, ±∞ always open. */
export function intervalString(iv: Interval): string {
  const lb = iv.open || !Number.isFinite(iv.a) ? '(' : '[';
  const rb = iv.open || !Number.isFinite(iv.b) ? ')' : ']';
  const av = iv.a === -Infinity ? '−∞' : fmtNum(iv.a);
  const bv = iv.b === Infinity ? '∞' : fmtNum(iv.b);
  return `${lb}${av}, ${bv}${rb}`;
}

export function fmtNum(x: number): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  const r = Math.round(x * 1e9) / 1e9;
  return String(Object.is(r, -0) ? 0 : r);
}

// ---------- linear systems ----------

/** Gaussian elimination for small systems (matrix-engine handles big ones). */
export function solveLinearSystem(rows: number[][], vars = ['x', 'y', 'z']): number[] | null {
  const m = rows.map((r) => [...r]);
  const nRows = m.length;
  const nCols = m[0].length - 1;
  let r = 0;
  for (let c = 0; c < nCols && r < nRows; c++) {
    let piv = r;
    for (let i = r + 1; i < nRows; i++) if (Math.abs(m[i][c]) > Math.abs(m[piv][c])) piv = i;
    if (Math.abs(m[piv][c]) < 1e-12) continue;
    [m[r], m[piv]] = [m[piv], m[r]];
    const pv = m[r][c];
    for (let j = c; j <= nCols; j++) m[r][j] /= pv;
    for (let i = 0; i < nRows; i++) {
      if (i !== r && Math.abs(m[i][c]) > 0) {
        const fct = m[i][c];
        for (let j = c; j <= nCols; j++) m[i][j] -= fct * m[r][j];
      }
    }
    r++;
  }
  // back substitution; reject underdetermined
  const sol = new Array(nCols).fill(NaN);
  for (let i = 0; i < nRows; i++) {
    let lead = -1;
    for (let j = 0; j < nCols; j++) if (Math.abs(m[i][j]) > 1e-12) { lead = j; break; }
    if (lead === -1) {
      if (Math.abs(m[i][nCols]) > 1e-9) return null; // inconsistent
      continue;
    }
    if (Math.abs(m[i][nCols]) < 1e-12 && Number.isNaN(sol[lead])) sol[lead] = 0;
    else if (Number.isNaN(sol[lead])) sol[lead] = m[i][nCols];
  }
  if (sol.some((s) => Number.isNaN(s))) return null;
  return sol;
}

export { substitute, simplify, expand };
