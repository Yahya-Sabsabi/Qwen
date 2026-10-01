# MathLab — Architecture

## 1. High-level topology

```
┌─────────────────────────  Browser (apps/web)  ─────────────────────────┐
│  React SPA · Router · small app store · Canvas/SVG renderers           │
│                                                                        │
│  ┌────────────── client-side engines (packages/*) ────────────────┐    │
│  │ math-engine  matrix-engine  stats-engine  geometry-engine      │    │
│  │ (imported directly by the SPA — deterministic, offline-capable)│    │
│  └─────────────────────────────────────────────────────────────────┘    │
│  graph module (2D canvas) · threed module (software-raster canvas)      │
└───────────────┬───────────────────────────────────────────┬────────────┘
                │ fetch /api/v1 (JSON, cookie session)      │ dev: vite proxy
        ┌───────▼───────────────────────────────────────────▼───────┐
        │                 apps/api (Express)                        │
        │  routes → zod validation → services → repositories        │
        │  session auth (httpOnly cookie) · rate limit · safe hdrs  │
        ├────────────────────────────┬──────────────────────────────┤
        │ better-sqlite3 (WAL)       │ optional OpenAI-compatible   │
        │ database/mathlab.db        │ tutor provider proxy         │
        │ + forward migrations       │ (never trusted for math)     │
        └────────────────────────────┴──────────────────────────────┘
```

**Key decision:** the math engines are pure TypeScript libraries with zero
runtime dependencies. They run *in the browser* for interactivity (sliders,
graph updates at 60 fps) and can also run on the server for verification and
export. The same tested code produces every number, everywhere. Heavy work
never goes to the LLM.

## 2. Package layout and rationale

```
apps/
  web/            Vite + React SPA. Pages: Home, Workspace, Graphing,
                  Calculus, Algebra, Statistics, Matrices, Geometry, 3D Lab,
                  Experiments, Learn, My Projects, Auth, Shared viewer.
                  src/graph/   2D engine bindings (canvas renderer, view
                               transforms, hit-testing, sampling)
                  src/threed/  dependency-free software rasterizer for
                               surfaces/fields (chosen over three.js to keep
                               bundle small and behavior fully testable)
  api/            Express app. Layering: routes → middleware(auth, validate,
                  rateLimit) → services → db repositories. No business logic
                  in routes.

packages/
  math-engine/    tokenizer → Pratt parser → AST → evaluator + CAS-lite
                  (simplify/expand/diff), equation solver (linear/quadratic/
                  polynomial/numeric), limits, numeric integration, series,
                  complex numbers. Deterministic, memoized evaluation.
  matrix-engine/  dense matrices (row-major Float64Array): arithmetic, LU,
                  determinant, inverse, rank, RREF (step-by-step), eigen via
                  QR algorithm, Gram-Schmidt.
  stats-engine/   descriptive stats, quantiles, PDF/CDF for normal/uniform/
                  binomial/Poisson, Pearson/Spearman correlation, linear &
                  polynomial least-squares regression.
  geometry-engine/ Euclidean constructions model: points, segments, lines,
                  circles, polygons, vectors; distances, angles, areas,
                  intersections, rigid transformations. Pure math — the
                  draggable-canvas lives in web.
  shared/         Zod schemas + inferred TS types used by BOTH web and api
                  (ExperimentDoc, DatasetDoc, auth payloads, API errors).
```

Deviation from the brief's suggested tree: `graph-engine`, `calculus-engine`,
`simulation-engine`, `ai-engine`, `ui` were folded into existing packages or
into `apps/web/src` modules. Rationale: calculus belongs in `math-engine`
(it is math, not rendering); graphing is a rendering concern tied to the DOM
(canvas), kept in `web/src/graph` but its algorithms (sampling, implicit
marching-squares, intersection finding) are pure functions in `math-engine`;
a separate `ui` package would be premature abstraction for a single app.
This keeps dependency count low (principle #14) while remaining modular.

## 3. Data flow for a user expression

1. User types `f(x) = a*x^2 + b*x + c` in Workspace.
2. `math-engine.parse()` → AST (or precise error message with position).
3. AST compiled to closure; sliders mutate parameter scope; renderer samples
   the function across the viewport (memoized per (ast, scope) pair).
4. Symbolic queries (derivative, roots, vertex) come from the same engine.
5. Saving an experiment serializes a typed `ExperimentDoc` (zod-validated
   client *and* server) → POST `/api/v1/experiments`.

## 4. Persistence

SQLite (better-sqlite3, WAL mode) with numbered forward-only migration files
in `apps/api/src/db/migrations/*.sql`, applied in a transaction at boot.
Relational tables for users/projects/experiments/datasets/shares/lessons/
progress/activity; structured JSON columns *only* for genuinely document-like
payloads (AST snapshots, plot configs) — see DATABASE.md.

## 5. Authentication & authorization

Session-based: scrypt-hashed passwords (node builtin crypto — strong KDF,
zero native deps), random 32-byte session tokens stored hashed in DB,
delivered via `httpOnly; SameSite=Lax; Secure(prod)` cookie. Ownership checks
in every service. Modular `AuthProvider` interface leaves room for OAuth
later.

## 6. AI tutor boundary

`POST /api/v1/tutor` proxies an optional OpenAI-compatible endpoint.
Prompt template forces the model to receive *engine-computed context*
(parsed AST, verified numeric results) and to explain, not compute.
Client displays results side-by-side with engine output; any quantitative
claim shown in "Verified" chips comes from the math engine. Without an API
key the tutor falls back to a deterministic rule-based explainer built on
the engine (so the feature is never fake/dead).

## 7. Performance strategy

- Memoized parse/compile caches keyed by expression string.
- Slider-driven re-render uses rAF batching + adaptive sample counts.
- Implicit plots: marching squares on coarse grid (O(cells)).
- 3D: painter's-algorithm quads, resolution slider, no GPU needed.
- Expensive ops (eigen, big CSV) behind debounce; Web Worker used for
  dataset parsing + heavy sampling when available.
- Route-level code splitting via React.lazy per lab.

## 8. Error handling policy

Engine throws typed `MathError {code, position?, hint}`; UI maps codes to
friendly messages. API returns `{error:{code,message}}` validated shape;
5xx responses never include stacks. Client has global ErrorBoundary +
toast system.
