alter table merchant_orders
  add column if not exists razorpay_payment_id text;

alter table payment_executions
  add column if not exists provider_payment jsonb,
  add column if not exists provider_verified_at timestamptz;
