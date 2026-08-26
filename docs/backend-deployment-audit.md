# Backend Deployment Audit

Backend entry point: `backend/server.js`

Working directory: AgentAuth project root, `/Users/vigneshanand/Documents/Codex/2026-08-24/build/work/agentauth`

Dependency file: `package.json`

Current start command: local `npm start`; production `npm run start:prod`

Production import/application: this repository currently uses a Node HTTP server, not FastAPI. There is no `app = FastAPI(...)` entry point. The correct production entry point is `node scripts/start_production.mjs`, which starts `backend/server.js`.

Production host/port: `HOST=0.0.0.0` and platform-provided `PORT`

Current persistence layer: JSON demo store at `${DATA_DIR}/agentauth.json`; local default is `data/agentauth.json`, production default wrapper uses `/tmp/agentauth`.

Current required env vars:

- `AGENTAUTH_TOKEN_SECRET` required when `ENVIRONMENT=production`
- `PORT` supplied by the host
- `HOST=0.0.0.0` for public deployment
- `DATA_DIR` recommended for writable demo storage
- `FRONTEND_URL` or `CORS_ORIGIN` for restrictive CORS

Optional env vars:

- `PAYMENT_PROVIDER`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- risk weights and thresholds from `.env.example`

Existing health endpoint: `GET /health`

Health response includes environment, persistence mode, Razorpay configuration status, and payment provider status. It does not expose secrets.

Current CORS configuration: single allowed origin from `FRONTEND_URL` or `CORS_ORIGIN`; production fallback is a non-real invalid origin to avoid `*`.

Docker configuration: `Dockerfile` and `docker-compose.yml` exist.

Deployment blockers:

- The implementation is Node, despite the spec title saying FastAPI.
- Persistence is demo-grade JSON, not PostgreSQL.
- Public deployment requires a platform project and generated `AGENTAUTH_TOKEN_SECRET`.
- Render deployment requires Render account/API access; this workspace has no Render CLI, API key, or connector.
- Razorpay is intentionally not required for this deployment task.
