/**
 * @mathlab/math-engine — public API surface.
 *
 * Deterministic symbolic + numeric mathematics for MathLab.
 * Layers: tokenizer → parser (AST) → simplify / evaluate → algebra / calculus / numeric → workspace.
 */

// ---------- errors ----------
export { MathError, explainError } from './errors';
export type { MathErrorCode } from './errors';

// ---------- tokenizer ----------
export { tokenize, normalizeInput } from './tokenizer';
export type { Token, TokenType } from './tokenizer';

// ---------- AST ----------
export type {
  Node,
  NumNode,
  VarNode,
  ConstNode,
  AddNode,
  MulNode,
  PowNode,
  NegNode,
  FuncNode,
  EqNode,
  CmpNode,
  FactNode,
  PiecewiseNode,
} from './ast';
export {
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
  isNum,
  freeVars,
  nodeToString,
} from './ast';

// ---------- parser ----------
export { parse, parseLine, FUNCTIONS, CONSTANTS } from './parser';
export type { ParsedDefinition } from './parser';

// ---------- evaluator ----------
export { evaluate, evalString, compile, BUILTINS, gammaFn, factorialInt, isNumNode } from './evaluator';
export type { Scope, CompiledFn } from './evaluator';

// ---------- simplification ----------
export { simplify, expand, substitute, subValue } from './simplify';

// ---------- calculus ----------
export { diff, diffN, dependsOn, numericDerivative, compileFn, evalWithNdiff } from './calculus';

// ---------- algebra / solving ----------
export {
  toPolynomial,
  polyAdd,
  polyMul,
  polyEval,
  polyDerivative,
  polyDegree,
  polyToNode,
  trimPoly,
  solveEquation,
  solvePolynomial,
  findRootsBracketed,
  bisect,
  refineRoot,
  solveInequality,
  intervalToString,
  solveLinearSystem,
  fmtNum,
} from './algebra';
export type { PolyTerm, SolveResult, Interval } from './algebra';

// ---------- numeric analysis ----------
export {
  integrateSimpson,
  integrateGauss,
  riemannSum,
  limit,
} from './numeric';
export type { IntegralOptions, RiemannMethod, RiemannResult, LimitKind, LimitResult } from './numeric';

// ---------- workspace ----------
export { Workspace, fmt } from './workspace';
export type { Definition, Assignment } from './workspace';

// ---------- function analysis (graph lab support) ----------
export {
  detectParameters,
  rootsOf,
  criticalPointsOf,
  analyzeFunction,
  intersectionsOf,
  formatRoots,
} from './analysis';
export type { CriticalPoint, FunctionAnalysis, Intersection } from './analysis';

// ---------- interval notation ----------
export { intervalString } from './algebra';
