-- Migration 019: vault tracking columns on pod_escrows
-- Tracks XLS-66d Vault lifecycle: vault_id, LP share balance, deposit timestamp, and status.
-- vault_id = 'SIMULATED' is the dev-mode sentinel (XLS-66d not enabled on devnet).
-- vault_shares is stored as TEXT because LP token amounts can exceed JS Number precision.

create type vault_status as enum ('none', 'deposited', 'withdrawn');

alter table pod_escrows
  add column vault_id         text,
  add column vault_shares     text,
  add column vault_deposited_at timestamptz,
  add column vault_status     vault_status not null default 'none';

comment on column pod_escrows.vault_id
  is 'XLS-66d VaultID (32-byte hex) or ''SIMULATED'' in dev mode when XLS-66d is unavailable.';

comment on column pod_escrows.vault_shares
  is 'LP token amount (as string to avoid float loss) representing the escrow wallet''s share of the vault.';

comment on column pod_escrows.vault_deposited_at
  is 'Timestamp when the pod collateral was first deposited into the vault.';

comment on column pod_escrows.vault_status
  is 'none: no vault activity | deposited: collateral in vault | withdrawn: fully redeemed.';
