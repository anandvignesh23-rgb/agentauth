# Current State Audit

Status labels: `REAL`, `PARTIAL`, `MOCKED`, `MISSING`, `BROKEN`.

| Component | Status | Notes |
| --- | --- | --- |
| user authentication | MISSING | No login/session/RBAC yet. Demo assumes seeded `user_123`. |
| agent registration | REAL | `POST /v1/agents` stores an Ed25519 public key or generates a demo key. |
| public-key storage | PARTIAL | Stored durably in JSON; production needs PostgreSQL constraints and secret scanning. |
| Ed25519 signing | REAL | SDK/demo signs canonical payloads with Node crypto Ed25519. |
| Ed25519 verification | REAL | Backend verifies registered public key before policy checks. |
| canonical request serialization | REAL | Text format with fixed field order and UTF-8/NFC rules. |
| delegation creation | REAL | API/UI create immutable transaction-scoped delegations. |
| delegation validation | REAL | Agent, merchant, order, amount, currency, expiry, revoked, and used state enforced. |
| delegation revocation | REAL | `POST /v1/delegations/{id}/revoke`. |
| delegation expiry | REAL | Expired delegations deny and become `EXPIRED`. |
| delegation signing | REAL | Server-signed delegation credential added to created/seeded delegations. |
| nonce protection | REAL | Durable per-agent nonce registry in JSON. |
| timestamp protection | REAL | ±2 minute clock window. |
| authorization endpoint | REAL | Full deterministic pipeline with audit events. |
| risk engine | PARTIAL | Deterministic weighted model with structured signals; prototype-grade weights. |
| transaction fraud engine | REAL | Separate deterministic `transaction-risk-v1` score and reason codes. |
| agent-aware risk engine | REAL | Separate deterministic `agent-risk-v1` score, reputation, profile, and behavior reason codes. |
| risk aggregator | REAL | `combined-policy-v2` combines transaction and agent risk with deterministic overrides. |
| risk snapshots | REAL | Stores `transactionRiskSnapshots` for successful hard-authorization paths. |
| fraud signal events | REAL | Stores per-signal severity events for analytics. |
| policy engine | REAL | Deterministic thresholds produce `ALLOW`, `DENY`, `STEP_UP`. |
| step-up flow | PARTIAL | Approve/deny and TTL exist; no SSE/live notification yet. |
| payment token generation | REAL | Signed short-lived token with transaction-bound claims. |
| payment token verification | REAL | Merchant-facing verification returns explicit checks without consuming. |
| token consumption | PARTIAL | Token moves `ACTIVE` -> `RESERVED` -> `CONSUMED` when payment execution starts; JSON store lacks row locks. |
| token revocation | REAL | `POST /v1/payment-tokens/{id}/revoke`. |
| merchant flow | PARTIAL | Merchant verification + create-order API exists; merchant portal is lightweight. |
| Razorpay order creation | REAL when configured | Uses real Razorpay Test Mode API only when `PAYMENT_PROVIDER=razorpay` and credentials exist. |
| Razorpay Checkout | PARTIAL | Backend returns safe checkout config; frontend checkout launcher is not fully polished. |
| Razorpay payment verification | REAL | Backend verifies checkout callback signature. |
| Razorpay webhook verification | REAL | Raw body HMAC verification, event persistence, dedupe, execution update. |
| webhook deduplication | REAL | Dedupes by Razorpay event id or deterministic body HMAC. |
| database persistence | PARTIAL | JSON persistence for local demo; production needs PostgreSQL migrations. |
| concurrency handling | PARTIAL | Exactly-once behavior covered in-process; production needs DB locks/unique constraints. |
| audit timeline | REAL | Every request gets timeline events with hash chaining. |
| dashboards | PARTIAL | Dashboard and security lab exist; portals are compact. |
| SDK | PARTIAL | Runnable JS agent/merchant SDK; Python SDK remains a documented facade. |
| tests | PARTIAL | Unit and local flow tests pass; no external Razorpay integration test without credentials. |
| deployment readiness | PARTIAL | `.env.example`, health endpoint, Docker Compose; not deployed from this workspace. |
