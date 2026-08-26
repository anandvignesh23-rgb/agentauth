# Fraud Detection and Agent-Aware Risk

AgentAuth now separates three decisions:

1. Hard authorization: is the agent allowed to request this payment?
2. Transaction fraud: does the authorized transaction look suspicious?
3. Agent-aware risk: is the autonomous agent behaving abnormally?

Hard authorization failures always win. Invalid signatures, replayed nonces, revoked agents, expired delegations, merchant mismatch, order mismatch, currency mismatch, and amount escalation return `DENY` before fraud scoring can approve anything.

## Stored Risk Objects

The local JSON store contains:

- `transactionRiskSnapshots`
- `userRiskProfiles`
- `agentRiskProfiles`
- `merchantRiskProfiles`
- `fraudSignalEvents`
- `agentReputationEvents`

Production should move these to PostgreSQL tables with row-level locking for concurrent updates.

## Transaction Fraud Engine

Model version: `transaction-risk-v1`.

Signals:

- `amount_anomaly`
- `new_merchant_risk`
- `velocity_risk`
- `recent_denial_risk`
- `unusual_time_risk`
- `merchant_reputation_inverse`

Default formula:

```text
0.30 * amount_anomaly
+ 0.20 * new_merchant_risk
+ 0.20 * velocity_risk
+ 0.15 * recent_denial_risk
+ 0.10 * unusual_time_risk
+ 0.05 * merchant_reputation_inverse
```

Reason codes include `NORMAL_AMOUNT`, `UNUSUAL_AMOUNT`, `EXTREME_AMOUNT_ANOMALY`, `KNOWN_MERCHANT`, `NEW_MERCHANT`, `LOW_REPUTATION_MERCHANT`, `NORMAL_VELOCITY`, `HIGH_VELOCITY`, `RECENT_DENIALS`, `RECENT_REPLAY_ACTIVITY`, `NORMAL_TRANSACTION_TIME`, and `UNUSUAL_TRANSACTION_TIME`.

Cold-start users with fewer than five successful transactions receive softer amount-anomaly penalties.

## Agent-Aware Risk Engine

Model version: `agent-risk-v1`.

Signals:

- `amount_behavior_anomaly`
- `request_velocity_anomaly`
- `authorization_violation_rate`
- `replay_activity`
- `signature_failure_activity`
- `merchant_spread_anomaly`
- `user_spread_anomaly`
- `recent_key_rotation_risk`

Default formula:

```text
0.20 * amount_behavior_anomaly
+ 0.20 * request_velocity_anomaly
+ 0.15 * authorization_violation_rate
+ 0.15 * replay_activity
+ 0.10 * signature_failure_activity
+ 0.10 * merchant_spread_anomaly
+ 0.05 * user_spread_anomaly
+ 0.05 * recent_key_rotation_risk
```

Then the score is adjusted by reputation:

```text
agent_risk = agent_risk * (1.1 - 0.2 * reputation_score)
```

Reason codes include `AGENT_BEHAVIOR_NORMAL`, `AGENT_AMOUNT_ANOMALY`, `AGENT_HIGH_VELOCITY`, `AGENT_REPEATED_POLICY_VIOLATIONS`, `AGENT_REPLAY_ACTIVITY`, `AGENT_SIGNATURE_FAILURE_SPIKE`, `AGENT_NEW_MERCHANT_SPIKE`, `AGENT_NEW_USER_SPIKE`, `AGENT_RECENT_KEY_ROTATION`, and `AGENT_LOW_REPUTATION`.

## Risk Aggregator

Policy version: `combined-policy-v2`.

Default formula:

```text
combined = 0.60 * transaction_risk + 0.40 * agent_risk
```

Default decisions:

```text
combined < 0.45 -> ALLOW
0.45 <= combined < 0.75 -> STEP_UP
combined >= 0.75 -> DENY
```

Additional deterministic overrides:

- transaction risk >= `TRANSACTION_RISK_STEP_UP_THRESHOLD` triggers `STEP_UP`
- agent risk >= `AGENT_RISK_STEP_UP_THRESHOLD` triggers `STEP_UP`
- `AGENT_HIGH_VELOCITY` + `AGENT_NEW_MERCHANT_SPIKE` triggers `STEP_UP`
- extreme replay activity triggers `DENY`

## Reputation Updates

Starting score defaults to `0.75`.

Adjustments:

- successful authorized payment: `+0.002`
- successful step-up: `+0.001`
- invalid signature: `-0.03`
- replay attempt: `-0.08`
- merchant mismatch: `-0.04`
- order mismatch: `-0.04`
- amount escalation: `-0.05`
- revoked delegation use: `-0.06`

Scores are clamped to `0.0-1.0`.

## APIs

- `GET /v1/risk/requests/{request_id}`
- `GET /v1/risk/agents/{agent_id}`
- `GET /v1/risk/users/{user_id}`
- `GET /v1/risk/merchants/{merchant_id}`
- `GET /v1/agents/{agent_id}/reputation`
- `GET /v1/agents/{agent_id}/risk-history`

## Demo Scenarios

Security Lab includes:

- normal payment
- high-value anomaly
- new-merchant anomaly
- velocity attack
- replay attack
- invalid signature
- merchant-spread spike
- denial spike
- recent key rotation + high value
- compromised-agent burst
- prompt-injected agent

All scenarios call the real backend authorization and risk pipeline.
