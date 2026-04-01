-- ============================================================
--  DeFi Tanda — Row Level Security Policies
--  Migration: 002_rls_policies
--
--  Principle: users see only their own data; admins see everything
--  via service_role key (never exposed to frontend).
-- ============================================================

-- Enable RLS on all user-facing tables
alter table users             enable row level security;
alter table pods              enable row level security;
alter table pod_members       enable row level security;
alter table payments          enable row level security;
alter table payouts           enable row level security;
alter table disputes          enable row level security;
alter table dispute_notes     enable row level security;
alter table reputation_events enable row level security;
alter table waitlist          enable row level security;

-- ── Helper: get wallet from JWT custom claim ─────────────────
-- The frontend stores wallet_address in the JWT via Supabase auth metadata.
create or replace function auth_wallet()
returns text language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'wallet_address',
    ''
  );
$$;

-- ── USERS ───────────────────────────────────────────────────
-- Users can read their own row
create policy "users: read own"
  on users for select
  using (wallet_address = auth_wallet());

-- Users can update their own alias, email, lang
create policy "users: update own"
  on users for update
  using (wallet_address = auth_wallet())
  with check (wallet_address = auth_wallet());

-- New user insert (wallet connect creates profile)
create policy "users: insert own"
  on users for insert
  with check (wallet_address = auth_wallet());

-- ── PODS ────────────────────────────────────────────────────
-- Anyone can read OPEN pods (browse screen)
create policy "pods: read open"
  on pods for select
  using (status = 'OPEN');

-- Members and organizers can read their pods
create policy "pods: read member"
  on pods for select
  using (
    exists (
      select 1 from pod_members pm
      join users u on u.id = pm.user_id
      where pm.pod_id = pods.id
        and u.wallet_address = auth_wallet()
    )
    or exists (
      select 1 from users u
      where u.id = pods.organizer_id
        and u.wallet_address = auth_wallet()
    )
  );

-- Organizer can insert a pod
create policy "pods: insert organizer"
  on pods for insert
  with check (
    exists (
      select 1 from users u
      where u.id = organizer_id
        and u.wallet_address = auth_wallet()
    )
  );

-- Organizer can update their pod (e.g. name before lock)
create policy "pods: update organizer"
  on pods for update
  using (
    exists (
      select 1 from users u
      where u.id = pods.organizer_id
        and u.wallet_address = auth_wallet()
    )
    and status = 'OPEN'   -- cannot edit once locked
  );

-- ── POD MEMBERS ─────────────────────────────────────────────
-- Members can read their own membership + co-members in same pod
create policy "pod_members: read same pod"
  on pod_members for select
  using (
    exists (
      select 1 from pod_members my_mem
      join users u on u.id = my_mem.user_id
      where my_mem.pod_id = pod_members.pod_id
        and u.wallet_address = auth_wallet()
    )
  );

-- Users can join a pod themselves
create policy "pod_members: insert self"
  on pod_members for insert
  with check (
    exists (
      select 1 from users u
      where u.id = user_id
        and u.wallet_address = auth_wallet()
    )
  );

-- ── PAYMENTS ────────────────────────────────────────────────
-- Users can read payments in their pods
create policy "payments: read own pods"
  on payments for select
  using (
    exists (
      select 1 from users u
      where u.id = payments.user_id
        and u.wallet_address = auth_wallet()
    )
    or exists (
      select 1 from pod_members pm
      join users u on u.id = pm.user_id
      where pm.pod_id = payments.pod_id
        and u.wallet_address = auth_wallet()
    )
  );

-- Users can insert their own payments
create policy "payments: insert own"
  on payments for insert
  with check (
    exists (
      select 1 from users u
      where u.id = user_id
        and u.wallet_address = auth_wallet()
    )
  );

-- ── PAYOUTS ─────────────────────────────────────────────────
create policy "payouts: read own pods"
  on payouts for select
  using (
    exists (
      select 1 from pod_members pm
      join users u on u.id = pm.user_id
      where pm.pod_id = payouts.pod_id
        and u.wallet_address = auth_wallet()
    )
  );

-- ── DISPUTES ────────────────────────────────────────────────
-- Reporter and respondent can see their disputes
create policy "disputes: read own"
  on disputes for select
  using (
    exists (select 1 from users u where u.id = reporter_id   and u.wallet_address = auth_wallet())
    or
    exists (select 1 from users u where u.id = respondent_id and u.wallet_address = auth_wallet())
  );

-- Users can file a dispute
create policy "disputes: insert"
  on disputes for insert
  with check (
    exists (
      select 1 from users u
      where u.id = reporter_id
        and u.wallet_address = auth_wallet()
    )
  );

-- ── DISPUTE NOTES ───────────────────────────────────────────
-- Notes are admin-only; no direct user access (service_role only)
-- RLS blocks all anon/authed reads; admin uses service_role key
create policy "dispute_notes: deny user"
  on dispute_notes for all
  using (false);

-- ── REPUTATION ──────────────────────────────────────────────
create policy "reputation: read own"
  on reputation_events for select
  using (
    exists (
      select 1 from users u
      where u.id = user_id
        and u.wallet_address = auth_wallet()
    )
  );

-- ── WAITLIST ────────────────────────────────────────────────
-- Waitlist is insert-only for anonymous users; no reads
create policy "waitlist: insert anon"
  on waitlist for insert
  with check (true);

-- No user reads of waitlist (admin only via service_role)
create policy "waitlist: no read"
  on waitlist for select
  using (false);

-- ── SERVICE ROLE ────────────────────────────────────────────
-- All admin operations (full CRUD on all tables) are performed
-- server-side using SUPABASE_SERVICE_ROLE_KEY, which bypasses
-- RLS entirely. Never expose this key to the frontend.
