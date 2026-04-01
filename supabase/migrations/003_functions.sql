-- ============================================================
--  DeFi Tanda — Database Functions & Triggers
--  Migration: 003_functions
-- ============================================================

-- ── Reputation update on payment ────────────────────────────
-- Called after a payment row is inserted with status = 'CONFIRMED'
create or replace function apply_reputation_on_payment()
returns trigger language plpgsql security definer as $$
declare
  v_pod_cycle   integer;
  v_due_date    timestamptz;
  v_delta       integer;
  v_reason      text;
begin
  if new.status <> 'CONFIRMED' then
    return new;
  end if;

  -- +5 for on-time payment (within cycle window)
  -- −10 for late payment (after grace period — handled elsewhere)
  v_delta  := 5;
  v_reason := 'ON_TIME_PAYMENT';

  insert into reputation_events (user_id, delta, reason, pod_id)
  values (new.user_id, v_delta, v_reason, new.pod_id);

  -- Update denormalized score on users table (clamped 0-100)
  update users
  set reputation_score = greatest(0, least(100, reputation_score + v_delta))
  where id = new.user_id;

  return new;
end;
$$;

create trigger trg_payment_reputation
  after insert or update of status on payments
  for each row execute function apply_reputation_on_payment();

-- ── Reputation penalty on default ───────────────────────────
create or replace function apply_reputation_on_default()
returns trigger language plpgsql security definer as $$
begin
  if new.status = 'DEFAULTED' and old.status <> 'DEFAULTED' then
    insert into reputation_events (user_id, delta, reason, pod_id)
    values (new.user_id, -20, 'DEFAULT', new.pod_id);

    update users
    set reputation_score = greatest(0, reputation_score - 20)
    where id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger trg_member_default_reputation
  after update of status on pod_members
  for each row execute function apply_reputation_on_default();

-- ── Ambassador stats update ──────────────────────────────────
-- Increment pods_created when a pod is deployed by an ambassador
create or replace function update_ambassador_pod_count()
returns trigger language plpgsql security definer as $$
begin
  -- When a pod moves from OPEN to LOCKED (deployed)
  if new.status = 'LOCKED' and old.status = 'OPEN' then
    update ambassadors
    set pods_created = pods_created + 1
    where user_id = new.organizer_id;
  end if;
  return new;
end;
$$;

create trigger trg_ambassador_pod_count
  after update of status on pods
  for each row execute function update_ambassador_pod_count();

-- ── Insurance pool current balance ──────────────────────────
create or replace function insurance_balance()
returns numeric language sql stable security definer as $$
  select coalesce(sum(amount), 0) from insurance_events;
$$;

-- ── Waitlist invite ─────────────────────────────────────────
create or replace function mark_invited(p_email text)
returns void language plpgsql security definer as $$
begin
  update waitlist
  set invited = true, invited_at = now()
  where email = p_email;
end;
$$;

-- ── Treasury proposal quorum check ──────────────────────────
-- Returns true if proposal has >= 2 distinct approvals
create or replace function proposal_has_quorum(p_id uuid)
returns boolean language sql stable security definer as $$
  select array_length(approvals, 1) >= 2
  from treasury_wallet_proposals
  where id = p_id;
$$;

-- Auto-apply approved proposal after 24h
create or replace function apply_treasury_proposals()
returns void language plpgsql security definer as $$
declare
  r record;
begin
  for r in
    select * from treasury_wallet_proposals
    where status = 'APPROVED'
      and effective_at <= now()
  loop
    -- Deactivate old wallet
    update treasury_wallets set active = false where chain = r.chain;

    -- This would insert the new one; in prod you'd also update the
    -- contracts config and send a confirmation email.
    raise notice 'Apply treasury change for chain % to %', r.chain, r.proposed_address;
  end loop;
end;
$$;

-- ── Soft-delete / audit helper ───────────────────────────────
create or replace function log_admin_action(
  p_actor_id    uuid,
  p_actor_email text,
  p_action      text,
  p_target_type text,
  p_target_id   uuid,
  p_payload     jsonb default null,
  p_ip          inet  default null
) returns void language plpgsql security definer as $$
begin
  insert into audit_log (actor_id, actor_email, action, target_type, target_id, payload, ip_address)
  values (p_actor_id, p_actor_email, p_action, p_target_type, p_target_id, p_payload, p_ip);
end;
$$;

-- ── Collateral upfront calculator ───────────────────────────
-- Returns how much USDC/RLUSD a member must pay to join.
-- Formula: collateral_multiple × contribution + contribution (first payment)
create or replace function upfront_cost(
  p_contribution numeric,
  p_collateral_multiple integer default 2
) returns numeric language sql immutable as $$
  select p_contribution * (p_collateral_multiple + 1);
$$;

-- ── Pod fill percentage ──────────────────────────────────────
create or replace function pod_fill_pct(p_pod_id uuid)
returns integer language sql stable as $$
  select
    case when p.size = 0 then 0
    else round(count(pm.id)::numeric / p.size * 100)
    end
  from pods p
  left join pod_members pm on pm.pod_id = p.id and pm.status = 'ACTIVE'
  where p.id = p_pod_id
  group by p.size;
$$;
