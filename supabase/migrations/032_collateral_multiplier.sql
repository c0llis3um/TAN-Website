-- Migration 032: per-pod collateral multiplier, stored not recomputed.
--
-- Collateral was always a flat contribution_amount * 2 everywhere it was
-- computed (join verification, claim refund, admin release, display) —
-- it never scaled with pod size, so a 4-member pod required the same
-- collateral as a 2-member pod even though an early-slot winner could walk
-- away with roughly (size - 1)x their contribution as a payout.
--
-- Fix: store the real multiplier on the pod row at creation time instead of
-- hardcoding `* 2` at every call site. Existing pods default to 2 — that's
-- what their members actually paid in, and changing it retroactively would
-- break claim/refund math on live pods (escrow only ever received 2x per
-- member, not the new size-scaled amount). New pods set this explicitly at
-- creation based on size; only future creations get the new scaling.
alter table pods
  add column collateral_multiplier integer not null default 2
    check (collateral_multiplier >= 2);

comment on column pods.collateral_multiplier is
  'Collateral = contribution_amount * this, fixed at pod creation. Existing pods default to 2 (flat, pre-fix behavior) — never recompute from current pod.size, since that would desync from what members actually paid into escrow.';
