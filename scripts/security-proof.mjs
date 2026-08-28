const baseUrl = process.env.AGENTAUTH_URL || "https://agentauth.vercel.app";

const scenarios = [
  ["Valid request", "valid", "ALLOW"],
  ["Amount escalation", "amount_attack", "DENY"],
  ["Merchant substitution", "merchant_attack", "DENY"],
  ["Order substitution", "order_attack", "DENY"],
  ["Request replay", "replay", "DENY"],
  ["Token replay", "token_replay", "BLOCK"],
  ["Invalid signature", "invalid_signature", "DENY"],
  ["Expired delegation", "expired_delegation", "DENY"],
  ["Revoked delegation", "revoked_delegation", "DENY"],
  ["Revoked agent", "revoked_agent", "DENY"],
  ["Prompt-injected agent", "prompt_injection", "DENY"],
  ["High-risk valid request", "high_risk", "STEP_UP"]
];

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

await post("/v1/dev/reset", {});
const rows = [];
for (const [attack, scenario, expected] of scenarios) {
  if (scenario !== "valid") await post("/v1/dev/reset", {});
  const { status, body } = await post("/v1/security-lab/run", { scenario });
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
