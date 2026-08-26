import fs from "node:fs";
import path from "node:path";
import { seedDemo } from "../backend/seed.js";

const dataDir = process.env.DATA_DIR || "/tmp/agentauth";
const storeFile = path.join(dataDir, "agentauth.json");

if ((process.env.ENVIRONMENT === "production" || process.env.NODE_ENV === "production") && !process.env.AGENTAUTH_TOKEN_SECRET) {
  console.error("AGENTAUTH_TOKEN_SECRET is required when ENVIRONMENT=production.");
  process.exit(1);
}

if (!fs.existsSync(storeFile)) {
  seedDemo();
  console.log(`Initialized demo store at ${storeFile}.`);
}

await import("../backend/server.js");
