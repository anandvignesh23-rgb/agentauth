# Persistence Audit

Date: 2026-08-26

## Summary

AgentAuth previously used `backend/store.js` as a JSON/file-backed store. That was acceptable for local demo mode but not for Vercel serverless production because replay protection, one-time tokens, delegations, step-up state, risk history, reputation, and audit state must be durable across cold starts and concurrent invocations.

This migration adds a Supabase PostgreSQL schema and a PostgreSQL-backed store selected by `DATABASE_URL`. JSON persistence remains only for explicit local/demo mode.

## State Inventory

| State Object | CURRENT_STORAGE | SECURITY_CRITICAL? | TARGET_TABLE | MIGRATION_REQUIRED? |
| --- | --- | --- | --- | --- |
| users | JSON array `users` | Yes | `users` | Yes |
| agents | JSON array `agents` | Yes | `agents` | Yes |
| agent public keys | `agents.public_key` | Yes | `agents.public_key` | Yes |
| merchants | JSON array `merchants` | Yes | `merchants` | Yes |
| merchant order references | JSON array `merchantOrders` | Yes | `merchant_orders` | Yes |
| delegations | JSON array `delegations` | Yes | `delegations` | Yes |
| delegation revocations | `delegations.status/revoked_at` | Yes | `delegations` | Yes |
| authorization requests | JSON array `requests` | Yes | `authorization_requests` | Yes |
| nonce records | JSON array `nonces` | Yes | `nonce_records` with `unique(agent_id, nonce)` | Yes |
| payment authorization tokens | JSON array `tokens` | Yes | `payment_authorization_tokens` | Yes |
| token revocations | `tokens.status/revoked_at` | Yes | `payment_authorization_tokens` | Yes |
| step-up challenges | request fields only before migration | Yes | `step_up_challenges` | Yes |
| audit events | JSON array `audit` | Yes | `audit_events` | Yes |
| transaction risk snapshots | JSON array `transactionRiskSnapshots` | Yes | `transaction_risk_snapshots` | Yes |
| user risk profiles | Derived JSON array `userRiskProfiles` | Yes | `user_risk_profiles` | Yes |
| agent risk profiles | Derived JSON array `agentRiskProfiles` | Yes | `agent_risk_profiles` | Yes |
| merchant risk profiles | Derived JSON array `merchantRiskProfiles` | Yes | `merchant_risk_profiles` | Yes |
| fraud signal events | JSON array `fraudSignalEvents` | Yes | `fraud_signal_events` | Yes |
| agent reputation | `agents.reputation_score` | Yes | `agents.reputation_score` | Yes |
| reputation history | JSON array `agentReputationEvents` | Yes | `reputation_history` | Yes |
| Razorpay orders | JSON array `razorpayOrders` | No for this task | `razorpay_orders` | Deferred |
| payment executions | JSON array `paymentExecutions` | Yes for token semantics | `payment_executions` | Yes |
| webhook events | JSON array `webhookEvents` | No for this task | `webhook_events` | Deferred |

## Request Path Findings

- `POST /v1/authorize-payment` now uses `store.reserveNonce(...)`, which is PostgreSQL-authoritative when `DATABASE_URL` is configured.
- `ALLOW` authorization now calls `store.consumeDelegation(...)`, which uses a conditional PostgreSQL update in database mode.
- `STEP_UP` authorization now creates a `step_up_challenges` row.
- Step-up approval calls `store.consumeDelegation(...)` and issues the token after the durable state transition.
- Payment execution calls `store.reservePaymentToken(...)` and `store.consumePaymentToken(...)`; failed payment-provider calls do not return reserved tokens to `ACTIVE`.

## Remaining Boundary

Supabase schema is applied to project `qusdfmrpujmvsqeqxwom`. The Vercel app must be given the Supabase pooled `DATABASE_URL` before production can be redeployed in durable mode. Without `DATABASE_URL`, production fails closed unless `PERSISTENCE_MODE=json` is explicitly set for a demo-only deployment.
