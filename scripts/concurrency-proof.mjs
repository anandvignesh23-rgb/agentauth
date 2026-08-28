import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPaymentExecution } from "../backend/payments/execution.js";
import { authorizePayment } from "../backend/pipeline.js";
import { signPayload } from "../backend/crypto.js";
import { seedDemo } from "../backend/seed.js";
import { Store } from "../backend/store.js";
import { updateAgentReputation } from "../backend/risk/reputation.js";

process.env.PAYMENT_PROVIDER = "fixture";
process.env.NODE_ENV = "test";
process.env.ENVIRONMENT = "test";
process.env.JWT_SECRET = "test-secret";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentauth-concurrency-"));

const store = new Store(path.join(process.env.DATA_DIR, "agentauth.json"));
let keys = await seedDemo(store);

function payload(overrides = {}) {
  return {
    agent_id: "agent_7F92A",
    delegation_id: "del_9217",
    merchant_id: "merchant_demo_electronics",
    order_id: "ORD-1934",
    amount: 499900,
    currency: "INR",
    nonce: crypto.randomBytes(12).toString("hex"),
    timestamp: new Date().toISOString(),
    ...overrides
  };
}

async function auth(p) {
  return authorizePayment({
    store,
    tokenSecret: process.env.JWT_SECRET,
    payload: p,
    signature: signPayload(keys.privateKeyPem, p),
    headerAgentId: p.agent_id
  });
}

const started = Date.now();
keys = await seedDemo(store);
const shared = payload({ nonce: "proof-shared-nonce" });
const sharedSignature = signPayload(keys.privateKeyPem, shared);
const nonceAttempts = await Promise.all(Array.from({ length: 50 }, () => authorizePayment({ store, tokenSecret: process.env.JWT_SECRET, payload: shared, signature: sharedSignature, headerAgentId: shared.agent_id })));

keys = await seedDemo(store);
const allowed = await auth(payload());
const expected = { merchant_id: "merchant_demo_electronics", order_id: "ORD-1934", amount: 499900, currency: "INR" };
const tokenAttempts = await Promise.all(Array.from({ length: 20 }, () => createPaymentExecution({ store, tokenSecret: process.env.JWT_SECRET, token: allowed.payment_authorization.token, expected })));

keys = await seedDemo(store);
const first = payload({ nonce: "delegation-race-a" });
const second = payload({ nonce: "delegation-race-b" });
const delegationAttempts = await Promise.all(Array.from({ length: 10 }, (_, index) => {
  const p = index === 0 ? first : { ...second, nonce: `delegation-race-${index}` };
  return auth(p);
}));

const agent = store.find("agents", (a) => a.agent_id === "agent_7F92A");
const beforeReputation = agent.reputation_score;
const reputationEventsBefore = store.all("agentReputationEvents").length;
await Promise.all(Array.from({ length: 50 }, (_, index) => Promise.resolve(updateAgentReputation(store, "agent_7F92A", index % 2 ? "DENY" : "ALLOW", [index % 2 ? "NONCE_REUSED" : "COMBINED_LOW_RISK"]))));
await store.save();
const reputationEventsAfter = store.all("agentReputationEvents").length;

console.log(JSON.stringify({
  generated_at: new Date().toISOString(),
  latency_ms: Date.now() - started,
  results: [
    {
      test: "50 identical nonce requests",
      expected_winner_count: 1,
      pass_count: nonceAttempts.filter((r) => r.decision === "ALLOW").length,
      fail_count: nonceAttempts.filter((r) => r.reason_codes?.includes("NONCE_REUSED")).length,
      database_constraint: "unique(agent_id, nonce)"
    },
    {
      test: "20 same-token reserve attempts",
      expected_winner_count: 1,
      pass_count: tokenAttempts.filter((r) => r.ok && !r.idempotent).length,
      fail_count: tokenAttempts.filter((r) => r.reason_codes?.includes("TOKEN_ALREADY_RESERVED") || r.reason_codes?.includes("TOKEN_ALREADY_USED")).length,
      database_constraint: "payment_authorization_tokens.status guarded update"
    },
    {
      test: "10 same single-use delegation requests",
      expected_winner_count: 1,
      pass_count: delegationAttempts.filter((r) => r.decision === "ALLOW").length,
      fail_count: delegationAttempts.filter((r) => r.reason_codes?.includes("DELEGATION_ALREADY_USED")).length,
      database_constraint: "delegations.status guarded update"
    },
    {
      test: "50 concurrent reputation updates",
      expected_winner_count: 50,
      pass_count: reputationEventsAfter - reputationEventsBefore,
      fail_count: 0,
      database_constraint: "agent id keyed reputation history append",
      before_reputation: beforeReputation,
      after_reputation: agent.reputation_score
    }
  ]
}, null, 2));
