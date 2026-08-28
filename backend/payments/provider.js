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
    available: ((provider === "fixture" || provider === "mock") && !isProduction) || (provider === "razorpay" && razorpayConfigured)
  };
}

export function getPaymentProvider() {
  const config = paymentConfig();
  if (config.provider === "fixture" || config.provider === "mock") {
    if ((process.env.ENVIRONMENT || process.env.NODE_ENV) === "production") {
      const err = new Error("FIXTURE_PAYMENT_PROVIDER_DISABLED_IN_PRODUCTION");
      err.status = 500;
      throw err;
    }
    return new FixturePaymentProvider();
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

  normalizeWebhookEvent(payload) {
    const payment = payload?.payload?.payment?.entity;
    const order = payload?.payload?.order?.entity;
    return {
      provider: "razorpay",
      external_event_id: payload?.id || null,
      event_type: payload?.event || "unknown",
      order_id: payment?.order_id || order?.id || null,
      payment_id: payment?.id || null,
      amount: payment?.amount ?? order?.amount ?? null,
      currency: payment?.currency || order?.currency || null,
      status: payment?.status || order?.status || null,
      raw: payload
    };
  }
}

export class FixturePaymentProvider {
  constructor({ mode = process.env.FIXTURE_PAYMENT_MODE || "SUCCESS" } = {}) {
    this.mode = mode;
  }

  async createOrder({ amount, currency, receipt }) {
    const minorAmount = assertMinorUnitAmount(amount);
    if (this.mode === "FAIL") {
      const err = new Error("FIXTURE_PAYMENT_FAILED");
      err.status = 402;
      throw err;
    }
    return {
      id: id("order_fixture"),
      entity: "order",
      amount: minorAmount,
      amount_due: minorAmount,
      amount_paid: 0,
      currency,
      receipt,
      status: this.mode === "PENDING" ? "created" : "paid",
      fixture: true,
      simulation_notice: "Provider contract simulation - no external payment processor call"
    };
  }

  async fetchOrder(orderId) {
    return { id: orderId, status: this.mode === "PENDING" ? "created" : "paid", fixture: true };
  }

  async fetchPayment(paymentId) {
    if (this.mode === "FAIL") return { id: paymentId, status: "failed", amount: null, currency: null, fixture: true };
    return { id: paymentId, status: this.mode === "PENDING" ? "authorized" : "captured", amount: null, currency: null, fixture: true };
  }

  verifyCheckoutSignature({ orderId, paymentId, signature }) {
    return timingSafeEqualText(signature, hmacHex(process.env.FIXTURE_CHECKOUT_SECRET || "fixture-checkout-secret", `${orderId}|${paymentId}`));
  }

  verifyWebhookSignature({ body, signature }) {
    const expected = hmacHex(process.env.FIXTURE_WEBHOOK_SECRET || "fixture-webhook-secret", body);
    return timingSafeEqualText(signature, expected);
  }

  normalizeWebhookEvent(payload) {
    const payment = payload?.payload?.payment?.entity;
    const order = payload?.payload?.order?.entity;
    return {
      provider: "fixture",
      external_event_id: payload?.id || hmacHex("fixture-event", JSON.stringify(payload)),
      event_type: payload?.event || "unknown",
      order_id: payment?.order_id || order?.id || null,
      payment_id: payment?.id || null,
      amount: payment?.amount ?? order?.amount ?? null,
      currency: payment?.currency || order?.currency || null,
      status: payment?.status || order?.status || null,
      raw: payload
    };
  }
}

export const MockPaymentProvider = FixturePaymentProvider;
