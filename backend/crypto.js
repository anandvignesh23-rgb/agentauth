import crypto from "node:crypto";

export const signedFields = [
  "agent_id",
  "delegation_id",
  "merchant_id",
  "order_id",
  "amount",
  "currency",
  "nonce",
  "timestamp"
];

export function id(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export function canonicalize(input) {
  return signedFields.map((field) => {
    const value = input[field];
    if (value === undefined || value === null || value === "") {
      throw new Error(`missing signed field: ${field}`);
    }
    if (field === "amount" && !Number.isInteger(Number(value))) {
      throw new Error("amount must be an integer minor-unit value");
    }
    if (field === "currency" && String(value) !== String(value).toUpperCase()) {
      throw new Error("currency must be uppercase ISO 4217");
    }
    return `${field}=${String(value).normalize("NFC")}`;
  }).join("\n");
}

export function generateEd25519KeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" })
  };
}

export function signPayload(privateKeyPem, payload) {
  return crypto.sign(null, Buffer.from(canonicalize(payload)), privateKeyPem).toString("base64");
}

export function verifyPayload(publicKeyPem, payload, signature) {
  return crypto.verify(
    null,
    Buffer.from(canonicalize(payload)),
    publicKeyPem,
    Buffer.from(signature || "", "base64")
  );
}

export function fingerprint(publicKeyPem) {
  return crypto.createHash("sha256").update(publicKeyPem).digest("hex").slice(0, 16);
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

export function signToken(secret, payload, lifetimeSeconds = 60) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: "AgentAuth", iat: now, exp: now + lifetimeSeconds, ...payload };
  const header = { alg: "HS256", typ: "JWT" };
  const encoded = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return { token: `${encoded}.${sig}`, claims };
}

export function verifyToken(secret, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("MALFORMED_TOKEN");
  const [h, p, s] = parts;
  const expected = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  if (Buffer.byteLength(s) !== Buffer.byteLength(expected)) throw new Error("TOKEN_SIGNATURE_INVALID");
  if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) throw new Error("TOKEN_SIGNATURE_INVALID");
  const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  if (claims.iss !== "AgentAuth") throw new Error("TOKEN_ISSUER_INVALID");
  if (claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("TOKEN_EXPIRED");
  return claims;
}

export function verifyRazorpaySignature(secret, orderId, paymentId, signature) {
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  if (Buffer.byteLength(signature || "") !== Buffer.byteLength(expected)) return false;
  return crypto.timingSafeEqual(Buffer.from(signature || ""), Buffer.from(expected));
}

export function signDelegationCredential(secret, delegation) {
  return signToken(secret, {
    typ: "agentauth-delegation",
    delegation_id: delegation.delegation_id,
    user_id: delegation.user_id,
    agent_id: delegation.agent_id,
    merchant_id: delegation.merchant_id,
    order_id: delegation.order_id,
    max_amount: delegation.max_amount,
    currency: delegation.currency,
    expires_at: delegation.expires_at,
    issued_at: delegation.created_at
  }, 15 * 60).token;
}

export function hmacHex(secret, body) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export function timingSafeEqualText(left, right) {
  if (Buffer.byteLength(left || "") !== Buffer.byteLength(right || "")) return false;
  return crypto.timingSafeEqual(Buffer.from(left || ""), Buffer.from(right || ""));
}

export function sha256Hex(body) {
  return crypto.createHash("sha256").update(body).digest("hex");
}
