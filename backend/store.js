import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { sha256Hex } from "./crypto.js";

const { Pool } = pg;

export const empty = {
  users: [],
  agents: [],
  merchants: [],
  delegations: [],
  requests: [],
  decisions: [],
  tokens: [],
  stepUpChallenges: [],
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

function cloneEmpty() {
  return structuredClone(empty);
}

function asJson(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return value;
}

function timestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function jsonb(value, fallback) {
  return JSON.stringify(value === undefined || value === null ? fallback : value);
}

function buildInsert(table, record, conflict, updateColumns = []) {
  const entries = Object.entries(record).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => key);
  const values = entries.map(([, value]) => value);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  let sql = `insert into ${table} (${columns.join(", ")}) values (${placeholders.join(", ")})`;
  if (conflict) {
    if (updateColumns.length) {
      sql += ` on conflict (${conflict}) do update set ${updateColumns.map((col) => `${col}=excluded.${col}`).join(", ")}`;
    } else {
      sql += ` on conflict (${conflict}) do nothing`;
    }
  }
  return { sql, values };
}

export class Store {
  constructor(file = path.resolve("data/agentauth.json")) {
    this.kind = "json";
    this.file = file;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, "utf8")) : cloneEmpty();
    for (const key of Object.keys(empty)) this.data[key] ||= [];
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  flush() {
    this.save();
  }

  reset(seed = {}) {
    this.data = { ...cloneEmpty(), ...seed };
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

  reserveNonce(agent_id, nonce, request_id) {
    if (this.find("nonces", (n) => n.agent_id === agent_id && n.nonce === nonce)) return false;
    this.insert("nonces", { nonce, agent_id, used_at: new Date().toISOString(), request_id });
    return true;
  }

  consumeDelegation(delegation_id) {
    const delegation = this.find("delegations", (d) => d.delegation_id === delegation_id);
    if (!delegation || delegation.status !== "ACTIVE") return false;
    delegation.status = "USED";
    delegation.used_at = new Date().toISOString();
    this.save();
    return true;
  }

  reservePaymentToken(token_id) {
    const token = this.find("tokens", (t) => t.token_id === token_id);
    if (!token || token.status !== "ACTIVE" || token.revoked_at) return false;
    token.status = "RESERVED";
    token.reserved_at = new Date().toISOString();
    this.save();
    return true;
  }

  consumePaymentToken(token_id) {
    const token = this.find("tokens", (t) => t.token_id === token_id);
    if (!token || token.status !== "RESERVED") return false;
    token.status = "CONSUMED";
    token.consumed_at = new Date().toISOString();
    this.save();
    return true;
  }
}

export class PostgresStore {
  constructor(pool) {
    this.kind = "postgres";
    this.pool = pool;
    this.pending = [];
    this.data = cloneEmpty();
  }

