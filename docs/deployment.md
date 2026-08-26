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
HOST=0.0.0.0
PORT=<platform-provided>
JWT_SECRET=<secure-random-value>
AGENTAUTH_TOKEN_SECRET=<secure-random-value>
DATA_DIR=/tmp/agentauth
FRONTEND_URL=<frontend origin when available>
PAYMENT_PROVIDER=razorpay
```

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
4. Set `ENVIRONMENT=production`, `NODE_ENV=production`, `JWT_SECRET`, `DATA_DIR=/tmp/agentauth`, and `PAYMENT_PROVIDER=razorpay`.
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
- PostgreSQL is not implemented in this milestone.
- JSON demo persistence is temporary on Vercel and is not production-grade.
