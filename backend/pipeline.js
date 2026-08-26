import { canonicalize, id, signToken, verifyPayload, verifyToken } from "./crypto.js";
import { explain } from "./explain.js";
import { evaluateRisk } from "./risk/index.js";
import { buildRiskProfiles } from "./risk/features.js";
import { maybeAutoSuspendAgent, updateAgentReputation } from "./risk/reputation.js";

const CLOCK_WINDOW_MS = 2 * 60 * 1000;
const POLICY_VERSION = "agentauth-policy-2026-08-24";

function deny(store, request, reason_codes, risk_score = 0) {
  request.status = "DENIED";
  const decision = {
    id: id("dec"),
    request_id: request.request_id,
    agent_id: request.agent_id,
    decision: "DENY",
    risk_score,
    transaction_score: null,
    agent_score: null,
    combined_score: risk_score,
    reason_codes,
    policy_version: POLICY_VERSION,
    explanation: explain("DENY", reason_codes),
    created_at: new Date().toISOString()
  };
  store.insert("decisions", decision);
  updateAgentReputation(store, request.agent_id, "DENY", reason_codes);
  maybeAutoSuspendAgent(store, request.agent_id);
  buildRiskProfiles(store);
  store.audit(request.request_id, "DECISION", "POLICY_ENGINE", "Decision: DENY", { reason_codes });
  console.log(JSON.stringify({
    event: "authorization_decision",
    request_id: request.request_id,
    agent_id: request.agent_id,
    decision: "DENY",
    risk_score,
    reason_codes
  }));
  return { decision: "DENY", request_id: request.request_id, risk_score, reason_codes, explanation: decision.explanation };
}

function issuePaymentToken(store, secret, request, delegation) {
  const token_id = id("pat");
  const expires_at = new Date(Date.now() + 60_000).toISOString();
  const { token, claims } = signToken(secret, {
    jti: token_id,
    sub: request.agent_id,
    user_id: delegation.user_id,
    agent_id: request.agent_id,
    merchant_id: request.merchant_id,
    order_id: request.order_id,
    amount: request.amount,
    currency: request.currency,
    request_id: request.request_id
  });
  store.insert("tokens", {
    token_id,
    token,
    request_id: request.request_id,
    user_id: delegation.user_id,
    agent_id: request.agent_id,
    merchant_id: request.merchant_id,
    order_id: request.order_id,
    amount: request.amount,
    currency: request.currency,
    expires_at,
    claims,
    status: "ACTIVE",
    reserved_at: null,
    consumed_at: null,
    revoked_at: null,
    created_at: new Date().toISOString()
  });
  store.audit(request.request_id, "TOKEN_ISSUED", "AGENTAUTH", `Authorization token ${token_id} issued.`, { token_id });
  return { token_id, token, expires_at };
}

