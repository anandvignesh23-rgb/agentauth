export const COMBINED_RISK_POLICY_VERSION = "combined-policy-v2";

function weight(name, fallback) {
  return Number(process.env[name] || fallback);
}

function clamp(n) {
  return Math.max(0, Math.min(1, Number(n.toFixed(2))));
}

export function aggregateRisk(transactionRisk, agentRisk) {
  agentRisk.reason_codes ||= [];
  const transactionWeight = weight("COMBINED_TRANSACTION_RISK_WEIGHT", 0.60);
  const agentWeight = weight("COMBINED_AGENT_RISK_WEIGHT", 0.40);
  const combined_score = clamp(
    transactionWeight * transactionRisk.transaction_risk_score +
    agentWeight * agentRisk.agent_risk_score
  );
  let decision = "ALLOW";
  const reason_codes = [];
  if (combined_score >= Number(process.env.RISK_DENY_THRESHOLD || 0.75)) decision = "DENY";
  else if (combined_score >= Number(process.env.RISK_STEP_UP_THRESHOLD || 0.45)) decision = "STEP_UP";
  if (transactionRisk.transaction_risk_score >= Number(process.env.TRANSACTION_RISK_STEP_UP_THRESHOLD || 0.45) && decision === "ALLOW") {
    decision = "STEP_UP";
    reason_codes.push("TRANSACTION_RISK_STEP_UP");
  }
  if (agentRisk.agent_risk_score >= Number(process.env.AGENT_RISK_STEP_UP_THRESHOLD || 0.55) && decision === "ALLOW") {
    decision = "STEP_UP";
    reason_codes.push("AGENT_RISK_STEP_UP");
  }
  if (agentRisk.reason_codes.includes("AGENT_HIGH_VELOCITY") && agentRisk.reason_codes.includes("AGENT_NEW_MERCHANT_SPIKE") && decision === "ALLOW") {
    decision = "STEP_UP";
    reason_codes.push("AGENT_SPREAD_AND_VELOCITY_STEP_UP");
  }
  if (agentRisk.signals.replay_activity >= 1) {
    decision = "DENY";
    reason_codes.push("EXTREME_AGENT_REPLAY_ACTIVITY");
  }
  reason_codes.push(decision === "DENY" ? "COMBINED_HIGH_RISK" : decision === "STEP_UP" ? "COMBINED_MEDIUM_RISK" : "COMBINED_LOW_RISK");
  return {
    combined_score,
    decision,
    reason_codes,
    transaction_weight: transactionWeight,
    agent_weight: agentWeight,
    policy_version: COMBINED_RISK_POLICY_VERSION
  };
}
