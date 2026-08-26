import { Store } from "../backend/store.js";
import { seedDemo } from "../backend/seed.js";

const store = new Store(`${process.env.DATA_DIR || "data"}/agentauth.json`);
seedDemo(store);
console.log("Reset demo requests, delegations, tokens, executions, orders, and audit events.");
