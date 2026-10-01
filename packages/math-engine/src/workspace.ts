import { Node } from './ast';
import { parse } from './parser';
import { evaluate, Scope } from './evaluator';
import { MathError } from './errors';

/**
 * Workspace session: holds definitions (f(x)=…), assignments (a=5), and
 * provides memoized evaluation for the UI. Deterministic & serializable.
 */
export interface Definition {
  name: string;
  params: string[];
  body: Node;
  source: string;
}

export interface Assignment {
  name: string;
  value: number;
  source: string;
}

/** Per-workspace memoization of user-function calls. Bounded & invalidated on mutation. */
class EvalCache {
  private map = new Map<string, number>();
  static MAX = 20_000;

  get(key: string): number | undefined {
    return this.map.get(key);
  }
  set(key: string, value: number): void {
    if (this.map.size > EvalCache.MAX) this.map.clear();
    this.map.set(key, value);
  }
  invalidate(name: string): void {
    for (const key of this.map.keys()) if (key.startsWith(name + '(')) this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

function cacheKey(name: string, args: number[]): string {
  return name + '(' + args.map((a) => a.toPrecision(15)).join(',') + ')';
}

export class Workspace {
  defs = new Map<string, Definition>();
  assigns = new Map<string, number>();
  private cache = new EvalCache();

  reset(): void {
    this.defs.clear();
    this.assigns.clear();
    this.cache.clear();
  }

  /** Execute one workspace line; returns description of what happened. */
  run(line: string): { kind: 'definition' | 'assignment' | 'value' | 'relation'; detail: string; value?: number } {
    const src = line.trim();
    if (!src || src.startsWith('#') || src.startsWith('//')) return { kind: 'value', detail: '' };
    // explicit function definition syntax first: f(x,t) = …
    const defMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*=(?!=)/.exec(src);
    if (defMatch && defMatch[2].trim() !== '') {
      const params = defMatch[2]
        .split(',')
        .map((s2) => s2.trim())
        .filter(Boolean);
      if (params.some((p) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(p))) {
        throw new MathError('invalid_syntax', `Invalid parameter in "${defMatch[0]}"`);
      }
      const bodyStr = src.slice(defMatch[0].length);
      const body = parse(bodyStr);
      this.defs.set(defMatch[1], { name: defMatch[1], params, body, source: src });
      this.cache.invalidate(defMatch[1]);
      return { kind: 'definition', detail: `Defined ${defMatch[1]}(${params.join(', ')})` };
    }
    const parsed = parse(src);
    if (parsed.type === 'eq') {
      const lhs = parsed.lhs;
      if (lhs.type === 'var' && !(lhs.name in KNOWN_CONSTS)) {
        const v = this.evalNode(parsed.rhs);
        this.assigns.set(lhs.name, v);
        this.cache.clear();
        return { kind: 'assignment', detail: `${lhs.name} = ${fmt(v)}`, value: v };
      }
      if (lhs.type === 'func' && lhs.args.every((a) => a.type === 'var')) {
        const params = lhs.args.map((a) => (a as { name: string }).name);
        this.defs.set(lhs.name, { name: lhs.name, params, body: parsed.rhs, source: src });
        this.cache.invalidate(lhs.name);
        return { kind: 'definition', detail: `Defined ${lhs.name}(${params.join(', ')})` };
      }
      // equation relation — solved lazily by caller
      return { kind: 'relation', detail: 'Equation entered.' };
    }
    if (parsed.type === 'cmp') {
      return { kind: 'relation', detail: 'Inequality entered.' };
    }
    const v = this.evalNode(parsed);
    return { kind: 'value', detail: fmt(v), value: v };
  }

  scope(extra: Record<string, number> = {}): Scope {
    const s: Scope = { ...extra };
    for (const [k, v] of this.assigns) if (!(k in s)) s[k] = v;
    for (const [k, d] of this.defs) {
      s[k] = (...args: number[]) => {
        if (args.length !== d.params.length) {
          throw new MathError('invalid_syntax', `${k}() expects ${d.params.length} argument(s), got ${args.length}`);
        }
        const inner: Scope = {};
        d.params.forEach((p, i) => (inner[p] = args[i]));
        // allow closure over workspace values
        const merged: Scope = { ...this.scope(inner), ...inner };
        const key = cacheKey(k, args);
        const cached = this.cache.get(key);
        if (cached !== undefined) return cached;
        const val = evaluate(d.body, merged);
        this.cache.set(key, val);
        return val;
      };
    }
    return s;
  }

  evalNode(node: Node, extra: Record<string, number> = {}): number {
    return evaluate(node, this.scope(extra));
  }

  eval(src: string, extra: Record<string, number> = {}): number {
    return this.evalNode(parse(src), extra);
  }

  /** serialize current state for experiments/history */
  snapshot(): { definitions: string[]; assignments: { name: string; value: number }[] } {
    return {
      definitions: [...this.defs.values()].map((d) => d.source),
      assignments: [...this.assigns.entries()].map(([name, value]) => ({ name, value })),
    };
  }

  restore(snap: { definitions: string[]; assignments: { name: string; value: number }[] }): void {
    this.reset();
    for (const a of snap.assignments ?? []) this.assigns.set(a.name, a.value);
    for (const d of snap.definitions ?? []) {
      try {
        this.run(d);
      } catch {
        /* skip stale definition */
      }
    }
  }
}

const KNOWN_CONSTS = new Set(['pi', 'e', 'tau', 'phi', 'inf']);

export function fmt(x: number): string {
  if (Number.isNaN(x)) return 'undefined';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '-∞';
  const abs = Math.abs(x);
  let s: string;
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-9)) s = x.toExponential(6);
  else s = String(Math.round(x * 1e10) / 1e10);
  return s === '-0' ? '0' : s;
}
