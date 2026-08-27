# Razorpay Integration Audit

Date: 2026-08-27

Search terms reviewed: `razorpay`, `rzp_`, `order_id`, `payment_id`, `webhook`, `payment signature`, `checkout`, `mock payment`, `fake payment`, `simulated payment`, `payment provider`.

| Component | Classification | Notes |
| --- | --- | --- |
| Payment provider abstraction | REAL | `backend/payments/provider.js` exposes create/fetch order, fetch payment, checkout signature verification, and webhook signature verification. |
| Razorpay provider adapter | REAL | `RazorpayTestProvider` calls Razorpay Test Mode REST APIs with server-side Basic Auth. |
| Mock payment provider | MOCKED | Kept only for tests/local explicit `PAYMENT_PROVIDER=mock`; disabled in production. |
| Razorpay order creation | REAL WHEN CONFIGURED | `POST /v1/payments/create-order` calls Razorpay only after token, merchant, order, amount, currency, and ALLOW checks pass. |
| Amount handling | REAL | AgentAuth, merchant order, and Razorpay order amounts use integer minor units. INR 4,999.00 is `499900`. |
| Checkout payload | REAL WHEN CONFIGURED | Response includes frontend-safe `key_id`, `razorpay_order_id`, amount, currency, merchant display name, and test-mode marker. Secrets are not returned. |
| Checkout UI | PARTIAL | Security Lab can open Razorpay Checkout when Test Mode keys exist. Full hosted consumer checkout styling is still demo-grade. |
| Checkout signature verification | REAL | Backend verifies `order_id + "|" + razorpay_payment_id` using the Razorpay key secret and fetches provider payment state before final updates. |
| Webhook endpoint | REAL | `POST /webhooks/razorpay` and `/api/webhooks/razorpay` preserve raw body before signature verification. |
| Webhook signature verification | REAL | Validates `x-razorpay-signature` against the raw body before parsing or trusting payload fields. |
| Webhook persistence | REAL | Webhook events persist with provider/event dedupe key. Duplicate delivery returns success without duplicate state mutation. |
| Supported webhook events | REAL | Handles `payment.authorized`, `payment.captured`, `payment.failed`, and `order.paid`. |
| Payment reconciliation | REAL | Fetches provider order state and updates local execution/order when provider state is paid. |
| Payment execution model | REAL | `payment_executions` stores token id, merchant/order binding, Razorpay order/payment ids, status, provider payloads, and timestamps. |
| Merchant order model | REAL | `merchant_orders` stores durable commerce orders and transitions to `PAYMENT_PENDING`/`PAID`. |
| Token consumption | REAL | Tokens move `ACTIVE -> RESERVED -> CONSUMED`; `payment_executions.token_id` is unique. |
| DENY/STEP_UP isolation | REAL | Razorpay is only reached through payment-token execution after an ALLOW-issued token exists. |
| Audit events | REAL | Order creation, checkout verification, webhook receipt/verification/dedupe, payment capture/failure, reconciliation, and merchant paid events are audited. |
| Environment configuration | PARTIAL | Variables are supported and documented; live Vercel Razorpay secrets have not been provided yet. |
| Remote live Test Mode order | MISSING | Blocked by missing `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. |
| Remote live webhook verification | MISSING | Blocked by missing Razorpay dashboard webhook secret and a completed Test Mode payment. |

## Boundary

AgentAuth owns authorization, risk, token issuance, exactly-once payment initiation, and auditability. Razorpay owns payment processing and provider state. AgentAuth never marks a payment paid from browser success alone; it requires a verified checkout signature plus provider fetch, or a verified webhook/provider reconciliation.
