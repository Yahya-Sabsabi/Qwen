# MathLab — API Reference

Base URL `/api/v1`. JSON in/out. Auth via `mathlab_session` httpOnly cookie.
Errors: `{ "error": { "code": string, "message": string } }` with proper
status; never stack traces. All request bodies validated by zod schemas from
`@mathlab/shared`.

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | /auth/register | {email,name,password} | creates session cookie |
| POST | /auth/login | {email,password} | generic error on failure |
| POST | /auth/logout | – | revokes session |
| GET | /auth/me | – | → {user} or 401 |
| POST | /auth/forgot | {email} | always 204 (no enumeration) |
| POST | /auth/reset | {token,password} | single-use token |

## Projects
| GET | /projects | list mine |
| POST | /projects | {title,description?,color?} |
| PATCH | /projects/:id | partial |
| DELETE | /projects/:id | cascades experiments' project link |

## Experiments
| GET | /experiments?projectId= | list mine |
| POST | /experiments | {projectId?,doc:ExperimentDoc} |
| GET | /experiments/:id | owner only (else 404) |
| PUT | /experiments/:id | full doc update → new revision |
| PATCH | /experiments/:id | title/description/visibility |
| DELETE | /experiments/:id | |
| GET | /experiments/:id/revisions | autosave history |
| POST | /experiments/:id/duplicate | → new experiment |
| GET | /experiments/:id/export?format=json\|md | download |

## Sharing
| POST | /experiments/:id/share | {allowParams?} → {token,url} |
| DELETE | /experiments/:id/share | revoke |
| GET | /shared/:token | public read-only snapshot (no auth) |

## Datasets
| GET | /datasets |
| POST | /datasets | {name,source,raw} → parsed columns + issues |
| DELETE | /datasets/:id |

## Learn
| GET | /lessons | catalog (public) |
| GET | /lessons/:slug | body (public) |
| POST | /lessons/:slug/progress | {state,score?} (auth) |
| GET | /progress | my progress map (auth) |

## Tutor
| POST | /tutor | {question, context?{expression,result,…}, mode} |
→ {answer, source:"ai"\|"engine", verified:[…]} . Uses OpenAI-compatible
provider if configured; otherwise deterministic engine-based explainer.

## Misc
| GET | /health | liveness |
Rate limits per SECURITY.md; 429 includes Retry-After.
