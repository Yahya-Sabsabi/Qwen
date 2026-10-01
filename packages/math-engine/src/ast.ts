export type Node =
  | NumNode
  | VarNode
  | ConstNode
  | AddNode
  | MulNode
  | PowNode
  | NegNode
  | FuncNode
  | EqNode
  | CmpNode
  | FactNode
  | PiecewiseNode;

export interface NumNode {
  type: 'num';
  value: number;
}
export interface VarNode {
  type: 'var';
  name: string;
}
export interface ConstNode {
  type: 'const';
  name: string; // pi, e, tau, phi
}
/** n-ary flattened sum: terms include signs (subtraction = add of neg) */
export interface AddNode {
  type: 'add';
  terms: Node[];
}
/** n-ary flattened product: factors may include Pow with -1 for division */
export interface MulNode {
  type: 'mul';
  factors: Node[];
}
export interface PowNode {
  type: 'pow';
  base: Node;
  exp: Node;
}
export interface NegNode {
  type: 'neg';
  arg: Node;
}
export interface FuncNode {
  type: 'func';
  name: string; // sin, ln, abs, … or user-defined fn call handled by evaluator scope
  args: Node[];
}
export interface EqNode {
  type: 'eq';
  lhs: Node;
  rhs: Node;
}
export interface CmpNode {
  type: 'cmp';
  op: '<' | '<=' | '>' | '>=';
  lhs: Node;
  rhs: Node;
}
export interface FactNode {
  type: 'fact';
  arg: Node;
}
export interface PiecewiseNode {
  type: 'piecewise';
  cases: { value: Node; cond: CmpNode | EqNode }[];
}

// ---------- constructors ----------
export const num = (value: number): NumNode => ({ type: 'num', value });
export const vari = (name: string): VarNode => ({ type: 'var', name });
export const konst = (name: string): ConstNode => ({ type: 'const', name });
export const add = (...terms: Node[]): AddNode => ({ type: 'add', terms });
export const mul = (...factors: Node[]): MulNode => ({ type: 'mul', factors });
export const pow = (base: Node, exp: Node): PowNode => ({ type: 'pow', base, exp });
export const neg = (arg: Node): NegNode => ({ type: 'neg', arg });
export const fn = (name: string, ...args: Node[]): FuncNode => ({ type: 'func', name, args });
export const eq = (lhs: Node, rhs: Node): EqNode => ({ type: 'eq', lhs, rhs });
export const cmp = (op: CmpNode['op'], lhs: Node, rhs: Node): CmpNode => ({ type: 'cmp', op, lhs, rhs });

export function isNum(n: Node): n is NumNode {
  return n.type === 'num';
}

/** Collect free variable names (excluding constants & known functions). */
export function freeVars(n: Node, out: Set<string> = new Set()): Set<string> {
  switch (n.type) {
    case 'num':
    case 'const':
      break;
    case 'var':
      out.add(n.name);
      break;
    case 'add':
    case 'mul':
    case 'func': {
      const items = n.type === 'func' ? n.args : n.terms ?? n.factors;
      for (const c of items as Node[]) freeVars(c, out);
      break;
    }
    case 'pow':
      freeVars(n.base, out);
      freeVars(n.exp, out);
      break;
    case 'neg':
    case 'fact':
      freeVars(n.arg, out);
      break;
    case 'eq':
    case 'cmp':
      freeVars(n.lhs, out);
      freeVars(n.rhs, out);
      break;
    case 'piecewise':
      for (const cse of n.cases) {
        freeVars(cse.value, out);
        freeVars(cse.cond, out);
      }
      break;
  }
  return out;
}

/** Deterministic structural printer (round-trips through parse). */
export function nodeToString(n: Node): string {
  switch (n.type) {
    case 'num': {
      if (Number.isNaN(n.value)) return 'nan';
      if (!Number.isFinite(n.value)) return n.value > 0 ? 'inf' : '-inf';
      return String(n.value);
    }
    case 'var':
      return n.name;
    case 'const':
      return n.name;
    case 'add': {
      let s = '';
      n.terms.forEach((t, i) => {
        const ts = atom(t, true);
        if (i === 0) s = ts;
        else if (ts.startsWith('-')) s += ' - ' + ts.slice(1);
        else s += ' + ' + ts;
      });
      return s || '0';
    }
    case 'mul':
      return n.factors.map((f) => atom(f, false)).join('*');
    case 'pow':
      return `${atom(n.base, false)}^${wrap(n.exp)}`;
    case 'neg':
      return '-' + atom(n.arg, false);
    case 'fact':
      return atom(n.arg, false) + '!';
    case 'func':
      return `${n.name}(${n.args.map(nodeToString).join(',')})`;
    case 'eq':
      return `${nodeToString(n.lhs)}=${nodeToString(n.rhs)}`;
    case 'cmp':
      return `${nodeToString(n.lhs)}${n.op}${nodeToString(n.rhs)}`;
    case 'piecewise':
      return `piecewise(${n.cases.map((c) => `${nodeToString(c.value)}:${nodeToString(c.cond)}`).join(',')})`;
  }
}

function wrap(n: Node): string {
  const s = nodeToString(n);
  return needsParens(n) ? `(${s})` : s;
}
function atom(n: Node, inSum: boolean): string {
  const s = nodeToString(n);
  const paren = needsParens(n);
  if (paren && n.type === 'add' && !inSum) return `(${s})`;
  if (paren && n.type === 'add' && inSum) return `(${s})`;
  if (paren && (n.type === 'add' || n.type === 'cmp' || n.type === 'eq')) return `(${s})`;
  if (paren && n.type === 'mul') return inSum ? s : `(${s})`;
  return s;
}
function needsParens(n: Node): boolean {
  return n.type === 'add' || n.type === 'mul' || n.type === 'cmp' || n.type === 'eq' || n.type === 'piecewise';
}
