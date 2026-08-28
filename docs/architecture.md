# Architecture

AgentAuth is positioned between an AI agent and a merchant/payment processor.

```text
Consumer
   ↓
AI Agent
   ↓
Signed Request
   ↓
AgentAuth / Vercel
   ├── Identity
   ├── Delegation
   ├── Replay Protection
   ├── Fraud
   ├── Agent Risk
   ├── Policy
   └── Token Service
            ↓
       Supabase Postgres
            ↓
          Merchant
            ↓
    PaymentProvider Interface
       ├── RazorpayProvider
       └── FixtureProvider
```

The implementation separates payment authority from agent reasoning. A valid agent signature proves identity, not permission. A valid delegation proves scoped authority.

RazorpayProvider contains the real documented API/HMAC integration but is blocked by missing sandbox credentials. FixtureProvider is an explicit provider-contract simulation for local tests and evidence demos.
