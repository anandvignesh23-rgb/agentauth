# Persistence Proof

Production URL: `https://agentauth.vercel.app`

Health check:

```json
{
  "status": "ok",
  "runtime": "vercel",
  "persistence": "supabase_postgres",
  "database_connected": true,
  "razorpay_configured": false
}
```

| Durable item | Verification | Result |
| --- | --- | --- |
| Used nonces | Public replay scenario stores first nonce and rejects second use. | PASS |
| Consumed/reserved tokens | Token reservation is guarded by token status in tests and Security Lab `token_replay`. | PASS |
| Revoked agents | Security Lab revokes `agent_7F92A`, then authorization returns `AGENT_REVOKED`. | PASS |
| Revoked delegations | Security Lab revokes a scenario delegation, then authorization returns `DELEGATION_REVOKED`. | PASS |
| Step-up challenges | High-risk scenario returns `STEP_UP` with challenge state. | PASS |
| Risk history | Public smoke/security runs create `transaction_risk_snapshots`. | PASS |
| Agent reputation | Denials and risk events update agent reputation history. | PASS |
| Audit events | `/v1/audit` returns durable hash-chained events. | PASS |

Supabase schema verification confirmed these Razorpay persistence columns:

```text
merchant_orders.razorpay_payment_id
payment_executions.provider_payment
payment_executions.provider_verified_at
payment_executions.razorpay_payment_id
```

The Vercel deployment creates a fresh serverless handler per request, while state survives through Supabase/Postgres. Redeploy verification was performed after commit `73b1219`; smoke tests continued passing after deployment `https://agentauth-28fldkddh-anandvignesh23-rgbs-projects.vercel.app`.