export function authorizePayment({ store, tokenSecret, payload, signature, headerAgentId }) {
  const request = {
    id: id("row"),
    request_id: id("req"),
    agent_id: payload.agent_id,
    delegation_id: payload.delegation_id,
    merchant_id: payload.merchant_id,
    order_id: payload.order_id,
    amount: Number(payload.amount),
    currency: payload.currency,
    nonce: payload.nonce,
    timestamp: payload.timestamp,
    signature,
    status: "RECEIVED",
    created_at: new Date().toISOString()
  };
  store.insert("requests", request);
  store.audit(request.request_id, "REQUEST_RECEIVED", "AGENT", "Signed request received.", { canonical: safeCanonical(payload) });

  if (headerAgentId && headerAgentId !== payload.agent_id) return deny(store, request, ["UNKNOWN_AGENT"]);
  const agent = store.find("agents", (a) => a.agent_id === payload.agent_id);
  if (!agent) return deny(store, request, ["UNKNOWN_AGENT"]);
  if (agent.status !== "ACTIVE") return deny(store, request, ["AGENT_REVOKED"]);
  store.audit(request.request_id, "AGENT_LOOKUP", "AGENTAUTH", `Agent ${agent.agent_id} authenticated.`);

  try {
    if (!verifyPayload(agent.public_key, payload, signature)) return deny(store, request, ["INVALID_SIGNATURE"]);
  } catch {
    return deny(store, request, ["INVALID_SIGNATURE"]);
  }
  store.audit(request.request_id, "SIGNATURE_VALID", "AGENTAUTH", "Signature valid.", { reason_code: "VALID_SIGNATURE" });

  const timestamp = new Date(payload.timestamp).getTime();
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > CLOCK_WINDOW_MS) return deny(store, request, ["REQUEST_TOO_OLD"]);

  if (store.find("nonces", (n) => n.agent_id === payload.agent_id && n.nonce === payload.nonce)) return deny(store, request, ["NONCE_REUSED"]);
  store.insert("nonces", { nonce: payload.nonce, agent_id: payload.agent_id, used_at: new Date().toISOString(), request_id: request.request_id });
  store.audit(request.request_id, "NONCE_ACCEPTED", "AGENTAUTH", "Nonce accepted.", { nonce: payload.nonce });

  const delegation = store.find("delegations", (d) => d.delegation_id === payload.delegation_id);
  if (!delegation) return deny(store, request, ["DELEGATION_NOT_FOUND"]);
  if (delegation.status === "REVOKED") return deny(store, request, ["DELEGATION_REVOKED"]);
  if (delegation.status === "USED") return deny(store, request, ["DELEGATION_ALREADY_USED"]);
  if (new Date(delegation.expires_at).getTime() <= Date.now()) {
    delegation.status = "EXPIRED";
    store.save();
    return deny(store, request, ["DELEGATION_EXPIRED"]);
  }
  const scopeFailures = [];
  if (delegation.agent_id !== payload.agent_id) scopeFailures.push("AGENT_MISMATCH");
  if (delegation.merchant_id !== payload.merchant_id) scopeFailures.push("MERCHANT_MISMATCH");
  if (delegation.order_id !== payload.order_id) scopeFailures.push("ORDER_MISMATCH");
  if (delegation.currency !== payload.currency) scopeFailures.push("CURRENCY_MISMATCH");
  if (Number(payload.amount) > Number(delegation.max_amount)) scopeFailures.push("AMOUNT_EXCEEDS_DELEGATION");
  if (scopeFailures.length) return deny(store, request, scopeFailures);
  store.audit(request.request_id, "DELEGATION_VALID", "AGENTAUTH", `Delegation ${delegation.delegation_id} validated.`, { reason_code: "DELEGATION_VALID" });

  const merchant = store.find("merchants", (m) => m.merchant_id === payload.merchant_id);
  const risk = evaluateRisk({ agent, merchant, delegation, payload, store });
  risk.snapshot.request_id = request.request_id;
  for (const event of store.all("fraudSignalEvents").filter((e) => e.request_id === null)) event.request_id = request.request_id;
  store.insert("transactionRiskSnapshots", risk.snapshot);
  store.audit(request.request_id, "TRANSACTION_FRAUD_SCORED", "RISK_ENGINE", `Transaction fraud score calculated: ${risk.transaction.transaction_risk_score}.`, {
    reason_codes: risk.transaction.reason_codes,
    signals: risk.transaction.signals
  });
  store.audit(request.request_id, "AGENT_BEHAVIOR_RISK_SCORED", "RISK_ENGINE", `Agent behavior risk calculated: ${risk.agent.agent_risk_score}.`, {
    reason_codes: risk.agent.reason_codes,
    signals: risk.agent.signals,
    reputation: risk.agent.agent_reputation
  });
  store.audit(request.request_id, "COMBINED_RISK_SCORED", "RISK_ENGINE", `Combined risk: ${risk.combined.combined_score}.`, {
    reason_codes: risk.combined.reason_codes,
    policy_version: risk.combined.policy_version
  });

  const reason_codes = [
    "VALID_SIGNATURE",
    "DELEGATION_VALID",
    ...risk.transaction.reason_codes,
    ...risk.agent.reason_codes,
    ...risk.combined.reason_codes
  ];
  let decision = risk.combined.decision;

  request.status = decision === "ALLOW" ? "ALLOWED" : decision;
  if (decision === "STEP_UP") {
    request.step_up_expires_at = new Date(Date.now() + Number(process.env.STEP_UP_TTL_SECONDS || 300) * 1000).toISOString();
  }
  const record = {
    id: id("dec"),
    request_id: request.request_id,
    agent_id: request.agent_id,
    decision,
    risk_score: risk.combined.combined_score,
    transaction_score: risk.transaction.transaction_risk_score,
    agent_score: risk.agent.agent_risk_score,
    combined_score: risk.combined.combined_score,
    transaction_reasons: risk.transaction.reason_codes,
    agent_reasons: risk.agent.reason_codes,
    risk_signals: {
      transaction: risk.transaction.signals,
      agent: risk.agent.signals
    },
    reason_codes,
    policy_version: risk.combined.policy_version,
    risk_model_version: risk.snapshot.model_version,
    explanation: explain(decision, reason_codes),
    fraud_explanation: risk.snapshot.explanation,
    created_at: new Date().toISOString()
  };
  store.insert("decisions", record);
  risk.snapshot.final_decision = decision;
  updateAgentReputation(store, request.agent_id, decision, reason_codes);
  maybeAutoSuspendAgent(store, request.agent_id);
  buildRiskProfiles(store);
  store.audit(request.request_id, "DECISION", "POLICY_ENGINE", `Decision: ${decision}.`, { reason_codes });
  console.log(JSON.stringify({
    event: "authorization_decision",
    request_id: request.request_id,
    agent_id: request.agent_id,
    decision,
    transaction_score: risk.transaction.transaction_risk_score,
    agent_score: risk.agent.agent_risk_score,
    combined_score: risk.combined.combined_score,
    reason_codes
  }));

  if (decision === "ALLOW") {
    delegation.status = "USED";
    delegation.used_at = new Date().toISOString();
    const payment_authorization = issuePaymentToken(store, tokenSecret, request, delegation);
    store.save();
    return {
      decision,
      request_id: request.request_id,
      risk: {
        transaction_score: risk.transaction.transaction_risk_score,
        agent_score: risk.agent.agent_risk_score,
        combined_score: risk.combined.combined_score,
        transaction_reasons: risk.transaction.reason_codes,
        agent_reasons: risk.agent.reason_codes,
        combined_reasons: risk.combined.reason_codes,
        signals: record.risk_signals,
        explanation: risk.snapshot.explanation
      },
      risk_score: risk.combined.combined_score,
      reason_codes,
      explanation: record.explanation,
      payment_authorization
    };
  }
  return {
    decision,
    request_id: request.request_id,
    risk: {
      transaction_score: risk.transaction.transaction_risk_score,
      agent_score: risk.agent.agent_risk_score,
      combined_score: risk.combined.combined_score,
      transaction_reasons: risk.transaction.reason_codes,
      agent_reasons: risk.agent.reason_codes,
      combined_reasons: risk.combined.reason_codes,
      signals: record.risk_signals,
      explanation: risk.snapshot.explanation
    },
    risk_score: risk.combined.combined_score,
    reason_codes,
    explanation: record.explanation
  };
}

