-- Migration 015: allow updates on pod_members
-- Without this policy, payout_slot assignment in maybeActivatePod
-- was silently blocked by RLS even though the UPDATE grant existed.

create policy "pod_members: update pilot"
  on pod_members for update
  using (true)
  with check (true);
