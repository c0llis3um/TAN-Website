-- Migration 028: lock down unauthenticated writes to fund-moving tables
--
-- Audit finding: 007_rls_tighten.sql left pods/pod_members/payments/users writes
-- open to the public `anon` key with `using (true)` policies and only trivial
-- `with check` constraints (e.g. "organizer_id is not null" — never "you own this
-- row"), noting "Full JWT-wallet auth comes in Sprint 3." That auth layer was never
-- built, and there is still no mechanism anywhere in the app that ties a Supabase
-- write to proof of wallet ownership.
--
-- Concretely, with nothing but the public anon key (shipped in every client bundle),
-- anyone could:
--   - UPDATE users.wallet_address on any row       -> hijack another member's payouts
--   - UPDATE pods.contract_address on any row       -> redirect a pod's collateral
--   - UPDATE pod_members.payout_slot on any row     -> redirect a cycle's payout
--   - INSERT fake payments rows                     -> trick maybeAdvanceCycle into
--                                                       an early/incorrect payout
--
-- Fix: revoke write access to these tables from anon/authenticated entirely. From
-- here on, pod_members/payments only change via netlify/functions/pod-join.js and
-- pod-record-payment.js, which independently verify an on-chain XRPL transaction
-- before writing (service role bypasses RLS) — the same trust model already used for
-- pod_escrows (016), treasury_wallets (post-023), and anomaly_refunds (027).
--
-- users.wallet_address is additionally protected by a trigger rather than a grant/
-- RLS trick, since a trigger fires regardless of how a client (or a future upsert
-- helper) shapes its request — it can't be bypassed by including wallet_address in
-- an UPDATE's SET list, unlike a column-level GRANT restriction.
--
-- Reads are untouched — pod browsing, member lists, etc. are meant to be public and
-- were never the risk.

-- ── pod_members: writes now server-only ─────────────────────────────────
revoke insert, update on public.pod_members from anon, authenticated;
drop policy if exists "pod_members: insert pilot" on public.pod_members;
drop policy if exists "pod_members: update pilot" on public.pod_members;

-- ── payments: writes now server-only ────────────────────────────────────
-- (UPDATE was already blocked by RLS default-deny — no "for update" policy was ever
-- created for this table — but the grant existed and is misleading; revoke it too.)
revoke insert, update on public.payments from anon, authenticated;
drop policy if exists "payments: insert pilot" on public.payments;

-- ── pods: sensitive fields (status, contract_address, current_cycle, ...) ──
-- now server-only. INSERT (pod creation) stays open — a freshly created pod has no
-- funds yet, so spoofing organizer_id isn't a theft vector, just an unresolved
-- follow-up (tracked separately, not a launch blocker).
revoke update on public.pods from anon, authenticated;
drop policy if exists "pods: update pilot" on public.pods;

-- ── users: wallet_address immutable after creation ──────────────────────
-- Narrow the anon grant to match authenticated's existing column-scoped grant
-- (004_grants.sql) — belt-and-suspenders alongside the trigger below.
revoke update on public.users from anon;
grant update (alias, email, lang) on public.users to anon;

create or replace function public.prevent_wallet_address_change()
returns trigger
language plpgsql
as $$
begin
  if new.wallet_address is distinct from old.wallet_address then
    raise exception 'wallet_address cannot be changed once set';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_users_wallet_address_immutable on public.users;
create trigger trg_users_wallet_address_immutable
  before update on public.users
  for each row
  execute function public.prevent_wallet_address_change();
