import { compileFn } from './calculus';
import { numericDerivative } from './calculus';
import { parse } from './parser';

/**
 * Numerical integration utilities. Deterministic, fixed budgets.
 */

export interface IntegralOptions {
  tol?: number;
  maxDepth?: number;
}

/** Adaptive Simpson quadrature of f on [a,b]. Handles endpoint singularities by eps-approach. */
export function integrateSimpson(f: (x: number) => number, a: number, b: number, opts: IntegralOptions = {}): number {
  const tol = opts.tol ?? 1e-10;
  const maxDepth = opts.maxDepth ?? 40;
  const fa = safe(f, a);
  const fb = safe(f, b);
  const fm = safe(f, (a + b) / 2);
  // if endpoints blow up, approach them numerically
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) {
    const eps = 1e-9;
    const na = Number.isFinite(fa) ? a : a + Math.sign(b - a) * eps;
    const nb = Number.isFinite(fb) ? b : b - Math.sign(b - a) * eps;
    return adaptive(f, na, nb, safe(f, na), safe(f, nb), safe(f, (na + nb) / 2), tol, maxDepth);
  }
  return adaptive(f, a, b, fa, fb, fm, tol, maxDepth);
}

function adaptive(
  f: (x: number) => number,
  a: number,
  b: number,
  fa: number,
  fb: number,
  fm: number,
  tol: number,
  depth: number,
): number {
  const m = (a + b) / 2;
  const whole = ((b - a) / 6) * (fa + 4 * fm + fb);
  if (depth <= 0) return whole;
  const lm = (a + m) / 2;
  const rm = (m + b) / 2;
  const flm = safe(f, lm);
  const frm = safe(f, rm);
  const left = ((m - a) / 6) * (fa + 4 * flm + fm);
  const right = ((b - m) / 6) * (fm + 4 * frm + fb);
  const refined = left + right;
  if (Math.abs(refined - whole) <= 15 * tol) return refined + (refined - whole) / 15;
  return adaptive(f, a, m, fa, fm, flm, tol / 2, depth - 1) + adaptive(f, m, b, fm, fb, frm, tol / 2, depth - 1);
}

function safe(f: (x: number) => number, x: number): number {
  try {
    const v = f(x);
    return typeof v === 'number' ? v : NaN;
  } catch {
    return NaN;
  }
}

