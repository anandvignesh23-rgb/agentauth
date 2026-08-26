create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  user_id text unique not null,
  name text,
  email text unique,
  password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  agent_id text unique not null,
  name text,
  developer_name text,
  public_key text not null,
  public_key_fingerprint text,
  status text not null check (status in ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  reputation_score numeric not null default 0.75,
  key_rotation_count integer not null default 0,
  last_key_rotation_at timestamptz,
  key_rotated_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists merchants (
  id uuid primary key default gen_random_uuid(),
  merchant_id text unique not null,
  name text,
  domain text,
  verification_status text,
  reputation_score numeric not null default 0.5,
  razorpay_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists merchant_orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(merchant_id),
  external_order_id text not null,
  description text,
  amount bigint not null,
  currency text not null,
  status text not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (merchant_id, external_order_id)
);

create table if not exists delegations (
  id uuid primary key default gen_random_uuid(),
  delegation_id text unique not null,
  user_id text not null references users(user_id),
  agent_id text not null references agents(agent_id),
  merchant_id text not null references merchants(merchant_id),
  order_id text not null,
  max_amount bigint not null,
  currency text not null,
  purpose text,
  delegation_credential text,
  status text not null check (status in ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists authorization_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text unique not null,
  user_id text references users(user_id),
  agent_id text references agents(agent_id),
  delegation_id text references delegations(delegation_id),
  merchant_id text references merchants(merchant_id),
  order_id text,
  amount bigint,
  currency text,
  nonce text,
  request_timestamp timestamptz,
  signature text,
  status text not null,
  final_decision text,
  transaction_risk_score numeric,
  agent_risk_score numeric,
  combined_risk_score numeric,
  step_up_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nonce_records (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references agents(agent_id),
  nonce text not null,
  request_id text references authorization_requests(request_id),
  used_at timestamptz not null default now(),
  unique (agent_id, nonce)
);

create table if not exists payment_authorization_tokens (
  id uuid primary key default gen_random_uuid(),
  token_id text unique not null,
  token text not null,
  claims jsonb not null default '{}'::jsonb,
  request_id text not null references authorization_requests(request_id),
  user_id text references users(user_id),
  agent_id text references agents(agent_id),
  merchant_id text references merchants(merchant_id),
  order_id text,
  amount bigint,
  currency text,
  status text not null check (status in ('ACTIVE', 'RESERVED', 'CONSUMED', 'EXPIRED', 'REVOKED')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reserved_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists step_up_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_id text unique not null,
  request_id text unique not null references authorization_requests(request_id),
  user_id text references users(user_id),
  status text not null check (status in ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED')),
  reason_codes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz
);

create table if not exists authorization_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_id text unique not null,
  request_id text not null references authorization_requests(request_id),
  agent_id text references agents(agent_id),
  decision text not null,
  risk_score numeric,
  transaction_score numeric,
  agent_score numeric,
  combined_score numeric,
  transaction_reasons jsonb not null default '[]'::jsonb,
  agent_reasons jsonb not null default '[]'::jsonb,
  risk_signals jsonb not null default '{}'::jsonb,
  reason_codes jsonb not null default '[]'::jsonb,
  policy_version text,
  risk_model_version text,
  explanation text,
  fraud_explanation jsonb,
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  event_id text unique not null,
  request_id text references authorization_requests(request_id),
  actor text,
  event_type text not null,
  previous_state jsonb,
  new_state jsonb,
  reason_codes jsonb not null default '[]'::jsonb,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  previous_event_hash text,
  event_hash text,
  created_at timestamptz not null default now()
);

create table if not exists transaction_risk_snapshots (
  id uuid primary key default gen_random_uuid(),
  request_id text unique references authorization_requests(request_id),
  user_id text references users(user_id),
  agent_id text references agents(agent_id),
  merchant_id text references merchants(merchant_id),
  transaction_score numeric,
  agent_score numeric,
  combined_score numeric,
  transaction_reason_codes jsonb not null default '[]'::jsonb,
  agent_reason_codes jsonb not null default '[]'::jsonb,
  combined_reason_codes jsonb not null default '[]'::jsonb,
  signals jsonb not null default '{}'::jsonb,
  explanation jsonb,
  policy_version text,
  model_version text,
  final_decision text,
  created_at timestamptz not null default now()
);

create table if not exists user_risk_profiles (
  user_id text primary key references users(user_id),
  transaction_count integer not null default 0,
  successful_count integer not null default 0,
  denied_count integer not null default 0,
  mean_amount numeric,
  median_amount numeric,
  max_amount bigint,
  p95_amount numeric,
  merchant_count integer not null default 0,
  typical_hours jsonb not null default '[]'::jsonb,
  last_transaction_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists agent_risk_profiles (
  agent_id text primary key references agents(agent_id),
  total_requests integer not null default 0,
  allowed_requests integer not null default 0,
  denied_requests integer not null default 0,
  step_up_requests integer not null default 0,
  signature_failures integer not null default 0,
  replay_attempts integer not null default 0,
  delegation_violations integer not null default 0,
  unique_users integer not null default 0,
  unique_merchants integer not null default 0,
  mean_amount numeric,
  median_amount numeric,
  p95_amount numeric,
  typical_hours jsonb not null default '[]'::jsonb,
  requests_last_1m integer not null default 0,
  requests_last_10m integer not null default 0,
  requests_last_1h integer not null default 0,
  requests_last_24h integer not null default 0,
  reputation_score numeric not null default 0.75,
  key_rotation_count integer not null default 0,
  last_key_rotation_at timestamptz,
  last_request_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists merchant_risk_profiles (
  merchant_id text primary key references merchants(merchant_id),
  total_agent_requests integer not null default 0,
  unique_agents integer not null default 0,
  unique_users integer not null default 0,
  mean_amount numeric,
  denied_request_count integer not null default 0,
  high_risk_request_count integer not null default 0,
  reputation_score numeric not null default 0.5,
  created_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists fraud_signal_events (
  id uuid primary key default gen_random_uuid(),
  request_id text references authorization_requests(request_id),
  signal_type text not null,
  severity text not null,
  value numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists reputation_history (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references agents(agent_id),
  old_score numeric,
  new_score numeric,
  delta numeric,
  reason_code text,
  decision text,
  reason_codes jsonb not null default '[]'::jsonb,
  request_id text references authorization_requests(request_id),
  created_at timestamptz not null default now()
);

create table if not exists payment_executions (
  id uuid primary key default gen_random_uuid(),
  execution_id text unique not null,
  authorization_request_id text references authorization_requests(request_id),
  token_id text unique not null references payment_authorization_tokens(token_id),
  merchant_id text references merchants(merchant_id),
  order_id text,
  razorpay_order_id text,
  razorpay_payment_id text,
  amount bigint,
  currency text,
  status text not null,
  provider_order jsonb,
  error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  failed_at timestamptz,
  client_signature_verified_at timestamptz
);

create table if not exists razorpay_orders (
  razorpay_order_id text primary key,
  amount bigint,
  currency text,
  receipt text,
  authorization_request_id text references authorization_requests(request_id),
  merchant_id text references merchants(merchant_id),
  status text,
  created_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  event_type text,
  payload_hash text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null,
  unique (provider, external_event_id)
);

create index if not exists idx_authorization_requests_agent_created on authorization_requests(agent_id, created_at);
create index if not exists idx_authorization_requests_user_created on authorization_requests(user_id, created_at);
create index if not exists idx_authorization_requests_merchant_created on authorization_requests(merchant_id, created_at);
create index if not exists idx_audit_events_request_created on audit_events(request_id, created_at);
create index if not exists idx_fraud_signal_events_request on fraud_signal_events(request_id);
create index if not exists idx_fraud_signal_events_type_created on fraud_signal_events(signal_type, created_at);
create index if not exists idx_reputation_history_agent_created on reputation_history(agent_id, created_at);
create index if not exists idx_delegations_agent_status on delegations(agent_id, status);
create index if not exists idx_delegations_user_status on delegations(user_id, status);
create index if not exists idx_payment_authorization_tokens_status_expires on payment_authorization_tokens(status, expires_at);
create index if not exists idx_step_up_challenges_status_expires on step_up_challenges(status, expires_at);
