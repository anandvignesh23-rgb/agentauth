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
| Replay protection | REAL | PostgreSQL mode reserves nonces with `unique(agent_id, nonce)`. |
| Fraud detection | REAL | Deterministic transaction fraud scoring. |
| Agent-aware risk | REAL | Deterministic behavior scoring and profiles. |
| Step-up | REAL | Step-up challenge approval flow works. |
| Audit history | REAL | Hash-chained audit events. |
| Production bind | REAL | Local wrapper uses host/port; Vercel uses serverless function handlers. |
| CORS | REAL | Restrictive env-driven origin, no wildcard production default. |
| Secret safety | REAL | `.env`, `.env.*`, data keys, and JSON store are ignored. |
| Razorpay Test API | BLOCKED_BY_CREDENTIALS | Integration code is implemented; live order creation needs Vercel `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. |
| PostgreSQL | LIVE | Supabase project `qusdfmrpujmvsqeqxwom`; Vercel production uses the pooled `DATABASE_URL`. |
| Public smoke test script | REAL | `scripts/smoke_test_public_backend.py`. |
| Clean deploy config | READY | `vercel.json`, `api/[...path].js`, reusable app handler, Supabase migration. |

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

Immutable deployment URLs change on every redeploy. Use the production alias above for verification.

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
  "persistence": "supabase_postgres",
  "environment": "production",
  "database_connected": true,
  "database": "supabase_postgres",
  "razorpay_configured": false,
  "razorpay_webhook_configured": false,
  "payment_provider": "razorpay",
  "payment_integration_available": false
}
```

Smoke test:

```bash
python3 scripts/smoke_test_public_backend.py --base-url https://agentauth.vercel.app --run-demo-flow
```

Result: passed for `/health`, `/v1/agents`, `/openapi.json`, and `/v1/security-lab/run`.

Supabase persistence check:

```sql
select count(*) from authorization_requests;
select count(*) from nonce_records;
select count(*) from payment_authorization_tokens;
select count(*) from audit_events;
select count(*) from transaction_risk_snapshots;
```

Result: rows are present for the public smoke authorization flow in Supabase PostgreSQL.

## Razorpay Status

| Capability | Status |
| --- | --- |
| Provider abstraction | REAL |
| Razorpay Test provider | REAL WHEN CONFIGURED |
| Order creation route | REAL WHEN CONFIGURED |
| Razorpay Checkout UI handoff | REAL WHEN CONFIGURED |
| Checkout signature verification | REAL |
| Webhook raw-body verification | REAL |
| Webhook dedupe | REAL |
| Payment reconciliation | REAL |
| Live Mode | NOT IMPLEMENTED |
| Remote real Test Mode order | BLOCKED_BY_CREDENTIALS |
| Remote Test Mode checkout/payment/webhook | BLOCKED_BY_CREDENTIALS |
