

---

## 18. Slash-and-Continue Feature Plan

### 18.1 Problem

When a member misses a payment, their collateral is slashed to cover the missed contribution. Currently, the member is marked `DEFAULTED` and the system treats them as permanently out. But:

- Their collateral already covered the missed payment — the tanda is made whole
- There is no reason they cannot keep paying future cycles
- The cron (`check-overdue.js`) skips `DEFAULTED` members, so if they miss again the cycle blocks forever
- There is no UI for a slashed member to "catch up" or see their remaining collateral

### 18.2 Goal

After a slash, the member stays in the pod. They can continue paying future cycles. If they miss again, their remaining collateral covers it again. Only when collateral is exhausted are they truly ejected.

### 18.3 Data Model Changes

**`pod_members` table — add column:**
- `collateral_balance` (numeric, default = `contribution_amount * 2`) — tracks remaining collateral in escrow for this member

No new table needed. Each slash decrements this by `contribution_amount`.

**Member status states:**
- `ACTIVE` — paying normally, full collateral
- `SLASHED` — missed at least one payment, collateral partially used, still participating
- `EJECTED` — collateral exhausted (`collateral_balance <= 0`), no longer in pod

Remove `DEFAULTED` as a permanent state. Replace with `SLASHED` (still in) and `EJECTED` (truly out).

### 18.4 Slash Logic Changes

**`slash-xrpl-collateral.js` and `check-overdue.js` `slashMember()`:**

After sending the on-chain payment:
1. Decrement `collateral_balance` by `contribution_amount`
2. If `collateral_balance <= 0` → set status `EJECTED`
3. Else → set status `SLASHED` (was `DEFAULTED`)

**`check-overdue.js` member loop:**
- Change `if (member.status === 'DEFAULTED') continue` → `if (member.status === 'EJECTED') continue`
- `SLASHED` members are still checked and can be slashed again in future cycles

### 18.5 Cycle Advance Logic

**`maybeAdvanceCycle` and its equivalents:**

Currently counts `CONFIRMED` payments vs `pod.size`. This already works because a slash inserts a `CONFIRMED` payment — the count reaches `pod.size` and the cycle advances.

No change needed here. The advance logic is already correct.

**Ejected members:**

When a member is `EJECTED`, they are still in `pod_members` (payout slot preserved) but:
- They never pay future cycles
- Their payout slot still exists — if it comes up, the cycle will need to be advanced via admin "Force Advance" or the payout recipient just doesn't get a full pot

Open question: do ejected members forfeit their own payout slot, or does the pod just advance past it with whatever collateral remains in escrow?

**Recommended:** When ejected, mark their payout slot as `0` (no recipient) and auto-advance that cycle without expecting a payout. This keeps the other members unaffected.

### 18.6 UI Changes

**PodView — member list:**
- Show `SLASHED` badge (orange) instead of `DEFAULTED` (red)
- Show remaining collateral balance next to member: `Collateral: 1.00 XRP`
- `EJECTED` badge (red) for fully ejected members

**Pay page:**
- `SLASHED` members can still reach the Pay page and pay normally — no change needed
- Do not block them

**Admin Pods panel:**
- Show `collateral_balance` per member in the cycle detail panel
- Slash button remains, label changes to reflect it's a partial slash

### 18.7 Migration

For existing `DEFAULTED` members in the DB:
- Run a one-time migration: set `status = 'SLASHED'`, `collateral_balance = contribution_amount` (they've used 1× already)
- If `collateral_balance` was already 0, set `status = 'EJECTED'`

### 18.8 Implementation Order

1. Add `collateral_balance` column to `pod_members` (Supabase migration)
2. Update `slash-xrpl-collateral.js` — decrement balance, set `SLASHED` vs `EJECTED`
3. Update `check-overdue.js` `slashMember()` — same logic, skip only `EJECTED`
4. Update admin Pods panel — show balance, update badge labels
5. Update PodView member list — `SLASHED` badge + balance display
6. Run DB migration for existing `DEFAULTED` rows
