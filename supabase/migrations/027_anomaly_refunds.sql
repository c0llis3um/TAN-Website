-- Migration 027: anomaly_refunds — audit trail for refunding stray escrow payments
--
-- Context: a wallet (in this case the platform's own XRPL treasury wallet, used to
-- test the join flow) sent collateral to a pod escrow 3x due to a client-side bug
-- (join succeeded on-chain but the DB write never landed, so retries re-sent
-- payment) without ever becoming a pod_members row. The funds sat in the escrow's
-- balance, indistinguishable from real members' collateral, with no audit trail
-- for the manual refund back out.
--
-- This table records refunds sent from a pod's escrow wallet back to a sender
-- who paid in without corresponding pod membership. Writes only ever happen via
-- netlify/functions/admin-refund-anomaly.js using the service role key (same
-- trust model as claim/release/slash-xrpl-collateral.js) — RLS below only grants
-- admin read access, mirroring treasury_wallets post-023_lock_treasury_wallets.

create table anomaly_refunds (
  id             uuid primary key default uuid_generate_v4(),
  pod_id         uuid not null references pods(id) on delete cascade,
  escrow_address text not null,
  sender_address text not null,
  to_address     text not null,
  amount         numeric(18,6) not null,
  token          token_type not null,
  reason         text not null,
  tx_hash        text,
  admin_id       uuid references admin_users(id),
  created_at     timestamptz not null default now()
);

create index idx_anomaly_refunds_pod on anomaly_refunds (pod_id);

alter table anomaly_refunds enable row level security;

create policy "admin_only_read_anomaly_refunds"
  on public.anomaly_refunds for select
  to authenticated
  using (exists (
    select 1 from public.admin_users a
    where a.email = (auth.jwt() ->> 'email') and a.active
  ));

grant select on public.anomaly_refunds to authenticated;
