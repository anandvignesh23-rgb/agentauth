-- Defense in depth for Supabase Data API exposure:
-- anon/authenticated can inherit schema usage through the PUBLIC pseudo-role.
-- Remove that inherited access and grant schema usage back only to the backend role.

revoke usage on schema public from public;
revoke all on schema public from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'agentauth_app') then
    grant usage on schema public to agentauth_app;
  end if;
end $$;
