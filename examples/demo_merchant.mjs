import { MerchantAgentAuthClient } from "../sdk/js/agentauth.mjs";

const merchant = new MerchantAgentAuthClient({
  base_url: process.env.AGENTAUTH_URL || "https://agentauth.vercel.app"
});

const token = process.env.AGENTAUTH_PAYMENT_TOKEN;
if (!token) {
  console.error("Set AGENTAUTH_PAYMENT_TOKEN to verify a live AgentAuth authorization token.");
  process.exit(1);
}

const result = await merchant.verifyPaymentToken({
  token,
  merchant_id: process.env.MERCHANT_ID || "merchant_demo_electronics",
  order_id: process.env.ORDER_ID || "ORD-1934",
  amount: Number(process.env.AMOUNT || 499900),
  currency: process.env.CURRENCY || "INR"
});

console.log(JSON.stringify(result, null, 2));
