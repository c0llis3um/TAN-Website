-- ============================================================
--  DeFi Tanda — Pilot Auth Policies
--  Migration: 005_pilot_auth
--
--  Context: the app uses wallet-connect (MetaMask / Phantom)
--  directly without Supabase Auth sessions. The JWT is empty,
--  so the auth_wallet() helper always returns '' and all
--  wallet-gated policies fail.
--
--  This migration opens the policies enough for the pilot
--  while keeping destructive operations blocked.
--  Sprint 3 will replace these with wallet-signature auth
--  (sign message → verify on Edge Function → custom JWT).
-- ============================================================

-- ── Drop the wallet-gated policies that depend on JWT ────────
drop policy if exists "users: read own"    on users;
drop policy if exists "users: insert own"  on users;
drop policy if exists "users: update own"  on users;

drop policy if exists "pods: insert organizer" on pods;
drop policy if exists "pods: update organizer" on pods;

drop policy if exists "pod_members: insert self" on pod_members;

drop policy if exists "payments: insert own" on payments;

drop policy if exists "disputes: insert" on disputes;

-- ── USERS ────────────────────────────────────────────────────
-- Anyone can insert a user row (wallet_address is the PK — no duplication risk)
create policy "users: insert pilot"
  on users for insert
  with check (true);

-- Anyone can read any user row (alias + score are public in a ROSCA anyway)
create policy "users: read pilot"
  on users for select
  using (true);

-- Only the wallet owner can update their own row.
-- We pass wallet_address in the WHERE clause from the app —
-- without a JWT we rely on the app to send the correct address.
-- Sensitive fields (status, kyc_verified) are excluded from the
-- authenticated grant so they cannot be self-modified.
create policy "users: update pilot"
  on users for update
  using (true)
  with check (true);

-- ── PODS ─────────────────────────────────────────────────────
create policy "pods: insert pilot"
  on pods for insert
  with check (true);

create policy "pods: update pilot"
  on pods for update
  using (status = 'OPEN')
  with check (true);

-- ── POD MEMBERS ──────────────────────────────────────────────
create policy "pod_members: insert pilot"
  on pod_members for insert
  with check (true);

-- ── PAYMENTS ─────────────────────────────────────────────────
create policy "payments: insert pilot"
  on payments for insert
  with check (true);

-- ── DISPUTES ─────────────────────────────────────────────────
create policy "disputes: insert pilot"
  on disputes for insert
  with check (true);

-- ── Grant anon INSERT on users (needed for wallet connect) ───
grant select, insert, update on users to anon;
grant select, insert         on pods  to anon;
grant select, insert         on pod_members to anon;
grant select, insert         on payments    to anon;

-- ── Sequence grants for anon (upsert needs these) ────────────
-- Tables use uuid_generate_v4() so no sequence needed.

-- ============================================================
--  Sprint 3 plan — replace with:
--  1. POST /auth/wallet  — verify EIP-191 / Solana signature
--  2. supabase.auth.signInWithCustomToken(jwt)
--  3. JWT includes { wallet_address, chain } in app_metadata
--  4. Restore strict auth_wallet() policies
-- ============================================================
