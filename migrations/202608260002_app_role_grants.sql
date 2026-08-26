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
