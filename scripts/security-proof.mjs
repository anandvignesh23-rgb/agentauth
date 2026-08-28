const baseUrl = process.env.AGENTAUTH_URL || "https://agentauth.vercel.app";

const scenarios = [
  ["Valid request", "valid", "ALLOW"],
  ["High-risk valid request", "high_risk", "STEP_UP"],
  ["Amount escalation", "amount_attack", "DENY"],
  ["Merchant substitution", "merchant_attack", "DENY"],
  ["Order substitution", "order_attack", "DENY"],
  ["Prompt-injected agent", "prompt_injection", "DENY"],
  ["Invalid signature", "invalid_signature", "DENY"],
  ["Expired delegation", "expired_delegation", "DENY"],
  ["Revoked delegation", "revoked_delegation", "DENY"],
  ["Token replay", "token_replay", "BLOCK"],
  ["Request replay", "replay", "DENY"],
  ["Revoked agent", "revoked_agent", "DENY"]
];

async function post(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AGENTAUTH_PROOF_TIMEOUT_MS || 90000));
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal
  });
  clearTimeout(timeout);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

await post("/v1/dev/reset", {});
const rows = [];
for (const [attack, scenario, expected] of scenarios) {
  let status;
  let body;
  try {
    ({ status, body } = await post("/v1/security-lab/run", { scenario }));
  } catch (err) {
    rows.push({ attack, scenario, expected, actual: err.name || err.message, verified_remotely: false, reason_codes: [] });
    continue;
  }
  const actual = scenario === "replay"
    ? body.second?.decision
    : scenario === "token_replay"
      ? body.token_replay?.second_reserve === false ? "BLOCK" : "ALLOW"
      : body.result?.decision;
  rows.push({
    attack,
    scenario,
    expected,
    actual,
    verified_remotely: status === 200 && actual === expected,
    reason_codes: body.result?.reason_codes || body.second?.reason_codes || [body.token_replay?.expected_second_reason].filter(Boolean)
  });
}

console.log(JSON.stringify({ base_url: baseUrl, generated_at: new Date().toISOString(), rows }, null, 2));
