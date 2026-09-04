# Supabase Security Remediation

Date: 2026-09-04

Supabase Review reported:

- `rls_disabled_in_public`
- `sensitive_columns_exposed`

Project: `qusdfmrpujmvsqeqxwom`

## Fix Applied

Migration:

```text
migrations/202609040001_lock_down_supabase_rls.sql
```

The migration:

- Enables Row-Level Security on every AgentAuth table in `public`.
- Forces Row-Level Security on every AgentAuth table.
- Revokes all table access from `anon` and `authenticated`.
- Revokes public schema usage, sequence access, and function execution from `anon` and `authenticated`.
- Revokes default table, sequence, and function privileges from `anon` and `authenticated`.
- Preserves backend-only access through the `agentauth_app` role when present.

No policy grants were added for `anon` or `authenticated`.

## Sensitive Tables Covered

- `users`, including `email` and `password_hash`
- `delegations`, including `delegation_credential`
- `authorization_requests`, including request signatures and nonces
- `payment_authorization_tokens`, including signed tokens and claims
- `payment_executions`, provider payloads, and webhook metadata
- audit, risk, reputation, merchant, agent, and order tables

## Live Verification

Supabase catalog verification returned:

```json
{
  "rls_enabled_and_forced_tables": 20,
  "expected_tables": 20,
  "anon_authenticated_table_grants": [],
  "rls_failures": []
}
```

Public backend verification after applying the migration:

```bash
curl https://agentauth.vercel.app/health
python3 scripts/smoke_test_public_backend.py --base-url https://agentauth.vercel.app --run-demo-flow
```

Result: both passed. Production still reports Supabase PostgreSQL connected.
