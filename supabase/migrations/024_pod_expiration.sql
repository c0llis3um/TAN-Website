-- 024_pod_expiration.sql
-- Tandas that don't fill up within a week of creation now auto-expire instead
-- of sitting OPEN forever, so collateral doesn't get stranded waiting on
-- members who never show up.

alter type pod_status add value if not exists 'EXPIRED';

alter table pods
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days');
