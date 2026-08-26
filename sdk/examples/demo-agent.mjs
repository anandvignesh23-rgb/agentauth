import fs from "node:fs";
import crypto from "node:crypto";
import { signPayload } from "../../backend/crypto.js";

const baseUrl = process.env.AGENTAUTH_URL || "http://127.0.0.1:8787";

async function post(path, body, signature, agentId = body.agent_id) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-id": agentId, "x-agent-signature": signature },
    body: JSON.stringify(body)
  });
  return res.json();
}

function payload(overrides = {}) {
  return {
    agent_id: "agent_7F92A",
    delegation_id: "del_9217",
    merchant_id: "merchant_demo_electronics",
    order_id: "ORD-1934",
    amount: 4999,
    currency: "INR",
    nonce: crypto.randomBytes(12).toString("hex"),
    timestamp: new Date().toISOString(),
    ...overrides
  };
}

async function authorize(label, p, tamper = null) {
  const privateKeyPem = fs.readFileSync(`${process.env.DATA_DIR || "data"}/demo-agent-private.pem`, "utf8");
  const signature = signPayload(privateKeyPem, p);
  const sent = tamper ? { ...p, ...tamper } : p;
  const result = await post("/v1/authorize-payment", sent, signature);
  console.log(`\n${label}`);
  console.log(JSON.stringify(result, null, 2));
  return { request: sent, signature, result };
}

await fetch(`${baseUrl}/v1/dev/reset`, { method: "POST" });
const legit = await authorize("Scenario A: legitimate payment", payload());
if (legit.result.payment_authorization) {
  const verification = await fetch(`${baseUrl}/v1/verify-payment-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: legit.result.payment_authorization.token,
      merchant_id: "merchant_demo_electronics",
      order_id: "ORD-1934",
      amount: 4999,
      currency: "INR"
    })
  }).then((r) => r.json());
  console.log("\nMerchant token verification");
  console.log(JSON.stringify(verification, null, 2));
}

await fetch(`${baseUrl}/v1/dev/reset`, { method: "POST" });
await authorize("Scenario B: amount escalation", payload({ amount: 9999 }));
await fetch(`${baseUrl}/v1/dev/reset`, { method: "POST" });
await authorize("Scenario C: merchant substitution", payload({ merchant_id: "merchant_malicious_electronics" }));
await fetch(`${baseUrl}/v1/dev/reset`, { method: "POST" });
await authorize("Scenario D: tampering after signature", payload(), { amount: 9999 });
await fetch(`${baseUrl}/v1/dev/reset`, { method: "POST" });
const replayPayload = payload();
const privateKeyPem = fs.readFileSync(`${process.env.DATA_DIR || "data"}/demo-agent-private.pem`, "utf8");
const replaySig = signPayload(privateKeyPem, replayPayload);
console.log("\nScenario E: replay attack first send");
console.log(JSON.stringify(await post("/v1/authorize-payment", replayPayload, replaySig), null, 2));
console.log("\nScenario E: replay attack second send");
console.log(JSON.stringify(await post("/v1/authorize-payment", replayPayload, replaySig), null, 2));
await fetch(`${baseUrl}/v1/dev/reset`, { method: "POST" });
await authorize("Scenario F: expired delegation", payload({ delegation_id: "del_expired", order_id: "ORD-OLD" }));
await fetch(`${baseUrl}/v1/dev/reset`, { method: "POST" });
await authorize("Prompt injection demo: compromised agent tries attacker merchant and ₹49,999", payload({ merchant_id: "merchant_malicious_electronics", amount: 49999 }));
await fetch(`${baseUrl}/v1/dev/reset`, { method: "POST" });
const highRisk = await authorize("Scenario G: high-risk step-up", payload({ delegation_id: "del_highrisk", merchant_id: "merchant_new_luxury", order_id: "ORD-40000", amount: 40000 }));
if (highRisk.result.decision === "STEP_UP") {
  const approved = await fetch(`${baseUrl}/v1/authorization-requests/${highRisk.result.request_id}/approve`, { method: "POST" }).then((r) => r.json());
  console.log("\nScenario G: user approves step-up");
  console.log(JSON.stringify(approved, null, 2));
}
