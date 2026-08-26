# Threat Model

## Agent Impersonation

Attack: an attacker claims to be `agent_7F92A`.
Impact: unauthorized transaction attempts.
Mitigation: AgentAuth verifies an Ed25519 signature against the registered public key.
Residual risk: stolen private keys require revocation and rotation.

## Prompt Injection

Attack: malicious content tells the agent to ignore the user's order and pay an attacker.
Impact: agent submits a bad request.
Mitigation: AgentAuth independently checks merchant, order, amount, currency, expiry, nonce, and revocation outside the agent.
Residual risk: if a user explicitly delegates the bad transaction, AgentAuth will treat that authority as valid.

## Agent Compromise

Attack: model error, tool compromise, or malware causes unsafe payment requests.
Impact: unsafe requests reach the gateway.
Mitigation: transaction-scoped delegation and deterministic policy controls money movement.
Residual risk: private-key compromise can sign requests until revocation.

## Developer Compromise / Key Theft

Attack: attacker steals or rotates an agent public key maliciously.
Impact: valid signatures may be produced by the attacker.
Mitigation: key rotation endpoint emits audit events; agent revocation blocks future requests.
Residual risk: production needs developer auth, approvals, and hardware-backed keys.

## Request Tampering

Attack: change `4999` to `9999`, merchant, order, nonce, or timestamp.
Impact: transaction scope changes after signature.
Mitigation: all relevant fields are in the Ed25519 canonical payload.
Residual risk: canonicalization bugs; covered by vectors and tests.

## Request Replay

Attack: reuse a previously valid signed request.
Impact: duplicate authorization.
Mitigation: nonce + timestamp + durable nonce registry.
Residual risk: JSON store lacks cross-process DB uniqueness; production needs unique constraints.

## Token Replay / Token Theft

Attack: reuse an approved authorization token.
Impact: duplicate payment execution.
Mitigation: short expiry, transaction-bound claims, `ACTIVE/RESERVED/CONSUMED` state, exactly-once execution.
Residual risk: production needs DB row locks and token encryption at rest.

## Merchant Tampering

Attack: merchant changes amount, order, or merchant identity.
Impact: payment differs from delegated transaction.
Mitigation: merchant verification checks token binding before payment execution.
Residual risk: merchant UI could misrepresent products; external merchant trust remains necessary.

## Database Race

Attack: concurrent token/delegation use.
Impact: duplicate order or authorization.
Mitigation: in-process exactly-once checks and tests.
Residual risk: production must use PostgreSQL transactions, row locks, and unique constraints.

## Webhook Forgery

Attack: attacker posts fake Razorpay events.
Impact: local payment marked paid.
Mitigation: raw body HMAC verification with `RAZORPAY_WEBHOOK_SECRET`.
Residual risk: endpoint must be HTTPS and secret must remain private.

## Client Callback Forgery

Attack: frontend sends fake Razorpay success payload.
Impact: false paid state.
Mitigation: backend verifies Razorpay payment signature and final state is reconciled by provider/webhook.
Residual risk: production should fetch provider state before marking final settlement.

## Delegation Revocation Race

Attack: request lands while user revokes.
Impact: request may be authorized just before revocation.
Mitigation: server checks delegation state during authorization; agent revocation can cascade active delegations.
Residual risk: production DB transactions needed for strict serializability.
