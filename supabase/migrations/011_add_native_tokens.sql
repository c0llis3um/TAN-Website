-- ============================================================
--  DeFi Tanda — Add native token types
--  Migration: 011_add_native_tokens
--
--  The token_type enum was missing ETH and SOL.
--  Every pod creation using either token failed with a
--  Postgres enum violation error.
-- ============================================================

alter type token_type add value if not exists 'ETH';
alter type token_type add value if not exists 'SOL';
