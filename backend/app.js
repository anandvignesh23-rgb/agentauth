import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalize, generateEd25519KeyPair, fingerprint, hmacHex, id, signDelegationCredential, signPayload } from "./crypto.js";
import { authorizePayment, approveStepUp, verifyPaymentToken } from "./pipeline.js";
import { createPaymentExecution } from "./payments/execution.js";
import { paymentConfig, getPaymentProvider } from "./payments/provider.js";
import { reconcilePaymentExecution } from "./payments/reconciliation.js";
import { buildRiskProfiles } from "./risk/features.js";
import { seedDemo } from "./seed.js";
import { createAppStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const environment = process.env.ENVIRONMENT || process.env.NODE_ENV || "development";
const isProduction = environment === "production";
const isVercel = Boolean(process.env.VERCEL);
const dataDir = process.env.DATA_DIR || (isVercel ? "/tmp/agentauth" : path.join(root, "data"));
process.env.DATA_DIR ||= dataDir;
const tokenSecret = process.env.JWT_SECRET || process.env.AGENTAUTH_TOKEN_SECRET || (isProduction ? null : "dev-only-token-secret");
if (!tokenSecret) {
  console.error("JWT_SECRET or AGENTAUTH_TOKEN_SECRET is required when ENVIRONMENT=production.");
  process.exit(1);
}

function json(res, status, body) {
  const corsOrigin = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || (isProduction ? "https://example.invalid" : "http://127.0.0.1:8787");
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": corsOrigin,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self' https://checkout.razorpay.com; img-src 'self' https://images.unsplash.com data:; style-src 'self' 'unsafe-inline'; script-src 'self' https://checkout.razorpay.com"
  });
  res.end(JSON.stringify(body, null, 2));
}

async function body(req) {
  const text = await rawBody(req);
  return text ? JSON.parse(text) : {};
}

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function metrics() {
  const decisions = store.all("decisions");
  const denied = decisions.filter((d) => d.decision === "DENY");
  return {
    authorization_requests_total: store.all("requests").length,
    authorization_allowed: decisions.filter((d) => d.decision === "ALLOW").length,
    authorization_denied: denied.length,
    authorization_step_up: decisions.filter((d) => d.decision === "STEP_UP").length,
    signature_failures: denied.filter((d) => d.reason_codes.includes("INVALID_SIGNATURE")).length,
    replay_attempts_blocked: denied.filter((d) => d.reason_codes.includes("NONCE_REUSED")).length,
    delegation_violations: denied.filter((d) => d.reason_codes.some((c) => c.includes("DELEGATION") || c.includes("MISMATCH") || c.includes("AMOUNT"))).length,
    high_risk_requests: decisions.filter((d) => d.reason_codes.includes("HIGH_RISK") || d.reason_codes.includes("MEDIUM_RISK")).length,
    payment_tokens_issued: store.all("tokens").length,
    payment_tokens_consumed: store.all("tokens").filter((t) => t.consumed_at).length,
    payment_executions: store.all("paymentExecutions").length,
    webhooks_verified: store.all("webhookEvents").filter((e) => e.status === "PROCESSED").length
  };
}

