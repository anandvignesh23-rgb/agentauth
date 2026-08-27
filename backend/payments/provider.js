import { hmacHex, id, timingSafeEqualText, verifyRazorpaySignature } from "../crypto.js";

export function paymentConfig() {
  const provider = process.env.PAYMENT_PROVIDER || "razorpay";
  const isProduction = (process.env.ENVIRONMENT || process.env.NODE_ENV) === "production";
  const razorpayConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  const webhookConfigured = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
  return {
    provider,
    razorpayConfigured,
    webhookConfigured,
    available: (provider === "mock" && !isProduction) || (provider === "razorpay" && razorpayConfigured)
  };
}

export function getPaymentProvider() {
  const config = paymentConfig();
  if (config.provider === "mock") {
    if ((process.env.ENVIRONMENT || process.env.NODE_ENV) === "production") {
      const err = new Error("MOCK_PAYMENT_PROVIDER_DISABLED_IN_PRODUCTION");
      err.status = 500;
      throw err;
    }
    return new MockPaymentProvider();
  }
  if (config.provider === "razorpay") return new RazorpayTestProvider();
  throw new Error(`Unsupported PAYMENT_PROVIDER=${config.provider}`);
}

function requireRazorpayCredentials() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    const err = new Error("RAZORPAY_NOT_CONFIGURED");
    err.status = 424;
    throw err;
  }
}

function razorpayAuthHeader() {
  requireRazorpayCredentials();
  return `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
}

function assertMinorUnitAmount(amount) {
  const value = Number(amount);
  if (!Number.isInteger(value) || value <= 0) {
    const err = new Error("PAYMENT_AMOUNT_INVALID");
    err.status = 400;
    throw err;
  }
  return value;
}

export class RazorpayTestProvider {
  async createOrder({ amount, currency, receipt }) {
    const minorAmount = assertMinorUnitAmount(amount);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { authorization: razorpayAuthHeader(), "content-type": "application/json" },
      body: JSON.stringify({ amount: minorAmount, currency, receipt })
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error("RAZORPAY_ORDER_CREATION_FAILED");
      err.status = res.status;
      err.provider_message = body?.error?.description;
      err.provider_response = body;
      throw err;
    }
    if (!body?.id || !String(body.id).startsWith("order_")) {
      const err = new Error("RAZORPAY_ORDER_RESPONSE_INVALID");
      err.status = 502;
      throw err;
    }
    return body;
  }

  async fetchOrder(orderId) {
    const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
      headers: { authorization: razorpayAuthHeader() }
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error("RAZORPAY_ORDER_FETCH_FAILED");
      err.status = res.status;
      err.provider_message = body?.error?.description;
      throw err;
    }
    return body;
  }

  async fetchPayment(paymentId) {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { authorization: razorpayAuthHeader() }
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error("RAZORPAY_PAYMENT_FETCH_FAILED");
      err.status = res.status;
      err.provider_message = body?.error?.description;
      throw err;
    }
    return body;
  }

  verifyCheckoutSignature({ orderId, paymentId, signature }) {
    requireRazorpayCredentials();
    return verifyRazorpaySignature(process.env.RAZORPAY_KEY_SECRET || "", orderId, paymentId, signature);
  }

  verifyWebhookSignature({ body, signature }) {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      const err = new Error("RAZORPAY_WEBHOOK_SECRET_REQUIRED");
      err.status = 424;
      throw err;
    }
    const expected = hmacHex(process.env.RAZORPAY_WEBHOOK_SECRET, body);
    return timingSafeEqualText(signature, expected);
  }
}

export class MockPaymentProvider {
  async createOrder({ amount, currency, receipt }) {
    const minorAmount = assertMinorUnitAmount(amount);
    return {
      id: id("order_mock"),
      entity: "order",
      amount: minorAmount,
      amount_due: minorAmount,
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
    return { id: paymentId, status: "captured", amount: null, currency: null, mock: true };
  }

  verifyCheckoutSignature({ orderId, paymentId, signature }) {
    return signature === hmacHex("mock-secret", `${orderId}|${paymentId}`);
  }

  verifyWebhookSignature({ body, signature }) {
    const expected = hmacHex("mock-webhook-secret", body);
    return signature === expected;
  }
}
