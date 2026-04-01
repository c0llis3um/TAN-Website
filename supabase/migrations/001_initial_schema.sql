-- ============================================================
--  DeFi Tanda — Supabase Schema v1
--  Migration: 001_initial_schema
--
--  Blockchain is the source of truth for money.
--  Supabase stores off-chain metadata, aliases, audit logs,
--  waitlist, ambassador records, and admin state.
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────
create type chain_type       as enum ('XRPL', 'Solana', 'Ethereum');
create type token_type       as enum ('RLUSD', 'USDC', 'USDT', 'XRP');
create type pod_status       as enum ('OPEN', 'LOCKED', 'ACTIVE', 'COMPLETED', 'PAUSED', 'DEFAULTED', 'CANCELLED');
create type member_status    as enum ('INVITED', 'ACTIVE', 'DEFAULTED', 'REMOVED');
create type payment_status   as enum ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED');
create type dispute_type     as enum ('MISSED_PAYMENT', 'DISPUTED_PAYOUT', 'COLLATERAL_DISPUTE', 'FRAUD', 'TECHNICAL');
create type dispute_status   as enum ('OPEN', 'REVIEWING', 'RESOLVED', 'CLOSED');
create type dispute_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
create type admin_role       as enum ('super_admin', 'support', 'ambassador_mgr', 'finance');
create type amb_status       as enum ('PENDING', 'ACTIVE', 'PAUSED', 'REMOVED');
create type env_mode         as enum ('dev', 'live');
create type payout_method    as enum ('random', 'fixed', 'volunteer');  -- bid-order excluded at DB level too

