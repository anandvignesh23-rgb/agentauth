# Legitimacy Audit

Statuses: `REAL`, `REAL_BUT_UNVERIFIED`, `FIXTURE_TESTED`, `MOCKED`, `MISSING`, `BLOCKED_BY_CREDENTIALS`.

| Component | Status | Evidence |
| --- | --- | --- |
| Public API deployment | REAL | `https://agentauth.vercel.app/api/health` returns `status: ok`, `runtime: vercel`. |
| Supabase/Postgres persistence | REAL | Health reports `database_connected: true`; proof rows verified in Supabase. |
| Agent registration | REAL | `POST /v1/agents`; public list endpoint verified by smoke test. |
| Ed25519 signing | FIXTURE_TESTED | `tests/fixtures/protocol_vectors.json`, `tests/provider-contract.test.mjs`. |
| Signature verification | REAL | Security Lab and tests reject signed-field tampering. |
| Delegations | REAL | Delegation scope, expiry, and revocation checks run in public API. |
| Nonce replay protection | REAL | Public Security Lab `replay`; DB uniqueness in Supabase. |
| Token replay protection | FIXTURE_TESTED | Guarded token reservation tests and Security Lab `token_replay`. |
| Revocation | REAL | Security Lab `revoked_agent` and `revoked_delegation`. |
| Step-up | REAL | Security Lab `high_risk` returns `STEP_UP`. |
| Transaction risk | REAL | Public Security Lab exposes structured transaction risk signals. |
| Agent-aware risk | REAL | Public dashboard and risk APIs expose agent behavior scoring. |
| Agent reputation | REAL | Reputation updates persist with risk/denial history. |
| Audit history | REAL | `/v1/audit` and per-request audit export read durable events. |
| SDKs | REAL | `sdk/js/agentauth.mjs`, `examples/shopping_agent.mjs`, `examples/demo_merchant.mjs`. |
| Merchant verification | REAL | `POST /v1/verify-payment-token` validates token signature and bindings. |
| Provider abstraction | REAL | `PaymentProvider` contract implemented by Razorpay and fixture providers. |
| Razorpay adapter | BLOCKED_BY_CREDENTIALS | Real API/HMAC code exists; live call requires Razorpay keys. |
| Razorpay order contract tests | FIXTURE_TESTED | Documented Razorpay-shaped fixtures under `tests/fixtures/razorpay/`. |
| Checkout callback verification | FIXTURE_TESTED | HMAC tests cover exact order/payment pair. |
| Webhook signature verification | FIXTURE_TESTED | Signed raw-body fixtures reject mutation/reserialization. |
| Webhook deduplication | FIXTURE_TESTED | Duplicate signed webhook test returns duplicate without state mutation. |
| Provider reconciliation | FIXTURE_TESTED | Reconciliation state machine tested against provider fixtures. |

Conclusion: AgentAuth’s core authorization and risk gateway is real and publicly running. The unavailable boundary is a Razorpay-issued sandbox order/payment because merchant-account API credentials are unavailable.
