-- Migration 029: rate_limits — shared fixed-window counter for no-auth Netlify functions
--
-- Several functions (pod-join, pod-record-payment, create-xrpl-escrow,
-- ensure-rlusd-trustline, contact-support, pod-cancel-open, pod-mark-failed,
-- check-overdue) deliberately have no session auth — they're either public
-- self-service actions verified against an on-chain transaction instead, or a
-- scheduled job — but that also means they can be hit an unlimited number of
-- times per caller with no cost to the caller. None of them can move funds
-- incorrectly (the fund-moving ones all verify on-chain first), but any of them
-- can be spammed: wasted XRPL RPC calls, testnet faucet exhaustion
-- (create-xrpl-escrow), a flooded support inbox (contact-support), etc.
--
-- This table backs an atomic increment-and-check (see check_rate_limit below)
-- used by netlify/functions/lib/rateLimit.js. Netlify Functions are stateless
-- across invocations (no shared memory between Lambda instances), so the
-- counter has to live somewhere persistent — Supabase, already used by every
-- function via the service role key, is the natural fit without provisioning
-- separate infra (e.g. Redis) for this alone.

create table if not exists rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 1,
  updated_at   timestamptz not null default now()
);

-- Atomically increments the counter for `p_key`, resetting it if the window has
-- expired, and returns whether the caller is still within `p_max` for this
-- `p_window_seconds` window. Single INSERT ... ON CONFLICT statement — safe
-- under concurrent calls for the same key (Postgres locks the row for the
-- duration of the upsert), unlike a read-then-write from application code.
create or replace function public.check_rate_limit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  insert into rate_limits (key, window_start, count, updated_at)
  values (p_key, now(), 1, now())
  on conflict (key) do update set
    count = case
      when rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
        then 1
      else rate_limits.count + 1
    end,
    window_start = case
      when rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
        then now()
      else rate_limits.window_start
    end,
    updated_at = now()
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

-- Only ever called via the service-role client from within Netlify functions
-- (see rateLimit.js) — no anon/authenticated access needed or granted.
alter table rate_limits enable row level security;
create policy "rate_limits: no client access" on rate_limits for all using (false);

-- Best-effort housekeeping so this table doesn't grow unbounded — old rows are
-- harmless (a key just gets treated as a fresh window) but there's no reason
-- to keep them once well past any window in use.
create index if not exists idx_rate_limits_updated_at on rate_limits (updated_at);
