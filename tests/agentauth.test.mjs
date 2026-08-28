import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalize, generateEd25519KeyPair, signPayload, verifyPayload } from "../backend/crypto.js";
import { authorizePayment, approveStepUp, verifyPaymentToken } from "../backend/pipeline.js";
import { createPaymentExecution } from "../backend/payments/execution.js";
import { aggregateRisk } from "../backend/risk/aggregator.js";
import { scoreAgentRisk } from "../backend/risk/agent_engine.js";
import { scoreTransactionRisk } from "../backend/risk/transaction_engine.js";
import { Store } from "../backend/store.js";

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentauth-test-"));
  const store = new Store(path.join(dir, "db.json"));
  const keys = generateEd25519KeyPair();
  store.reset({
    users: [{ id: "user_123", name: "Test", email: "test@example.com" }],
    agents: [{ agent_id: "agent_7F92A", name: "Shopping Copilot", developer_name: "Demo Labs", public_key: keys.publicKeyPem, status: "ACTIVE", reputation_score: 0.91, created_at: new Date().toISOString() }],
    merchants: [
      { merchant_id: "merchant_demo_electronics", name: "Demo Electronics", verification_status: "VERIFIED" },
      { merchant_id: "merchant_new_luxury", name: "New Luxury", verification_status: "PENDING" }
    ],
    delegations: [
      { delegation_id: "del_9217", user_id: "user_123", agent_id: "agent_7F92A", merchant_id: "merchant_demo_electronics", order_id: "ORD-1934", max_amount: 499900, currency: "INR", purpose: "Headphones", expires_at: new Date(Date.now() + 60_000).toISOString(), status: "ACTIVE", created_at: new Date().toISOString() },
      { delegation_id: "del_expired", user_id: "user_123", agent_id: "agent_7F92A", merchant_id: "merchant_demo_electronics", order_id: "ORD-OLD", max_amount: 499900, currency: "INR", purpose: "Old", expires_at: new Date(Date.now() - 60_000).toISOString(), status: "ACTIVE", created_at: new Date().toISOString() },
      { delegation_id: "del_highrisk", user_id: "user_123", agent_id: "agent_7F92A", merchant_id: "merchant_new_luxury", order_id: "ORD-40000", max_amount: 4000000, currency: "INR", purpose: "High", expires_at: new Date(Date.now() + 60_000).toISOString(), status: "ACTIVE", created_at: new Date().toISOString() }
    ],
    requests: [], decisions: [], tokens: [], nonces: [], audit: [], razorpayOrders: [], razorpayEvents: [], paymentExecutions: [],
    merchantOrders: [
      { merchant_id: "merchant_demo_electronics", external_order_id: "ORD-1934", description: "Headphones", amount: 499900, currency: "INR", status: "OPEN", created_at: new Date().toISOString(), paid_at: null },
      { merchant_id: "merchant_new_luxury", external_order_id: "ORD-40000", description: "High", amount: 4000000, currency: "INR", status: "OPEN", created_at: new Date().toISOString(), paid_at: null }
    ],
    webhookEvents: []
  });
  return { store, privateKeyPem: keys.privateKeyPem, tokenSecret: "test-secret" };
}

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

function auth(ctx, p, sig = signPayload(ctx.privateKeyPem, p)) {
  return authorizePayment({ store: ctx.store, tokenSecret: ctx.tokenSecret, payload: p, signature: sig, headerAgentId: p.agent_id });
}

