# Deployment Limitations

The current public deployment uses the existing demo persistence layer. Durable PostgreSQL persistence is a separate next milestone.

## Persistence

The backend writes JSON data to `${DATA_DIR}/agentauth.json`. On hosts with ephemeral disks, data may reset when the instance restarts or redeploys. The production start wrapper initializes demo data when the store file is missing.

## Authentication

The current app has demo-oriented endpoints and does not yet enforce full role-based authentication. `AGENTAUTH_TOKEN_SECRET` signs AgentAuth tokens and delegation credentials, but consumer/developer/merchant login is a separate milestone.

## Razorpay

Razorpay Test Mode is not configured as part of this deployment milestone. The backend exposes configuration status through `/health`, and payment creation refuses to fake Razorpay orders unless `PAYMENT_PROVIDER=mock` is explicitly selected.

## FastAPI

The deployment spec refers to FastAPI, but the actual current backend is a dependency-light Node HTTP backend. This deployment work packages and deploys the actual backend rather than introducing a second implementation.
