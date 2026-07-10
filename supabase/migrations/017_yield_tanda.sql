-- Migration 017: yield tanda support (XRPL only)
-- Adds tanda_type + yield_strategy to pods.
-- Feature flag: yield pods exist in DB but UI hides them until Phase 2 is ready.

create type tanda_type     as enum ('standard', 'yield');
create type yield_strategy as enum ('vault', 'amm');

alter table pods
  add column tanda_type     tanda_type     not null default 'standard',
  add column yield_strategy yield_strategy;
