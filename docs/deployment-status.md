# Deployment Status

| Component | Status | Notes |
| --- | --- | --- |
| Public backend | BLOCKED | Render Free Web Service config is ready, but no Render API key/session/connector is available in this workspace to create the service. |
| HTTPS | BLOCKED | Requires a created Render service URL. |
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
| Production bind | REAL | Uses `HOST=0.0.0.0` and platform `PORT` in production. |
| CORS | REAL | Restrictive env-driven origin, no wildcard production default. |
| Secret safety | REAL | `.env`, `.env.*`, data keys, and JSON store are ignored. |
| Razorpay Test API | NOT CONFIGURED | Explicitly on hold for this task. |
| PostgreSQL | NOT YET | JSON demo store remains. |
| Public smoke test script | REAL | `scripts/smoke_test_public_backend.py`. |
| Clean deploy config | READY | `render.yaml`, `Dockerfile`, `start:prod`. |

## Deployment Attempt

Provider attempted: Render Free Web Service

Requested public Render URL: unavailable from this workspace

Actual public Render URL: not generated

Local capability check:

```bash
command -v render
printenv | rg '^RENDER'
```

Result: no Render CLI and no Render API key/session were available. No public URL was generated.

## Verification Completed Locally

Production start command:

```bash
ENVIRONMENT=production NODE_ENV=production HOST=127.0.0.1 PORT=8793 DATA_DIR=/tmp/agentauth-render-prod-smoke AGENTAUTH_TOKEN_SECRET=prod-smoke-secret npm run start:prod
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
  "data_dir": "/tmp/agentauth-render-prod-smoke",
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
