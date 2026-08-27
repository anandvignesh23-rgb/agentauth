# AgentAuth Protocol

## Signed Request

The signed request contains:

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

Canonicalization is a deterministic UTF-8 text format with one `field=value` pair per line:

```text
agent_id=agent_7F92A
delegation_id=del_9217
merchant_id=merchant_demo_electronics
order_id=ORD-1934
amount=499900
currency=INR
nonce=abc123
timestamp=2026-08-24T10:31:20Z
```

Rules:

- fields appear exactly in the order above
- line separator is `\n`
- values are UTF-8 strings normalized with Unicode NFC
- `amount` is an integer minor-unit value
- `currency` is uppercase ISO 4217
- timestamps are ISO 8601 instants; demo clients use UTC-compatible ISO strings
- missing or empty signed fields fail canonicalization
- no extra whitespace is inserted or trimmed

The SDK signs the canonical bytes with Ed25519. AgentAuth verifies the signature with the registered public key.

Test vectors live in `tests/fixtures/signature_vectors.json`.

## Decision Pipeline

```text
schema validation
agent lookup
agent status check
signature verification
timestamp validation
nonce validation
delegation lookup
delegation validation
transaction scope validation
risk scoring
policy decision
```

Each stage emits an audit event. Hard failures stop the pipeline.

## Payment Authorization Token

For `ALLOW`, AgentAuth issues a signed token with:

```text
iss
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

The token is short-lived, transaction-bound, and single-use.

## Merchant Payment Execution

Merchant token verification is separate from payment execution:

```text
verify token bindings
reserve token
create PaymentExecution
call Razorpay Test Mode
mark token consumed
return checkout-safe fields
```

Exactly one token can create one payment execution. Retries return the existing execution.
