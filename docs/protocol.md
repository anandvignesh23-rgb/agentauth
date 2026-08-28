# AgentAuth Protocol Specification

AgentAuth is a cryptographic authorization and risk gateway for AI-agent payments. Payment processing is delegated to a `PaymentProvider`; authorization, replay protection, risk scoring, token issuance, and auditability are AgentAuth-owned.

## Agent Identity

An agent record contains:

```text
agent_id
name
developer_name
public_key
public_key_fingerprint
status
reputation_score
key_rotation_count
last_key_rotation_at
```

`status=ACTIVE` is required before any signed payment request can pass. `REVOKED` and `SUSPENDED` agents are denied.

## Signed Payment Request

The signed payload contains exactly these canonical fields:

```text
agent_id
delegation_id
merchant_id
order_id
amount
currency
nonce
timestamp
```

`amount` is an integer minor-unit value. For INR, `499900` means INR 4,999.00.

## Canonicalization

The canonical message is UTF-8 text:

```text
agent_id=agent_7F92A
delegation_id=del_9217
merchant_id=merchant_demo_electronics
order_id=ORD-1934
amount=499900
currency=INR
nonce=vector_nonce_001
timestamp=2026-08-24T10:31:20Z
```

Rules:

- fields appear in the exact order shown above
- line separator is `\n`
- field names are lowercase ASCII and case-sensitive
- values are converted to strings and Unicode NFC normalized
- no whitespace is inserted, trimmed, or normalized around `=`
- `amount` must parse as an integer
- `currency` must already be uppercase ISO 4217
- timestamps are ISO 8601 instants; requests outside the clock window are rejected
- missing, null, or empty signed fields fail canonicalization

## Signature

Algorithm: `Ed25519`.

The agent signs the canonical UTF-8 bytes with its private key. AgentAuth verifies with the stored public key for `agent_id`. A valid signature proves agent identity, not spending authority.

Protocol vectors live in `tests/fixtures/protocol_vectors.json`.

## Delegation

A delegation defines user-granted authority:

```text
delegation_id
user_id
agent_id
merchant_id
order_id
max_amount
currency
purpose
expires_at
status
delegation_credential
```

AgentAuth checks agent, merchant, order, currency, amount ceiling, expiry, and revocation before risk scoring.

## Decisions

AgentAuth returns one of:

```text
ALLOW
DENY
STEP_UP
```

Hard security failures produce `DENY`. Medium risk produces `STEP_UP`. Low risk with valid delegation produces `ALLOW`.

## Payment Authorization Token

An `ALLOW` decision issues a short-lived signed token with:

```text
iss=AgentAuth
jti
sub
user_id
agent_id
merchant_id
order_id
amount
currency
request_id
iat
exp
```

Token semantics:

- merchant/order/amount/currency bound
- short expiry
- one token can reserve one payment execution
- states: `ACTIVE`, `RESERVED`, `CONSUMED`, `EXPIRED`, `REVOKED`
- retries after a successful reservation return the existing execution idempotently

## Replay Protection

Request replay is blocked by:

- unique `(agent_id, nonce)` persistence
- timestamp tolerance of two minutes
- durable Supabase/Postgres storage in production

Payment-token replay is blocked by guarded token state transitions:

```text
ACTIVE -> RESERVED -> CONSUMED
```

## Revocation

Agent revocation blocks future requests for that agent. Delegation revocation blocks use of that delegation. Token revocation blocks merchant verification and payment execution for that token.

## Payment Provider Contract

`PaymentProvider` exposes:

```text
createOrder
fetchOrder
fetchPayment
verifyCheckoutSignature
verifyWebhookSignature
normalizeWebhookEvent
```

Implemented providers:

- `RazorpayTestProvider`: real Razorpay API adapter, blocked by credentials in production.
- `FixturePaymentProvider`: deterministic signed provider-contract simulation for local tests and explicit demos only.

## Machine-Readable Error Codes

Authorization and cryptography:

```text
UNKNOWN_AGENT
AGENT_REVOKED
INVALID_SIGNATURE
REQUEST_TOO_OLD
NONCE_REUSED
DELEGATION_NOT_FOUND
DELEGATION_REVOKED
DELEGATION_ALREADY_USED
DELEGATION_EXPIRED
AGENT_MISMATCH
MERCHANT_MISMATCH
ORDER_MISMATCH
AMOUNT_EXCEEDS_DELEGATION
CURRENCY_MISMATCH
```

Token and payment execution:

```text
MALFORMED_TOKEN
TOKEN_SIGNATURE_INVALID
TOKEN_ISSUER_INVALID
TOKEN_EXPIRED
TOKEN_NOT_FOUND
TOKEN_REVOKED
TOKEN_ALREADY_USED
TOKEN_ALREADY_RESERVED
TOKEN_NOT_ACTIVE
AUTHORIZATION_NOT_ALLOWED
MERCHANT_ORDER_NOT_FOUND
PAYMENT_STATE_MISMATCH
PAYMENT_TOKEN_ALREADY_USED
PAYMENT_AMOUNT_INVALID
```

Provider boundary:

```text
RAZORPAY_NOT_CONFIGURED
RAZORPAY_ORDER_CREATION_FAILED
RAZORPAY_ORDER_RESPONSE_INVALID
RAZORPAY_ORDER_FETCH_FAILED
RAZORPAY_PAYMENT_FETCH_FAILED
RAZORPAY_SIGNATURE_INVALID
RAZORPAY_WEBHOOK_SECRET_REQUIRED
RAZORPAY_WEBHOOK_SIGNATURE_INVALID
FIXTURE_PAYMENT_PROVIDER_DISABLED_IN_PRODUCTION
FIXTURE_PAYMENT_FAILED
```
