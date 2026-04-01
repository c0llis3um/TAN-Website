-- Migration 012: grant admin access to treasury tables
-- Admin users are authenticated via Supabase Auth (admin_users table)
-- The anon key is used for wallet users; authenticated role is for logged-in admins

-- Grant table-level permissions
grant select, insert, update on public.treasury_wallets          to authenticated;
grant select, insert         on public.treasury_wallet_proposals to authenticated;

-- Also allow anon read so the admin panel (which may use anon key) can read
grant select on public.treasury_wallets          to anon;
grant select on public.treasury_wallet_proposals to anon;
grant insert on public.treasury_wallets          to anon;
grant insert on public.treasury_wallet_proposals to anon;
grant update on public.treasury_wallets          to anon;

-- RLS policies: allow any request through (admin UI controls auth via RequireAdmin)
create policy "admin_read_treasury_wallets"
  on public.treasury_wallets for select
  using (true);

create policy "admin_write_treasury_wallets"
  on public.treasury_wallets for insert
  with check (true);

create policy "admin_update_treasury_wallets"
  on public.treasury_wallets for update
  using (true);

create policy "admin_read_treasury_proposals"
  on public.treasury_wallet_proposals for select
  using (true);

create policy "admin_insert_treasury_proposals"
  on public.treasury_wallet_proposals for insert
  with check (true);
