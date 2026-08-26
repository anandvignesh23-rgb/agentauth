import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "./crypto.js";

const empty = {
  users: [],
  agents: [],
  merchants: [],
  delegations: [],
  requests: [],
  decisions: [],
  tokens: [],
  nonces: [],
  audit: [],
  razorpayOrders: [],
  razorpayEvents: [],
  paymentExecutions: [],
  merchantOrders: [],
  webhookEvents: [],
  transactionRiskSnapshots: [],
  userRiskProfiles: [],
  agentRiskProfiles: [],
  merchantRiskProfiles: [],
  fraudSignalEvents: [],
  agentReputationEvents: []
};

export class Store {
  constructor(file = path.resolve("data/agentauth.json")) {
    this.file = file;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, "utf8")) : structuredClone(empty);
    for (const key of Object.keys(empty)) this.data[key] ||= [];
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  reset(seed = {}) {
    this.data = { ...structuredClone(empty), ...seed };
    this.save();
  }

  insert(collection, record) {
    this.data[collection].push(record);
    this.save();
    return record;
  }

  audit(request_id, event_type, actor, message, metadata = {}) {
    const previous = this.data.audit.at(-1)?.event_hash || "GENESIS";
    const event = {
      id: this.data.audit.length + 1,
      event_id: `aud_${String(this.data.audit.length + 1).padStart(6, "0")}`,
      request_id,
      event_type,
      actor,
      message,
      metadata,
      previous_event_hash: previous,
      timestamp: new Date().toISOString()
    };
    event.event_hash = sha256Hex(`${previous}:${JSON.stringify(event)}`);
    this.data.audit.push(event);
    this.save();
    return event;
  }

  find(collection, predicate) {
    return this.data[collection].find(predicate);
  }

  all(collection) {
    return this.data[collection];
  }
}
