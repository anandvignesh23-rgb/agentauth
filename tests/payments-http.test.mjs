import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.ENVIRONMENT = "test";
process.env.NODE_ENV = "test";
process.env.PAYMENT_PROVIDER = "mock";
process.env.JWT_SECRET = "test-secret";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentauth-http-"));

const { handleAgentAuthRequest } = await import("../backend/app.js");

function hmac(secret, body) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function withServer(fn) {
  const server = http.createServer((req, res) => handleAgentAuthRequest(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(baseUrl, path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

test("payment order route returns checkout-safe minor-unit Razorpay payload exactly once", async () => {
  await withServer(async (baseUrl) => {
    await request(baseUrl, "/v1/dev/reset", { method: "POST" });
    const lab = await request(baseUrl, "/v1/security-lab/run", { method: "POST", body: { scenario: "valid" } });
    assert.equal(lab.status, 200);
    assert.equal(lab.body.result.decision, "ALLOW");

    const expected = { merchant_id: "merchant_demo_electronics", order_id: lab.body.result.payment_authorization.claims?.order_id || lab.body.canonical.match(/order_id=(.+)/)[1], amount: 499900, currency: "INR" };
    const first = await request(baseUrl, "/v1/payments/create-order", {
      method: "POST",
      body: { token: lab.body.result.payment_authorization.token, ...expected }
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.checkout.amount, 499900);
    assert.equal(first.body.checkout.razorpay_order_id.startsWith("order_mock_"), true);
    assert.equal(first.body.checkout.key_id, "rzp_test_mock");
    assert.equal(first.body.execution.status, "ORDER_CREATED");

    const second = await request(baseUrl, "/v1/payments/create-order", {
      method: "POST",
      body: { token: lab.body.result.payment_authorization.token, ...expected }
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.idempotent, true);
    assert.equal(second.body.execution.execution_id, first.body.execution.execution_id);
  });
});

test("checkout verification rejects tampered signatures and accepts provider-verified callbacks", async () => {
  await withServer(async (baseUrl) => {
    await request(baseUrl, "/v1/dev/reset", { method: "POST" });
    const lab = await request(baseUrl, "/v1/security-lab/run", { method: "POST", body: { scenario: "valid" } });
    const orderId = lab.body.canonical.match(/order_id=(.+)/)[1];
    const created = await request(baseUrl, "/v1/payments/create-order", {
      method: "POST",
      body: { token: lab.body.result.payment_authorization.token, merchant_id: "merchant_demo_electronics", order_id: orderId, amount: 499900, currency: "INR" }
    });
    const razorpayOrderId = created.body.checkout.razorpay_order_id;

    const bad = await request(baseUrl, "/v1/payments/verify", {
      method: "POST",
      body: { razorpay_order_id: razorpayOrderId, razorpay_payment_id: "pay_mock_bad", razorpay_signature: "bad" }
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, "RAZORPAY_SIGNATURE_INVALID");

    const paymentId = "pay_mock_good";
    const good = await request(baseUrl, "/v1/payments/verify", {
      method: "POST",
      body: { razorpay_order_id: razorpayOrderId, razorpay_payment_id: paymentId, razorpay_signature: hmac("mock-secret", `${razorpayOrderId}|${paymentId}`) }
    });
    assert.equal(good.status, 200);
    assert.equal(good.body.valid, true);
    assert.equal(good.body.status, "CAPTURED");
  });
});

test("webhook verification rejects fake signatures and deduplicates valid capture events", async () => {
  await withServer(async (baseUrl) => {
    await request(baseUrl, "/v1/dev/reset", { method: "POST" });
    const lab = await request(baseUrl, "/v1/security-lab/run", { method: "POST", body: { scenario: "valid" } });
    const orderId = lab.body.canonical.match(/order_id=(.+)/)[1];
    const created = await request(baseUrl, "/v1/payments/create-order", {
      method: "POST",
      body: { token: lab.body.result.payment_authorization.token, merchant_id: "merchant_demo_electronics", order_id: orderId, amount: 499900, currency: "INR" }
    });
    const payload = {
      id: "evt_mock_capture_once",
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_mock_webhook",
            order_id: created.body.checkout.razorpay_order_id,
            amount: 499900,
            currency: "INR",
            status: "captured"
          }
        }
      }
    };
    const text = JSON.stringify(payload);
    const fake = await fetch(`${baseUrl}/webhooks/razorpay`, { method: "POST", headers: { "x-razorpay-signature": "fake" }, body: text });
    assert.equal(fake.status, 400);

    const signature = hmac("mock-webhook-secret", text);
    const first = await fetch(`${baseUrl}/webhooks/razorpay`, { method: "POST", headers: { "x-razorpay-signature": signature }, body: text });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).ok, true);

    const second = await fetch(`${baseUrl}/webhooks/razorpay`, { method: "POST", headers: { "x-razorpay-signature": signature }, body: text });
    const duplicate = await second.json();
    assert.equal(second.status, 200);
    assert.equal(duplicate.duplicate, true);
  });
});
