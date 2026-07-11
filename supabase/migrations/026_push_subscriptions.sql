-- Migration 026: push_subscriptions
--
-- Stores Web Push subscriptions (one browser/device per row) so
-- check-overdue.js can send due-date reminders as push notifications
-- alongside the existing email reminder.
--
-- Follows the same pilot-mode RLS pattern as migration 005 (no wallet-
-- signature auth yet, so policies are open and the app is trusted to send
-- the correct user_id — see 005_pilot_auth.sql for the full rationale).
-- service_role (Netlify functions) always bypasses RLS regardless.

create table push_subscriptions (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users(id) on delete cascade,
  endpoint     text not null unique,
  keys_p256dh  text not null,
  keys_auth    text not null,
  created_at   timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions: insert pilot"
  on push_subscriptions for insert
  with check (true);

create policy "push_subscriptions: read own pilot"
  on push_subscriptions for select
  using (true);

create policy "push_subscriptions: delete own pilot"
  on push_subscriptions for delete
  using (true);

grant select, insert, delete on push_subscriptions to anon;