function serveStatic(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : req.url === "/security-lab" ? "/security-lab.html" : req.url;
  const file = path.join(root, "frontend", path.normalize(urlPath));
  if (!file.startsWith(path.join(root, "frontend")) || !fs.existsSync(file)) return false;
  const type = file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html";
  res.writeHead(200, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
  res.end(fs.readFileSync(file));
  return true;
}

export async function handleAgentAuthRequest(req, res) {
  try {
    const store = await createAppStore({ file: path.join(dataDir, "agentauth.json") });
    if (req.method === "OPTIONS") return json(res, 200, {});
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname === "/api" ? "/" : url.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
    if (req.method === "GET" && serveStatic(req, res)) return;
    if (req.method === "GET" && p === "/health") return json(res, 200, {
      status: "ok",
      ...(isVercel ? { runtime: "vercel", persistence: store.kind === "postgres" ? "supabase_postgres" : "temporary" } : {}),
      environment,
      database_connected: store.kind === "postgres",
      database: store.kind === "postgres" ? "supabase_postgres" : "demo_store",
      ...(store.kind === "json" ? { data_dir: dataDir } : {}),
      razorpay_configured: paymentConfig().razorpayConfigured,
      razorpay_webhook_configured: paymentConfig().webhookConfigured,
      payment_provider: paymentConfig().provider,
      payment_integration_available: paymentConfig().available
    });
    if (req.method === "GET" && p === "/openapi.json") return json(res, 200, {
      openapi: "3.1.0",
      info: { title: "AgentAuth API", version: "0.1.0" },
      paths: {
        "/health": { get: { summary: "Deployment health check" } },
        "/v1/agents": { get: { summary: "List agents" }, post: { summary: "Register agent" } },
        "/v1/delegations": { get: { summary: "List delegations" }, post: { summary: "Create delegation" } },
        "/v1/authorize-payment": { post: { summary: "Authorize signed agent payment request" } },
        "/v1/verify-payment-token": { post: { summary: "Verify AgentAuth payment token" } },
        "/v1/risk/requests/{request_id}": { get: { summary: "Get risk snapshot" } },
        "/v1/dashboard": { get: { summary: "Dashboard payload" } }
      }
    });
    if (req.method === "GET" && p === "/docs") {
      res.writeHead(200, { "content-type": "text/html", "x-content-type-options": "nosniff" });
      res.end("<!doctype html><title>AgentAuth API</title><h1>AgentAuth API</h1><p>OpenAPI JSON is available at <a href=\"/openapi.json\">/openapi.json</a>.</p>");
      return;
    }
    if (req.method === "POST" && p === "/v1/dev/reset") {
      await seedDemo(store);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && p === "/v1/agents") {
      const data = await body(req);
      const keys = data.public_key ? null : generateEd25519KeyPair();
      const agent = store.insert("agents", {
        id: store.all("agents").length + 1,
        agent_id: id("agent"),
        name: data.name,
        developer_name: data.developer_name,
        public_key: data.public_key || keys.publicKeyPem,
        public_key_fingerprint: fingerprint(data.public_key || keys.publicKeyPem),
        status: "ACTIVE",
        reputation_score: data.reputation_score ?? 0.8,
        created_at: new Date().toISOString(),
        revoked_at: null
      });
      await store.save();
      return json(res, 201, { agent_id: agent.agent_id, status: agent.status, ...(keys && !isProduction ? { demo_private_key: keys.privateKeyPem } : {}) });
    }
    if (req.method === "GET" && p === "/v1/agents") return json(res, 200, store.all("agents").map(({ public_key, ...a }) => a));
    if (req.method === "GET" && p.match(/^\/v1\/agents\/[^/]+$/)) {
      const agent = store.find("agents", (a) => a.agent_id === p.split("/").pop());
      if (!agent) return json(res, 404, { error: "UNKNOWN_AGENT" });
      const { public_key, ...safe } = agent;
      return json(res, 200, safe);
    }
    if (req.method === "POST" && p.match(/^\/v1\/agents\/[^/]+\/revoke$/)) {
      const agent_id = p.split("/")[3];
      const agent = store.find("agents", (a) => a.agent_id === agent_id);
      if (!agent) return json(res, 404, { error: "UNKNOWN_AGENT" });
      agent.status = "REVOKED";
      agent.revoked_at = new Date().toISOString();
      const cascade = process.env.REVOKE_AGENT_DELEGATIONS !== "false";
      if (cascade) {
        for (const delegation of store.all("delegations").filter((d) => d.agent_id === agent_id && d.status === "ACTIVE")) {
          delegation.status = "REVOKED";
          delegation.revoked_at = agent.revoked_at;
        }
      }
      await store.save();
      return json(res, 200, { agent_id, status: "REVOKED", active_delegations_revoked: cascade });
    }
    if (req.method === "POST" && p.match(/^\/v1\/agents\/[^/]+\/rotate-key$/)) {
      const agent_id = p.split("/")[3];
      const data = await body(req);
      const agent = store.find("agents", (a) => a.agent_id === agent_id);
      if (!agent) return json(res, 404, { error: "UNKNOWN_AGENT" });
      const oldFingerprint = agent.public_key_fingerprint;
      agent.public_key = data.public_key;
      agent.public_key_fingerprint = fingerprint(data.public_key);
      agent.key_rotated_at = new Date().toISOString();
      agent.last_key_rotation_at = agent.key_rotated_at;
      agent.key_rotation_count = (agent.key_rotation_count || 0) + 1;
      store.audit(null, "AGENT_KEY_ROTATED", "DEVELOPER", `Agent ${agent_id} public key rotated.`, { agent_id, old_fingerprint: oldFingerprint, new_fingerprint: agent.public_key_fingerprint });
      await store.save();
      return json(res, 200, { agent_id, public_key_fingerprint: agent.public_key_fingerprint, status: agent.status });
    }
    if (req.method === "GET" && p === "/v1/merchants") return json(res, 200, store.all("merchants"));
    if (req.method === "POST" && p === "/v1/delegations") {
      const data = await body(req);
      const delegation = store.insert("delegations", {
        id: store.all("delegations").length + 1,
        delegation_id: id("del"),
        user_id: data.user_id || "user_123",
        agent_id: data.agent_id,
        merchant_id: data.merchant_id,
        order_id: data.order_id,
        max_amount: Number(data.max_amount),
        currency: data.currency,
        purpose: data.purpose || "",
        expires_at: data.expires_at,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        used_at: null,
        revoked_at: null
      });
      delegation.delegation_credential = signDelegationCredential(tokenSecret, delegation);
      await store.save();
      return json(res, 201, delegation);
    }
    if (req.method === "GET" && p === "/v1/delegations") return json(res, 200, store.all("delegations"));
    if (req.method === "POST" && p.match(/^\/v1\/delegations\/[^/]+\/revoke$/)) {
      const delegation_id = p.split("/")[3];
      const d = store.find("delegations", (x) => x.delegation_id === delegation_id);
      if (!d) return json(res, 404, { error: "DELEGATION_NOT_FOUND" });
      d.status = "REVOKED";
      d.revoked_at = new Date().toISOString();
      await store.save();
      return json(res, 200, { delegation_id, status: "REVOKED" });
    }
    if (req.method === "POST" && p === "/v1/authorize-payment") {
      const payload = await body(req);
      return json(res, 200, await authorizePayment({ store, tokenSecret, payload, signature: req.headers["x-agent-signature"], headerAgentId: req.headers["x-agent-id"] }));
    }
    if (req.method === "GET" && p.match(/^\/v1\/authorization-requests\/[^/]+\/audit\/export$/)) {
      const request_id = p.split("/")[3];
      const request = store.find("requests", (r) => r.request_id === request_id);
      return json(res, 200, {
        request,
        agent: store.find("agents", (a) => a.agent_id === request?.agent_id),
        delegation: store.find("delegations", (d) => d.delegation_id === request?.delegation_id),
        decisions: store.all("decisions").filter((d) => d.request_id === request_id),
        tokens: store.all("tokens").filter((t) => t.request_id === request_id).map(({ token, claims, ...safe }) => safe),
        payment_executions: store.all("paymentExecutions").filter((e) => e.authorization_request_id === request_id),
        audit: store.all("audit").filter((a) => a.request_id === request_id)
      });
    }
    if (req.method === "GET" && p.startsWith("/v1/authorization-requests/") && p.endsWith("/audit")) {
      const request_id = p.split("/")[3];
      return json(res, 200, store.all("audit").filter((a) => a.request_id === request_id));
    }
    if (req.method === "GET" && p.startsWith("/v1/authorization-requests/")) {
      const request_id = p.split("/").pop();
      return json(res, 200, {
        request: store.find("requests", (r) => r.request_id === request_id),
        decisions: store.all("decisions").filter((d) => d.request_id === request_id),
        audit: store.all("audit").filter((a) => a.request_id === request_id)
      });
    }
    if (req.method === "POST" && p.match(/^\/v1\/authorization-requests\/[^/]+\/(approve|deny)$/)) {
      const parts = p.split("/");
      const result = await approveStepUp({ store, tokenSecret, request_id: parts[3], approved: parts[4] === "approve" });
      return result ? json(res, 200, result) : json(res, 404, { error: "STEP_UP_REQUEST_NOT_FOUND" });
    }
    if (req.method === "POST" && p === "/v1/verify-payment-token") {
      const data = await body(req);
      return json(res, 200, await verifyPaymentToken({ store, tokenSecret, token: data.token, expected: data }));
    }
    if (req.method === "POST" && p.match(/^\/v1\/payment-tokens\/[^/]+\/revoke$/)) {
      const token_id = p.split("/")[3];
      const t = store.find("tokens", (x) => x.token_id === token_id);
      if (!t) return json(res, 404, { error: "TOKEN_NOT_FOUND" });
      t.revoked_at = new Date().toISOString();
      t.status = "REVOKED";
      await store.save();
      return json(res, 200, { token_id, status: "REVOKED" });
    }
    if (req.method === "POST" && p === "/v1/payments/create-order") {
      const data = await body(req);
      const result = await createPaymentExecution({
        store,
        tokenSecret,
        token: data.token,
        expected: { merchant_id: data.merchant_id, order_id: data.order_id, amount: data.amount, currency: data.currency }
      });
      return json(res, result.ok ? 200 : (result.status || 409), result);
    }
    if (req.method === "POST" && p === "/v1/payments/verify") {
      const data = await body(req);
      const provider = getPaymentProvider();
      const execution = store.find("paymentExecutions", (e) => e.razorpay_order_id === data.razorpay_order_id);
      if (!execution) return json(res, 404, { valid: false, error: "PAYMENT_EXECUTION_NOT_FOUND" });
      const ok = provider.verifyCheckoutSignature({ orderId: execution.razorpay_order_id, paymentId: data.razorpay_payment_id, signature: data.razorpay_signature });
      if (!ok) {
        store.audit(execution.authorization_request_id, "RAZORPAY_CHECKOUT_SIGNATURE_INVALID", "RAZORPAY", "Razorpay checkout callback signature rejected.", { razorpay_order_id: data.razorpay_order_id });
        await store.save();
        return json(res, 400, { valid: false, error: "RAZORPAY_SIGNATURE_INVALID", execution_id: execution.execution_id });
      }
      const payment = await provider.fetchPayment(data.razorpay_payment_id);
      const providerMatches = (!payment.order_id || payment.order_id === execution.razorpay_order_id) &&
        (payment.amount === null || payment.amount === undefined || Number(payment.amount) === Number(execution.amount)) &&
        (!payment.currency || payment.currency === execution.currency);
      if (!providerMatches) {
        store.audit(execution.authorization_request_id, "PAYMENT_STATE_MISMATCH", "RAZORPAY", "Razorpay payment state did not match local execution.", { razorpay_payment_id: data.razorpay_payment_id });
        await store.save();
        return json(res, 409, { valid: false, error: "PAYMENT_STATE_MISMATCH", execution_id: execution.execution_id });
      }
      execution.razorpay_payment_id = data.razorpay_payment_id;
      execution.client_signature_verified_at = new Date().toISOString();
      execution.provider_payment = payment;
      execution.provider_verified_at = new Date().toISOString();
      execution.status = payment.status === "captured" ? "CAPTURED" : "AUTHORIZED";
      store.audit(execution.authorization_request_id, "RAZORPAY_CHECKOUT_VERIFIED", "RAZORPAY", "Razorpay checkout callback signature verified.", { razorpay_payment_id: data.razorpay_payment_id });
      if (execution.status === "CAPTURED") {
        execution.paid_at = new Date().toISOString();
        const merchantOrder = store.find("merchantOrders", (o) => o.merchant_id === execution.merchant_id && o.external_order_id === execution.order_id);
        if (merchantOrder) {
          merchantOrder.status = "PAID";
          merchantOrder.paid_at = execution.paid_at;
          merchantOrder.razorpay_payment_id = data.razorpay_payment_id;
          await store.persistRecord?.("merchantOrders", merchantOrder);
          store.audit(execution.authorization_request_id, "MERCHANT_ORDER_PAID", "AGENTAUTH", `Merchant order ${merchantOrder.external_order_id} marked PAID.`, { execution_id: execution.execution_id });
        }
        store.audit(execution.authorization_request_id, "PAYMENT_CAPTURED", "RAZORPAY", `Payment execution ${execution.execution_id} captured after provider verification.`, { razorpay_payment_id: data.razorpay_payment_id });
      }
      await store.persistRecord?.("paymentExecutions", execution);
      await store.save();
      return json(res, 200, { valid: true, execution_id: execution.execution_id, status: execution.status });
    }
    if (req.method === "POST" && p === "/v1/payments/reconcile") {
      const data = await body(req);
      const execution = await reconcilePaymentExecution({ store, provider: getPaymentProvider(), execution_id: data.execution_id });
      return execution ? json(res, 200, execution) : json(res, 404, { error: "PAYMENT_EXECUTION_NOT_FOUND" });
    }
    if (req.method === "POST" && p === "/webhooks/razorpay") {
      const text = await rawBody(req);
      const provider = getPaymentProvider();
      const got = req.headers["x-razorpay-signature"] || "";
      if (!provider.verifyWebhookSignature({ body: text, signature: got })) {
        store.audit(null, "RAZORPAY_WEBHOOK_SIGNATURE_INVALID", "RAZORPAY", "Razorpay webhook signature rejected.", { payload_hash: hmacHex("payload", text) });
        await store.save();
        return json(res, 400, { error: "RAZORPAY_WEBHOOK_SIGNATURE_INVALID" });
      }
      const payload = JSON.parse(text);
      const external_event_id = payload.id || hmacHex(process.env.RAZORPAY_WEBHOOK_SECRET, text);
      const existing = store.find("webhookEvents", (e) => e.provider === "razorpay" && e.external_event_id === external_event_id);
      if (existing) {
        store.audit(null, "RAZORPAY_WEBHOOK_DUPLICATE", "RAZORPAY", "Duplicate Razorpay webhook ignored.", { external_event_id });
        await store.save();
        return json(res, 200, { ok: true, duplicate: true, event_id: existing.id });
      }
      const event = store.insert("webhookEvents", {
        id: store.all("webhookEvents").length + 1,
        provider: "razorpay",
        external_event_id,
        event_type: payload.event,
        payload_hash: hmacHex("payload", text),
        received_at: new Date().toISOString(),
        processed_at: null,
        status: "RECEIVED"
      });
      store.audit(null, "RAZORPAY_WEBHOOK_RECEIVED", "RAZORPAY", `Razorpay webhook ${payload.event} received.`, { external_event_id });
      store.audit(null, "RAZORPAY_WEBHOOK_VERIFIED", "RAZORPAY", `Razorpay webhook ${payload.event} signature verified.`, { external_event_id });
      const orderId = payload.payload?.payment?.entity?.order_id || payload.payload?.order?.entity?.id;
      const execution = store.find("paymentExecutions", (e) => e.razorpay_order_id === orderId);
      if (execution) {
        const paymentEntity = payload.payload?.payment?.entity;
        if (paymentEntity?.id) execution.razorpay_payment_id = paymentEntity.id;
        if (payload.event === "payment.authorized") {
          execution.status = "AUTHORIZED";
        }
        if (payload.event === "payment.captured" || payload.event === "order.paid") {
          execution.status = "CAPTURED";
          execution.paid_at = new Date().toISOString();
          const merchantOrder = store.find("merchantOrders", (o) => o.merchant_id === execution.merchant_id && o.external_order_id === execution.order_id);
          if (merchantOrder) {
            merchantOrder.status = "PAID";
            merchantOrder.paid_at = execution.paid_at;
            merchantOrder.razorpay_payment_id = execution.razorpay_payment_id;
            await store.persistRecord?.("merchantOrders", merchantOrder);
            store.audit(execution.authorization_request_id, "MERCHANT_ORDER_PAID", "AGENTAUTH", `Merchant order ${merchantOrder.external_order_id} marked PAID.`, { execution_id: execution.execution_id });
          }
          store.audit(execution.authorization_request_id, "PAYMENT_CAPTURED", "RAZORPAY", `Payment execution ${execution.execution_id} captured by webhook.`, { external_event_id });
        }
        if (payload.event === "payment.failed") {
          execution.status = "FAILED";
          execution.failed_at = new Date().toISOString();
          store.audit(execution.authorization_request_id, "PAYMENT_FAILED", "RAZORPAY", `Payment execution ${execution.execution_id} failed by webhook.`, { external_event_id });
        }
        store.audit(execution.authorization_request_id, "RAZORPAY_WEBHOOK_PROCESSED", "RAZORPAY", `Webhook ${payload.event} processed.`, { external_event_id });
        await store.persistRecord?.("paymentExecutions", execution);
      }
      event.status = "PROCESSED";
      event.processed_at = new Date().toISOString();
      await store.save();
      return json(res, 200, { ok: true, event_id: event.id });
    }
    if (req.method === "POST" && p === "/v1/security-lab/run") {
      const data = await body(req);
      const keyPath = path.join(dataDir, "demo-agent-private.pem");
      const publicKeyPath = path.join(dataDir, "demo-agent-public.pem");
      let privateKey;
      if (!store.find("agents", (a) => a.agent_id === "agent_7F92A") || !store.find("merchants", (m) => m.merchant_id === "merchant_demo_electronics") || !store.find("users", (u) => u.id === "user_123" || u.user_id === "user_123")) {
        const keys = await seedDemo(store);
        privateKey = keys.privateKeyPem;
      } else {
        const keys = generateEd25519KeyPair();
        const agent = store.find("agents", (a) => a.agent_id === "agent_7F92A");
        agent.public_key = keys.publicKeyPem;
        agent.public_key_fingerprint = fingerprint(keys.publicKeyPem);
        agent.last_key_rotation_at = new Date().toISOString();
        agent.key_rotation_count = (agent.key_rotation_count || 0) + 1;
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(keyPath, keys.privateKeyPem);
        fs.writeFileSync(publicKeyPath, keys.publicKeyPem);
        await store.persistRecord?.("agents", agent);
        privateKey = keys.privateKeyPem;
      }
      const base = {
        agent_id: "agent_7F92A",
        delegation_id: "del_9217",
        merchant_id: "merchant_demo_electronics",
        order_id: "ORD-1934",
        amount: 499900,
        currency: "INR",
        nonce: id("nonce"),
        timestamp: new Date().toISOString()
      };
      const createScenarioDelegation = (overrides) => {
        const delegation = {
          id: store.all("delegations").length + 1,
          delegation_id: id("del"),
          user_id: "user_123",
          agent_id: "agent_7F92A",
          merchant_id: overrides.merchant_id,
          order_id: overrides.order_id,
          max_amount: overrides.amount,
          currency: "INR",
          purpose: "Security Lab scenario",
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          used_at: null,
          revoked_at: null
        };
        delegation.delegation_credential = signDelegationCredential(tokenSecret, delegation);
        store.insert("delegations", delegation);
        if (!store.find("merchantOrders", (order) => order.merchant_id === overrides.merchant_id && order.external_order_id === overrides.order_id)) {
          store.insert("merchantOrders", {
            id: store.all("merchantOrders").length + 1,
            merchant_id: overrides.merchant_id,
            external_order_id: overrides.order_id,
            description: "Security Lab scenario",
            amount: overrides.amount,
            currency: "INR",
            status: "OPEN",
            created_at: new Date().toISOString(),
            paid_at: null,
            razorpay_payment_id: null
          });
        }
        return delegation;
      };
      let signed = { ...base };
      let sent = { ...base };
      if (!data.scenario || data.scenario === "valid") {
        const order_id = id("ORD");
        const delegation = createScenarioDelegation({ merchant_id: base.merchant_id, order_id, amount: base.amount });
        signed = sent = { ...base, delegation_id: delegation.delegation_id, order_id };
      }
      if (data.scenario === "tamper_amount") sent.amount = 9999;
      if (data.scenario === "tamper_merchant") sent.merchant_id = "merchant_malicious_electronics";
      if (data.scenario === "amount_attack") signed = sent = { ...base, amount: 4999900 };
      if (data.scenario === "merchant_attack") signed = sent = { ...base, merchant_id: "merchant_malicious_electronics" };
      if (data.scenario === "expired_delegation") signed = sent = { ...base, delegation_id: "del_expired", order_id: "ORD-OLD" };
      if (data.scenario === "high_risk") signed = sent = { ...base, delegation_id: "del_highrisk", merchant_id: "merchant_new_luxury", order_id: "ORD-40000", amount: 4000000 };
      if (data.scenario === "prompt_injection") signed = sent = { ...base, merchant_id: "merchant_malicious_electronics", amount: 4999900 };
      if (data.scenario === "high_value_anomaly" || data.scenario === "new_merchant_anomaly") signed = sent = { ...base, delegation_id: "del_highrisk", merchant_id: "merchant_new_luxury", order_id: "ORD-40000", amount: 4000000 };
      if (data.scenario === "denial_spike") {
        const results = [];
        for (let i = 0; i < 5; i++) {
          const bad = { ...base, nonce: id("nonce"), amount: 4999900 };
          results.push(await authorizePayment({ store, tokenSecret, payload: bad, signature: signPayload(privateKey, bad), headerAgentId: bad.agent_id }));
        }
        return json(res, 200, { results, profile: store.find("agentRiskProfiles", (profile) => profile.agent_id === "agent_7F92A") });
      }
      if (data.scenario === "velocity_attack" || data.scenario === "compromised_burst" || data.scenario === "merchant_spread_spike") {
        const results = [];
        for (let i = 0; i < 15; i++) {
          const merchant_id = data.scenario === "merchant_spread_spike" ? `merchant_spike_${i}` : (i % 3 === 0 ? "merchant_malicious_electronics" : "merchant_demo_electronics");
          if (data.scenario === "merchant_spread_spike") store.insert("merchants", { id: store.all("merchants").length + 1, merchant_id, name: `Spike Merchant ${i}`, verification_status: "PENDING", reputation_score: 0.4, created_at: new Date().toISOString() });
          const amount = i % 3 === 0 ? 4999900 : 499900;
          const order_id = `ORD-BURST-${i}`;
          const shouldAuthorize = data.scenario !== "compromised_burst" || i % 3 !== 0;
          const delegation = shouldAuthorize ? createScenarioDelegation({ merchant_id, order_id, amount }) : null;
          const burst = { ...base, delegation_id: delegation?.delegation_id || base.delegation_id, order_id, nonce: id("nonce"), merchant_id, amount };
          results.push(await authorizePayment({ store, tokenSecret, payload: burst, signature: signPayload(privateKey, burst), headerAgentId: burst.agent_id }));
        }
        return json(res, 200, { results, profile: store.find("agentRiskProfiles", (profile) => profile.agent_id === "agent_7F92A") });
      }
      if (data.scenario === "recent_key_rotation_high_value") {
        const keys = generateEd25519KeyPair();
        const agent = store.find("agents", (a) => a.agent_id === "agent_7F92A");
        agent.public_key = keys.publicKeyPem;
        agent.public_key_fingerprint = fingerprint(keys.publicKeyPem);
        agent.last_key_rotation_at = new Date().toISOString();
        agent.key_rotation_count = (agent.key_rotation_count || 0) + 1;
        fs.writeFileSync(path.join(dataDir, "demo-agent-private.pem"), keys.privateKeyPem);
        fs.writeFileSync(path.join(dataDir, "demo-agent-public.pem"), keys.publicKeyPem);
        privateKey = keys.privateKeyPem;
        signed = sent = { ...base, delegation_id: "del_highrisk", merchant_id: "merchant_new_luxury", order_id: "ORD-40000", amount: 4000000 };
      }
      const signature = data.scenario === "invalid_signature" ? "invalid" : signPayload(privateKey, signed);
      const first = await authorizePayment({ store, tokenSecret, payload: sent, signature, headerAgentId: sent.agent_id });
      if (data.scenario === "replay") {
        const second = await authorizePayment({ store, tokenSecret, payload: sent, signature, headerAgentId: sent.agent_id });
        return json(res, 200, { canonical: canonicalize(signed), first, second });
      }
      return json(res, 200, { canonical: canonicalize(signed), result: first });
    }
    if (req.method === "GET" && p.startsWith("/v1/risk/requests/")) {
      const request_id = p.split("/").pop();
      return json(res, 200, store.find("transactionRiskSnapshots", (s) => s.request_id === request_id) || { error: "RISK_SNAPSHOT_NOT_FOUND" });
    }
    if (req.method === "GET" && p.startsWith("/v1/risk/agents/")) {
      buildRiskProfiles(store);
      const agent_id = p.split("/").pop();
      return json(res, 200, store.find("agentRiskProfiles", (profile) => profile.agent_id === agent_id) || { error: "AGENT_RISK_PROFILE_NOT_FOUND" });
    }
    if (req.method === "GET" && p.startsWith("/v1/risk/users/")) {
      buildRiskProfiles(store);
      const user_id = p.split("/").pop();
      return json(res, 200, store.find("userRiskProfiles", (profile) => profile.user_id === user_id) || { error: "USER_RISK_PROFILE_NOT_FOUND" });
    }
    if (req.method === "GET" && p.startsWith("/v1/risk/merchants/")) {
      buildRiskProfiles(store);
      const merchant_id = p.split("/").pop();
      return json(res, 200, store.find("merchantRiskProfiles", (profile) => profile.merchant_id === merchant_id) || { error: "MERCHANT_RISK_PROFILE_NOT_FOUND" });
    }
    if (req.method === "GET" && p.match(/^\/v1\/agents\/[^/]+\/reputation$/)) {
      buildRiskProfiles(store);
      const agent_id = p.split("/")[3];
      const profile = store.find("agentRiskProfiles", (a) => a.agent_id === agent_id);
      const latestRisk = store.all("transactionRiskSnapshots").filter((s) => s.agent_id === agent_id).at(-1);
      return json(res, 200, {
        agent_id,
        reputation: profile?.reputation_score ?? store.find("agents", (a) => a.agent_id === agent_id)?.reputation_score,
        current_risk: latestRisk?.agent_score ?? 0,
        recent_events: store.all("agentReputationEvents").filter((e) => e.agent_id === agent_id).slice(-10).reverse()
      });
    }
    if (req.method === "GET" && p.match(/^\/v1\/agents\/[^/]+\/risk-history$/)) {
      const agent_id = p.split("/")[3];
      return json(res, 200, store.all("transactionRiskSnapshots").filter((s) => s.agent_id === agent_id).slice(-50).reverse());
    }
    if (req.method === "GET" && p === "/v1/audit") return json(res, 200, store.all("audit").slice(-100).reverse());
    if (req.method === "GET" && p === "/v1/dashboard") {
      buildRiskProfiles(store);
      const snapshots = store.all("transactionRiskSnapshots");
      return json(res, 200, {
        metrics: {
          ...metrics(),
          fraud_alerts_today: store.all("fraudSignalEvents").filter((e) => e.severity === "HIGH" || e.severity === "CRITICAL").length,
          amount_anomalies: snapshots.filter((s) => s.transaction_reason_codes.includes("UNUSUAL_AMOUNT") || s.transaction_reason_codes.includes("EXTREME_AMOUNT_ANOMALY")).length,
          velocity_anomalies: snapshots.filter((s) => s.transaction_reason_codes.includes("HIGH_VELOCITY") || s.agent_reason_codes.includes("AGENT_HIGH_VELOCITY")).length,
          new_merchant_alerts: snapshots.filter((s) => s.transaction_reason_codes.includes("NEW_MERCHANT")).length,
          high_risk_agents: store.all("agentRiskProfiles").filter((profile) => (snapshots.filter((s) => s.agent_id === profile.agent_id).at(-1)?.agent_score || 0) >= 0.75).length
        },
        payment_config: paymentConfig(),
        agents: store.all("agents").map(({ public_key, ...a }) => a),
        delegations: store.all("delegations"),
        merchantOrders: store.all("merchantOrders"),
        requests: store.all("requests").slice(-20).reverse(),
        decisions: store.all("decisions").slice(-20).reverse(),
        riskSnapshots: snapshots.slice(-20).reverse(),
        agentRiskProfiles: store.all("agentRiskProfiles"),
        userRiskProfiles: store.all("userRiskProfiles"),
        merchantRiskProfiles: store.all("merchantRiskProfiles"),
        fraudSignalEvents: store.all("fraudSignalEvents").slice(-50).reverse(),
        audit: store.all("audit").slice(-20).reverse(),
        tokens: store.all("tokens").map(({ token, claims, ...t }) => t),
        paymentExecutions: store.all("paymentExecutions").slice(-20).reverse()
      });
    }
    return json(res, 404, { error: "NOT_FOUND", message: "Route not found." });
  } catch (err) {
    console.error(JSON.stringify({ event: "request_error", error: err.message, stack: isProduction ? undefined : err.stack }));
    const status = Number(err.status || 500);
    if (status >= 400 && status < 500) return json(res, status, { error: err.message });
    return json(res, status, { error: status === 500 ? "INTERNAL_ERROR" : err.message, message: isProduction && status === 500 ? "Internal server error." : err.message });
  }
}
