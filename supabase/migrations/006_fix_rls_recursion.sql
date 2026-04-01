-- ============================================================
--  DeFi Tanda — Fix RLS infinite recursion
--  Migration: 006_fix_rls_recursion
--
--  The "pod_members: read same pod" policy in 002 queries
--  pod_members from inside a policy ON pod_members — Postgres
--  recurses infinitely evaluating it.
--
--  Same issue exists on "pods: read member" which also joins
--  pod_members inside a pods policy.
--
--  Fix: replace all self-referencing policies with flat ones
--  that work for the pilot. Sprint 3 replaces with a
--  security-definer function that bypasses RLS for the subquery.
-- ============================================================

-- ── pod_members ──────────────────────────────────────────────
drop policy if exists "pod_members: read same pod" on pod_members;

create policy "pod_members: read pilot"
  on pod_members for select
  using (true);

-- ── pods ─────────────────────────────────────────────────────
-- "pods: read member" joins pod_members → same recursion risk
drop policy if exists "pods: read member" on pods;

create policy "pods: read pilot"
  on pods for select
  using (true);

-- ── payments ─────────────────────────────────────────────────
-- "payments: read own pods" also joins pod_members
drop policy if exists "payments: read own pods" on payments;

create policy "payments: read pilot"
  on payments for select
  using (true);

-- ── payouts ──────────────────────────────────────────────────
drop policy if exists "payouts: read own pods" on payouts;

create policy "payouts: read pilot"
  on payouts for select
  using (true);

-- ── disputes ─────────────────────────────────────────────────
-- Keep as-is — no pod_members join in disputes policies
-- ── reputation ───────────────────────────────────────────────
-- Keep as-is — no pod_members join

-- ── Grant selects that were blocked ──────────────────────────
grant select on pod_members to anon;
grant select on payments    to anon;
grant select on payouts     to anon;
