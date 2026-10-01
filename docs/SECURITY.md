# MathLab — Security

## Threat model summary

Web app with authenticated users creating/sharing mathematical documents.
Main risks: credential compromise, IDOR on projects/experiments/datasets,
XSS via stored content, CSRF on cookie auth, DoS via expensive computation or
upload floods, secret leakage (AI key), injection into SQL.

## Implemented controls

### Authentication
- Passwords hashed with **scrypt** (N=16384, r=8, p=1, 32-byte salt) —
  memory-hard, node builtin, timing-safe compare (`crypto.timingSafeEqual`).
- Opaque **session tokens**: 32 random bytes; only SHA-256 hash stored;
  cookie flags `HttpOnly; SameSite=Lax; Secure(prod); Path=/`. Sliding 30-day
  expiry, absolute 90-day cap. Logout deletes server row (instant revoke).
- Account recovery: single-use reset tokens (hashed, 15-min TTL) emailed via
  pluggable mailer interface (dev logs link).
- Modular `AuthProvider` (local now; OAuth later) — routes don't know the
  mechanism.

### Authorization
- Every mutating service call takes `userId` from session and applies an
  **ownership predicate** (`WHERE id=? AND user_id=?`) — IDOR-safe by
  construction; 404 (not 403) on foreign resources to avoid enumeration.
- Role field reserved for admin actions; checks centralized in `requireRole`.
- Public share endpoints return **read-only snapshots**; no route accepts
  writes keyed by share token. Viewer slider changes are local to the
  browser session — owner's stored doc is untouched.

### Input validation & sanitization
- Zod schemas on every endpoint (types shared with client via @mathlab/shared).
- Stored docs are structured JSON matching a whitelist schema — free-form
  HTML rejected; React escapes all rendered text (no dangerouslySetInnerHTML
  anywhere). LaTeX-ish math rendered by our own formatter, not innerHTML.
- Expression strings parsed by math-engine (own grammar) — never `eval()`;
  parser rejects unknown identifiers; AST depth ≤ 512, length ≤ 10 000 chars.
- CSV upload: size cap 2 MB, line cap 100k, delimiter sniffing, numeric cell
  coercion with bad-row report; filename never used in filesystem paths.

### Injection
- 100% parameterized SQL (better-sqlite3 prepared statements). No string
  concatenation into queries. Table/column names static.

### Rate limiting & DoS
- In-memory token bucket limiter keyed by IP (+ userId): auth 10/min,
  tutor 20/min, writes 60/min, global 300/min. 429 with Retry-After.
- Computation budget: server-side evaluation caps iterations; heavy math
  runs client-side anyway (browser sandbox). Body limit 1 MB JSON.

### Secrets & transport
- `.env` gitignored; committed `.env.example` only. `SESSION_SECRET` required
  in production (boot fails fast otherwise). Tutor API key lives **only** in
  server env; browser talks to `/api/v1/tutor` proxy. Pre-commit hygiene:
  repo scanned; no secrets present.
- Production expects TLS termination at reverse proxy (Caddy/Nginx examples
  in infrastructure/); HSTS recommended there. CSP header set by app:
  `default-src 'self'; img-src 'self' data:; connect-src 'self'`.

### Logging & privacy
- Activity logs record actions, not request bodies. Failed-login rate limits
  blunt brute force. Error responses use generic codes; stack traces go to
  server logs only.

## Checklist (verified in CI/tests)

- [x] register/login/logout/me flow integration-tested
- [x] wrong password → identical error shape as unknown email (no user enum)
- [x] cross-user access returns 404 (tested)
- [x] unauthenticated writes rejected (tested)
- [x] share token cannot be used to mutate (route absent + tested)
- [x] oversized/invalid payloads rejected pre-DB (tested)
- [x] rate limiter returns 429 (tested)
- [x] no secrets in bundle (`npm run build` output grep in CI script)
- [x] security headers asserted in API tests
