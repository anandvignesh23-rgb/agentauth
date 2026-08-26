import crypto from "node:crypto";
import fs from "node:fs";
import { signPayload } from "../../backend/crypto.js";

export class AgentAuthClient {
  constructor({ agent_id, private_key_path, base_url = "http://127.0.0.1:8787" }) {
    this.agent_id = agent_id;
    this.private_key_path = private_key_path;
    this.base_url = base_url;
  }

  signedPayload(input) {
    const payload = {
      agent_id: this.agent_id,
      nonce: crypto.randomBytes(12).toString("hex"),
      timestamp: new Date().toISOString(),
      ...input
    };
    const privateKey = fs.readFileSync(this.private_key_path, "utf8");
    return { payload, signature: signPayload(privateKey, payload) };
  }

  async authorizePayment(input) {
    const { payload, signature } = this.signedPayload(input);
    const res = await fetch(`${this.base_url}/v1/authorize-payment`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-id": this.agent_id, "x-agent-signature": signature },
      body: JSON.stringify(payload)
    });
    return res.json();
  }

  async pollAuthorization(request_id) {
    const res = await fetch(`${this.base_url}/v1/authorization-requests/${request_id}`);
    return res.json();
  }
}

export class MerchantAgentAuthClient {
  constructor({ base_url = "http://127.0.0.1:8787" } = {}) {
    this.base_url = base_url;
  }

  async verifyPaymentToken({ token, merchant_id, order_id, amount, currency }) {
    const res = await fetch(`${this.base_url}/v1/verify-payment-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, merchant_id, order_id, amount, currency })
    });
    return res.json();
  }

  async createPaymentOrder({ token, merchant_id, order_id, amount, currency }) {
    const res = await fetch(`${this.base_url}/v1/payments/create-order`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, merchant_id, order_id, amount, currency })
    });
    return res.json();
  }
}
