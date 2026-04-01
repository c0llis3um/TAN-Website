-- Migration 013: add cycle timing to pods
-- cycle_frequency_days: how many days each cycle lasts (7 = weekly, 14 = biweekly, 30 = monthly)
-- cycle_started_at: when the current cycle began (set on activate + each advance)

alter table public.pods
  add column if not exists cycle_frequency_days integer not null default 7,
  add column if not exists cycle_started_at     timestamptz;

comment on column public.pods.cycle_frequency_days is 'Days per cycle: 7=weekly, 14=biweekly, 30=monthly';
comment on column public.pods.cycle_started_at    is 'When the current cycle started — due date = cycle_started_at + cycle_frequency_days';
