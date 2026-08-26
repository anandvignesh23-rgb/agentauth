function clamp(n) {
  return Math.max(0, Math.min(1, Number(n.toFixed(2))));
}

export const AGENT_RISK_MODEL_VERSION = "agent-risk-v1";

export function scoreAgentRisk(features) {
  const amount_behavior_anomaly = features.current_amount_vs_agent_p95 <= 1 ? 0 : features.current_amount_vs_agent_p95 >= 6 ? 1 : clamp((features.current_amount_vs_agent_p95 - 1) / 5);
  const request_velocity_anomaly = features.requests_last_10m >= 20 ? 1 : features.requests_last_10m >= 10 ? 0.7 : clamp(features.requests_last_10m / 15);
  const authorization_violation_rate = clamp(features.agent_delegation_violation_rate + features.recent_policy_violations / 10);
  const replay_activity = features.recent_replay_attempts ? 1 : clamp(features.agent_replay_attempt_rate * 3);
  const signature_failure_activity = features.recent_signature_failures >= 3 ? 1 : clamp(features.agent_signature_failure_rate * 3);
  const merchant_spread_anomaly = features.recent_merchant_count >= 20 ? 1 : features.recent_merchant_count >= 5 ? 0.65 : clamp(features.recent_merchant_count / 10);
  const user_spread_anomaly = features.recent_user_count >= 20 ? 1 : features.recent_user_count >= 5 ? 0.55 : clamp(features.recent_user_count / 12);
  const recent_key_rotation_risk = features.key_rotated_recently && features.current_amount_vs_agent_p95 > 2 ? 0.65 : features.key_rotated_recently ? 0.3 : 0;
  const signals = {
    amount_behavior_anomaly,
    request_velocity_anomaly,
    authorization_violation_rate,
    replay_activity,
    signature_failure_activity,
    merchant_spread_anomaly,
    user_spread_anomaly,
    recent_key_rotation_risk
  };
  let score = (
    0.20 * amount_behavior_anomaly +
    0.20 * request_velocity_anomaly +
    0.15 * authorization_violation_rate +
    0.15 * replay_activity +
    0.10 * signature_failure_activity +
    0.10 * merchant_spread_anomaly +
    0.05 * user_spread_anomaly +
    0.05 * recent_key_rotation_risk
  );
  const reputation = Math.max(0, Math.min(1, features.reputation_score ?? 0.75));
  score = clamp(score * (1.1 - 0.2 * reputation));
  const reason_codes = [];
  if (score < 0.25) reason_codes.push("AGENT_BEHAVIOR_NORMAL");
  if (amount_behavior_anomaly >= 0.45) reason_codes.push("AGENT_AMOUNT_ANOMALY");
  if (request_velocity_anomaly >= 0.5) reason_codes.push("AGENT_HIGH_VELOCITY");
  if (authorization_violation_rate >= 0.35) reason_codes.push("AGENT_REPEATED_POLICY_VIOLATIONS");
  if (replay_activity >= 0.5) reason_codes.push("AGENT_REPLAY_ACTIVITY");
  if (signature_failure_activity >= 0.5) reason_codes.push("AGENT_SIGNATURE_FAILURE_SPIKE");
  if (merchant_spread_anomaly >= 0.5) reason_codes.push("AGENT_NEW_MERCHANT_SPIKE");
  if (user_spread_anomaly >= 0.5) reason_codes.push("AGENT_NEW_USER_SPIKE");
  if (recent_key_rotation_risk) reason_codes.push("AGENT_RECENT_KEY_ROTATION");
  if (reputation < 0.5) reason_codes.push("AGENT_LOW_REPUTATION");
  return { agent_risk_score: score, agent_reputation: reputation, signals, reason_codes, model_version: AGENT_RISK_MODEL_VERSION };
}
