import { aggregateRisk } from "./aggregator.js";
import { scoreAgentRisk } from "./agent_engine.js";
import { explainFraudRisk } from "./explanations.js";
import { extractAgentFeatures, extractTransactionFeatures, buildRiskProfiles } from "./features.js";
import { scoreTransactionRisk } from "./transaction_engine.js";

export function evaluateRisk({ store, agent, merchant, delegation, payload }) {
  const transaction_features = extractTransactionFeatures({ store, agent, merchant, delegation, payload });
  const agent_features = extractAgentFeatures({ store, agent, delegation, payload });
  const transaction = scoreTransactionRisk(transaction_features);
  const agentRisk = scoreAgentRisk(agent_features);
  const combined = aggregateRisk(transaction, agentRisk);
  const explanation = explainFraudRisk(transaction, agentRisk, combined);
  const snapshot = {
    id: store.all("transactionRiskSnapshots").length + 1,
    request_id: null,
    user_id: delegation.user_id,
    agent_id: payload.agent_id,
    merchant_id: payload.merchant_id,
    amount: Number(payload.amount),
    currency: payload.currency,
    transaction_score: transaction.transaction_risk_score,
    agent_score: agentRisk.agent_risk_score,
    combined_score: combined.combined_score,
    transaction_reason_codes: transaction.reason_codes,
    agent_reason_codes: agentRisk.reason_codes,
    final_decision: combined.decision,
    model_version: `${transaction.model_version}+${agentRisk.model_version}`,
    policy_version: combined.policy_version,
    transaction_signals: transaction.signals,
    agent_signals: agentRisk.signals,
    explanation,
    created_at: new Date().toISOString()
  };
  for (const [signal_type, value] of Object.entries(transaction.signals)) {
    store.insert("fraudSignalEvents", {
      id: store.all("fraudSignalEvents").length + 1,
      request_id: null,
      signal_type,
      severity: value >= 0.85 ? "CRITICAL" : value >= 0.6 ? "HIGH" : value >= 0.3 ? "MEDIUM" : value > 0 ? "LOW" : "INFO",
      value,
      metadata: { layer: "transaction" },
      created_at: new Date().toISOString()
    });
  }
  for (const [signal_type, value] of Object.entries(agentRisk.signals)) {
    store.insert("fraudSignalEvents", {
      id: store.all("fraudSignalEvents").length + 1,
      request_id: null,
      signal_type,
      severity: value >= 0.85 ? "CRITICAL" : value >= 0.6 ? "HIGH" : value >= 0.3 ? "MEDIUM" : value > 0 ? "LOW" : "INFO",
      value,
      metadata: { layer: "agent" },
      created_at: new Date().toISOString()
    });
  }
  buildRiskProfiles(store);
  return { transaction, agent: agentRisk, combined, transaction_features, agent_features, snapshot };
}
