# Deployment Limitations

The current public deployment is Vercel Serverless Functions backed by Supabase/PostgreSQL. Local JSON storage remains only for explicit local demo/test mode.

## Authentication

The current app has demo-oriented endpoints and does not yet enforce full consumer/developer/merchant role-based authentication. `JWT_SECRET` signs AgentAuth tokens and delegation credentials.

## Razorpay

Razorpay sandbox verification is blocked by merchant-account credential access. The backend exposes this through `/health`, and payment creation returns `RAZORPAY_NOT_CONFIGURED` instead of falling back to a fixture provider in production.

## Fixture Provider

`PAYMENT_PROVIDER=fixture` is for local tests and explicit provider-contract demos only. It is disabled in production.

## FastAPI

Earlier deployment specs referred to FastAPI, but the actual current backend is a dependency-light Node HTTP backend deployed through Vercel serverless functions.