-- ============================================================
--  USERS
--  One row per wallet address. Wallet = identity.
-- ============================================================
create table users (
  id               uuid primary key default uuid_generate_v4(),
  wallet_address   text not null unique,
  chain            chain_type not null,
  alias            text,
  email            text unique,
  lang             text not null default 'es',
  reputation_score integer not null default 50 check (reputation_score between 0 and 100),
  kyc_verified     boolean not null default false,
  status           text not null default 'ACTIVE' check (status in ('ACTIVE','FLAGGED','SUSPENDED')),
  stripe_customer_id text,
  moonpay_user_id    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_users_wallet on users (wallet_address);
create index idx_users_status  on users (status);

-- ============================================================
--  ADMIN USERS  ← must come before dispute_notes, ambassadors,
--                  treasury_wallets, and platform_settings
-- ============================================================
create table admin_users (
  id          uuid primary key default uuid_generate_v4(),
  email       text not null unique,
  name        text not null,
  role        admin_role not null default 'support',
  active      boolean not null default true,
  totp_secret text,
  last_login  timestamptz,
  created_at  timestamptz not null default now()
);

-- ============================================================
--  PODS
-- ============================================================
create table pods (
  id                  uuid primary key default uuid_generate_v4(),
  contract_address    text unique,
  chain               chain_type not null,
  token               token_type not null,
  name                text not null,
  organizer_id        uuid not null references users(id),
  contribution_amount numeric(18,6) not null,
  size                integer not null check (size between 2 and 20),
  current_cycle       integer not null default 0,
  total_cycles        integer not null,
  payout_method       payout_method not null default 'random',
  status              pod_status not null default 'OPEN',
  env                 env_mode not null default 'dev',
  creation_fee_paid   boolean not null default false,
  creation_fee_tx     text,
  deployed_at         timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_pods_status    on pods (status);
create index idx_pods_chain     on pods (chain);
create index idx_pods_organizer on pods (organizer_id);
create index idx_pods_contract  on pods (contract_address);
create index idx_pods_env       on pods (env);

-- ============================================================
--  POD MEMBERS
-- ============================================================
create table pod_members (
  id            uuid primary key default uuid_generate_v4(),
  pod_id        uuid not null references pods(id) on delete cascade,
  user_id       uuid not null references users(id),
  payout_slot   integer,
  status        member_status not null default 'INVITED',
  collateral_tx text,
  joined_at     timestamptz not null default now(),
  unique (pod_id, user_id),
  unique (pod_id, payout_slot)
);

create index idx_pod_members_pod  on pod_members (pod_id);
create index idx_pod_members_user on pod_members (user_id);

-- ============================================================
--  PAYMENTS
-- ============================================================
create table payments (
  id         uuid primary key default uuid_generate_v4(),
  pod_id     uuid not null references pods(id) on delete cascade,
  user_id    uuid not null references users(id),
  cycle      integer not null,
  amount     numeric(18,6) not null,
  token      token_type not null,
  chain      chain_type not null,
  tx_hash    text,
  status     payment_status not null default 'PENDING',
  method     text,
  paid_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (pod_id, user_id, cycle)
);

create index idx_payments_pod    on payments (pod_id);
create index idx_payments_user   on payments (user_id);
create index idx_payments_status on payments (status);

-- ============================================================
--  PAYOUTS
-- ============================================================
create table payouts (
  id           uuid primary key default uuid_generate_v4(),
  pod_id       uuid not null references pods(id) on delete cascade,
  recipient_id uuid not null references users(id),
  cycle        integer not null,
  amount       numeric(18,6) not null,
  token        token_type not null,
  chain        chain_type not null,
  tx_hash      text,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (pod_id, cycle)
);

create index idx_payouts_pod       on payouts (pod_id);
create index idx_payouts_recipient on payouts (recipient_id);

-- ============================================================
--  INSURANCE POOL
-- ============================================================
create table insurance_events (
  id          uuid primary key default uuid_generate_v4(),
  type        text not null check (type in ('DEPOSIT','CLAIM','RECOVERY')),
  pod_id      uuid references pods(id),
  amount      numeric(18,6) not null,
  description text,
  tx_hash     text,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

create view insurance_pool_balance as
  select coalesce(sum(amount), 0) as balance
  from insurance_events;

-- ============================================================
--  DISPUTES
-- ============================================================
create table disputes (
  id              uuid primary key default uuid_generate_v4(),
  pod_id          uuid not null references pods(id),
  reporter_id     uuid not null references users(id),
  respondent_id   uuid references users(id),
  type            dispute_type not null,
  status          dispute_status not null default 'OPEN',
  priority        dispute_priority not null default 'MEDIUM',
  amount_at_stake numeric(18,6),
  description     text not null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_disputes_status on disputes (status);
create index idx_disputes_pod    on disputes (pod_id);

-- admin_users exists now, so this FK is valid
create table dispute_notes (
  id         uuid primary key default uuid_generate_v4(),
  dispute_id uuid not null references disputes(id) on delete cascade,
  admin_id   uuid not null references admin_users(id),
  note       text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
--  REPUTATION HISTORY
-- ============================================================
create table reputation_events (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references users(id),
  delta      integer not null,
  reason     text not null,
  pod_id     uuid references pods(id),
  created_at timestamptz not null default now()
);

create index idx_reputation_user on reputation_events (user_id);

-- ============================================================
--  WAITLIST
-- ============================================================
create table waitlist (
  id         uuid primary key default uuid_generate_v4(),
  email      text not null unique,
  name       text,
  source     text,
  chain_pref chain_type,
  lang       text not null default 'es',
  notes      text,
  invited    boolean not null default false,
  invited_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_waitlist_invited on waitlist (invited);

-- ============================================================
--  AMBASSADORS
-- ============================================================
create table ambassadors (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references users(id) unique,
  city               text,
  status             amb_status not null default 'PENDING',
  tier               text not null default 'Bronze' check (tier in ('Bronze','Silver','Gold')),
  statement          text,
  pods_created       integer not null default 0,
  members_onboarded  integer not null default 0,
  revenue_earned     numeric(10,2) not null default 0,
  approved_by        uuid references admin_users(id),
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ============================================================
--  TREASURY WALLETS
-- ============================================================
create table treasury_wallets (
  id         uuid primary key default uuid_generate_v4(),
  chain      chain_type not null unique,
  address    text not null,
  label      text,
  active     boolean not null default true,
  set_by     uuid not null references admin_users(id),
  created_at timestamptz not null default now()
);

create table treasury_wallet_proposals (
  id               uuid primary key default uuid_generate_v4(),
  chain            chain_type not null,
  proposed_address text not null,
  reason           text not null,
  proposed_by      uuid not null references admin_users(id),
  approvals        uuid[] not null default '{}',
  status           text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  effective_at     timestamptz,
  created_at       timestamptz not null default now()
);

-- ============================================================
--  ENVIRONMENT CONFIG
-- ============================================================
create table env_contracts (
  id          uuid primary key default uuid_generate_v4(),
  chain       chain_type not null,
  env         env_mode not null,
  address     text not null,
  label       text,
  abi_version text not null default '1.0',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (chain, env, label)
);

-- ============================================================
--  PLATFORM SETTINGS
-- ============================================================
create table platform_settings (
  key         text primary key,
  value       text not null,
  description text,
  updated_by  uuid references admin_users(id),
  updated_at  timestamptz not null default now()
);

insert into platform_settings (key, value, description) values
  ('creation_fee_usd',    '2.00',  'Flat creation fee per pod in USD'),
  ('insurance_floor',     '25000', 'Global minimum insurance pool balance in USD'),
  ('grace_period_hours',  '72',    'First-time missed payment grace window in hours'),
  ('max_pod_size',        '20',    'Maximum members per pod'),
  ('collateral_multiple', '2',     'Collateral = N × weekly contribution'),
  ('yield_share_pct',     '30',    'Protocol share of collateral yield (%)'),
  ('env_mode',            'dev',   'Active environment: dev or live');

-- ============================================================
--  AUDIT LOG
-- ============================================================
create table audit_log (
  id          uuid primary key default uuid_generate_v4(),
  actor_id    uuid,
  actor_email text,
  action      text not null,
  target_type text,
  target_id   uuid,
  payload     jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);

create index idx_audit_log_actor  on audit_log (actor_id);
create index idx_audit_log_action on audit_log (action);
create index idx_audit_log_time   on audit_log (created_at desc);

-- ============================================================
--  UPDATED_AT triggers
-- ============================================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at       before update on users        for each row execute function update_updated_at();
create trigger trg_pods_updated_at        before update on pods         for each row execute function update_updated_at();
create trigger trg_disputes_updated_at    before update on disputes     for each row execute function update_updated_at();
create trigger trg_ambassadors_updated_at before update on ambassadors  for each row execute function update_updated_at();
