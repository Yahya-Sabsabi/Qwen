# MathLab — Math Engine Design

`packages/math-engine` (plus matrix/stats/geometry engines) is the source of
mathematical truth. Pure TypeScript, zero runtime dependencies, deterministic,
fully unit-tested with known expected values. Runs identically in browser and
Node (tests, API verification, export).

## 1. Pipeline

```
source text ──► tokenizer ──► Pratt parser ──► AST ──► compile ──► fn(scope)
                                   │                        │
                       simplify / expand / diff        memoized eval cache
                       solve / roots / extrema         adaptive sampling
```

### Tokenizer
Numbers (incl. decimals & scientific notation), identifiers, operators
`+ - * / ^ % !`, comparison `= < <= > >= ≠ ≤ ≥`, parens, comma, implicit
multiplication handled at parse time (`2x`, `3sin(x)`, `a(x+1)`). Unicode
aliases: `π → pi`, `√ → sqrt`, `· → *`, `× → *`, `÷ → /`, `θ`, `≤/≥/≠`.

### Parser (Pratt / top-down operator precedence)
Precedence: assignment (`f(x)=…`, `y=…`) < comparison < `+ -` < `* / %`
(implicit ×) < unary `- +`, factorial < `^` (right-assoc) < function call /
index. Produces a typed discriminated-union AST:

```ts
type Node = Num|Var|Const|Add|Sub|Mul|Div|Pow|Neg|Call|Eq|Compare|Factorial|Piecewise
```

Errors are `MathError { code, position, hint }` — e.g. `unexpected_token`,
`unbalanced_paren`, `unknown_identifier`, `division_by_zero`, `domain_error`
— mapped to friendly UI messages (never raw stacks).

### Evaluator
AST compiled to a closure `fn(vars: Record<string, number>) => number`.
Memoized per `(exprString, varName)`; NaN/±Infinity propagate as
`domain_error` signals that renderers treat as gaps (no fake points).

Built-ins: sin cos tan cot sec csc, asin acos atan, sinh cosh tanh,
exp ln log(log10) log2 logb, sqrt cbrt abs sign floor ceil round mod gcd lcm,
min max, gamma lgamma, factorial, sum/product notation helpers. Constants:
pi, e, tau, phi, inf.

## 2. CAS-lite operations

- **simplify**: constant folding, identity removal, like-term collection for
  polynomials, x^0/x^1 rules, even/odd simplification of trig on numerics.
- **expand**: distribute products/powers over sums (polynomial path exact).
- **substitute(node, var, value|node)**.
- **diff (symbolic)**: power rule, product/quotient/chain rules, table of
  elementary derivatives; falls back to verified numeric derivative when a
  closed form isn't derivable. Cross-checked against central differences in
  tests (tol 1e-6 relative).
- **collectPolynomial(node)** → coefficient array (degree detection) used by
  solver, Taylor, and rational analysis.

## 3. Solvers

- **Linear/quadratic**: exact formulas (numerically stable quadratic).
- **Polynomial degree ≤ 4**: exact radicals for cubic/quartic optional path;
  default is robust numeric: coefficient bounds → Descartes/Sturm-style sign
  scan on adaptive grid → bisection bracketing → Newton polish. Deterministic
  (fixed grid + fixed iteration count).
- **Systems of linear equations**: Gaussian elimination w/ partial pivoting
  (matrix-engine); small nonlinear systems via Newton-Jacobian.
- **Inequalities**: reduce to polynomial sign analysis via critical points
  (roots of numerator/denominator) → interval test points → union notation.
- **Numeric root finding** (any expression): bracketed Brent method.
- **Optimization**: golden-section search + derivative-based critical point
  refinement on intervals.

## 4. Calculus numerics

- **Limits**: two-sided sampling h=10^-k sequences with Richardson-style
  extrapolation; detects ±∞, DNE (disagreement beyond tolerance), removable
  singularities by simplification pass.
- **Integrals**: adaptive Simpson (default), Gauss–Kronrod 10–21 option;
  improper handling via variable transform or endpoint ε-approach.
- **Riemann sums**: left/right/midpoint/trapezoid/Simpson with n control —
  powers the Calculus Lab visualization.
- **Taylor/Maclaurin**: coefficients from symbolic derivatives at a point.

## 5. Sequences & series

`sum(k=1..n, expr)` / `product(...)` evaluation; convergence exploration:
partial-sum tables, ratio/root tests numerically, plot of sₙ vs n.

## 6. Complex numbers

`Complex` class: arithmetic, polar ↔ rectangular, argument, modulus, powers
(de Moivre), roots (all n-th roots), complex exponential/log. Powers the
complex-plane visualizations.

## 7. Matrix engine (`packages/matrix-engine`)

Row-major Float64Array wrapper. add/sub/scale/mul, transpose, LU
(partial pivot), determinant (LU), inverse (LU solve), rank (RREF ε-pivot),
rref with **step-by-step operation log** (drives Matrix Lab UI), eigenvalues
via Hessenberg reduction + shifted QR iteration, eigenvectors via null-space
solve, Gram–Schmidt, cross/dot norms. All tested against known matrices.

## 8. Stats engine (`packages/stats-engine`)

mean/median/mode/variance(sample & population)/stddev/quartiles (linear
interpolation, documented convention)/percentiles/IQR/skewness/kurtosis;
normal(erf-based)/uniform/binomial/Poisson PDF/CDF/quantile; Pearson &
Spearman correlation; simple/multiple/polynomial least-squares regression
(normal equations w/ QR); histogram binning (Sturges/FD/manual); CSV parser
with malformed-row reporting.

## 9. Geometry engine (`packages/geometry-engine`)

Primitive model (Point, Segment, Line, Circle, Polygon, Vector) with pure
functions: distance, angleAt, polygon area (shoelace), segment/line/circle
intersections, projections, reflection/rotation/translation/scaling maps,
circumcenter/incenter, tangents from external point. The web canvas binds
these to draggable handles.

## 10. Numerical policy

Determinism first: fixed grids, fixed iteration budgets, no randomness, no
time-dependent behavior. Tolerances centralized (`EPS = 1e-12`, display
rounding 10 significant digits). Every public function has at least one test
with an analytically known value.
