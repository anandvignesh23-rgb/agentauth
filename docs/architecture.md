# Architecture

AgentAuth is positioned between an AI agent and a merchant/payment processor.

```text
Consumer grants limited authority
AI Agent signs transaction request
AgentAuth verifies identity, delegation, replay, risk, and policy
Merchant verifies short-lived authorization token
Razorpay Test Mode executes payment
```

The implementation separates payment authority from agent reasoning. A valid agent signature proves identity, not permission. A valid delegation proves scoped authority.
