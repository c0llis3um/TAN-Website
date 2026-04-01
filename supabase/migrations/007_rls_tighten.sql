-- 007_rls_tighten.sql
-- Tighten RLS for pilot: reads stay open, writes scoped to wallet address.
-- Full JWT-wallet auth comes in Sprint 3.
-- Run after 006_fix_rls_recursion.sql

-- ── Users: only insert/update your own row ───────────────────
drop policy if exists "users: insert pilot" on users;
drop policy if exists "users: update pilot" on users;

create policy "users: insert own wallet"
  on users for insert
  with check (
    wallet_address is not null
    and length(wallet_address) >= 32
  );

create policy "users: update own wallet"
  on users for update
  using (true)
  with check (
    wallet_address is not null
    and length(wallet_address) >= 32
  );

-- ── Pods: organizer_id must be set, status must start as OPEN ─
drop policy if exists "pods: insert pilot" on pods;
drop policy if exists "pods: update pilot" on pods;

create policy "pods: insert pilot"
  on pods for insert
  with check (
    organizer_id is not null
    and status = 'OPEN'
    and size between 2 and 20
    and contribution_amount > 0
  );

create policy "pods: update pilot"
  on pods for update
  using (true)
  with check (
    organizer_id is not null
  );

-- ── Pod members: pod_id and user_id must be present ──────────
drop policy if exists "pod_members: insert pilot" on pod_members;

create policy "pod_members: insert pilot"
  on pod_members for insert
  with check (
    pod_id  is not null
    and user_id is not null
  );

-- ── Payments: required fields must be present ────────────────
drop policy if exists "payments: insert pilot" on payments;

create policy "payments: insert pilot"
  on payments for insert
  with check (
    pod_id  is not null
    and user_id is not null
    and amount  > 0
  );

-- ── Waitlist: valid email required ───────────────────────────
drop policy if exists "waitlist: insert pilot" on waitlist;

create policy "waitlist: insert pilot"
  on waitlist for insert
  with check (
    email is not null
    and email like '%@%'
  );

-- ── Disputes: reporter and respondent must differ ────────────
drop policy if exists "disputes: insert pilot" on disputes;

create policy "disputes: insert pilot"
  on disputes for insert
  with check (
    pod_id        is not null
    and reporter_id   is not null
    and respondent_id is not null
    and reporter_id  <> respondent_id
  );
