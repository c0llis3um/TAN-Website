-- Migration 016: XRPL pod escrow seed storage
-- Stores escrow wallet seeds for XRPL pods.
-- Readable only by service_role (used in Netlify functions).
-- The escrow wallet address is stored in pods.contract_address.

create table if not exists pod_escrows (
  pod_id     uuid primary key references pods(id) on delete cascade,
  escrow_seed text not null,
  created_at  timestamptz default now()
);

alter table pod_escrows enable row level security;

-- Block all client-side access — only service_role bypasses RLS
create policy "pod_escrows: no client access"
  on pod_escrows for all using (false);
