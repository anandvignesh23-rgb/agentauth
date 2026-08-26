const messages = {
  VALID_SIGNATURE: "agent identity was proven with a valid Ed25519 signature",
  INVALID_SIGNATURE: "the signed request did not match the submitted transaction fields",
  UNKNOWN_AGENT: "the agent is not registered",
  AGENT_REVOKED: "the agent is revoked or suspended",
  NONCE_REUSED: "this signed request nonce was already used",
  REQUEST_TOO_OLD: "the request timestamp is outside the allowed clock window",
  DELEGATION_VALID: "the user delegation matched the requested transaction",
  DELEGATION_EXPIRED: "the delegation has expired",
  DELEGATION_REVOKED: "the delegation was revoked",
  DELEGATION_ALREADY_USED: "the delegation was already used",
  AGENT_MISMATCH: "the delegation belongs to a different agent",
  MERCHANT_MISMATCH: "the merchant did not match the user delegation",
  ORDER_MISMATCH: "the order did not match the user delegation",
  AMOUNT_EXCEEDS_DELEGATION: "the amount exceeded the user's delegated maximum",
  CURRENCY_MISMATCH: "the currency did not match the user delegation",
  LOW_RISK: "transaction risk was low",
  MEDIUM_RISK: "transaction needs user step-up verification",
  HIGH_RISK: "transaction risk was too high",
  USER_STEP_UP_APPROVED: "the user approved the step-up challenge",
  USER_STEP_UP_DENIED: "the user denied the step-up challenge",
  TOKEN_ALREADY_USED: "the authorization token was already consumed",
  TOKEN_REVOKED: "the authorization token was revoked",
  TOKEN_EXPIRED: "the authorization token expired",
  TRANSACTION_RISK_STEP_UP: "the transaction fraud score requires step-up",
  AGENT_RISK_STEP_UP: "the agent behavior score requires step-up",
  AGENT_SPREAD_AND_VELOCITY_STEP_UP: "the agent is showing both high velocity and merchant-spread anomalies",
  COMBINED_LOW_RISK: "combined transaction and agent risk was low",
  COMBINED_MEDIUM_RISK: "combined transaction and agent risk requires step-up",
  COMBINED_HIGH_RISK: "combined transaction and agent risk was high",
  AGENT_BEHAVIOR_NORMAL: "the agent behavior was consistent with history"
};

export function explain(decision, reason_codes) {
  const readable = reason_codes.map((code) => messages[code] || code.toLowerCase().replaceAll("_", " "));
  if (decision === "ALLOW") return `Payment approved because ${readable.join(", ")}.`;
  if (decision === "STEP_UP") return `Step-up required because ${readable.join(", ")}.`;
  return `Payment denied because ${readable.join(", ")}.`;
}
