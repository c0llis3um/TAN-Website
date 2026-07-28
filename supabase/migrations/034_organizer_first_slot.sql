-- Migration 034: organizer can pay an extra flat 3 XRP to reserve the first
-- payout cycle for themselves at pod creation.
--
-- organizer_first_slot: the organizer's choice, set once at creation.
-- first_slot_fee_paid:  server-verified fact — only confirm-first-slot-fee.js
--                       sets this true, after independently verifying an
--                       on-chain payment of >= 3 XRP to the treasury. Kept
--                       separate from organizer_first_slot so pod-join.js can
--                       gate slot-1 reservation on the fee actually having
--                       landed, not just on the box having been checked.
-- first_slot_fee_tx:    the specific on-chain payment that satisfied this fee
--                       (mirrors creation_fee_tx) — prevents the same
--                       transaction being replayed to satisfy both the
--                       creation fee and this fee, or this fee on two pods.
alter table pods add column organizer_first_slot boolean not null default false;
alter table pods add column first_slot_fee_paid boolean not null default false;
alter table pods add column first_slot_fee_tx text;
