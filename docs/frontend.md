# AgentAuth Frontend

Public deployment: https://agentauth.vercel.app

The frontend is a static browser-routed console served by the same Vercel serverless handler as the AgentAuth API. It uses same-origin API calls in production, so no production route points at localhost.

## Local Setup

```bash
npm run seed
npm start
```

Open `http://127.0.0.1:8787`.

Optional API override for local browser testing:

```html
<script>window.AGENTAUTH_API_URL = "https://agentauth.vercel.app";</script>
```

## Routes

- `/login` - demo console session gate
- `/dashboard` - live health, system status, metrics, recent decisions
- `/agents` and `/agents/{agent_id}` - agent identity, fingerprint, reputation, risk history, revoke action
- `/delegations`, `/delegations/new`, and `/delegations/{delegation_id}` - scoped authority list, creation, detail, revocation
- `/requests` and `/requests/{request_id}` - authorization list/detail, checks, reason codes, audit export
- `/step-up` - human approval/denial queue for medium-risk requests
- `/risk` - transaction fraud and agent-aware risk
- `/security-lab` - real backend attack/demo scenarios
- `/audit` - durable audit timeline
- `/merchant` - merchant order/token verification view and payment-provider status
- `/evidence` - judge-facing proof/status page
- `/developer` - SDK/API links
- `/demo` - guided Buildathon flow

## Architecture

The app keeps one centralized API client in `frontend/app.js`, renders protected routes client-side, and loads data from:

- `GET /health`
- `GET /v1/dashboard`
- `GET /v1/audit`
- `GET /v1/authorization-requests/{id}/audit/export`
- `GET /v1/agents/{id}/risk-history`
- `GET /v1/agents/{id}/reputation`
- `POST /v1/delegations`
- `POST /v1/delegations/{id}/revoke`
- `POST /v1/agents/{id}/revoke`
- `POST /v1/authorization-requests/{id}/approve`
- `POST /v1/authorization-requests/{id}/deny`
- `POST /v1/security-lab/run`
- `POST /v1/dev/reset`

## Authentication Status

The current backend has token signing and authorization-token verification, but full login/RBAC is documented as partial in `docs/deployment-status.md`. The frontend therefore uses a clearly labeled demo session gate stored in browser local storage. It does not store backend secrets, service role keys, Razorpay secrets, private signing keys, or private agent keys.

## Provider Boundary

The UI displays the real payment-provider state from `/health` and `/v1/dashboard`. Razorpay adapter code is implemented, while Razorpay sandbox calls remain blocked until test-mode credentials are configured. Fixture provider flows are labeled as provider contract simulation, not Razorpay.
