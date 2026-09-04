-- Supabase reviewer remediation:
-- - Public schema app tables must not be reachable by anon/authenticated Data API roles.
-- - RLS is enabled and forced on every AgentAuth table as defense in depth.
-- - Backend access remains available only through the dedicated agentauth_app role.

do $$
declare
  table_name text;
  app_tables text[] := array[
    'users',
    'agents',
    'merchants',
    'merchant_orders',
    'delegations',
    'authorization_requests',
    'nonce_records',
    'payment_authorization_tokens',
    'step_up_challenges',
    'authorization_decisions',
    'audit_events',
    'transaction_risk_snapshots',
    'user_risk_profiles',
    'agent_risk_profiles',
    'merchant_risk_profiles',
    'fraud_signal_events',
    'reputation_history',
    'payment_executions',
    'razorpay_orders',
    'webhook_events'
  ];
begin
  foreach table_name in array app_tables loop
    execute format('alter table if exists public.%I enable row level security', table_name);
    execute format('alter table if exists public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    if exists (select 1 from pg_roles where rolname = 'agentauth_app') then
      execute format('drop policy if exists agentauth_app_backend_access on public.%I', table_name);
      execute format('create policy agentauth_app_backend_access on public.%I for all to agentauth_app using (true) with check (true)', table_name);
    end if;
  end loop;
end $$;

revoke usage on schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'agentauth_app') then
    grant usage on schema public to agentauth_app;
    grant select, insert, update, delete, truncate on all tables in schema public to agentauth_app;
    grant usage, select on all sequences in schema public to agentauth_app;
    alter default privileges in schema public grant select, insert, update, delete, truncate on tables to agentauth_app;
    alter default privileges in schema public grant usage, select on sequences to agentauth_app;
  end if;
end $$;