test("allows a valid transaction and starts one exactly-once payment execution", async () => {
  process.env.PAYMENT_PROVIDER = "fixture";
  const ctx = fixture();
  const result = await auth(ctx, payload());
  assert.equal(result.decision, "ALLOW");
  assert.ok(result.payment_authorization.token);
  const verified = await verifyPaymentToken({
    store: ctx.store,
    tokenSecret: ctx.tokenSecret,
    token: result.payment_authorization.token,
    expected: { merchant_id: "merchant_demo_electronics", order_id: "ORD-1934", amount: 499900, currency: "INR" }
  });
  assert.equal(verified.valid, true);
  const execution = await createPaymentExecution({
    store: ctx.store,
    tokenSecret: ctx.tokenSecret,
    token: result.payment_authorization.token,
    expected: { merchant_id: "merchant_demo_electronics", order_id: "ORD-1934", amount: 499900, currency: "INR" }
  });
  assert.equal(execution.ok, true);
  assert.equal(execution.execution.status, "ORDER_CREATED");
  const replay = await createPaymentExecution({
    store: ctx.store,
    tokenSecret: ctx.tokenSecret,
    token: result.payment_authorization.token,
    expected: { merchant_id: "merchant_demo_electronics", order_id: "ORD-1934", amount: 499900, currency: "INR" }
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.idempotent, true);
});

test("rejects tampered amount after signing", async () => {
  const ctx = fixture();
  const original = payload();
  const sig = signPayload(ctx.privateKeyPem, original);
  const result = await auth(ctx, { ...original, amount: 9999 }, sig);
  assert.equal(result.decision, "DENY");
  assert.deepEqual(result.reason_codes, ["INVALID_SIGNATURE"]);
});

test("rejects replayed nonce", async () => {
  const ctx = fixture();
  const p = payload();
  const sig = signPayload(ctx.privateKeyPem, p);
  assert.equal((await auth(ctx, p, sig)).decision, "ALLOW");
  const replay = await auth(ctx, p, sig);
  assert.equal(replay.decision, "DENY");
  assert.deepEqual(replay.reason_codes, ["NONCE_REUSED"]);
});

test("rejects delegation scope violations", async () => {
  let ctx = fixture();
  assert.deepEqual((await auth(ctx, payload({ amount: 999900 }))).reason_codes, ["AMOUNT_EXCEEDS_DELEGATION"]);
  ctx = fixture();
  assert.deepEqual((await auth(ctx, payload({ merchant_id: "merchant_new_luxury" }))).reason_codes, ["MERCHANT_MISMATCH"]);
  ctx = fixture();
  assert.deepEqual((await auth(ctx, payload({ order_id: "ORD-OTHER" }))).reason_codes, ["ORDER_MISMATCH"]);
  ctx = fixture();
  assert.deepEqual((await auth(ctx, payload({ currency: "USD" }))).reason_codes, ["CURRENCY_MISMATCH"]);
});

test("rejects expired delegation", async () => {
  const ctx = fixture();
  const result = await auth(ctx, payload({ delegation_id: "del_expired", order_id: "ORD-OLD" }));
  assert.equal(result.decision, "DENY");
  assert.deepEqual(result.reason_codes, ["DELEGATION_EXPIRED"]);
});

test("produces step-up for medium risk and approval issues token", async () => {
  const ctx = fixture();
  const result = await auth(ctx, payload({ delegation_id: "del_highrisk", merchant_id: "merchant_new_luxury", order_id: "ORD-40000", amount: 4000000 }));
  assert.equal(result.decision, "STEP_UP");
  const approved = await approveStepUp({ store: ctx.store, tokenSecret: ctx.tokenSecret, request_id: result.request_id, approved: true });
  assert.equal(approved.decision, "ALLOW");
  assert.ok(approved.payment_authorization.token);
});

test("canonical signature vectors reject changed signed fields", () => {
  const ctx = fixture();
  const p = payload({ nonce: "vector_nonce", timestamp: "2026-08-24T10:31:20Z" });
  const sig = signPayload(ctx.privateKeyPem, p);
  assert.equal(canonicalize(p), [
    "agent_id=agent_7F92A",
    "delegation_id=del_9217",
    "merchant_id=merchant_demo_electronics",
    "order_id=ORD-1934",
    "amount=499900",
    "currency=INR",
    "nonce=vector_nonce",
    "timestamp=2026-08-24T10:31:20Z"
  ].join("\n"));
  assert.equal(verifyPayload(ctx.store.all("agents")[0].public_key, p, sig), true);
  for (const changed of [
    { amount: 9999 },
    { merchant_id: "merchant_new_luxury" },
    { order_id: "ORD-OTHER" },
    { nonce: "other_nonce" },
    { timestamp: "2026-08-24T10:32:20Z" }
  ]) {
    assert.equal(verifyPayload(ctx.store.all("agents")[0].public_key, { ...p, ...changed }, sig), false);
  }
});

test("published signature fixture validates and all tampered variants fail", () => {
  const vector = JSON.parse(fs.readFileSync("tests/fixtures/signature_vectors.json", "utf8"));
  assert.equal(canonicalize(vector.payload), vector.canonical_message);
  assert.equal(verifyPayload(vector.public_key, vector.payload, vector.valid_signature), true);
  for (const variant of vector.tampered_variants) {
    assert.equal(verifyPayload(vector.public_key, { ...vector.payload, [variant.field]: variant.value }, vector.valid_signature), false);
  }
});

test("100 simultaneous token consume requests reserve one token execution", async () => {
  process.env.PAYMENT_PROVIDER = "fixture";
  const ctx = fixture();
  const result = await auth(ctx, payload());
  const expected = { merchant_id: "merchant_demo_electronics", order_id: "ORD-1934", amount: 499900, currency: "INR" };
  const attempts = await Promise.all(Array.from({ length: 100 }, () => createPaymentExecution({ store: ctx.store, tokenSecret: ctx.tokenSecret, token: result.payment_authorization.token, expected })));
  assert.equal(ctx.store.all("paymentExecutions").length, 1);
  assert.equal(attempts.filter((a) => a.ok && !a.idempotent).length, 1);
  assert.equal(attempts.filter((a) => a.reason_codes?.includes("TOKEN_ALREADY_RESERVED") || a.reason_codes?.includes("TOKEN_ALREADY_USED")).length, 99);
});

test("revoked agent blocks future requests", async () => {
  const ctx = fixture();
  ctx.store.all("agents")[0].status = "REVOKED";
  const result = await auth(ctx, payload());
  assert.equal(result.decision, "DENY");
  assert.deepEqual(result.reason_codes, ["AGENT_REVOKED"]);
});

test("transaction fraud engine emits expected low and high amount reason codes", () => {
  const low = scoreTransactionRisk({
    amount: 199900,
    user_p95_amount: 500000,
    user_transaction_count: 10,
    merchant_seen_by_user: true,
    requests_last_1m: 1,
    recent_denials: 0,
    recent_replay_attempts: 0,
    recent_signature_failures: 0,
    user_typical_hours: [10],
    transaction_hour: 10,
    merchant_reputation_score: 0.9
  });
  assert.equal(low.reason_codes.includes("NORMAL_AMOUNT"), true);
  assert.equal(low.reason_codes.includes("KNOWN_MERCHANT"), true);
  assert.equal(low.transaction_risk_score < 0.2, true);

  const high = scoreTransactionRisk({
    amount: 4500000,
    user_p95_amount: 900000,
    user_transaction_count: 10,
    merchant_seen_by_user: false,
    requests_last_1m: 6,
    recent_denials: 2,
    recent_replay_attempts: 0,
    recent_signature_failures: 0,
    user_typical_hours: [10],
    transaction_hour: 3,
    merchant_reputation_score: 0.35
  });
  assert.equal(high.reason_codes.includes("EXTREME_AMOUNT_ANOMALY"), true);
  assert.equal(high.reason_codes.includes("NEW_MERCHANT"), true);
  assert.equal(high.transaction_risk_score >= 0.65, true);
});

test("agent-aware risk flags suspicious autonomous behavior", () => {
  const result = scoreAgentRisk({
    current_amount_vs_agent_p95: 8,
    requests_last_10m: 20,
    agent_delegation_violation_rate: 0.8,
    recent_policy_violations: 8,
    recent_replay_attempts: 1,
    agent_replay_attempt_rate: 0.2,
    recent_signature_failures: 3,
    agent_signature_failure_rate: 0.2,
    recent_merchant_count: 12,
    recent_user_count: 6,
    key_rotated_recently: true,
    reputation_score: 0.35
  });
  assert.equal(result.agent_risk_score >= 0.75, true);
  assert.equal(result.reason_codes.includes("AGENT_HIGH_VELOCITY"), true);
  assert.equal(result.reason_codes.includes("AGENT_REPLAY_ACTIVITY"), true);
  assert.equal(result.reason_codes.includes("AGENT_LOW_REPUTATION"), true);
});

test("combined risk policy separates transaction and agent risk", () => {
  const low = aggregateRisk({ transaction_risk_score: 0.1 }, { agent_risk_score: 0.1, signals: { replay_activity: 0 } });
  assert.equal(low.decision, "ALLOW");
  const mediumTransaction = aggregateRisk({ transaction_risk_score: 0.5 }, { agent_risk_score: 0.1, signals: { replay_activity: 0 } });
  assert.equal(mediumTransaction.decision, "STEP_UP");
  const highBoth = aggregateRisk({ transaction_risk_score: 0.9 }, { agent_risk_score: 0.9, signals: { replay_activity: 0 } });
  assert.equal(highBoth.decision, "DENY");
});

test("risk snapshot is stored and policy violations lower reputation", async () => {
  const ctx = fixture();
  const before = ctx.store.all("agents")[0].reputation_score;
  const bad = await auth(ctx, payload({ merchant_id: "merchant_new_luxury", nonce: "bad-nonce" }));
  assert.equal(bad.decision, "DENY");
  const after = ctx.store.all("agents")[0].reputation_score;
  assert.equal(after < before, true);
  assert.equal(ctx.store.find("agentRiskProfiles", (p) => p.agent_id === "agent_7F92A").delegation_violations >= 1, true);

  const clean = fixture();
  const allowed = await auth(clean, payload());
  assert.equal(clean.store.all("transactionRiskSnapshots").length, 1);
  assert.equal(allowed.risk.transaction_score < 0.45, true);
});

test("concurrent identical signed requests reserve a nonce once", async () => {
  const ctx = fixture();
  const p = payload({ nonce: "shared-nonce" });
  const sig = signPayload(ctx.privateKeyPem, p);
  const attempts = await Promise.all(Array.from({ length: 50 }, () => auth(ctx, p, sig)));
  assert.equal(attempts.filter((r) => r.decision === "ALLOW").length, 1);
  assert.equal(attempts.filter((r) => r.reason_codes?.includes("NONCE_REUSED")).length, 49);
});

test("two valid requests cannot consume the same single-use delegation", async () => {
  const ctx = fixture();
  const first = payload({ nonce: "first-delegation-use" });
  const second = payload({ nonce: "second-delegation-use" });
  const attempts = await Promise.all([
    auth(ctx, first, signPayload(ctx.privateKeyPem, first)),
    auth(ctx, second, signPayload(ctx.privateKeyPem, second))
  ]);
  assert.equal(attempts.filter((r) => r.decision === "ALLOW").length, 1);
  assert.equal(attempts.filter((r) => r.reason_codes?.includes("DELEGATION_ALREADY_USED")).length, 1);
});
