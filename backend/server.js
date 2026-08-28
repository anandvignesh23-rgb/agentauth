import http from "node:http";
import { handleAgentAuthRequest } from "./app.js";
import { paymentConfig } from "./payments/provider.js";

const environment = process.env.ENVIRONMENT || process.env.NODE_ENV || "development";
const isProduction = environment === "production";
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");

const server = http.createServer(handleAgentAuthRequest);

server.listen(port, host, () => {
  console.log(`AgentAuth running at http://${host}:${port}`);
  if (!paymentConfig().available) {
    console.log("Razorpay integration unavailable. Set Razorpay Test Mode credentials or explicit PAYMENT_PROVIDER=fixture for local tests.");
  }
});
