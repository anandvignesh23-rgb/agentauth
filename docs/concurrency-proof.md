# Concurrency Proof

Run:

```bash
npm run proof:concurrency
```

| Test | Size | Expected winner count | Pass count | Fail count | Database constraint used |
| --- | ---: | ---: | ---: | ---: | --- |
| Identical nonce requests | 50 | 1 | 1 | 49 | `unique(agent_id, nonce)` / guarded reservation |
| Same-token reserve attempts | 20 | 1 | 1 | 19 | `payment_authorization_tokens.status` guarded update |
| Same single-use delegation requests | 10 | 1 | 1 | 9 | `delegations.status` guarded update |
| Reputation updates | 50 | 50 | 50 | 0 | keyed agent reputation history append |

The local proof uses the same store contract and guarded state transitions as production. Production Supabase/Postgres uses uniqueness and status-guarded updates for cross-invocation enforcement.
