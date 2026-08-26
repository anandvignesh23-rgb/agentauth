import { createAppStore } from "../backend/store.js";
import { seedDemo } from "../backend/seed.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to seed Supabase PostgreSQL.");
  process.exit(1);
}

const store = await createAppStore();
const keys = await seedDemo(store);
console.log(JSON.stringify({
  ok: true,
  persistence: store.kind,
  seeded: ["users", "agents", "merchants", "merchantOrders", "delegations"],
  demo_private_key_written_to: `${process.env.DATA_DIR || "data"}/demo-agent-private.pem`,
  public_key_fingerprint: store.find("agents", (a) => a.agent_id === "agent_7F92A")?.public_key_fingerprint,
  private_key_generated: Boolean(keys.privateKeyPem)
}, null, 2));
