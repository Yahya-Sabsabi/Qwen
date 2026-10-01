# MathLab — Tech Stack

Chosen for: maturity, small footprint (~2 GB RAM build box), testability,
and long-term maintainability. Every dependency below is load-bearing.

## Runtime & tooling

| Concern        | Choice                     | Why |
|----------------|----------------------------|-----|
| Language       | TypeScript 5 (strict)      | One language across stack; shared types between web/api/packages |
| Monorepo       | npm workspaces             | Zero extra tooling (no turborepo/nx needed at this scale) |
| Frontend build | Vite 5                     | Fast dev server, first-class TS, tiny config |
| UI library     | React 18                   | Mature ecosystem, concurrent features for smooth graph updates |
| Routing        | react-router-dom 6         | Standard SPA routing incl. `/experiment/:token` public route |
| Server         | Express 4                  | Battle-tested, minimal, easy middleware layering |
| Database       | SQLite via better-sqlite3  | Synchronous, fast, embedded, transactional; trivially deployable; verified prebuilt binaries on Node 20 |
| Validation     | Zod 3                      | Single schema source for client + server + inferred TS types |
| Testing        | Vitest                     | Fast, shared runner for unit + API integration tests |
| Lint/Format    | ESLint 8 + Prettier        | Standard, low-config |
| Password hash  | node:crypto scrypt         | Strong KDF without native argon dependency |
| Sessions       | crypto.randomBytes tokens  | No JWT complexity; instant revocation |

## Deliberate omissions

- **No chart library** — graphs are custom canvas renderers bound to the
  tested math engines (full control of tangents, Riemann rectangles, implicit
  curves; smaller bundle than recharts/plotly).
- **No three.js** — 3D Lab uses a purpose-built software rasterizer
  (painter's algorithm) sufficient for surfaces/fields and fully testable.
- **No Redux/MUI/Tailwind** — plain CSS design system + tiny custom store
  keeps the bundle lean and the look distinctive (scientific, calm).
- **No ORM** — hand-written SQL in repositories with migrations gives exact
  control over schema/indexes; schema is modest and stable.

## Environment variables (server only)

```
API_PORT=4000
DATABASE_PATH=./database/mathlab.db
SESSION_SECRET=<random, min 32 chars>
TUTOR_API_KEY=<optional OpenAI-compatible key>
TUTOR_API_BASE=<optional base URL>
TUTOR_MODEL=<optional model id>
NODE_ENV=production
```

Frontend never reads secrets; tutor calls go through the API proxy.
