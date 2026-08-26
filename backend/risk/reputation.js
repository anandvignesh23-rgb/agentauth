const adjustments = {
  ALLOW: 0.002,
  USER_STEP_UP_APPROVED: 0.001,
  INVALID_SIGNATURE: -0.03,
  NONCE_REUSED: -0.08,
  TOKEN_ALREADY_USED: -0.08,
  MERCHANT_MISMATCH: -0.04,
  ORDER_MISMATCH: -0.04,
  AMOUNT_EXCEEDS_DELEGATION: -0.05,
  DELEGATION_REVOKED: -0.06,
  DELEGATION_EXPIRED: -0.02,
  CURRENCY_MISMATCH: -0.03
};

function clamp(n) {
  return Math.max(0, Math.min(1, Number(n.toFixed(3))));
}

export function updateAgentReputation(store, agent_id, decision, reason_codes) {
  const agent = store.find("agents", (a) => a.agent_id === agent_id);
  if (!agent) return null;
  const before = agent.reputation_score ?? 0.75;
  let delta = decision === "ALLOW" ? adjustments.ALLOW : 0;
  for (const code of reason_codes) delta += adjustments[code] || 0;
  agent.reputation_score = clamp(before + delta);
  store.insert("agentReputationEvents", {
    id: store.all("agentReputationEvents").length + 1,
    agent_id,
    previous_reputation: before,
    new_reputation: agent.reputation_score,
    delta: Number(delta.toFixed(3)),
    decision,
    reason_codes,
    created_at: new Date().toISOString()
  });
  return agent.reputation_score;
}

export function maybeAutoSuspendAgent(store, agent_id) {
  const agent = store.find("agents", (a) => a.agent_id === agent_id);
  if (!agent || agent.status !== "ACTIVE") return false;
  const now = Date.now();
  const recent = store.all("decisions").filter((d) => d.agent_id === agent_id && now - new Date(d.created_at).getTime() <= 600_000);
  const replayCount = recent.filter((d) => d.reason_codes.includes("NONCE_REUSED")).length;
  const signatureFailures = recent.filter((d) => d.reason_codes.includes("INVALID_SIGNATURE")).length;
  if (replayCount >= Number(process.env.AUTO_SUSPEND_REPLAY_THRESHOLD || 3) || signatureFailures >= Number(process.env.AUTO_SUSPEND_SIGNATURE_THRESHOLD || 10)) {
    agent.status = "SUSPENDED";
    agent.suspended_at = new Date().toISOString();
    store.audit(null, "AGENT_AUTO_SUSPENDED", "RISK_ENGINE", `Agent ${agent_id} auto-suspended by behavioral risk policy.`, { replayCount, signatureFailures });
    return true;
  }
  return false;
}
