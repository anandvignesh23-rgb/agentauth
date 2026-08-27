# Deployment

Deployment provider: Vercel Serverless Functions

Public backend URL: https://agentauth.vercel.app

Health URL: https://agentauth.vercel.app/api/health

Actual Vercel URL: https://agentauth.vercel.app

Swagger/OpenAPI URL: `/docs` and `/openapi.json` are available in the Node backend. They are lightweight API docs, not FastAPI Swagger UI.

Root directory: AgentAuth project root

Build command:

```bash
npm install
```

Vercel entrypoint: `api/[...path].js`

Required environment variables:

```env
ENVIRONMENT=production
NODE_ENV=production
JWT_SECRET=<secure-random-value>
DATABASE_URL=<supabase-pooled-postgres-url>
FRONTEND_URL=<frontend origin when available>
PAYMENT_PROVIDER=razorpay
PG_POOL_MAX=5
```

`AGENTAUTH_TOKEN_SECRET` remains supported as a backwards-compatible alias for `JWT_SECRET`. `DATA_DIR` is used only for explicit JSON demo mode.

Razorpay variables are optional for this deployment milestone:

```env
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

## Vercel Workflow

1. Push the AgentAuth project to GitHub.
2. Import `anandvignesh23-rgb/agentauth` in Vercel or deploy with the Vercel CLI.
3. Use the included `vercel.json`.
4. Set `ENVIRONMENT=production`, `NODE_ENV=production`, `JWT_SECRET`, `DATABASE_URL`, `PG_POOL_MAX`, and `PAYMENT_PROVIDER=razorpay`.
5. Deploy.

## Verification

After deployment:

```bash
python3 scripts/smoke_test_public_backend.py --base-url https://agentauth.vercel.app --run-demo-flow
```

Also verify manually:

```bash
curl https://agentauth.vercel.app/api/health
curl https://agentauth.vercel.app/v1/agents
curl https://agentauth.vercel.app/openapi.json
```

Known limitations:

- Razorpay integration is not configured in this milestone.
- PostgreSQL/Supabase schema is implemented and the current production deployment uses the Supabase pooled `DATABASE_URL`.
- JSON demo persistence is local/demo only and is not production-grade.
