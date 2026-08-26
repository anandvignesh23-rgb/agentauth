import { handleAgentAuthRequest } from "../../backend/app.js";

export default async function handler(req, res) {
  return handleAgentAuthRequest(req, res);
}
