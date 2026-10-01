# MathLab — Database Design

Engine: SQLite (better-sqlite3, WAL mode, foreign keys ON). Migrations:
numbered forward-only SQL files in `apps/api/src/db/migrations/`, applied in
one transaction at boot, tracked in `_migrations`. Rationale in TECH_STACK.md
(no ORM; hand-written SQL in repositories).

## Entity-relationship overview

```
users 1──* projects 1──* experiments *──1 shares (0..1 active)
users 1──* datasets    (owned tabular data + parsed columns)
users 1──* lesson_progress *──1 lessons (seeded content, not user data)
users 1──* activity_logs
experiments 1──* experiment_revisions (autosave history)
```

## Tables

### users
| col | type | notes |
|---|---|---|
| id | TEXT pk | uuid v4 |
| email | TEXT unique collate NOCASE | login identity |
| name | TEXT | display |
| password_hash | TEXT | `scrypt$N$r$p$salt$hash` format, never plaintext |
| role | TEXT | `student\|teacher\|admin` (authz hook) |
| created_at / updated_at | TEXT ISO | |

### sessions
| col | type | notes |
|---|---|---|
| id | TEXT pk | uuid |
| user_id | TEXT fk→users ON DELETE CASCADE | |
| token_hash | TEXT unique | sha256 of random 32-byte cookie token (raw token never stored) |
| expires_at | INTEGER epoch ms | sliding 30d, capped 90d |
| created_at | | index(user_id) |

### password_resets
token_hash, user_id, expires_at (15 min TTL), used_at — account recovery.

### projects
id, user_id(fk), title, description, color, archived, timestamps.
Index on user_id. A project groups experiments ("Quadratic Function Study").

### experiments
id, project_id(fk nullable), user_id(fk denormalized for cheap ownership),
title, description, doc(JSON: equations[], variables[], parameters[],
graphs[], calculations[], observations, conclusion — validated by shared zod
schema ExperimentDocSchema; this payload IS a document, so JSON column is the
correct relational choice), visibility(`private|shared`), timestamps.
Indexes: user_id, project_id.

### experiment_revisions
id, experiment_id(fk cascade), doc(JSON), saved_at — autosave history
(last 50 kept), enables "reopen previous work".

### datasets
id, user_id(fk), name, source(`manual|paste|csv`), raw TEXT,
columns(JSON [{name, values:number[]}], parse errors recorded server-side),
timestamps. Index user_id.

### shares
id, experiment_id(fk cascade), token(TEXT unique, 12-char url-safe random),
created_by(fk users), allow_params(INTEGER bool — can viewers move sliders),
revoked_at(nullable), created_at. Public viewer resolves
`GET /api/v1/shared/:token` → immutable snapshot copy; writes impossible by
design (no mutation route exists without session+ownership).

### lessons
id(slug pk), module, title, order_index, body(JSON blocks incl. interactive
embed specs + exercises with engine-checkable answers). Seeded from
versioned content; read-only at runtime.

### lesson_progress
user_id+lesson_id pk, state(`started|completed`), score, updated_at.

### activity_logs
id, user_id, kind(`login|save_experiment|share|export|tutor`…), detail(JSON),
created_at. Index (user_id, created_at). Audit trail without PII bloat.

## Integrity & validation

- FK enforcement per connection (`PRAGMA foreign_keys=ON`).
- All write payloads validated with zod schemas from `@mathlab/shared`
  before touching SQL; sizes bounded (doc ≤ 256 KB, dataset ≤ 2 MB).
- Transactions for multi-statement writes (e.g., create project+experiment).
- Deletes cascade intentionally (user deletion removes their content);
  shares revoke automatically with parent experiment deletion.

## Why SQLite

Single-node production deployment (see infrastructure/Dockerfile) makes an
embedded ACID engine ideal: zero ops, file-level backup, trivially fast for
this workload. The repository layer isolates SQL so a Postgres adapter is a
contained future change.
