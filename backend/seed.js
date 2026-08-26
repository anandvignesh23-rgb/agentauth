import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateEd25519KeyPair, fingerprint, signDelegationCredential } from "./crypto.js";
import { Store } from "./store.js";

export function seedDemo(store = new Store(path.join(process.env.DATA_DIR || "data", "agentauth.json"))) {
  const dataDir = process.env.DATA_DIR || "data";
  const keys = generateEd25519KeyPair();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "demo-agent-private.pem"), keys.privateKeyPem);
  fs.writeFileSync(path.join(dataDir, "demo-agent-public.pem"), keys.publicKeyPem);

  const now = Date.now();
  const delegations = [
    { id: 1, delegation_id: "del_9217", user_id: "user_123", agent_id: "agent_7F92A", merchant_id: "merchant_demo_electronics", order_id: "ORD-1934", max_amount: 4999, currency: "INR", purpose: "Wireless Headphones", expires_at: new Date(now + 15 * 60_000).toISOString(), status: "ACTIVE", created_at: new Date().toISOString(), used_at: null, revoked_at: null },
    { id: 2, delegation_id: "del_expired", user_id: "user_123", agent_id: "agent_7F92A", merchant_id: "merchant_demo_electronics", order_id: "ORD-OLD", max_amount: 4999, currency: "INR", purpose: "Expired demo", expires_at: new Date(now - 60_000).toISOString(), status: "ACTIVE", created_at: new Date(now - 20 * 60_000).toISOString(), used_at: null, revoked_at: null },
    { id: 3, delegation_id: "del_highrisk", user_id: "user_123", agent_id: "agent_7F92A", merchant_id: "merchant_new_luxury", order_id: "ORD-40000", max_amount: 40000, currency: "INR", purpose: "High risk demo", expires_at: new Date(now + 15 * 60_000).toISOString(), status: "ACTIVE", created_at: new Date().toISOString(), used_at: null, revoked_at: null },
    { id: 4, delegation_id: "del_hist_1", user_id: "user_123", agent_id: "agent_7F92A", merchant_id: "merchant_demo_electronics", order_id: "ORD-HIST-1", max_amount: 1999, currency: "INR", purpose: "Historical charger", expires_at: new Date(now - 5 * 86_400_000).toISOString(), status: "USED", created_at: new Date(now - 6 * 86_400_000).toISOString(), used_at: new Date(now - 5 * 86_400_000).toISOString(), revoked_at: null },
    { id: 5, delegation_id: "del_hist_2", user_id: "user_123", agent_id: "agent_7F92A", merchant_id: "merchant_demo_electronics", order_id: "ORD-HIST-2", max_amount: 2999, currency: "INR", purpose: "Historical keyboard", expires_at: new Date(now - 4 * 86_400_000).toISOString(), status: "USED", created_at: new Date(now - 5 * 86_400_000).toISOString(), used_at: new Date(now - 4 * 86_400_000).toISOString(), revoked_at: null },
    { id: 6, delegation_id: "del_hist_3", user_id: "user_123", agent_id: "agent_7F92A", merchant_id: "merchant_demo_electronics", order_id: "ORD-HIST-3", max_amount: 3499, currency: "INR", purpose: "Historical mouse", expires_at: new Date(now - 3 * 86_400_000).toISOString(), status: "USED", created_at: new Date(now - 4 * 86_400_000).toISOString(), used_at: new Date(now - 3 * 86_400_000).toISOString(), revoked_at: null },
    { id: 7, delegation_id: "del_hist_4", user_id: "user_123", agent_id: "agent_7F92A", merchant_id: "merchant_demo_electronics", order_id: "ORD-HIST-4", max_amount: 4499, currency: "INR", purpose: "Historical webcam", expires_at: new Date(now - 2 * 86_400_000).toISOString(), status: "USED", created_at: new Date(now - 3 * 86_400_000).toISOString(), used_at: new Date(now - 2 * 86_400_000).toISOString(), revoked_at: null },
    { id: 8, delegation_id: "del_hist_5", user_id: "user_123", agent_id: "agent_7F92A", merchant_id: "merchant_demo_electronics", order_id: "ORD-HIST-5", max_amount: 4999, currency: "INR", purpose: "Historical headphones", expires_at: new Date(now - 86_400_000).toISOString(), status: "USED", created_at: new Date(now - 2 * 86_400_000).toISOString(), used_at: new Date(now - 86_400_000).toISOString(), revoked_at: null }
  ].map((delegation) => ({
    ...delegation,
    delegation_credential: signDelegationCredential(process.env.AGENTAUTH_TOKEN_SECRET || "dev-only-token-secret", delegation)
  }));
  store.reset({
    users: [{ id: "user_123", name: "Vignesh", email: "vignesh@example.com", created_at: new Date().toISOString() }],
    agents: [{
      id: 1,
      agent_id: "agent_7F92A",
      name: "Shopping Copilot",
      developer_name: "Demo Labs",
      public_key: keys.publicKeyPem,
      public_key_fingerprint: fingerprint(keys.publicKeyPem),
      status: "ACTIVE",
      reputation_score: 0.91,
      created_at: new Date().toISOString(),
      revoked_at: null
    }],
    merchants: [
      { id: 1, merchant_id: "merchant_demo_electronics", name: "Demo Electronics", domain: "demo-electronics.test", verification_status: "VERIFIED", reputation_score: 0.92, razorpay_reference: "rzp_test_demo", created_at: new Date(now - 45 * 86_400_000).toISOString() },
      { id: 2, merchant_id: "merchant_malicious_electronics", name: "Malicious Electronics", domain: "bad-electronics.test", verification_status: "UNVERIFIED", reputation_score: 0.08, razorpay_reference: null, created_at: new Date().toISOString() },
      { id: 3, merchant_id: "merchant_new_luxury", name: "New Luxury Store", domain: "luxury-new.test", verification_status: "PENDING", reputation_score: 0.45, razorpay_reference: null, created_at: new Date().toISOString() }
    ],
    merchantOrders: [
      { id: 1, merchant_id: "merchant_demo_electronics", external_order_id: "ORD-1934", description: "Wireless Headphones", amount: 4999, currency: "INR", status: "OPEN", created_at: new Date().toISOString(), paid_at: null },
      { id: 2, merchant_id: "merchant_new_luxury", external_order_id: "ORD-40000", description: "High-risk luxury item", amount: 40000, currency: "INR", status: "OPEN", created_at: new Date().toISOString(), paid_at: null }
    ],
    delegations,
    requests: [],
    decisions: [],
    tokens: [],
    nonces: [],
    audit: [],
    razorpayOrders: [],
    razorpayEvents: [],
    paymentExecutions: [],
    webhookEvents: [],
    transactionRiskSnapshots: [],
    userRiskProfiles: [],
    agentRiskProfiles: [],
    merchantRiskProfiles: [],
    fraudSignalEvents: [],
    agentReputationEvents: []
  });
  return keys;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDemo();
  console.log("Seeded AgentAuth demo data.");
  console.log(`Demo private key: ${process.env.DATA_DIR || "data"}/demo-agent-private.pem`);
}
