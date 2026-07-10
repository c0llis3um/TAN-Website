-- Migration 018: tighten waitlist insert policy
-- Replaces the always-true with_check with one that enforces:
--   - email must be non-empty
--   - invited must be false (anon can't self-approve)
--   - invited_at must be null (server-only field)

drop policy if exists "waitlist: insert anon" on waitlist;

create policy "waitlist: insert anon"
  on waitlist for insert
  with check (
    email is not null
    and length(trim(email)) > 0
    and invited     = false
    and invited_at  is null
  );
