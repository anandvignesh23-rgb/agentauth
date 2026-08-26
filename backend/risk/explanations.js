const reasonText = {
  NORMAL_AMOUNT: "the amount is consistent with prior behavior",
  UNUSUAL_AMOUNT: "the amount is elevated compared with the user's normal transaction size",
  EXTREME_AMOUNT_ANOMALY: "the amount is far above the user's historical range",
  KNOWN_MERCHANT: "the merchant has historical trust signals",
  NEW_MERCHANT: "the merchant is new for this user",
  LOW_REPUTATION_MERCHANT: "the merchant has a low prototype reputation score",
  HIGH_VELOCITY: "request velocity is elevated",
  RECENT_DENIALS: "there were recent denied attempts",
  RECENT_REPLAY_ACTIVITY: "recent replay behavior was observed",
  UNUSUAL_TRANSACTION_TIME: "the request happened outside typical transaction hours",
  AGENT_AMOUNT_ANOMALY: "the agent is requesting an amount outside its usual range",
  AGENT_HIGH_VELOCITY: "the agent is making requests unusually quickly",
  AGENT_REPEATED_POLICY_VIOLATIONS: "the agent recently violated authorization policy",
  AGENT_REPLAY_ACTIVITY: "the agent has replay activity",
  AGENT_SIGNATURE_FAILURE_SPIKE: "the agent has recent signature failures",
  AGENT_NEW_MERCHANT_SPIKE: "the agent is spreading across new merchants unusually quickly",
  AGENT_NEW_USER_SPIKE: "the agent is spreading across users unusually quickly",
  AGENT_RECENT_KEY_ROTATION: "the request follows a recent key rotation",
  AGENT_LOW_REPUTATION: "the agent reputation is low"
};

export function explainFraudRisk(transactionRisk, agentRisk, combined) {
  const transaction = transactionRisk.reason_codes
    .filter((c) => reasonText[c])
    .map((c) => reasonText[c]);
  const agent = agentRisk.reason_codes
    .filter((c) => reasonText[c])
    .map((c) => reasonText[c]);
  return {
    summary: `Transaction risk ${transactionRisk.transaction_risk_score}, agent risk ${agentRisk.agent_risk_score}, combined risk ${combined.combined_score}.`,
    transaction,
    agent
  };
}
