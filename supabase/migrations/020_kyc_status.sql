-- Migration 020: KYC status on users
-- Tracks identity verification state per user.
-- Required before a user can create or join a tanda.

create type kyc_status as enum ('none', 'pending', 'approved', 'rejected');

alter table users
  add column kyc_status kyc_status not null default 'none',
  add column kyc_verified_at timestamptz,
  add column kyc_provider_ref text;

comment on column users.kyc_status
  is 'none: no verification started | pending: in review | approved: cleared | rejected: failed';

comment on column users.kyc_provider_ref
  is 'External reference ID from the KYC provider (Persona, Sumsub, etc.)';
