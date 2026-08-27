import assert from "node:assert/strict";
import { RazorpayTestProvider } from "../backend/payments/provider.js";

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.log("Skipping live Razorpay Test Mode check: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required.");
  process.exit(0);
}

const provider = new RazorpayTestProvider();
const order = await provider.createOrder({
  amount: Number(process.env.RAZORPAY_TEST_AMOUNT || 1000),
  currency: process.env.RAZORPAY_TEST_CURRENCY || "INR",
  receipt: `agentauth_test_${Date.now()}`
});
assert.equal(String(order.id).startsWith("order_"), true);
assert.equal(order.amount, Number(process.env.RAZORPAY_TEST_AMOUNT || 1000));
assert.equal(order.currency, process.env.RAZORPAY_TEST_CURRENCY || "INR");

const fetched = await provider.fetchOrder(order.id);
assert.equal(fetched.id, order.id);
assert.equal(fetched.amount, order.amount);
assert.equal(fetched.currency, order.currency);
console.log(JSON.stringify({ ok: true, razorpay_order_id: order.id, amount: order.amount, currency: order.currency }, null, 2));
