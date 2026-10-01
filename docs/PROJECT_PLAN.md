# MathLab — Project Plan

**MathLab: Interactive Mathematics Laboratory**
A production-quality web application for exploring mathematics through symbolic
computation, numerical computation, interactive graphs, simulations, statistics,
geometry, matrices, calculus, and AI-assisted explanations.

---

## 1. Product Definition

MathLab is a mathematical laboratory that combines:

- **Symbolic math environment** (expression parser, simplification, solving)
- **Graphing calculator** (interactive 2D + 3D)
- **Interactive classroom** (lessons, exercises)
- **Scientific notebook** (experiments, projects, history, export)
- **Visualization platform** (calculus animations, statistics charts, geometry)

Target users: students, teachers, researchers, independent learners.

### Guiding principles

1. Real functionality only — no fake buttons, no placeholder production data.
2. Deterministic, testable mathematics. The math engine (not an LLM) is the
   source of truth for every computed result.
3. AI is an *assistant layer*: it explains verified results from the math
   engine; it never fabricates numbers.
4. Every major UI action connects to real logic (engine call or API call).
5. Modular architecture: frontend / backend / math engines / shared types are
   separate packages.

## 2. Repository Analysis (Phase 0)

At project start the repository contained only `README.md` ("# Qwen") with a
single initial commit — effectively empty. No framework, package manager, or
configuration existed. Decision: initialize a fresh npm-workspaces monorepo.

Environment constraints discovered:

| Item        | Value                                   |
|-------------|-----------------------------------------|
| Node.js     | v20.20.2                                |
| npm         | 10.8.2                                  |
| RAM         | ~2 GB (favor lightweight dependencies)  |
| Native deps | better-sqlite3 prebuilds verified OK    |

## 3. Architecture Summary

```
mathlab/
├── apps/
│   ├── web/          React 18 + Vite SPA (all labs, workspace, learn, auth UI)
│   └── api/          Express + better-sqlite3 REST API (auth, projects,
│                     experiments, sharing, datasets, tutor proxy)
├── packages/
│   ├── math-engine/  Parser, algebra, calculus, equations, sequences,
│                     complex numbers, numeric methods  (pure TS, zero deps)
│   ├── matrix-engine/Vectors, matrices, eigen, Gaussian elimination
│   ├── stats-engine/ Descriptive stats, distributions, regression
│   ├── geometry-engine/ Points/lines/circles/polygons, intersections,
│                     transformations, measurements
│   └── shared/       Zod schemas + DTO types shared by web & api
└── docs/             This plan + architecture, roadmap, etc.
```

The graph/3D/calculus/statistics/geometry *rendering* lives in `apps/web` as
dedicated modules (`src/graph`, `src/threed`, …) because they are canvas/SVG
concerns; the underlying computations live in the engine packages so they can
be unit-tested headlessly. This deviation from the suggested folder list is
justified in `ARCHITECTURE.md`.

## 4. Delivery Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Repository analysis, planning docs | ✅ |
| 1 | Monorepo foundation, CI scripts, base UI shell, DB, auth | ✅ |
| 2 | Math core: tokenizer/parser/evaluator, simplify, solve, variables | ✅ |
| 3 | 2D graphing: cartesian/polar/parametric/implicit, zoom/pan, roots, intersections, extrema | ✅ |
| 4 | Calculus lab: limits, derivatives, integrals, tangent/secant, Riemann sums | ✅ |
| 5 | Matrix lab + Statistics lab (datasets, CSV import, charts, regression) | ✅ |
| 6 | Geometry lab + 3D Lab (surfaces, vector fields, camera) | ✅ |
| 7 | Experiments + Projects + Sharing + Export | ✅ |
| 8 | Learn: lesson system with interactive embeds + exercises | ✅ |
| 9 | AI Tutor with math-engine verification | ✅ |
| 10 | Production hardening: security, perf, a11y, tests, build | ✅ |

Each phase ends with: tests → typecheck → lint → build → fix → commit.

## 5. Quality Gate (definition of done)

- All math functions covered by unit tests with known expected values.
- API endpoints covered by integration tests (auth, ownership, sharing).
- `npm run build` succeeds; `npm test` green; `npm run typecheck` clean.
- Responsive layouts verified at 375 px and desktop widths.
- No secrets committed; `.env` gitignored; server validates all input (Zod).
- Errors surface as friendly messages, never raw stack traces.
