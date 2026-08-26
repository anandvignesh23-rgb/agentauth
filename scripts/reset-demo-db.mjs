import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to reset Supabase PostgreSQL demo state.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
});

const client = await pool.connect();
try {
  await client.query("begin");
  await client.query("truncate table webhook_events, razorpay_orders, payment_executions, reputation_history, fraud_signal_events, transaction_risk_snapshots, audit_events, authorization_decisions, step_up_challenges, payment_authorization_tokens, nonce_records, authorization_requests restart identity cascade");
  await client.query("update agents set status='ACTIVE', reputation_score=0.91, suspended_at=null, revoked_at=null where agent_id='agent_7F92A'");
  await client.query("update delegations set status='ACTIVE', used_at=null, revoked_at=null where delegation_id in ('del_9217', 'del_highrisk')");
  await client.query("update delegations set status='ACTIVE', used_at=null, revoked_at=null where delegation_id='del_expired'");
  await client.query("update merchant_orders set status='OPEN', paid_at=null where external_order_id in ('ORD-1934', 'ORD-40000')");
  await client.query("delete from user_risk_profiles");
  await client.query("delete from agent_risk_profiles");
  await client.query("delete from merchant_risk_profiles");
  await client.query("commit");
  console.log(JSON.stringify({ ok: true, reset: "demo_transactional_state" }, null, 2));
} catch (err) {
  await client.query("rollback");
  console.error(err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
