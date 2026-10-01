# MathLab — Roadmap

Phases are sequential; each ends with green tests + typecheck + build and a
meaningful git commit. Status reflects the delivered state of this repo.

## Phase 0 — Repository Analysis ✅
- Inspected repo (empty except README), verified Node 20/npm, network,
  better-sqlite3 prebuilds. Wrote all planning docs.

## Phase 1 — Foundation ✅
- npm-workspaces monorepo: apps/web, apps/api, packages/{math,matrix,stats,
  geometry}-engine, shared.
- Strict TS configs, ESLint, Prettier, Vitest, unified npm scripts.
- Design system (CSS custom properties, dark scientific theme), app shell
  with full navigation (Home, Workspace, Graphing, Calculus, Algebra,
  Statistics, Matrices, Geometry, 3D Lab, Experiments, Learn, My Projects).
- SQLite migrations + Express skeleton + session auth (register/login/logout/
  me) + protected routes + rate limiting.

## Phase 2 — Mathematical Core ✅
- Tokenizer, Pratt parser, AST, compiler/evaluator with memoization.
- Simplify, expand, substitute, numeric+symbolic differentiation.
- Equation solving: linear, quadratic, higher-degree via companion/root
  isolation + Newton/bisection polish; inequalities; small linear systems.
- Sequences/series (sum notation, convergence exploration, Taylor).
- Complex numbers with polar form.

## Phase 3 — 2D Graphing ✅
- Canvas graph component: pan/zoom/wheel/pinch, grid, axes, labels.
- Cartesian, polar, parametric, implicit (marching squares).
- Multiple colored functions, hover coordinates, trace.
- Roots, intersections, extrema detection; derivative overlay; tangent line.

## Phase 4 — Calculus Lab ✅
- Limits (two-sided numeric + symbolics where possible), f′, f″ visualization.
- Tangent/secant sliders, area-under-curve, Riemann sums (left/right/mid/
  trapezoid) with n-slider, definite integrals (Simpson/Gauss).

## Phase 5 — Linear Algebra + Statistics ✅
- Matrix lab: editable grids, +−×, transpose, det, inverse, rank, step-by-
  step RREF display, eigenvalues/vectors.
- Stats lab: manual entry, paste, CSV upload/parse, full descriptive stats,
  quartiles/percentiles, distributions, correlation, regression, histogram,
  box plot, scatter, line chart.

## Phase 6 — Geometry + 3D ✅
- Geometry canvas: draggable points, segments/lines/circles/polygons/vectors,
  live distance/angle/area/intersection readouts, transformations.
- 3D Lab: z=f(x,y) surfaces, parametric surfaces, vector fields, 3D points,
  orbit/zoom/pan camera, axes & labels.

## Phase 7 — Experiments + Projects ✅
- Experiment CRUD (title, description, equations, params, graphs, notes,
  observations, conclusion), duplicate/rename/delete, JSON + Markdown export.
- Projects containing experiments; autosaved history; share links
  (`/experiment/:token`) with read-only public viewer that can still move
  permitted sliders against its own copy.

## Phase 8 — Learning Platform ✅
- Lesson content system (structured TS/JSON lessons: explanation, formulas,
  interactive embeds, exercises with auto-checking, progress tracking).
- Seed curriculum: calculus (derivatives/integrals/limits), algebra, stats.

## Phase 9 — AI Tutor ✅
- API proxy to optional OpenAI-compatible provider; engine-grounded prompts;
  deterministic rule-based fallback explainer (works with zero keys);
  practice-problem generation validated by the math engine.

## Phase 10 — Production Hardening ✅
- Security pass (see SECURITY.md), performance pass (memoization, rAF,
  lazy routes), accessibility pass (keyboard, focus, ARIA, contrast),
  responsive QA at 375/768/1440, error-boundary UX, full test suite,
  production build, Dockerfile + deployment docs.

## Future expansion
- OAuth providers (Google/GitHub) via AuthProvider interface.
- Teacher/classroom mode, exercise assignment, grading.
- Differential equations & physics simulations.
- Postgres adapter for multi-instance deploys.
- Plugin API for community lessons/experiments.
