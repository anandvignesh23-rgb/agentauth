# Payment Provider Status

| Capability | Fixture Provider | Razorpay Adapter |
| --- | ---: | ---: |
| Order creation | REAL internal simulation | IMPLEMENTED |
| Signature verification | REAL HMAC fixture | IMPLEMENTED |
| Webhook verification | REAL signed fixture | IMPLEMENTED |
| Raw-body enforcement | REAL fixture test | IMPLEMENTED |
| Webhook dedupe | REAL local/Postgres path | IMPLEMENTED |
| Reconciliation | REAL fixture path | IMPLEMENTED |
| External API call | N/A | BLOCKED_BY_CREDENTIALS |

The fixture provider is named `PAYMENT_PROVIDER=fixture` and returns `simulation_notice: "Provider contract simulation - no external payment processor call"`. It exists to prove the AgentAuth payment-state contract without pretending that Razorpay issued an order.

Production remains configured as `PAYMENT_PROVIDER=razorpay`. With credentials absent, `/v1/payments/create-order` returns `RAZORPAY_NOT_CONFIGURED` and no fake Razorpay order is produced.
