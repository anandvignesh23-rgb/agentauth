# Deployment

Deployment provider: Render Free Web Service

Public backend URL: pending Render account/API access

Health URL: pending Render deployment

Actual Render URL: not generated in this workspace because no Render CLI, API key, authenticated browser session, or Render connector is available.

Swagger/OpenAPI URL: `/docs` and `/openapi.json` are available in the Node backend. They are lightweight API docs, not FastAPI Swagger UI.

Root directory: AgentAuth project root

Build command:

```bash
npm install
```

Start command:

```bash
npm run start:prod
```

Required environment variables:

```env
ENVIRONMENT=production
NODE_ENV=production
HOST=0.0.0.0
PORT=<platform-provided>
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

## Render Free Web Service Workflow

1. Push the AgentAuth project to GitHub.
2. Create a Render Web Service.
3. Set the root directory to the AgentAuth project root if using a monorepo.
4. Use `npm install` as the build command.
5. Use `npm run start:prod` as the start command.
6. Set `ENVIRONMENT=production`, `NODE_ENV=production`, `HOST=0.0.0.0`, and `DATA_DIR=/tmp/agentauth`.
7. Generate a strong `AGENTAUTH_TOKEN_SECRET`.
8. Set health check path to `/health`.
9. Deploy.

`render.yaml` is included for reproducible setup.

## Render API Blocker

This workspace does not have a Render CLI, Render API key, or authenticated Render connector. The service cannot be created programmatically without Render account access.

When a Render URL exists, update this document with the actual service URL and run the smoke test below.

## Verification

After deployment:

```bash
python3 scripts/smoke_test_public_backend.py --base-url https://actual-render-url --run-demo-flow
```

Also verify manually:

```bash
curl https://actual-render-url/health
curl https://actual-render-url/v1/agents
curl https://actual-render-url/openapi.json
```

Known limitations:

- Razorpay integration is not configured in this milestone.
- PostgreSQL is not implemented in this milestone.
- JSON demo persistence may be ephemeral on the host.