  static async create(databaseUrl = process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.PG_POOL_MAX || 1),
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
    });
    const store = new PostgresStore(pool);
    await store.reload();
    return store;
  }

  async reload() {
    const collections = await Promise.all([
      this.pool.query("select * from users order by created_at"),
      this.pool.query("select * from agents order by created_at"),
      this.pool.query("select * from merchants order by created_at"),
      this.pool.query("select * from delegations order by created_at"),
      this.pool.query("select * from authorization_requests order by created_at"),
      this.pool.query("select * from authorization_decisions order by created_at"),
      this.pool.query("select * from payment_authorization_tokens order by created_at"),
      this.pool.query("select * from step_up_challenges order by created_at"),
      this.pool.query("select * from nonce_records order by used_at"),
      this.pool.query("select * from audit_events order by created_at"),
      this.pool.query("select * from payment_executions order by created_at"),
      this.pool.query("select * from merchant_orders order by created_at"),
      this.pool.query("select * from webhook_events order by received_at"),
      this.pool.query("select * from transaction_risk_snapshots order by created_at"),
      this.pool.query("select * from user_risk_profiles order by updated_at"),
      this.pool.query("select * from agent_risk_profiles order by updated_at"),
      this.pool.query("select * from merchant_risk_profiles order by updated_at"),
      this.pool.query("select * from fraud_signal_events order by created_at"),
      this.pool.query("select * from reputation_history order by created_at")
    ]);

    this.data = {
      users: collections[0].rows.map((r) => ({ ...r, created_at: timestamp(r.created_at), updated_at: timestamp(r.updated_at) })),
      agents: collections[1].rows.map((r) => ({ ...r, created_at: timestamp(r.created_at), updated_at: timestamp(r.updated_at), revoked_at: timestamp(r.revoked_at), key_rotated_at: timestamp(r.key_rotated_at), last_key_rotation_at: timestamp(r.last_key_rotation_at), suspended_at: timestamp(r.suspended_at), reputation_score: Number(r.reputation_score) })),
      merchants: collections[2].rows.map((r) => ({ ...r, created_at: timestamp(r.created_at), updated_at: timestamp(r.updated_at), reputation_score: Number(r.reputation_score) })),
      delegations: collections[3].rows.map((r) => ({ ...r, created_at: timestamp(r.created_at), expires_at: timestamp(r.expires_at), used_at: timestamp(r.used_at), revoked_at: timestamp(r.revoked_at), max_amount: Number(r.max_amount) })),
      requests: collections[4].rows.map((r) => ({ ...r, timestamp: timestamp(r.request_timestamp), created_at: timestamp(r.created_at), updated_at: timestamp(r.updated_at), step_up_expires_at: timestamp(r.step_up_expires_at), amount: Number(r.amount) })),
      decisions: collections[5].rows.map((r) => ({ ...r, id: r.decision_id, created_at: timestamp(r.created_at), reason_codes: asJson(r.reason_codes, []), transaction_reasons: asJson(r.transaction_reasons, []), agent_reasons: asJson(r.agent_reasons, []), risk_signals: asJson(r.risk_signals, {}), fraud_explanation: r.fraud_explanation })),
      tokens: collections[6].rows.map((r) => ({ ...r, issued_at: timestamp(r.issued_at), created_at: timestamp(r.created_at), expires_at: timestamp(r.expires_at), reserved_at: timestamp(r.reserved_at), consumed_at: timestamp(r.consumed_at), revoked_at: timestamp(r.revoked_at), amount: Number(r.amount), claims: asJson(r.claims, {}) })),
      stepUpChallenges: collections[7].rows.map((r) => ({ ...r, created_at: timestamp(r.created_at), expires_at: timestamp(r.expires_at), resolved_at: timestamp(r.resolved_at), reason_codes: asJson(r.reason_codes, []) })),
      nonces: collections[8].rows.map((r) => ({ ...r, used_at: timestamp(r.used_at) })),
      audit: collections[9].rows.map((r) => ({ ...r, timestamp: timestamp(r.created_at), metadata: asJson(r.metadata, {}) })),
      paymentExecutions: collections[10].rows.map((r) => ({ ...r, authorization_request_id: r.authorization_request_id, created_at: timestamp(r.created_at), paid_at: timestamp(r.paid_at), failed_at: timestamp(r.failed_at), amount: Number(r.amount), provider_order: r.provider_order })),
      merchantOrders: collections[11].rows.map((r) => ({ ...r, created_at: timestamp(r.created_at), paid_at: timestamp(r.paid_at), amount: Number(r.amount) })),
      webhookEvents: collections[12].rows.map((r) => ({ ...r, received_at: timestamp(r.received_at), processed_at: timestamp(r.processed_at) })),
      transactionRiskSnapshots: collections[13].rows.map((r) => ({ ...r, created_at: timestamp(r.created_at), transaction_risk_score: Number(r.transaction_score), transaction_score: Number(r.transaction_score), agent_score: Number(r.agent_score), combined_score: Number(r.combined_score), transaction_reason_codes: asJson(r.transaction_reason_codes, []), agent_reason_codes: asJson(r.agent_reason_codes, []), combined_reason_codes: asJson(r.combined_reason_codes, []), signals: asJson(r.signals, {}), explanation: r.explanation })),
      userRiskProfiles: collections[14].rows.map((r) => ({ ...r, updated_at: timestamp(r.updated_at), last_transaction_at: timestamp(r.last_transaction_at), mean_amount: Number(r.mean_amount), median_amount: Number(r.median_amount), p95_amount: Number(r.p95_amount), typical_hours: asJson(r.typical_hours, []) })),
      agentRiskProfiles: collections[15].rows.map((r) => ({ ...r, updated_at: timestamp(r.updated_at), last_request_at: timestamp(r.last_request_at), last_key_rotation_at: timestamp(r.last_key_rotation_at), mean_amount: Number(r.mean_amount), median_amount: Number(r.median_amount), p95_amount: Number(r.p95_amount), reputation_score: Number(r.reputation_score), typical_hours: asJson(r.typical_hours, []) })),
      merchantRiskProfiles: collections[16].rows.map((r) => ({ ...r, created_at: timestamp(r.created_at), updated_at: timestamp(r.updated_at), mean_amount: Number(r.mean_amount), reputation_score: Number(r.reputation_score) })),
      fraudSignalEvents: collections[17].rows.map((r) => ({ ...r, created_at: timestamp(r.created_at), metadata: asJson(r.metadata, {}), value: Number(r.value) })),
      agentReputationEvents: collections[18].rows.map((r) => ({ ...r, created_at: timestamp(r.created_at), previous_reputation: Number(r.old_score), new_reputation: Number(r.new_score), delta: Number(r.delta), reason_codes: asJson(r.reason_codes, []) })),
      razorpayOrders: []
    };
  }

  async flush() {
    const pending = this.pending.splice(0);
    for (const operation of pending) await operation;
    await this.persistProfiles();
    await this.persistMutableCore();
  }

  save() {
    return this.flush();
  }

  reset(seed = {}) {
    this.data = { ...cloneEmpty(), ...seed };
    this.pending.push(this.resetDatabase(seed));
  }

  insert(collection, record) {
    this.data[collection].push(record);
    this.pending.push(this.persistRecord(collection, record));
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
    this.pending.push(this.persistRecord("audit", event));
    return event;
  }

  find(collection, predicate) {
    return this.data[collection].find(predicate);
  }

  all(collection) {
    return this.data[collection];
  }

  async reserveNonce(agent_id, nonce, request_id) {
    await this.flush();
    const result = await this.pool.query(
      "insert into nonce_records (agent_id, nonce, request_id, used_at) values ($1, $2, $3, now()) on conflict (agent_id, nonce) do nothing returning agent_id, nonce, request_id, used_at",
      [agent_id, nonce, request_id]
    );
    if (!result.rowCount) return false;
    this.data.nonces.push({ agent_id, nonce, request_id, used_at: timestamp(result.rows[0].used_at) });
    return true;
  }

  async consumeDelegation(delegation_id) {
    await this.flush();
    const result = await this.pool.query(
      "update delegations set status='USED', used_at=now() where delegation_id=$1 and status='ACTIVE' returning used_at",
      [delegation_id]
    );
    if (!result.rowCount) return false;
    const local = this.find("delegations", (d) => d.delegation_id === delegation_id);
    if (local) {
      local.status = "USED";
      local.used_at = timestamp(result.rows[0].used_at);
    }
    return true;
  }

  async reservePaymentToken(token_id) {
    await this.flush();
    const result = await this.pool.query(
      "update payment_authorization_tokens set status='RESERVED', reserved_at=now() where token_id=$1 and status='ACTIVE' and revoked_at is null and expires_at > now() returning reserved_at",
      [token_id]
    );
    if (!result.rowCount) return false;
    const local = this.find("tokens", (t) => t.token_id === token_id);
    if (local) {
      local.status = "RESERVED";
      local.reserved_at = timestamp(result.rows[0].reserved_at);
    }
    return true;
  }

  async consumePaymentToken(token_id) {
    await this.flush();
    const result = await this.pool.query(
      "update payment_authorization_tokens set status='CONSUMED', consumed_at=now() where token_id=$1 and status='RESERVED' returning consumed_at",
      [token_id]
    );
    if (!result.rowCount) return false;
    const local = this.find("tokens", (t) => t.token_id === token_id);
    if (local) {
      local.status = "CONSUMED";
      local.consumed_at = timestamp(result.rows[0].consumed_at);
    }
    return true;
  }

  async resetDatabase(seed) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("truncate table webhook_events, razorpay_orders, payment_executions, reputation_history, fraud_signal_events, transaction_risk_snapshots, audit_events, authorization_decisions, step_up_challenges, payment_authorization_tokens, nonce_records, authorization_requests, merchant_orders, delegations, merchants, agents, users restart identity cascade");
      for (const collection of ["users", "agents", "merchants", "merchantOrders", "delegations"]) {
        for (const record of seed[collection] || []) await this.persistRecord(collection, record, client);
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async persistProfiles() {
    for (const record of this.data.userRiskProfiles) await this.persistRecord("userRiskProfiles", record);
    for (const record of this.data.agentRiskProfiles) await this.persistRecord("agentRiskProfiles", record);
    for (const record of this.data.merchantRiskProfiles) await this.persistRecord("merchantRiskProfiles", record);
  }

  async persistMutableCore() {
    for (const record of this.data.agents) await this.persistRecord("agents", record);
    for (const record of this.data.delegations) await this.persistRecord("delegations", record);
    for (const record of this.data.requests) await this.persistRecord("requests", record);
    for (const record of this.data.tokens) await this.persistRecord("tokens", record);
    for (const record of this.data.stepUpChallenges) await this.persistRecord("stepUpChallenges", record);
    for (const record of this.data.paymentExecutions) await this.persistRecord("paymentExecutions", record);
    for (const record of this.data.merchantOrders) await this.persistRecord("merchantOrders", record);
    for (const record of this.data.webhookEvents) await this.persistRecord("webhookEvents", record);
  }

  async persistRecord(collection, record, client = this.pool) {
    const built = this.toInsert(collection, record);
    if (!built) return;
    await client.query(built.sql, built.values);
  }

  toInsert(collection, r) {
    switch (collection) {
      case "users":
        return buildInsert("users", { user_id: r.user_id || r.id, name: r.name, email: r.email, password_hash: r.password_hash, created_at: r.created_at, updated_at: r.updated_at || r.created_at }, "user_id", ["name", "email", "password_hash", "updated_at"]);
      case "agents":
        return buildInsert("agents", { agent_id: r.agent_id, name: r.name, developer_name: r.developer_name, public_key: r.public_key, public_key_fingerprint: r.public_key_fingerprint, status: r.status, reputation_score: r.reputation_score, key_rotation_count: r.key_rotation_count || 0, last_key_rotation_at: r.last_key_rotation_at, key_rotated_at: r.key_rotated_at, suspended_at: r.suspended_at, created_at: r.created_at, updated_at: r.updated_at || new Date().toISOString(), revoked_at: r.revoked_at }, "agent_id", ["name", "developer_name", "public_key", "public_key_fingerprint", "status", "reputation_score", "key_rotation_count", "last_key_rotation_at", "key_rotated_at", "suspended_at", "updated_at", "revoked_at"]);
      case "merchants":
        return buildInsert("merchants", { merchant_id: r.merchant_id, name: r.name, domain: r.domain, verification_status: r.verification_status, reputation_score: r.reputation_score ?? 0.5, razorpay_reference: r.razorpay_reference, created_at: r.created_at, updated_at: r.updated_at || r.created_at }, "merchant_id", ["name", "domain", "verification_status", "reputation_score", "razorpay_reference", "updated_at"]);
      case "merchantOrders":
        return buildInsert("merchant_orders", { merchant_id: r.merchant_id, external_order_id: r.external_order_id, description: r.description, amount: r.amount, currency: r.currency, status: r.status, created_at: r.created_at, paid_at: r.paid_at }, "merchant_id, external_order_id", ["description", "amount", "currency", "status", "paid_at"]);
      case "delegations":
        return buildInsert("delegations", { delegation_id: r.delegation_id, user_id: r.user_id, agent_id: r.agent_id, merchant_id: r.merchant_id, order_id: r.order_id, max_amount: r.max_amount, currency: r.currency, purpose: r.purpose, delegation_credential: r.delegation_credential, status: r.status, expires_at: r.expires_at, created_at: r.created_at, used_at: r.used_at, revoked_at: r.revoked_at }, "delegation_id", ["status", "used_at", "revoked_at", "delegation_credential"]);
      case "requests":
        return buildInsert("authorization_requests", { request_id: r.request_id, user_id: r.user_id, agent_id: r.agent_id, delegation_id: r.delegation_id, merchant_id: r.merchant_id, order_id: r.order_id, amount: r.amount, currency: r.currency, nonce: r.nonce, request_timestamp: r.timestamp, signature: r.signature, status: r.status, final_decision: r.final_decision, transaction_risk_score: r.transaction_risk_score, agent_risk_score: r.agent_risk_score, combined_risk_score: r.combined_risk_score, step_up_expires_at: r.step_up_expires_at, created_at: r.created_at, updated_at: r.updated_at || new Date().toISOString() }, "request_id", ["user_id", "status", "final_decision", "transaction_risk_score", "agent_risk_score", "combined_risk_score", "step_up_expires_at", "updated_at"]);
      case "nonces":
        return buildInsert("nonce_records", { agent_id: r.agent_id, nonce: r.nonce, request_id: r.request_id, used_at: r.used_at }, "agent_id, nonce");
      case "tokens":
        return buildInsert("payment_authorization_tokens", { token_id: r.token_id, token: r.token, claims: jsonb(r.claims, {}), request_id: r.request_id, user_id: r.user_id, agent_id: r.agent_id, merchant_id: r.merchant_id, order_id: r.order_id, amount: r.amount, currency: r.currency, status: r.status, issued_at: r.issued_at || r.created_at, expires_at: r.expires_at, reserved_at: r.reserved_at, consumed_at: r.consumed_at, revoked_at: r.revoked_at, created_at: r.created_at }, "token_id", ["status", "reserved_at", "consumed_at", "revoked_at"]);
      case "stepUpChallenges":
        return buildInsert("step_up_challenges", { challenge_id: r.challenge_id, request_id: r.request_id, user_id: r.user_id, status: r.status, reason_codes: jsonb(r.reason_codes, []), created_at: r.created_at, expires_at: r.expires_at, resolved_at: r.resolved_at }, "challenge_id", ["status", "reason_codes", "resolved_at"]);
      case "decisions":
        return buildInsert("authorization_decisions", { decision_id: r.id, request_id: r.request_id, agent_id: r.agent_id, decision: r.decision, risk_score: r.risk_score, transaction_score: r.transaction_score, agent_score: r.agent_score, combined_score: r.combined_score, transaction_reasons: jsonb(r.transaction_reasons, []), agent_reasons: jsonb(r.agent_reasons, []), risk_signals: jsonb(r.risk_signals, {}), reason_codes: jsonb(r.reason_codes, []), policy_version: r.policy_version, risk_model_version: r.risk_model_version, explanation: r.explanation, fraud_explanation: jsonb(r.fraud_explanation, null), created_at: r.created_at }, "decision_id");
      case "audit":
        return buildInsert("audit_events", { event_id: r.event_id, request_id: r.request_id, actor: r.actor, event_type: r.event_type, message: r.message, metadata: jsonb(r.metadata, {}), previous_event_hash: r.previous_event_hash, event_hash: r.event_hash, created_at: r.timestamp || r.created_at }, "event_id");
      case "transactionRiskSnapshots":
        return buildInsert("transaction_risk_snapshots", { request_id: r.request_id, user_id: r.user_id, agent_id: r.agent_id, merchant_id: r.merchant_id, transaction_score: r.transaction_risk_score ?? r.transaction_score, agent_score: r.agent_score, combined_score: r.combined_score, transaction_reason_codes: jsonb(r.transaction_reason_codes || r.transaction_reasons, []), agent_reason_codes: jsonb(r.agent_reason_codes || r.agent_reasons, []), combined_reason_codes: jsonb(r.combined_reason_codes || r.combined_reasons, []), signals: jsonb(r.signals, {}), explanation: jsonb(r.explanation, null), policy_version: r.policy_version, model_version: r.model_version, final_decision: r.final_decision, created_at: r.created_at || new Date().toISOString() }, "request_id");
      case "userRiskProfiles":
        return buildInsert("user_risk_profiles", { user_id: r.user_id, transaction_count: r.transaction_count || 0, successful_count: r.successful_count || 0, denied_count: r.denied_count || 0, mean_amount: r.mean_amount, median_amount: r.median_amount, max_amount: r.max_amount, p95_amount: r.p95_amount, merchant_count: r.merchant_count || 0, typical_hours: jsonb(r.typical_hours, []), last_transaction_at: r.last_transaction_at, updated_at: r.updated_at || new Date().toISOString() }, "user_id", ["transaction_count", "successful_count", "denied_count", "mean_amount", "median_amount", "max_amount", "p95_amount", "merchant_count", "typical_hours", "last_transaction_at", "updated_at"]);
      case "agentRiskProfiles":
        return buildInsert("agent_risk_profiles", { agent_id: r.agent_id, total_requests: r.total_requests || 0, allowed_requests: r.allowed_requests || 0, denied_requests: r.denied_requests || 0, step_up_requests: r.step_up_requests || 0, signature_failures: r.signature_failures || 0, replay_attempts: r.replay_attempts || 0, delegation_violations: r.delegation_violations || 0, unique_users: r.unique_users || 0, unique_merchants: r.unique_merchants || 0, mean_amount: r.mean_amount, median_amount: r.median_amount, p95_amount: r.p95_amount, typical_hours: jsonb(r.typical_hours, []), requests_last_1m: r.requests_last_1m || 0, requests_last_10m: r.requests_last_10m || 0, requests_last_1h: r.requests_last_1h || 0, requests_last_24h: r.requests_last_24h || 0, reputation_score: r.reputation_score ?? 0.75, key_rotation_count: r.key_rotation_count || 0, last_key_rotation_at: r.last_key_rotation_at, last_request_at: r.last_request_at, updated_at: r.updated_at || new Date().toISOString() }, "agent_id", ["total_requests", "allowed_requests", "denied_requests", "step_up_requests", "signature_failures", "replay_attempts", "delegation_violations", "unique_users", "unique_merchants", "mean_amount", "median_amount", "p95_amount", "typical_hours", "requests_last_1m", "requests_last_10m", "requests_last_1h", "requests_last_24h", "reputation_score", "key_rotation_count", "last_key_rotation_at", "last_request_at", "updated_at"]);
      case "merchantRiskProfiles":
        return buildInsert("merchant_risk_profiles", { merchant_id: r.merchant_id, total_agent_requests: r.total_agent_requests || 0, unique_agents: r.unique_agents || 0, unique_users: r.unique_users || 0, mean_amount: r.mean_amount, denied_request_count: r.denied_request_count || 0, high_risk_request_count: r.high_risk_request_count || 0, reputation_score: r.reputation_score ?? 0.5, created_at: r.created_at, updated_at: r.updated_at || new Date().toISOString() }, "merchant_id", ["total_agent_requests", "unique_agents", "unique_users", "mean_amount", "denied_request_count", "high_risk_request_count", "reputation_score", "updated_at"]);
      case "fraudSignalEvents":
        return buildInsert("fraud_signal_events", { request_id: r.request_id, signal_type: r.signal_type, severity: r.severity, value: r.value, metadata: jsonb(r.metadata, {}), created_at: r.created_at }, null);
      case "agentReputationEvents":
        return buildInsert("reputation_history", { agent_id: r.agent_id, old_score: r.previous_reputation, new_score: r.new_reputation, delta: r.delta, reason_code: r.reason_codes?.[0], decision: r.decision, reason_codes: jsonb(r.reason_codes, []), request_id: r.request_id, created_at: r.created_at }, null);
      case "paymentExecutions":
        return buildInsert("payment_executions", { execution_id: r.execution_id, authorization_request_id: r.authorization_request_id, token_id: r.token_id, merchant_id: r.merchant_id, order_id: r.order_id, razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, amount: r.amount, currency: r.currency, status: r.status, provider_order: jsonb(r.provider_order, null), error: r.error, created_at: r.created_at, paid_at: r.paid_at, failed_at: r.failed_at, client_signature_verified_at: r.client_signature_verified_at }, "execution_id", ["razorpay_order_id", "razorpay_payment_id", "status", "provider_order", "error", "paid_at", "failed_at", "client_signature_verified_at"]);
      case "razorpayOrders":
        return buildInsert("razorpay_orders", { razorpay_order_id: r.razorpay_order_id, amount: r.amount, currency: r.currency, receipt: r.receipt, authorization_request_id: r.authorization_request_id, merchant_id: r.merchant_id, status: r.status, created_at: r.created_at }, "razorpay_order_id", ["status"]);
      case "webhookEvents":
        return buildInsert("webhook_events", { provider: r.provider, external_event_id: r.external_event_id, event_type: r.event_type, payload_hash: r.payload_hash, received_at: r.received_at, processed_at: r.processed_at, status: r.status }, "provider, external_event_id", ["processed_at", "status"]);
      default:
        return null;
    }
  }
}

let postgresStorePromise = null;

export async function createAppStore({ file } = {}) {
  const environment = process.env.ENVIRONMENT || process.env.NODE_ENV || "development";
  const explicitJson = process.env.PERSISTENCE_MODE === "json" || process.env.DEV_PERSISTENCE_MODE === "json";
  if (process.env.DATABASE_URL) {
    postgresStorePromise ||= PostgresStore.create(process.env.DATABASE_URL);
    const store = await postgresStorePromise;
    await store.reload();
    return store;
  }
  if (environment === "production" && !explicitJson) {
    throw new Error("DATABASE_URL is required in production. Set PERSISTENCE_MODE=json only for an explicit demo deployment.");
  }
  return new Store(file);
}
