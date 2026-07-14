-- Migration 030: fix users upsert regression from 028_lock_fund_moving_tables
--
-- 028 narrowed anon's UPDATE grant on `users` to (alias, email, lang), intending
-- to stop wallet_address from being rewritten. But upsertUser() (src/lib/db.js)
-- always upserts { wallet_address, chain, alias, lang, email } together, and
-- Postgres's ON CONFLICT DO UPDATE SET touches every column in the payload —
-- including wallet_address and chain — even when the value doesn't change.
-- Column-level grants block that write outright, regardless of value, so every
-- RETURNING user (anyone whose users row already exists) got
-- "permission denied for table users" on every join/reconnect. Confirmed by
-- reproducing the exact upsert against the live anon key.
--
-- The actual protection against wallet_address reassignment is the
-- trg_users_wallet_address_immutable trigger from 028, not the column grant —
-- it raises unconditionally if the value would change, regardless of which
-- role or which grant let the statement through. So widening the grant back to
-- include wallet_address/chain doesn't reopen the original hole; the trigger
-- still blocks any actual change, it just also needs to tolerate being named in
-- a same-value UPDATE SET clause, which the grant alone can't distinguish.

revoke update on public.users from anon, authenticated;
grant update (wallet_address, chain, alias, email, lang) on public.users to anon, authenticated;
