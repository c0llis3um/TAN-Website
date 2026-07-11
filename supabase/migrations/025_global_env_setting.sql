-- Migration 025: global env setting
--
-- `env` (dev/live) used to be a per-browser localStorage flag, so switching
-- it in the admin panel only affected that one admin's own browser — every
-- other visitor stayed on dev regardless. Making it a real platform_settings
-- row lets every visitor read the same value on load, so a live/dev switch
-- actually applies site-wide. Writes stay service_role-only (see migration
-- 021) — the admin-gated Netlify function set-platform-env.js is the only
-- write path.

insert into platform_settings (key, value) values ('env', 'dev')
  on conflict (key) do nothing;
