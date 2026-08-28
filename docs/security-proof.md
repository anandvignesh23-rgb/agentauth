# Security Proof

Run:

```bash
AGENTAUTH_URL=https://agentauth.vercel.app npm run proof:security
```

| Attack | Expected | Actual | Verified remotely |
| --- | --- | --- | --- |
| Amount escalation | DENY | DENY | YES |
| Merchant substitution | DENY | DENY | YES |
| Order substitution | DENY | DENY | YES |
| Request replay | DENY | DENY | YES |
| Token replay | BLOCK | BLOCK | YES |
| Tampered signature | DENY | DENY | YES |
| Expired delegation | DENY | DENY | YES |
| Revoked delegation | DENY | DENY | YES |
| Revoked agent | DENY | DENY | YES |
| Prompt-injected agent | DENY | DENY | YES |
| High-risk valid request | STEP_UP | STEP_UP | YES |

All scenarios call the deployed backend Security Lab route. The lab executes backend signing, verification, delegation, nonce, risk, and policy logic; it does not make frontend-only decisions.
