function envWeight(name, fallback) {
  return Number(process.env[name] || fallback);
}

function clamp(n) {
  return Math.max(0, Math.min(1, Number(n.toFixed(2))));
}

export const TRANSACTION_RISK_MODEL_VERSION = "transaction-risk-v1";

export function scoreTransactionRisk(features) {
  const amountRatio = features.amount / Math.max(features.user_p95_amount || 5000, 1);
  const coldStart = features.user_transaction_count < 5;
  const amount_anomaly = coldStart
    ? clamp(Math.max(0, (amountRatio - 2) / 8))
    : amountRatio <= 1 ? 0 : amountRatio > 4 ? 1 : clamp((amountRatio - 1) / 3);
  const new_merchant_risk = features.merchant_seen_by_user ? 0 : 1;
  const velocity_risk = features.requests_last_1m >= 20 ? 1 : features.requests_last_1m >= 5 ? 0.55 : clamp(features.requests_last_1m / 10);
  const recent_denial_risk = clamp((features.recent_denials + features.recent_replay_attempts * 2 + features.recent_signature_failures) / 8);
  const unusual_time_risk = features.user_typical_hours.includes(features.transaction_hour) ? 0 : 0.7;
  const merchant_reputation_inverse = 1 - Math.max(0, Math.min(1, features.merchant_reputation_score ?? 0.5));
  const signals = {
    amount_anomaly,
    new_merchant_risk,
    velocity_risk,
    recent_denial_risk,
    unusual_time_risk,
    merchant_reputation_inverse
  };
  const score = clamp(
    envWeight("TRANSACTION_RISK_AMOUNT_WEIGHT", 0.30) * amount_anomaly +
    envWeight("TRANSACTION_RISK_MERCHANT_WEIGHT", 0.20) * new_merchant_risk +
    envWeight("TRANSACTION_RISK_VELOCITY_WEIGHT", 0.20) * velocity_risk +
    envWeight("TRANSACTION_RISK_DENIAL_WEIGHT", 0.15) * recent_denial_risk +
    envWeight("TRANSACTION_RISK_TIME_WEIGHT", 0.10) * unusual_time_risk +
    envWeight("TRANSACTION_RISK_MERCHANT_REPUTATION_WEIGHT", 0.05) * merchant_reputation_inverse
  );
  const reason_codes = [];
  if (amount_anomaly >= 0.85) reason_codes.push("EXTREME_AMOUNT_ANOMALY");
  else if (amount_anomaly >= 0.35) reason_codes.push("UNUSUAL_AMOUNT");
  else reason_codes.push("NORMAL_AMOUNT");
  reason_codes.push(new_merchant_risk ? "NEW_MERCHANT" : "KNOWN_MERCHANT");
  if (merchant_reputation_inverse >= 0.6) reason_codes.push("LOW_REPUTATION_MERCHANT");
  reason_codes.push(velocity_risk >= 0.5 ? "HIGH_VELOCITY" : "NORMAL_VELOCITY");
  if (recent_denial_risk >= 0.3) reason_codes.push("RECENT_DENIALS");
  if (features.recent_replay_attempts) reason_codes.push("RECENT_REPLAY_ACTIVITY");
  reason_codes.push(unusual_time_risk ? "UNUSUAL_TRANSACTION_TIME" : "NORMAL_TRANSACTION_TIME");
  return { transaction_risk_score: score, signals, reason_codes, model_version: TRANSACTION_RISK_MODEL_VERSION };
}
