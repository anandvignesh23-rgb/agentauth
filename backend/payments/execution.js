import { id, verifyToken } from "../crypto.js";
import { getPaymentProvider } from "./provider.js";

export function inspectPaymentToken({ store, tokenSecret, token, expected }) {
  let claims;
  try {
    claims = verifyToken(tokenSecret, token);
  } catch (err) {
    return { valid: false, checks: [{ name: "Token signature / expiry", ok: false, reason_code: err.message }], reason_codes: [err.message] };
  }
  const record = store.find("tokens", (t) => t.token_id === claims.jti);
  const checks = [
    { name: "Token signature", ok: true, reason_code: "TOKEN_SIGNATURE_VALID" },
    { name: "Token issuer", ok: claims.iss === "AgentAuth", reason_code: claims.iss === "AgentAuth" ? "TOKEN_ISSUER_VALID" : "TOKEN_ISSUER_INVALID" },
    { name: "Token expiry", ok: true, reason_code: "TOKEN_NOT_EXPIRED" },
    { name: "Merchant binding", ok: String(expected?.merchant_id) === String(claims.merchant_id), reason_code: "MERCHANT_MISMATCH" },
    { name: "Order binding", ok: String(expected?.order_id) === String(claims.order_id), reason_code: "ORDER_MISMATCH" },
    { name: "Amount binding", ok: String(expected?.amount) === String(claims.amount), reason_code: "AMOUNT_MISMATCH" },
    { name: "Currency binding", ok: String(expected?.currency) === String(claims.currency), reason_code: "CURRENCY_MISMATCH" },
    { name: "One-time status", ok: Boolean(record) && record.status === "ACTIVE", reason_code: record?.status === "CONSUMED" ? "TOKEN_ALREADY_USED" : record?.status === "RESERVED" ? "TOKEN_ALREADY_RESERVED" : "TOKEN_NOT_ACTIVE" }
  ];
  const failed = checks.filter((c) => !c.ok);
  if (record?.revoked_at || record?.status === "REVOKED") failed.push({ name: "Revocation", ok: false, reason_code: "TOKEN_REVOKED" });
  const reason_codes = failed.map((f) => f.reason_code);
  return {
    valid: failed.length === 0,
    checks,
    reason_codes,
    claims,
    token_record: record
  };
}

export async function createPaymentExecution({ store, tokenSecret, token, expected }) {
  const inspection = inspectPaymentToken({ store, tokenSecret, token, expected });
  if (!inspection.valid) {
    try {
      const claims = verifyToken(tokenSecret, token);
      const existing = store.find("paymentExecutions", (p) => p.token_id === claims.jti);
      const expectedMatches = [
        ["merchant_id", claims.merchant_id],
        ["order_id", claims.order_id],
        ["amount", claims.amount],
        ["currency", claims.currency]
      ].every(([field, value]) => expected?.[field] === undefined || String(expected[field]) === String(value));
      if (existing && expectedMatches) return { ok: true, idempotent: true, execution: existing };
    } catch {
      // Return the original inspection failure below.
    }
    return { ok: false, ...inspection };
  }

  const tokenRecord = inspection.token_record;
  const existing = store.find("paymentExecutions", (p) => p.token_id === tokenRecord.token_id);
  if (existing) return { ok: true, idempotent: true, execution: existing };

  tokenRecord.status = "RESERVED";
  tokenRecord.reserved_at = new Date().toISOString();
  const execution = store.insert("paymentExecutions", {
    id: store.all("paymentExecutions").length + 1,
    execution_id: id("pex"),
    authorization_request_id: tokenRecord.request_id,
    token_id: tokenRecord.token_id,
    merchant_id: tokenRecord.merchant_id,
    order_id: tokenRecord.order_id,
    razorpay_order_id: null,
    razorpay_payment_id: null,
    amount: tokenRecord.amount,
    currency: tokenRecord.currency,
    status: "CREATED",
    created_at: new Date().toISOString(),
    paid_at: null,
    failed_at: null
  });
  store.audit(tokenRecord.request_id, "TOKEN_RESERVED", "MERCHANT", "Payment token reserved for execution.", { token_id: tokenRecord.token_id, execution_id: execution.execution_id });

  try {
    const provider = getPaymentProvider();
    const providerOrder = await provider.createOrder({
      amount: tokenRecord.amount,
      currency: tokenRecord.currency,
      receipt: tokenRecord.order_id
    });
    execution.razorpay_order_id = providerOrder.id;
    execution.provider_order = providerOrder;
    execution.status = "CHECKOUT_OPENED";
    tokenRecord.status = "CONSUMED";
    tokenRecord.consumed_at = new Date().toISOString();
    store.insert("razorpayOrders", {
      razorpay_order_id: providerOrder.id,
      amount: tokenRecord.amount,
      currency: tokenRecord.currency,
      receipt: tokenRecord.order_id,
      authorization_request_id: tokenRecord.request_id,
      merchant_id: tokenRecord.merchant_id,
      status: providerOrder.status,
      created_at: new Date().toISOString()
    });
    store.audit(tokenRecord.request_id, "RAZORPAY_ORDER_CREATED", "RAZORPAY", `Razorpay order ${providerOrder.id} created.`, { execution_id: execution.execution_id });
    store.save();
    return {
      ok: true,
      execution,
      checkout: {
        key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_mock",
        razorpay_order_id: providerOrder.id,
        amount: tokenRecord.amount,
        currency: tokenRecord.currency,
        merchant_display_name: tokenRecord.merchant_id
      }
    };
  } catch (err) {
    execution.status = "FAILED";
    execution.failed_at = new Date().toISOString();
    execution.error = err.message;
    tokenRecord.status = "ACTIVE";
    tokenRecord.reserved_at = null;
    store.audit(tokenRecord.request_id, "PAYMENT_ORDER_FAILED", "RAZORPAY", "Razorpay order creation failed.", { error: err.message });
    store.save();
    return { ok: false, error: err.message, status: err.status || 500 };
  }
}
