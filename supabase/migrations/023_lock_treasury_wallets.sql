-- Migration 023: lock treasury_wallets / treasury_wallet_proposals writes to admins only
--
-- Migration 012_treasury_admin_access.sql granted insert/update on treasury_wallets to
-- the `anon` role and set RLS policies to using(true)/with check(true), reasoning that
-- "admin UI controls auth via RequireAdmin". RequireAdmin is a client-side React route
-- guard — it does nothing to stop a direct call to the Supabase REST API with the public
-- anon key (which is not a secret; it ships in the client bundle). That means, as shipped,
-- ANY unauthenticated caller can currently overwrite treasury_wallets.address — the
-- fee-collection wallet address per chain — for any chain.
--
-- This is also a regression: migration 009_security_advisor_fixes.sql had already locked
-- this table to "no public access / admin-only via service role" before 012 reopened it.
--
-- Fix: revoke anon write access, and replace the permissive insert/update policies with
-- ones that check the caller is a real admin. The admin panel's frontend calls
-- (adminUpsertTreasuryWallet in src/lib/db.js) run on the same Supabase client instance
-- used for admin login (src/pages/admin/Login/index.jsx), so a logged-in admin does carry
-- a real Supabase Auth session/JWT here — auth.jwt() ->> 'email' matches the admin-check
-- pattern already used in netlify/functions/release-xrpl-collateral.js and
-- slash-xrpl-collateral.js (admin_users has no user_id column, only email).
--
-- Reads are left open to anon — wallet addresses aren't secret (they're public on-chain
-- data anyway), and restricting reads isn't the actual risk here.

revoke insert, update on public.treasury_wallets          from anon;
revoke insert         on public.treasury_wallet_proposals from anon;

drop policy if exists "admin_write_treasury_wallets"    on public.treasury_wallets;
drop policy if exists "admin_update_treasury_wallets"   on public.treasury_wallets;
drop policy if exists "admin_insert_treasury_proposals" on public.treasury_wallet_proposals;

create policy "admin_only_insert_treasury_wallets"
  on public.treasury_wallets for insert
  to authenticated
  with check (exists (
    select 1 from public.admin_users a
    where a.email = (auth.jwt() ->> 'email') and a.active
  ));

create policy "admin_only_update_treasury_wallets"
  on public.treasury_wallets for update
  to authenticated
  using (exists (
    select 1 from public.admin_users a
    where a.email = (auth.jwt() ->> 'email') and a.active
  ))
  with check (exists (
    select 1 from public.admin_users a
    where a.email = (auth.jwt() ->> 'email') and a.active
  ));

create policy "admin_only_insert_treasury_proposals"
  on public.treasury_wallet_proposals for insert
  to authenticated
  with check (exists (
    select 1 from public.admin_users a
    where a.email = (auth.jwt() ->> 'email') and a.active
  ));
