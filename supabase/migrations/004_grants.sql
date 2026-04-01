-- ============================================================
--  DeFi Tanda — Role Grants
--  Migration: 004_grants
--
--  Supabase requires explicit GRANT even when RLS policies
--  exist. Without these, the anon/authenticated roles cannot
--  read or write even if a policy says "with check (true)".
-- ============================================================

-- ── anon role (unauthenticated visitors) ────────────────────
-- Can only insert into waitlist (landing page form)
grant insert on waitlist to anon;

-- ── authenticated role (wallet-connected users) ─────────────
grant select, insert        on users             to authenticated;
grant update (alias, email, lang) on users       to authenticated;

grant select, insert        on pods              to authenticated;
grant update (name, status) on pods              to authenticated;

grant select, insert        on pod_members       to authenticated;

grant select, insert        on payments          to authenticated;
grant update (status, tx_hash, paid_at) on payments to authenticated;

grant select               on payouts            to authenticated;

grant select               on insurance_events   to authenticated;
grant select               on insurance_pool_balance to authenticated;

grant select, insert        on disputes          to authenticated;

grant select               on reputation_events  to authenticated;

grant select               on platform_settings  to authenticated;

grant select               on env_contracts      to authenticated;

-- ── Usage on sequences (needed for uuid inserts) ─────────────
-- uuid_generate_v4() is an extension function, not a sequence,
-- so no sequence grants needed — covered by the extension grant.

-- ── Confirm grants applied ───────────────────────────────────
-- Run this to verify:
-- select grantee, table_name, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
-- order by table_name, grantee;
