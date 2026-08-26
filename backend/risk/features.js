function percentile(values, p, fallback = 0) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return fallback;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function median(values, fallback = 0) {
  return percentile(values, 50, fallback);
}

function mean(values, fallback = 0) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : fallback;
}

function hoursFrom(items) {
  return items.map((item) => new Date(item.created_at || item.used_at || item.timestamp).getHours()).filter(Number.isFinite);
}

function typicalHours(items) {
  const hours = new Set(hoursFrom(items));
  return hours.size ? [...hours] : Array.from({ length: 16 }, (_, i) => i + 8);
}

function isRecent(item, windowMs, now = Date.now()) {
  const at = new Date(item.created_at || item.timestamp || item.used_at).getTime();
  return Number.isFinite(at) && now - at <= windowMs;
}

export function buildRiskProfiles(store) {
  const users = store.all("users");
  const agents = store.all("agents");
  const merchants = store.all("merchants");
  const requests = store.all("requests");
  const decisions = store.all("decisions");
  const usedDelegations = store.all("delegations").filter((d) => d.used_at);
  const now = Date.now();

  store.data.userRiskProfiles = users.map((user) => {
    const userId = user.user_id || user.id;
    const userDelegations = usedDelegations.filter((d) => d.user_id === userId);
    const amounts = userDelegations.map((d) => Number(d.max_amount));
    const denied = decisions.filter((d) => {
      const req = requests.find((r) => r.request_id === d.request_id);
      const del = store.all("delegations").find((x) => x.delegation_id === req?.delegation_id);
      return del?.user_id === userId && d.decision === "DENY";
    });
    return {
      user_id: userId,
      transaction_count: userDelegations.length,
      successful_count: userDelegations.length,
      denied_count: denied.length,
      mean_amount: Math.round(mean(amounts, 5000)),
      median_amount: Math.round(median(amounts, 5000)),
      max_amount: Math.max(0, ...amounts),
      p95_amount: Math.round(percentile(amounts, 5000)),
      merchant_count: new Set(userDelegations.map((d) => d.merchant_id)).size,
      typical_hours: typicalHours(userDelegations),
      last_transaction_at: userDelegations.at(-1)?.used_at || null,
      updated_at: new Date().toISOString()
    };
  });

  store.data.agentRiskProfiles = agents.map((agent) => {
    const agentRequests = requests.filter((r) => r.agent_id === agent.agent_id);
    const agentDecisions = decisions.filter((d) => d.agent_id === agent.agent_id);
    const amounts = agentRequests.map((r) => Number(r.amount));
    const violations = agentDecisions.filter((d) => d.reason_codes.some((c) => [
      "MERCHANT_MISMATCH",
      "ORDER_MISMATCH",
      "AMOUNT_EXCEEDS_DELEGATION",
      "DELEGATION_REVOKED",
      "DELEGATION_EXPIRED",
      "CURRENCY_MISMATCH"
    ].includes(c)));
    return {
      agent_id: agent.agent_id,
      total_requests: agentRequests.length,
      allowed_requests: agentDecisions.filter((d) => d.decision === "ALLOW").length,
      denied_requests: agentDecisions.filter((d) => d.decision === "DENY").length,
      step_up_requests: agentDecisions.filter((d) => d.decision === "STEP_UP").length,
      signature_failures: agentDecisions.filter((d) => d.reason_codes.includes("INVALID_SIGNATURE")).length,
      replay_attempts: agentDecisions.filter((d) => d.reason_codes.includes("NONCE_REUSED") || d.reason_codes.includes("TOKEN_ALREADY_USED")).length,
      delegation_violations: violations.length,
      unique_users: new Set(agentRequests.map((r) => store.all("delegations").find((del) => del.delegation_id === r.delegation_id)?.user_id).filter(Boolean)).size,
      unique_merchants: new Set(agentRequests.map((r) => r.merchant_id)).size,
      mean_amount: Math.round(mean(amounts, 5000)),
      median_amount: Math.round(median(amounts, 5000)),
      p95_amount: Math.round(percentile(amounts, 5000)),
      typical_hours: typicalHours(agentRequests),
      requests_last_1m: agentRequests.filter((r) => isRecent(r, 60_000, now)).length,
      requests_last_10m: agentRequests.filter((r) => isRecent(r, 600_000, now)).length,
      requests_last_1h: agentRequests.filter((r) => isRecent(r, 3_600_000, now)).length,
      requests_last_24h: agentRequests.filter((r) => isRecent(r, 86_400_000, now)).length,
      key_rotation_count: agent.key_rotation_count || 0,
      last_key_rotation_at: agent.last_key_rotation_at || agent.key_rotated_at || null,
      reputation_score: agent.reputation_score ?? 0.75,
      last_request_at: agentRequests.at(-1)?.created_at || null,
      updated_at: new Date().toISOString()
    };
  });

  store.data.merchantRiskProfiles = merchants.map((merchant) => {
    const merchantRequests = requests.filter((r) => r.merchant_id === merchant.merchant_id);
    const merchantDecisions = decisions.filter((d) => {
      const req = requests.find((r) => r.request_id === d.request_id);
      return req?.merchant_id === merchant.merchant_id;
    });
    const amounts = merchantRequests.map((r) => Number(r.amount));
    return {
      merchant_id: merchant.merchant_id,
      total_agent_requests: merchantRequests.length,
      unique_agents: new Set(merchantRequests.map((r) => r.agent_id)).size,
      unique_users: new Set(merchantRequests.map((r) => store.all("delegations").find((del) => del.delegation_id === r.delegation_id)?.user_id).filter(Boolean)).size,
      mean_amount: Math.round(mean(amounts, 5000)),
      denied_request_count: merchantDecisions.filter((d) => d.decision === "DENY").length,
      high_risk_request_count: merchantDecisions.filter((d) => d.combined_score >= 0.75 || d.risk_score >= 0.75).length,
      reputation_score: merchant.reputation_score ?? (merchant.verification_status === "VERIFIED" ? 0.9 : 0.45),
      created_at: merchant.created_at || null,
      updated_at: new Date().toISOString()
    };
  });
}