/** Gauss–Legendre 8-point on arbitrary interval (non-adaptive, very accurate for smooth f). */
const GL_NODES = [-0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.1834346424956498, 0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
const GL_WEIGHTS = [0.1012285381520672, 0.2223810344533745, 0.3122328097439696, 0.3626039482623881, 0.3626039482623881, 0.3122328097439696, 0.2223810344533745, 0.1012285381520672];

export function integrateGauss(f: (x: number) => number, a: number, b: number): number {
  const mid = (a + b) / 2;
  const half = (b - a) / 2;
  let s = 0;
  for (let i = 0; i < 8; i++) s += GL_WEIGHTS[i] * safe(f, mid + half * GL_NODES[i]);
  return half * s;
}

export type RiemannMethod = 'left' | 'right' | 'midpoint' | 'trapezoid' | 'simpson';

export interface RiemannResult {
  value: number;
  n: number;
  method: RiemannMethod;
  rectangles: { x0: number; x1: number; height: number }[];
}

export function riemannSum(f: (x: number) => number, a: number, b: number, n: number, method: RiemannMethod): RiemannResult {
  const nn = Math.max(1, Math.min(2000, Math.round(n)));
  const dx = (b - a) / nn;
  let total = 0;
  const rects: { x0: number; x1: number; height: number }[] = [];
  for (let i = 0; i < nn; i++) {
    const x0 = a + i * dx;
    const x1 = x0 + dx;
    let h: number;
    if (method === 'left') h = safe(f, x0);
    else if (method === 'right') h = safe(f, x1);
    else if (method === 'midpoint') h = safe(f, (x0 + x1) / 2);
    else if (method === 'trapezoid') h = (safe(f, x0) + safe(f, x1)) / 2;
    else {
      // composite simpson needs even n — handle per-pair
      const xm = (x0 + x1) / 2;
      h = (safe(f, x0) + 4 * safe(f, xm) + safe(f, x1)) / 6;
    }
    if (!Number.isFinite(h)) h = 0;
    total += h * dx;
    rects.push({ x0, x1, height: h });
  }
  return { value: total, n: nn, method, rectangles: rects };
}

// ---------- limits ----------

export type LimitKind = 'value' | 'infinity' | '-infinity' | 'dne';
export interface LimitResult {
  kind: LimitKind;
  value?: number;
  left?: number;
  right?: number;
  detail: string;
}

/** Two-sided limit of expr at point (or ±∞ when point = ±Infinity). */
export function limit(nodeOrSource: unknown, variable: string, point: number, direction: 'both' | 'left' | 'right' = 'both'): LimitResult {
  const f = compileFrom(nodeOrSource, variable);
  if (Number.isInfinite(point)) {
    const v = limitAtInfinity(f, point > 0 ? 1 : -1);
    return v;
  }
  const hs = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7];
  const evalSide = (sign: 1 | -1): number => {
    const vals = hs.map((h) => safe(f, point + sign * h)).filter(Number.isFinite);
    if (vals.length === 0) return NaN;
    // Aitken-like extrapolation on last two samples
    const k = vals.length - 1;
    const l0 = vals[k - 1] ?? vals[k];
    const l1 = vals[k];
    return 2 * l1 - l0;
  };
  const L = direction !== 'right' ? evalSide(-1) : NaN;
  const R = direction !== 'left' ? evalSide(1) : NaN;
  const single = direction !== 'both' ? (direction === 'left' ? L : R) : undefined;

  if (single !== undefined) {
    if (Number.isNaN(single)) return { kind: 'dne', detail: `One-sided limit does not exist numerically.` };
    if (!Number.isFinite(single)) return { kind: single > 0 ? 'infinity' : '-infinity', detail: `Approaches ${single > 0 ? '+∞' : '−∞'}.` };
    return { kind: 'value', value: nice(single), detail: `≈ ${nice(single)}` };
  }
  if (Number.isNaN(L) || Number.isNaN(R)) {
    return { kind: 'dne', left: L, right: R, detail: 'Limit could not be evaluated from one side (domain issue).' };
  }
  if (!Number.isFinite(L) || !Number.isFinite(R)) {
    if (L === R || (L > 0 && R > 0 && !Number.isFinite(L) && !Number.isFinite(R))) {
      const inf = L > 0 || R > 0;
      return { kind: inf ? 'infinity' : '-infinity', left: L, right: R, detail: `Both sides diverge to ${inf ? '+∞' : '−∞'}.` };
    }
    return { kind: 'dne', left: L, right: R, detail: `Left → ${fmt(L)}, right → ${fmt(R)}: different behaviour.` };
  }
  const scale = Math.max(1, Math.abs(L), Math.abs(R));
  if (Math.abs(L - R) < 1e-6 * scale) {
    const v = (L + R) / 2;
    return { kind: 'value', value: nice(v), left: L, right: R, detail: `≈ ${nice(v)}` };
  }
  return { kind: 'dne', left: nice(L), right: nice(R), detail: `Left limit ${fmt(nice(L))} ≠ right limit ${fmt(nice(R))}.` };
}

function limitAtInfinity(f: (t: number) => number, dir: 1 | -1): LimitResult {
  const ts = [10, 100, 1000, 1e4, 1e5, 1e6].map((t) => t * dir);
  const vals = ts.map((t) => safe(f, t));
  const finite = vals.filter(Number.isFinite);
  if (finite.length >= 3) {
    const a = finite[finite.length - 2];
    const b = finite[finite.length - 1];
    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    if (Math.abs(b - a) < 1e-6 * scale) {
      return { kind: 'value', value: nice(b), detail: `Converges to ≈ ${nice(b)} as x → ${dir > 0 ? '+∞' : '−∞'}.` };
    }
  }
  const last = vals[vals.length - 1];
  if (Number.isNaN(last)) return { kind: 'dne', detail: 'Oscillates or undefined at infinity.' };
  if (!Number.isFinite(last)) return { kind: last > 0 ? 'infinity' : '-infinity', detail: `Diverges to ${last > 0 ? '+∞' : '−∞'}.` };
  // growing without bound check
  const prev = vals[vals.length - 2];
  if (Number.isFinite(prev) && Math.abs(last) > Math.abs(prev) * 3) {
    return { kind: last > 0 ? 'infinity' : '-infinity', detail: `Grows without bound (${fmt(last)} at x=${ts[ts.length - 1]}).` };
  }
  return { kind: 'dne', detail: `No stable value approached (samples ${vals.slice(-3).map(fmt).join(', ')}).` };
}

function compileFrom(src: unknown, variable: string): (t: number) => number {
  if (typeof src === 'string') return compileFn(parse(src), variable);
  if (typeof src === 'function') return src as (t: number) => number;
  return compileFn(src as never, variable);
}

function fmt(x: number): string {
  if (Number.isNaN(x)) return 'undefined';
  if (!Number.isFinite(x)) return x > 0 ? '+∞' : '−∞';
  return String(nice(x));
}

function nice(x: number): number {
  if (!Number.isFinite(x)) return x;
  const r = Math.round(x * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
}

/** derivative helper re-export for convenience */
export { numericDerivative };
