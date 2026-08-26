import { hmacHex, id, verifyRazorpaySignature } from "../crypto.js";

export function paymentConfig() {
  const provider = process.env.PAYMENT_PROVIDER || "razorpay";
  const razorpayConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  const webhookConfigured = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
  return {
    provider,
    razorpayConfigured,
    webhookConfigured,
    available: provider === "mock" || (provider === "razorpay" && razorpayConfigured)
  };
}

export function getPaymentProvider() {
  const config = paymentConfig();
  if (config.provider === "mock") return new MockPaymentProvider();
  if (config.provider === "razorpay") return new RazorpayTestProvider();
  throw new Error(`Unsupported PAYMENT_PROVIDER=${config.provider}`);
}

export class RazorpayTestProvider {
  async createOrder({ amount, currency, receipt }) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      const err = new Error("RAZORPAY_INTEGRATION_UNAVAILABLE");
      err.status = 424;
      throw err;
    }
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({ amount: Number(amount) * 100, currency, receipt })
    });
    const body = await res.json();
    if (!res.ok) {
      const err = new Error(body?.error?.description || "RAZORPAY_ORDER_CREATE_FAILED");
      err.status = res.status;
      err.provider_response = body;
      throw err;
    }
    return body;
  }

  async fetchOrder(orderId) {
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
    const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
      headers: { authorization: `Basic ${auth}` }
    });
    return res.json();
  }

  async fetchPayment(paymentId) {
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { authorization: `Basic ${auth}` }
    });
    return res.json();
  }

  verifyPayment({ orderId, paymentId, signature }) {
    return verifyRazorpaySignature(process.env.RAZORPAY_KEY_SECRET || "", orderId, paymentId, signature);
  }
}

export class MockPaymentProvider {
  async createOrder({ amount, currency, receipt }) {
    return {
      id: id("order_mock"),
      entity: "order",
      amount: Number(amount) * 100,
      amount_due: Number(amount) * 100,
      amount_paid: 0,
      currency,
      receipt,
      status: "created",
      mock: true
    };
  }

  async fetchOrder(orderId) {
    return { id: orderId, status: "created", mock: true };
  }

  async fetchPayment(paymentId) {
    return { id: paymentId, status: "captured", mock: true };
  }

  verifyPayment({ orderId, paymentId, signature }) {
    return signature === hmacHex("mock-secret", `${orderId}|${paymentId}`);
  }
}