export function extractTransactionFeatures({ store, agent, merchant, delegation, payload }) {
  buildRiskProfiles(store);
  const userProfile = store.find("userRiskProfiles", (p) => p.user_id === delegation.user_id) || {};
  const agentProfile = store.find("agentRiskProfiles", (p) => p.agent_id === payload.agent_id) || {};
  const merchantProfile = store.find("merchantRiskProfiles", (p) => p.merchant_id === payload.merchant_id) || {};
  const now = Date.now();
  const requestHour = new Date(payload.timestamp).getHours();
  const userHistory = store.all("delegations").filter((d) => d.user_id === delegation.user_id && d.used_at);
  const agentHistory = store.all("requests").filter((r) => r.agent_id === payload.agent_id);
  return {
    amount: Number(payload.amount),
    user_id: delegation.user_id,
    user_mean_amount: userProfile.mean_amount ?? 5000,
    user_p95_amount: userProfile.p95_amount || 5000,
    agent_mean_amount: agentProfile.mean_amount ?? 5000,
    agent_p95_amount: agentProfile.p95_amount || 5000,
    merchant_seen_by_user: userHistory.some((d) => d.merchant_id === payload.merchant_id),
    merchant_seen_by_agent: agentHistory.some((r) => r.merchant_id === payload.merchant_id),
    transaction_hour: requestHour,
    user_typical_hours: userProfile.typical_hours || typicalHours(userHistory),
    agent_typical_hours: agentProfile.typical_hours || typicalHours(agentHistory),
    requests_last_1m: agentHistory.filter((r) => isRecent(r, 60_000, now)).length,
    requests_last_10m: agentHistory.filter((r) => isRecent(r, 600_000, now)).length,
    requests_last_1h: agentHistory.filter((r) => isRecent(r, 3_600_000, now)).length,
    recent_denials: store.all("decisions").filter((d) => d.agent_id === payload.agent_id && d.decision === "DENY" && isRecent(d, 600_000, now)).length,
    recent_signature_failures: store.all("decisions").filter((d) => d.agent_id === payload.agent_id && d.reason_codes.includes("INVALID_SIGNATURE") && isRecent(d, 600_000, now)).length,
    recent_replay_attempts: store.all("decisions").filter((d) => d.agent_id === payload.agent_id && d.reason_codes.includes("NONCE_REUSED") && isRecent(d, 600_000, now)).length,
    delegation_ttl_remaining: Math.max(0, (new Date(delegation.expires_at).getTime() - now) / 1000),
    agent_age_days: Math.max(0, (now - new Date(agent.created_at || now).getTime()) / 86_400_000),
    merchant_age_days: Math.max(0, (now - new Date(merchant?.created_at || now).getTime()) / 86_400_000),
    merchant_reputation_score: merchantProfile.reputation_score ?? merchant?.reputation_score ?? 0.5,
    user_transaction_count: userProfile.transaction_count || 0
  };
}

