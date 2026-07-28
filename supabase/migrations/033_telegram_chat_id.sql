-- Migration 033: Telegram DM notifications.
--
-- Adds a nullable telegram_chat_id column, populated only by
-- telegram-webhook.js (service-role) once a user links their Telegram via the
-- /start deep link — never by the client. Migration 030's column-restricted
-- UPDATE grant on users (wallet_address, chain, alias, email, lang) does not
-- include this column, so anon/authenticated can never write it; no grant
-- changes needed.
alter table users add column telegram_chat_id text;

comment on column users.telegram_chat_id is
  'Telegram chat id, set by telegram-webhook.js when the user links their account via the /start deep link. Null = not linked. Cleared automatically if the bot gets blocked (403 from sendMessage).';
