import { seedDemo } from "../backend/seed.js";

await seedDemo();
console.log("Seeded AgentAuth demo data.");
console.log(`Demo private key: ${process.env.DATA_DIR || "data"}/demo-agent-private.pem`);
