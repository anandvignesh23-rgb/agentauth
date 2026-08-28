import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { canonicalize, hmacHex, verifyPayload, verifyRazorpaySignature } from "../backend/crypto.js";
import { FixturePaymentProvider, RazorpayTestProvider } from "../backend/payments/provider.js";

function fixture(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

test("protocol vectors verify exact canonical payload and reject signed-field tampering", () => {
  const vector = fixture("tests/fixtures/protocol_vectors.json");
  assert.equal(canonicalize(vector.payload), vector.canonical_message);
  assert.equal(verifyPayload(vector.public_key, vector.payload, vector.valid_signature), true);
  for (const variant of vector.tampered_variants) {
    assert.equal(
      verifyPayload(vector.public_key, { ...vector.payload, [variant.field]: variant.value }, vector.valid_signature),
      false,
      variant.name
    );
  }
});

test("Razorpay documented order and payment fixtures map provider fields exactly", () => {
  const order = fixture("tests/fixtures/razorpay/order_created.json");
  const captured = fixture("tests/fixtures/razorpay/payment_captured.json");
  const failed = fixture("tests/fixtures/razorpay/payment_failed.json");
  assert.equal(order.id, "order_fixture_doc_001");
  assert.equal(order.amount, 499900);
  assert.equal(order.currency, "INR");
  assert.equal(order.status, "created");
  assert.equal(captured.id, "pay_fixture_doc_captured");
  assert.equal(captured.order_id, order.id);
  assert.equal(captured.status, "captured");
  assert.equal(failed.id, "pay_fixture_doc_failed");
  assert.equal(failed.order_id, order.id);
  assert.equal(failed.status, "failed");
});

test("checkout signature verification accepts only the exact order/payment pair", () => {
  const secret = "fixture_razorpay_secret";
  const orderId = "order_fixture_doc_001";
  const paymentId = "pay_fixture_doc_captured";
  const signature = hmacHex(secret, `${orderId}|${paymentId}`);
  assert.equal(verifyRazorpaySignature(secret, orderId, paymentId, signature), true);
  assert.equal(verifyRazorpaySignature(secret, `${orderId}_x`, paymentId, signature), false);
  assert.equal(verifyRazorpaySignature(secret, orderId, `${paymentId}_x`, signature), false);
  assert.equal(verifyRazorpaySignature(secret, orderId, paymentId, `${signature.slice(0, -1)}0`), false);
});

test("webhook signature verification uses raw body bytes", () => {
  process.env.FIXTURE_WEBHOOK_SECRET = "fixture-webhook-secret";
  const provider = new FixturePaymentProvider();
  const body = '{"id":"evt_fixture_001","event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_fixture_doc_captured","order_id":"order_fixture_doc_001","amount":499900,"currency":"INR","status":"captured"}}}}';
  const signature = hmacHex(process.env.FIXTURE_WEBHOOK_SECRET, body);
  const reserialized = JSON.stringify(JSON.parse(body), null, 2);
  assert.equal(provider.verifyWebhookSignature({ body, signature }), true);
  assert.equal(provider.verifyWebhookSignature({ body: body.replace("499900", "499901"), signature }), false);
  assert.equal(provider.verifyWebhookSignature({ body: reserialized, signature }), false);
  assert.equal(provider.verifyWebhookSignature({ body, signature: "" }), false);
  process.env.FIXTURE_WEBHOOK_SECRET = "wrong-secret";
  assert.equal(provider.verifyWebhookSignature({ body, signature }), false);
});

test("fixture provider behaves like a deterministic external PSP contract", async () => {
  const provider = new FixturePaymentProvider({ mode: "SUCCESS" });
  const order = await provider.createOrder({ amount: 499900, currency: "INR", receipt: "ORD-1934" });
  assert.equal(order.fixture, true);
  assert.equal(order.simulation_notice, "Provider contract simulation - no external payment processor call");
  assert.equal(order.status, "paid");
  const webhook = provider.normalizeWebhookEvent({
    id: "evt_fixture_capture",
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_fixture_doc_captured", order_id: order.id, amount: 499900, currency: "INR", status: "captured" } } }
  });
  assert.equal(webhook.provider, "fixture");
  assert.equal(webhook.event_type, "payment.captured");
  assert.equal(webhook.order_id, order.id);
  assert.equal(webhook.payment_id, "pay_fixture_doc_captured");
});

test("Razorpay adapter refuses live API work without credentials", async () => {
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  const provider = new RazorpayTestProvider();
  await assert.rejects(
    provider.createOrder({ amount: 499900, currency: "INR", receipt: "ORD-1934" }),
    /RAZORPAY_NOT_CONFIGURED/
  );
});
