# Performance

Authorization work is deterministic and local to the gateway plus database:

```text
canonicalization
Ed25519 verification
nonce reservation
delegation lookup
risk feature scoring
policy decision
token issuance
audit append
```

External Razorpay calls are not part of authorization latency.

Current smoke/security checks against `https://agentauth.vercel.app` pass through Vercel and Supabase. A dedicated load test can target:

```bash
AGENTAUTH_URL=https://agentauth.vercel.app npm run proof:security
```

Target for the authorization endpoint remains p95 `<250ms` excluding external payment provider calls.