export function extractAgentFeatures({ store, agent, delegation, payload }) {
  buildRiskProfiles(store);
  const profile = store.find("agentRiskProfiles", (p) => p.agent_id === payload.agent_id) || {};
  const now = Date.now();
  const recentRequests = store.all("requests").filter((r) => r.agent_id === payload.agent_id && isRecent(r, 600_000, now));
  const recentMerchants = new Set(recentRequests.map((r) => r.merchant_id));
  const recentUsers = new Set(recentRequests.map((r) => store.all("delegations").find((d) => d.delegation_id === r.delegation_id)?.user_id).filter(Boolean));
  const keyRotationAt = profile.last_key_rotation_at ? new Date(profile.last_key_rotation_at).getTime() : null;
  return {
    agent_age_days: profile.agent_age_days ?? Math.max(0, (now - new Date(agent.created_at || now).getTime()) / 86_400_000),
    agent_total_requests: profile.total_requests || 0,
    agent_allow_rate: profile.total_requests ? profile.allowed_requests / profile.total_requests : 0,
    agent_denial_rate: profile.total_requests ? profile.denied_requests / profile.total_requests : 0,
    agent_step_up_rate: profile.total_requests ? profile.step_up_requests / profile.total_requests : 0,
    agent_signature_failure_rate: profile.total_requests ? profile.signature_failures / profile.total_requests : 0,
    agent_replay_attempt_rate: profile.total_requests ? profile.replay_attempts / profile.total_requests : 0,
    agent_delegation_violation_rate: profile.total_requests ? profile.delegation_violations / profile.total_requests : 0,
    agent_mean_amount: profile.mean_amount || 5000,
    agent_p95_amount: profile.p95_amount || 5000,
    current_amount_vs_agent_p95: Number(payload.amount) / Math.max(profile.p95_amount || 5000, 1),
    agent_unique_users: profile.unique_users || 0,
    agent_unique_merchants: profile.unique_merchants || 0,
    new_user_for_agent: !store.all("requests").some((r) => {
      const d = store.all("delegations").find((del) => del.delegation_id === r.delegation_id);
      return r.agent_id === payload.agent_id && d?.user_id === delegation.user_id;
    }),
    new_merchant_for_agent: !store.all("requests").some((r) => r.agent_id === payload.agent_id && r.merchant_id === payload.merchant_id),
    requests_last_1m: profile.requests_last_1m || 0,
    requests_last_10m: profile.requests_last_10m || 0,
    requests_last_1h: profile.requests_last_1h || 0,
    key_rotated_recently: Boolean(keyRotationAt && now - keyRotationAt <= 3_600_000),
    time_since_key_rotation: keyRotationAt ? Math.round((now - keyRotationAt) / 1000) : null,
    recent_policy_violations: profile.delegation_violations || 0,
    recent_replay_attempts: profile.replay_attempts || 0,
    recent_signature_failures: profile.signature_failures || 0,
    recent_merchant_count: recentMerchants.size,
    recent_user_count: recentUsers.size,
    reputation_score: agent.reputation_score ?? 0.75
  };
}
