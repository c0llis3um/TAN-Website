-- Migration 021: platform_settings key-value store
-- Used for admin-controlled feature flags and protocol parameters.

create table platform_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Seed defaults
insert into platform_settings (key, value) values
  ('kyc_required', 'false');

-- Only service_role (admin functions) can write; anon can read
alter table platform_settings enable row level security;

create policy "public read" on platform_settings
  for select using (true);

create policy "service role write" on platform_settings
  for all using (auth.role() = 'service_role');
