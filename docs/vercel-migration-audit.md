# Vercel Migration Audit

Date: 2026-08-26

## Current Backend

| Area | Finding | Classification |
| --- | --- | --- |
| Current server framework | Plain Node.js `node:http`; no Express/Fastify/FastAPI. | VERCEL_COMPATIBLE |
| Server entry point | Local server wrapper at `backend/server.js`; reusable handler extracted to `backend/app.js`. | VERCEL_COMPATIBLE |
| Route structure | Existing routes are centralized in one handler and exposed on Vercel through `api/[...path].js`; `/api/*` maps to the same route surface. | VERCEL_COMPATIBLE |
| Middleware | Minimal inline CORS/security headers and JSON body parsing. | VERCEL_COMPATIBLE |
| In-memory state | No standalone global `Map`/`Set` security store; state is loaded into a process-local `Store` instance from JSON. | BLOCKED_BY_PERSISTENCE |
| JSON/file persistence | `backend/store.js` uses JSON file reads/writes. On Vercel this is temporary `/tmp` storage only. | BLOCKED_BY_PERSISTENCE |
| Background timers | No long-lived background loops were found. Step-up expiry is checked when accessed. | VERCEL_COMPATIBLE |
| Process-level caches | `Store` is a module-level object in `backend/app.js`; not durable across serverless instances. | BLOCKED_BY_PERSISTENCE |
| Event emitters | None found. | NOT NEEDED |
| WebSocket usage | None found. | NOT NEEDED |
| SSE usage | None found. | NOT NEEDED |
| Filesystem writes | Demo seed, security lab key rotation, audit, token, nonce, and risk mutations write to JSON/PEM files. | BLOCKED_BY_PERSISTENCE |
| Cron/background jobs | None found. | NOT NEEDED |
| Global mutable variables | Store data is mutable in the process; acceptable for demo only, not production security state. | BLOCKED_BY_PERSISTENCE |
| Docker assumptions | Dockerfile and Render config remain for previous deployment targets, but Vercel uses `vercel.json`. | NOT NEEDED |
| PORT assumptions | Local wrapper reads `PORT`; Vercel functions do not depend on a listener or port. | VERCEL_COMPATIBLE |
| Long-running process assumptions | Local server still listens for dev; Vercel path uses request handler only. | VERCEL_COMPATIBLE |

## Migration Result

- `backend/app.js` exports `handleAgentAuthRequest(req, res)`.
- `backend/server.js` is now a local development/VM wrapper around the reusable handler.
- `api/[...path].js` is the Vercel serverless function entrypoint.
- `vercel.json` rewrites `/health`, `/v1/*`, and `/webhooks/*` into `/api/*` so existing clients continue to work.
- `GET /api/health` returns Vercel runtime metadata when `VERCEL=1`.
- `JWT_SECRET` is supported and required in production; `AGENTAUTH_TOKEN_SECRET` remains as a backwards-compatible alias.

## Security Status

The deployment is Vercel-compatible, but persistence remains temporary. Replay protection, one-time token consumption, step-up state, reputation history, and audit history still use the JSON store adapter. This preserves the buildathon/demo behavior but is not production-grade until Supabase/PostgreSQL persistence replaces `backend/store.js`.

Razorpay and PostgreSQL were intentionally not added in this migration.
