# Deployment Status

| Component | Status | Notes |
| --- | --- | --- |
| Public backend | LIVE | https://agentauth.vercel.app |
| HTTPS | LIVE | Vercel HTTPS is active at the production alias. |
| Health endpoint | REAL | `GET /health` works locally and is configured as health check. |
| API docs | REAL | `/docs` and `/openapi.json` are available. |
| Authentication | PARTIAL | Token signing exists; full login/RBAC is not implemented. |
| Ed25519 verification | REAL | Covered by tests and demo flow. |
| Delegation checks | REAL | Agent/merchant/order/amount/currency/expiry/revocation enforced. |
| Replay protection | REAL | Nonce registry blocks replay. |
| Fraud detection | REAL | Deterministic transaction fraud scoring. |
| Agent-aware risk | REAL | Deterministic behavior scoring and profiles. |
| Step-up | REAL | Step-up challenge approval flow works. |
| Audit history | REAL | Hash-chained audit events. |
| Production bind | REAL | Local wrapper uses host/port; Vercel uses serverless function handlers. |
| CORS | REAL | Restrictive env-driven origin, no wildcard production default. |
| Secret safety | REAL | `.env`, `.env.*`, data keys, and JSON store are ignored. |
| Razorpay Test API | NOT CONFIGURED | Explicitly on hold for this task. |
| PostgreSQL | NOT ADDED | Explicitly not added in this task. |
| Public smoke test script | REAL | `scripts/smoke_test_public_backend.py`. |
| Clean deploy config | READY | `vercel.json`, `api/[...path].js`, reusable app handler. |

## Deployment Attempt

Provider attempted: Vercel Serverless Functions

Requested public Vercel URL: https://agentauth.vercel.app

Actual public Vercel URL: https://agentauth.vercel.app

Local capability check:

```bash
command -v vercel
vercel whoami
```

Result: Vercel CLI is installed and authenticated as `anandvignesh23-rgb`.

Production deployment:

```text
https://agentauth.vercel.app
```

Latest deployment:

```text
https://agentauth-dqz9hbpso-anandvignesh23-rgbs-projects.vercel.app
```

## Verification Completed Locally

Production start command:

```bash
ENVIRONMENT=production NODE_ENV=production HOST=127.0.0.1 PORT=8793 DATA_DIR=/tmp/agentauth-vercel-prod-smoke JWT_SECRET=prod-smoke-secret npm run start
```

Health verification:

```bash
curl http://127.0.0.1:8793/health
```

Result:

```json
{
  "status": "ok",
  "environment": "production",
  "database": "demo_store",
  "data_dir": "/tmp/agentauth-vercel-prod-smoke",
  "razorpay_configured": false,
  "payment_provider": "razorpay",
  "payment_integration_available": false
}
```

Smoke test:

```bash
python3 scripts/smoke_test_public_backend.py --base-url http://127.0.0.1:8793 --run-demo-flow
```

Result: passed for `/health`, `/v1/agents`, `/openapi.json`, and `/v1/security-lab/run`.

## Verification Completed Remotely

Health verification:

```bash
curl https://agentauth.vercel.app/api/health
```

Result:

```json
{
  "status": "ok",
  "runtime": "vercel",
  "persistence": "temporary",
  "environment": "production",
  "database": "demo_store",
  "data_dir": "/tmp/agentauth",
  "razorpay_configured": false,
  "payment_provider": "razorpay",
  "payment_integration_available": false
}
```

Smoke test:

```bash
python3 scripts/smoke_test_public_backend.py --base-url https://agentauth.vercel.app --run-demo-flow
```

Result: passed for `/health`, `/v1/agents`, `/openapi.json`, and `/v1/security-lab/run`.
