-- ============================================================
--  Migration: 014_anon_read_open_pods
--
--  The anon role was missing SELECT on pods, pod_members, and
--  users — so the Browse Pods page returned nothing for users
--  who hadn't connected a wallet yet, AND for wallet-connected
--  users (who still use the anon key since we use custom auth).
-- ============================================================

-- Allow anon to read pods (RLS policy "pods: read open" already
-- restricts this to status = 'OPEN' rows only)
grant select on public.pods        to anon;
grant select on public.pod_members to anon;
grant select on public.users       to anon;