export function approveStepUp({ store, tokenSecret, request_id, approved }) {
  const request = store.find("requests", (r) => r.request_id === request_id);
  if (!request || request.status !== "STEP_UP") return null;
  if (new Date(request.step_up_expires_at || 0).getTime() <= Date.now()) return deny(store, request, ["STEP_UP_EXPIRED"]);
  const delegation = store.find("delegations", (d) => d.delegation_id === request.delegation_id);
  const code = approved ? "USER_STEP_UP_APPROVED" : "USER_STEP_UP_DENIED";
  store.audit(request_id, "STEP_UP_DECISION", "USER", approved ? "User approved step-up challenge." : "User denied step-up challenge.", { reason_code: code });
  if (!approved) {
    return deny(store, request, [code]);
  }
  request.status = "ALLOWED";
  delegation.status = "USED";
  delegation.used_at = new Date().toISOString();
  const payment_authorization = issuePaymentToken(store, tokenSecret, request, delegation);
  const decision = {
    id: id("dec"),
    request_id,
    agent_id: request.agent_id,
    decision: "ALLOW",
    risk_score: 0.5,
    reason_codes: [code],
    policy_version: POLICY_VERSION,
    explanation: explain("ALLOW", [code]),
    created_at: new Date().toISOString()
  };
  store.insert("decisions", decision);
  store.audit(request_id, "DECISION", "POLICY_ENGINE", "Decision: ALLOW after step-up.", { reason_codes: [code] });
  store.save();
  return { decision: "ALLOW", request_id, reason_codes: [code], explanation: decision.explanation, payment_authorization };
}

export function verifyPaymentToken({ store, tokenSecret, token, expected }) {
  let claims;
  try {
    claims = verifyToken(tokenSecret, token);
  } catch (err) {
    return { valid: false, reason_codes: [err.message] };
  }
  const record = store.find("tokens", (t) => t.token_id === claims.jti);
  if (!record) return { valid: false, reason_codes: ["TOKEN_NOT_FOUND"] };
  if (record.revoked_at || record.status === "REVOKED") return { valid: false, reason_codes: ["TOKEN_REVOKED"] };
  if (record.status === "CONSUMED") return { valid: false, reason_codes: ["TOKEN_ALREADY_USED"] };
  if (record.status === "RESERVED") return { valid: false, reason_codes: ["TOKEN_ALREADY_RESERVED"] };
  const checks = [["merchant_id", "MERCHANT_MISMATCH"], ["order_id", "ORDER_MISMATCH"], ["amount", "AMOUNT_MISMATCH"], ["currency", "CURRENCY_MISMATCH"]];
  for (const [field, code] of checks) {
    if (expected?.[field] !== undefined && String(expected[field]) !== String(claims[field])) return { valid: false, reason_codes: [code] };
  }
  store.audit(claims.request_id, "TOKEN_VERIFIED", "MERCHANT", "Merchant independently verified token.", { token_id: claims.jti });
  store.save();
  return {
    valid: true,
    checks: [
      { name: "Token signature", ok: true },
      { name: "Token issuer", ok: true },
      { name: "Token expiry", ok: true },
      { name: "Merchant binding", ok: true },
      { name: "Order binding", ok: true },
      { name: "Amount binding", ok: true },
      { name: "One-time status", ok: true }
    ],
    agent_id: claims.agent_id,
    merchant_id: claims.merchant_id,
    order_id: claims.order_id,
    amount: claims.amount,
    currency: claims.currency,
    token_id: claims.jti,
    request_id: claims.request_id
  };
}

function safeCanonical(payload) {
  try {
    return canonicalize(payload);
  } catch {
    return null;
  }
}
