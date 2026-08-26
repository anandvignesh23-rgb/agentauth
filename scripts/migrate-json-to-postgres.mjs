import fs from "node:fs";
import path from "node:path";
import { createAppStore, empty } from "../backend/store.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to migrate JSON state to PostgreSQL.");
  process.exit(1);
}

const source = process.argv[2] || path.join(process.env.DATA_DIR || "data", "agentauth.json");
if (!fs.existsSync(source)) {
  console.error(`JSON source not found: ${source}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(source, "utf8"));
for (const key of Object.keys(raw)) {
  if (!Object.hasOwn(empty, key)) {
    console.error(`Unexpected collection in JSON source: ${key}`);
    process.exit(1);
  }
  if (!Array.isArray(raw[key])) {
    console.error(`Malformed collection ${key}: expected array`);
    process.exit(1);
  }
}

const store = await createAppStore();
let inserted = 0;
for (const collection of Object.keys(empty)) {
  for (const record of raw[collection] || []) {
    store.insert(collection, record);
    inserted += 1;
  }
}
await store.save();
console.log(JSON.stringify({ ok: true, source, inserted }, null, 2));
