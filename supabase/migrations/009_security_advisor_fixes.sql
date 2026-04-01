-- 009_security_advisor_fixes.sql
-- Fixes all Supabase Security Advisor ERRORs:
--   1. security_definer_view  → insurance_pool_balance
--   2. rls_disabled_in_public → 8 tables

-- ═══════════════════════════════════════════════════════════════
-- 1. Fix SECURITY DEFINER view
--    Recreate with SECURITY INVOKER so it respects the caller's
--    RLS context instead of the view creator's permissions.
-- ═══════════════════════════════════════════════════════════════

drop view if exists public.insurance_pool_balance;

create view public.insurance_pool_balance
  with (security_invoker = true)
as
  select
    coalesce(sum(amount) filter (where type = 'DEPOSIT'),           0) as total_deposits,
    coalesce(sum(amount) filter (where type in ('CLAIM','RECOVERY')), 0) as total_paid_out,
    coalesce(sum(amount) filter (where type = 'DEPOSIT'),           0)
      - coalesce(sum(amount) filter (where type in ('CLAIM','RECOVERY')), 0) as balance
  from public.insurance_events;

-- ═══════════════════════════════════════════════════════════════
-- 2. Enable RLS on all unprotected tables
-- ═══════════════════════════════════════════════════════════════

alter table public.admin_users                enable row level security;
alter table public.ambassadors                enable row level security;
alter table public.audit_log                  enable row level security;
alter table public.env_contracts              enable row level security;
alter table public.insurance_events           enable row level security;
alter table public.platform_settings          enable row level security;
alter table public.treasury_wallets           enable row level security;
alter table public.treasury_wallet_proposals  enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- 3. Policies per table
-- ═══════════════════════════════════════════════════════════════

-- ── admin_users ───────────────────────────────────────────────
-- Only readable by the authenticated user whose email matches.
-- No public writes — managed via Supabase dashboard / service role only.

create policy "admin_users: read own row"
  on public.admin_users for select
  using ( auth.email() = email );

-- ── ambassadors ───────────────────────────────────────────────
-- Public read (ambassador profiles shown on landing page).
-- No public writes — updated by admin via service role.

create policy "ambassadors: public read"
  on public.ambassadors for select
  using (true);

-- ── audit_log ─────────────────────────────────────────────────
-- No public access. Written by DB triggers (security definer functions).
-- Admin reads via service role key in backend routes only.
-- (No policies = deny all for anon/authenticated via PostgREST)

-- ── env_contracts ─────────────────────────────────────────────
-- Public read — frontend needs contract addresses.
-- No public writes.

create policy "env_contracts: public read"
  on public.env_contracts for select
  using (true);

-- ── insurance_events ──────────────────────────────────────────
-- No public access. Written by DB triggers / admin backend only.
-- (No policies = deny all)

-- ── platform_settings ────────────────────────────────────────
-- Public read — frontend reads factory address, fee config, feature flags.
-- No public writes.

create policy "platform_settings: public read"
  on public.platform_settings for select
  using (true);

-- ── treasury_wallets ─────────────────────────────────────────
-- No public access. Admin-only via service role.
-- (No policies = deny all)

-- ── treasury_wallet_proposals ────────────────────────────────
-- No public access. Admin-only via service role.
-- (No policies = deny all)

-- ═══════════════════════════════════════════════════════════════
-- 4. GRANT read on public-read tables (RLS still enforces policy)
-- ═══════════════════════════════════════════════════════════════

grant select on public.ambassadors        to anon, authenticated;
grant select on public.env_contracts      to anon, authenticated;
grant select on public.platform_settings  to anon, authenticated;

-- admin_users: only authenticated can attempt a read (policy restricts further)
grant select on public.admin_users to authenticated;
