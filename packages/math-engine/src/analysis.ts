import { Node, freeVars, nodeToString } from './ast';
import { CONSTANTS, FUNCTIONS, parse } from './parser';
import { compileFn, diff } from './calculus';
import { simplify } from './simplify';
import { toPolynomial, solvePolynomial, findRootsBracketed, bisect, fmtNum } from './algebra';
import { MathError } from './errors';

/**
 * Function analysis used by the Graphing Lab (roots, extrema, intersections).
 * All results are computed with the deterministic engine — never hardcoded.
 */

/** Free variables that are not the primary plotting variable → interactive parameters. */
export function detectParameters(node: Node, mainVar = 'x'): string[] {
  const vars = [...freeVars(node)].filter((v) => v !== mainVar && !(v in CONSTANTS));
  return vars.sort();
}

export interface CriticalPoint {
  x: number;
  y: number;
  kind: 'min' | 'max';
}

export interface FunctionAnalysis {
  source: string;
  variable: string;
  definedEverywhere?: boolean;
  roots: number[];
  yIntercept: number | null;
  criticalPoints: CriticalPoint[];
  derivativeSource: string | null;
  notes: string[];
}

type F = (x: number) => number;

function safeVal(f: F, x: number): number {
  try {
    const v = f(x);
    return typeof v === 'number' ? v : NaN;
  } catch {
    return NaN;
  }
}

/** Numerical derivative (5-point stencil) of an already-compiled f. */
function numDeriv(f: F, x: number): number {
  const h = Math.max(1e-6, Math.abs(x) * 1e-6);
  const fm2 = safeVal(f, x - 2 * h);
  const fm1 = safeVal(f, x - h);
  const fp1 = safeVal(f, x + h);
  const fp2 = safeVal(f, x + 2 * h);
  return (-fm2 + 8 * fm1 - 8 * fp1 + fp2) / (12 * h);
}

function dedupe(values: number[], eps = 1e-6): number[] {
  const out: number[] = [];
  for (const v of values.sort((a, b) => a - b)) {
    if (!out.some((o) => Math.abs(o - v) < eps)) out.push(v);
  }
  return out;
}

/** Roots of f on [a,b]: exact polynomial solving when possible, bracketing otherwise. */
export function rootsOf(node: Node, variable: string, a: number, b: number): number[] {
  const p = toPolynomial(node, variable);
  if (p !== null && p.length <= 2) {
    // exact linear/quadratic solution
    const sol = solvePolynomial(p);
    return sol.real.filter((r) => r >= a && r <= b).map((r) => Math.round(r * 1e9) / 1e9);
  }
  // higher-degree or non-polynomial: deterministic bracketing over the view
  const f = compileFn(node, variable);
  const samples = Math.min(4000, Math.max(600, Math.round((b - a) * 80)));
  return findRootsBracketed(f, a, b, samples);
}

/** Local extrema via sign changes of the numerical derivative (parasite-free: require Δf small). */
export function criticalPointsOf(node: Node, variable: string, a: number, b: number): CriticalPoint[] {
  const f = compileFn(node, variable);
  const df: F = (x) => numDeriv(f, x);
  const samples = Math.min(2000, Math.max(400, Math.round((b - a) * 40)));
  const dx = (b - a) / samples;
  const out: CriticalPoint[] = [];
  let prevX = a;
  let prevD = df(a);
  for (let i = 1; i <= samples; i++) {
    const x = a + i * dx;
    const d = df(x);
    if (Number.isFinite(prevD) && Number.isFinite(d) && prevD * d < 0) {
      const cx = bisect(df, prevX, x, 1e-10, 100);
      const cy = safeVal(f, cx);
      // reject asymptote "critical" points: slope must genuinely vanish
      if (Number.isFinite(cy) && Math.abs(numDeriv(f, cx)) < 1e-3) {
        const kind = prevD > 0 ? 'max' : 'min';
        if (!out.some((o) => Math.abs(o.x - cx) < 1e-5)) out.push({ x: Math.round(cx * 1e9) / 1e9, y: Math.round(cy * 1e9) / 1e9, kind });
      }
    }
    prevX = x;
    prevD = d;
  }
  return out;
}

/** Full analysis used by the analysis panel. */
export function analyzeFunction(source: string, variable = 'x', view: { min: number; max: number } = { min: -10, max: 10 }): FunctionAnalysis {
  const node = parse(source);
  const notes: string[] = [];
  const f = compileFn(node, variable);
  const roots = rootsOf(node, variable, view.min, view.max);
  const y0 = safeVal(f, 0);
  let derivativeSource: string | null = null;
  try {
    derivativeSource = nodeToString(simplify(diff(node, variable)));
  } catch (err) {
    notes.push(err instanceof MathError ? `Derivative: ${err.message}` : 'Derivative unavailable.');
  }
  const cps = criticalPointsOf(node, variable, view.min, view.max);
  const params = detectParameters(node, variable);
  if (params.length > 0) notes.push(`Parameters detected: ${params.join(', ')} — add sliders to explore.`);
  return {
    source,
    variable,
    roots,
    yIntercept: view.min <= 0 && view.max >= 0 && Number.isFinite(y0) ? Math.round(y0 * 1e9) / 1e9 : null,
    criticalPoints: cps,
    derivativeSource,
    notes,
  };
}

export interface Intersection {
  x: number;
  y: number;
}

/** Intersections of two compiled functions over [a,b]. */
export function intersectionsOf(fa: F, fb: F, a: number, b: number, samples = 2000): Intersection[] {
  const d: F = (x) => {
    const va = safeVal(fa, x);
    const vb = safeVal(fb, x);
    return Number.isFinite(va) && Number.isFinite(vb) ? va - vb : NaN;
  };
  const xs = findRootsBracketed(d, a, b, samples);
  const out: Intersection[] = [];
  for (const x of xs) {
    const y = safeVal(fa, x);
    if (Number.isFinite(y)) out.push({ x: Math.round(x * 1e7) / 1e7, y: Math.round(y * 1e7) / 1e7 });
  }
  return out;
}

export function formatRoots(roots: number[]): string {
  if (roots.length === 0) return 'none in view';
  return roots.map(fmtNum).join(', ');
}
