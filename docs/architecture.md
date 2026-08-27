# Architecture

AgentAuth is positioned between an AI agent and a merchant/payment processor.

```text
Consumer
  -> AI Agent
  -> Signed Request
  -> AgentAuth on Vercel
       -> Signature Verification
       -> Delegation Enforcement
       -> Replay Protection
       -> Fraud Detection
       -> Agent-Aware Risk
       -> Policy Engine
       -> Token Service
  -> Supabase PostgreSQL
  -> Merchant
  -> Razorpay Test Mode
  -> Verified webhook back to AgentAuth
  -> Durable audit trail
```

The implementation separates payment authority from agent reasoning. A valid agent signature proves identity, not permission. A valid delegation proves scoped authority.
