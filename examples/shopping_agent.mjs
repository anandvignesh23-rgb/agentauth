import { AgentAuthClient, MerchantAgentAuthClient } from "../sdk/js/agentauth.mjs";

await fetch("http://127.0.0.1:8787/v1/dev/reset", { method: "POST" });

const agent = new AgentAuthClient({
  agent_id: "agent_7F92A",
  private_key_path: `${process.env.DATA_DIR || "data"}/demo-agent-private.pem`
});
const merchant = new MerchantAgentAuthClient();

const authorization = await agent.authorizePayment({
  delegation_id: "del_9217",
  merchant_id: "merchant_demo_electronics",
  order_id: "ORD-1934",
  amount: 4999,
  currency: "INR"
});

console.log("AgentAuth decision");
console.log(JSON.stringify(authorization, null, 2));

if (authorization.decision !== "ALLOW") process.exit(0);

const token = authorization.payment_authorization.token;
const verified = await merchant.verifyPaymentToken({
  token,
  merchant_id: "merchant_demo_electronics",
  order_id: "ORD-1934",
  amount: 4999,
  currency: "INR"
});

console.log("Merchant verification");
console.log(JSON.stringify(verified, null, 2));

const order = await merchant.createPaymentOrder({
  token,
  merchant_id: "merchant_demo_electronics",
  order_id: "ORD-1934",
  amount: 4999,
  currency: "INR"
});

console.log("Payment execution / Razorpay order");
console.log(JSON.stringify(order, null, 2));
