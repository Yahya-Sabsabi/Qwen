# MathLab — Testing Strategy

Runner: **Vitest** across the workspace. Three layers:

1. **Unit — math engines** (the heart). Every public engine function has at
   least one test asserting an *analytically known* value, not snapshots:
   - parser/evaluator: precedence, implicit multiplication, domain errors
   - simplify/expand/diff: d/dx x³+sin x = 3x²+cos x …
   - solvers: x²−5x+6={2,3}; √2 irrational root check; Sturm bracket counts
   - limits: lim(sin x/x)=1, lim(1/x) at 0 → DNE/∞ cases
   - integrals: ∫₀¹ x²dx = 1/3 (Simpson tol 1e-9), ∫₀^π sin = 2
   - matrices: det([[1,2],[3,4]])=−2, known eigenpairs (symmetric 3×3),
     RREF step log correctness, inverse(A)·A ≈ I
   - stats: mean/median/quantiles on textbook samples, normal CDF Φ(1.96)≈0.975,
     Pearson r on perfect line = 1, regression recovers y=2x+1
   - geometry: shoelace areas, circle-line intersections tangent case,
     rotation composition identities
   - complex: i⁴=1, de Moivre, cube roots of unity sum ≈ 0
   Tolerances explicit per test; determinism enforced (no Date.now/random in
   engine paths).

2. **Integration — API** (`supertest` against Express app with temp SQLite
   file): auth lifecycle, ownership/IDOR 404s, experiment CRUD + revisions,
   dataset CSV import (valid + malformed), share create/read/revoke, tutor
   fallback (no key configured), validation rejections, rate-limit 429,
   security headers.

3. **Frontend logic**: pure modules (view transforms, marching squares,
   chart binning, lesson exercise checker, store reducers) unit-tested in
   jsdom-free environment where possible; component smoke tests minimal.

## Quality gates (root scripts)

```
npm run typecheck   # tsc -b strict across all packages/apps
npm run lint        # eslint (no-explicit-any warnings, react-hooks)
npm test            # vitest run (unit + integration)
npm run build       # vite build (web) + tsc (api) — must succeed
```

CI expectation: all four green before merge. Test fixtures live beside
engines (`*.test.ts` colocated; API tests in apps/api/test). Coverage target:
statements ≥ 80% for packages/* (enforced via vitest coverage thresholds on
engine packages).

## Manual QA matrix (Phase 10)

- Desktop 1440px, tablet 768px, phone 375px for each lab page.
- Keyboard-only traversal of workspace + forms; focus visible; ARIA labels on
  canvas controls; contrast AA on theme tokens.
- Error UX: invalid equation message, CSV garbage message, offline API toast,
  AI failure fallback chip.
- Persistence: save experiment → logout → login → reopen; share link opens
  read-only and survives owner edits.
