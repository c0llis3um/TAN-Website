# DeFi Tanda — Protocol Rules

> The complete rulebook governing how Tanda Pods operate — from creation through completion, default handling, insurance coverage, and everything in between. The smart contract enforces these rules automatically.

---

## 1. Pod States

Every pod exists in exactly one state at any time. State transitions are on-chain events — no manual intervention required except where noted.

```
OPEN        All slots not yet filled. Members can join by depositing collateral.
LOCKED      All slots filled. Payout order assigned. No new members. Clock starts.
ACTIVE      Cycles running. Contributions collected and payouts distributed each cycle.
PAUSED      Pod temporarily halted. Clock frozen. No contributions or payouts.
DEFAULTED   Insurance pool coverage limit exceeded. Member vote required.
COMPLETED   All payouts made. All collateral returned. Pod permanently closed.
CANCELLED   Pod cancelled while still OPEN. All collateral returned immediately.
```

**State transition rules:**
```
OPEN      → LOCKED      Triggered when final member slot is filled
OPEN      → CANCELLED   Organizer initiates, OR pod has 0 joiners after 30 days
LOCKED    → ACTIVE      Triggered at first cycle open timestamp
ACTIVE    → ACTIVE      Default declared — insurance covers it, pod continues (normal path)
ACTIVE    → PAUSED      Governance or member vote triggers pause
ACTIVE    → DEFAULTED   Insurance pool limit exceeded — manual resolution required
ACTIVE    → COMPLETED   Final cycle payout distributed
PAUSED    → ACTIVE      Pause resolved — pod resumes from exact pause point
PAUSED    → CANCELLED   If pause exceeds 60 days with no resolution
DEFAULTED → ACTIVE      Members vote to resolve and continue
DEFAULTED → CANCELLED   Members vote to dissolve
```

---

## 2. Pod Types and Their Rules

### 2.1 Community Pod (Private)

A pod where the organizer personally knows and invites all members. Social trust exists alongside the protocol's economic enforcement.

**Access:** Invite-only via unique link or QR code generated for each member slot.

**Rules differences from Public Pod:**
- Organizer may set collateral between 1× and 2× contribution (not fixed at 2×)
- Protocol payout fee: 0.75% (vs 1% for public) — **waived during pilot for all pod types**
- Creation fee: 50% discount (growth phase) — **$2 flat during pilot**
- Organizer's reputation score affects all member slots — if organizer has high score, minimum score for members is reduced

**Organizer responsibility for Community Pods:** If more than 2 members the organizer personally invited default within the same pod, the organizer's reputation score receives a penalty (-10 points per excess default). This reflects their curation responsibility.

### 2.2 Public Pod (Stranger Pod)

A pod listed publicly where members may not know each other. Protocol enforcement is the only trust layer.

**Access:** Open listing on the pod marketplace. Any qualifying wallet can join.

**Minimum requirements to join a public pod:**
- Reputation score: 25+ (new wallets cannot join public pods immediately)
- No active Orange or Red flags
- Not a flagged wallet for fraud

**Rules:** Standard protocol rules apply in full — 2× collateral, 1% fee, standard enforcement.

---

## 3. Pod Size Rules

| Parameter | Minimum | Maximum | Notes |
|-----------|---------|---------|-------|
| Members | 3 | 20 | Below 3 is not a ROSCA. Above 20 increases coordination risk. |
| Contribution | $10 | $10,000 | Per cycle, in stablecoin equivalent |
| Cycle duration | 7 days (weekly) | 90 days (quarterly) | — |
| Total pod pot | $30 | $200,000 | Members × Contribution × Cycles |
| Grace period | 24 hours | 72 hours | Organizer sets within this range |

---

## 4. Joining a Pod

### 4.1 Requirements to Join

**Community Pod:**
- Valid wallet on the pod's chain
- Invitation link or code from the organizer
- Sufficient balance for collateral (set by organizer, 1×–2× contribution)
- No Black flag on wallet

**Public Pod:**
- Valid wallet on the pod's chain
- Reputation score ≥ 25
- No active Orange, Red, or Black flag
- Sufficient balance for 2× collateral
- Open slot available

### 4.2 What You Need in Your Wallet to Join

Before joining, a member must have sufficient balance for both the collateral deposit and their first contribution. The app checks this automatically and shows the total required.

```
Example — public pod, $100/week contribution:
  Collateral deposit:      $200  (2× contribution — returned at pod end + yield)
  First cycle payment:     $100  (goes into the pot)
  ─────────────────────────────
  Total needed upfront:    $300

  Every week after:        $100 only (collateral stays locked, not re-paid)
```

If the member does not have sufficient balance, the app surfaces the fiat onramp prompt: **"You need $200 USDC. Buy with Apple Pay →"**

### 4.3 Join Process

```
Step 1:  Member accepts invitation or finds pod in marketplace
Step 2:  Member reviews all pod parameters (contribution, cycle, collateral)
Step 3:  If insufficient balance → fiat onramp (Apple Pay / Google Pay / debit card)
         If sufficient balance → proceed to Step 4
Step 4:  Member signs acknowledgment (on-chain — constitutes agreement to rules)
Step 5:  Collateral transferred from member wallet to pod account
Step 6:  Member assigned a slot number
Step 7:  Member receives pod schedule and WhatsApp confirmation (if opted in)
```

Collateral transfer and acknowledgment happen in a single transaction. Member is not joined until collateral is confirmed on-chain.

### 4.4 Leaving Before Lock

A member may withdraw from an OPEN pod at any time before the pod locks.

- Full collateral returned immediately to their wallet
- Slot becomes available for a new member
- No reputation penalty
- WhatsApp notification sent to organizer

A member **cannot leave** once the pod is LOCKED. The pod is a binding commitment from lock. The only exit path after lock is default — which carries full penalties.

---

## 5. Collateral Rules

Collateral is the economic guarantee that replaces the social guarantee of a traditional tanda.

### 5.1 Standard Collateral Requirements

| Pod Type | Collateral Required | Set by |
|----------|-------------------|--------|
| Public Pod | 2× contribution (fixed) | Protocol |
| Community Pod | 1×–2× contribution | Organizer |

```
Example — Public Pod:
  Contribution: $100/week
  Required collateral: $200

Example — Community Pod (organizer sets 1.5×):
  Contribution: $100/week
  Required collateral: $150
```

### 5.2 Reputation-Based Collateral Reduction (Phase 2)

Once the reputation system has sufficient data (estimated Q4 2026), collateral scales with reputation.

| Reputation Score | Public Pod Collateral | Community Pod Min Collateral |
|-----------------|----------------------|------------------------------|
| 0–49 (New) | 2.0× | 1.0× (organizer vouches) |
| 50–99 | 1.75× | 0.75× |
| 100–199 | 1.5× | 0.5× |
| 200–499 | 1.0× | 0.25× |
| 500+ (Trusted) | 0.5× | 0.1× |

### 5.3 Collateral Yield

Collateral does not sit idle. It is deployed to conservative yield protocols:

- XRPL: RLUSD in XRPL AMM pools
- Ethereum: USDC in Aave v3
- Solana: USDC in Kamino Finance

Yield split: **70% returned to member at pod close. 30% to protocol treasury.**

Members earn a small return on their locked collateral — the collateral is not purely a cost.

**Capital guarantee — all chains:** Members are always returned their full original collateral amount regardless of yield performance. If yield is negative (impermanent loss on XRPL AMM, rate drop on Aave/Kamino, or any other scenario), the protocol absorbs the shortfall. Members never receive less than they deposited. This guarantee applies on XRPL, Ethereum, and Solana equally.

### 5.4 Collateral Return

When the pod reaches COMPLETED state:
- Full original collateral returned to each member automatically
- Plus their 70% yield share
- Minus any slashes incurred during the pod
- No action required from member — it is pushed to their wallet

---

## 6. Contribution Rules

### 6.1 Payment Window

Every cycle follows this structure (specific times set at pod creation):

```
Cycle opens:           Day 1, 00:00 UTC
Contribution window:   Days 1–5 (or organizer-set window)
Grace period starts:   Day 5, 00:00 UTC
Grace period ends:     Day 7, 00:00 UTC  (48h grace — organizer can extend to 72h)
Default declared:      Day 7, 00:00 UTC  (if no payment received)
Payout distributed:    Day 7, 12:00 UTC  (after default processing complete)
```

Organizers can choose 24, 48, or 72 hour grace periods at pod creation (48h default). Extended grace costs 10 USDC premium (see BUSINESS_MODEL.md).

### 6.2 Notification Schedule

```
Day 1 (cycle opens):        "Tu tanda está abierta. Puedes pagar ahora."
Day 4 (24h before window):  "Recuerda hacer tu pago esta semana."
Day 5 (grace starts):       "Tiempo de gracia activo. Tienes 48 horas para pagar."
Day 6 (24h before default): "URGENTE: Tu pago vence mañana. Evita perder tu depósito."
Day 7 (at default):         Notification to defaulter + all pod members.
Day 7 (at payout):          "¡Felicidades [winner]! Tu tanda cayó esta semana."
```

Notifications sent via WhatsApp (primary), push notification, and email. All opt-in.

### 6.3 Partial and Wrong-Amount Payments

- Partial payments are rejected by the contract and returned immediately
- The full exact contribution amount must be sent in a single transaction
- On XRPL: if RLUSD amount does not match exactly, transaction fails at ledger level
- On Ethereum/Solana: contract reverts with clear error message

### 6.4 Payment Finality by Chain

```
XRPL:    Confirmed after 1 ledger close — ~4 seconds. No reorgs.
Solana:  Confirmed after 1 block — ~400ms. Treat as final after 32 confirmations.
Ethereum: 1 block confirmation (~12s). Recommend waiting 3 blocks for finality.
```

Protocol uses on-chain block timestamps for all cycle timing. UTC timezone only.

---

## 7. Default Rules

### 7.1 What Constitutes a Default

A member defaults when they have not submitted their full contribution by the time the grace period ends.

Default is determined by the smart contract at the grace period end timestamp. No human decision is involved.

### 7.2 The Default Cascade — How It Works

The most important design decision: **when a member defaults, the pod continues. The cycle winner always gets paid on time.**

Here is the complete sequence when a default is declared:

**Step 1 — Collateral Slash**

The defaulting member's collateral is slashed based on how many times they have defaulted in this pod:

```
Default #1 in this pod:
  Slash amount: 25% of original collateral deposited
  Remaining collateral: 75% of original

Default #2 in this pod:
  Slash amount: 50% of current remaining collateral
  Remaining collateral: 37.5% of original

Default #3 in this pod (or collateral fully exhausted):
  Slash amount: 100% of remaining collateral
  Member removed from pod entirely
```

**Step 2 — Slashed Collateral Distribution**

```
Slashed amount splits as:
  60% → distributed equally to all other active members in the pod
        (compensation for the risk they accepted)
  30% → insurance pool draw-back fund (covers this cycle's missing contribution)
  10% → protocol treasury
```

**Step 3 — Missing Contribution Covered**

The 30% allocated from the slashed collateral, combined with a draw from the insurance pool if needed, covers the defaulter's missing contribution for this cycle.

```
Defaulter's contribution = $100
Slashed collateral (25% of $200) = $50
  → 30% of $50 = $15 goes toward covering contribution
  → Shortfall = $100 - $15 = $85 drawn from insurance pool

Net effect: All 10 members contributed this cycle (9 directly, 1 via insurance).
Winner receives full $990 (pot - 1% fee). No delay.
```

**Step 4 — Future Contributions Auto-Debited**

After a default, the member's remaining collateral is flagged for auto-debit. Each future cycle, if the member does not pay, the protocol automatically deducts the contribution from their collateral.

```
Member has $150 remaining after first slash.
They contribute $100 in cycle 4 normally.
They miss cycle 5 — $100 auto-debited from collateral.
  Remaining collateral: $50
They miss cycle 6 — only $50 remains.
  $50 auto-debited, $50 drawn from insurance pool.
  Remaining collateral: $0 — member removed.
```

This mechanism means a defaulter does not need to take any further action. Their remaining collateral silently covers their obligation until exhausted. The pod continues uninterrupted.

**Step 5 — Payout Right Forfeited**

After their first default, a member permanently forfeits their right to receive a payout in this pod. Their assigned slot is handled according to the slot reallocation method chosen at pod creation (see Section 7.4).

**Step 6 — Wallet Flag Applied**

```
Lifetime default count for this wallet:
  1st ever default:  Yellow flag  — visible to organizers, no join restrictions
  2nd ever default:  Orange flag  — restricted from public pods for 90 days
  3rd ever default:  Red flag     — restricted from all pods for 12 months
  4th ever default:  Black flag   — permanently restricted, recovery required
```

Note: flag count is **lifetime across all pods**, not per-pod. Missing payments in multiple pods accumulates.

### 7.3 First-Time User Grace Policy

New users (reputation score 0–10, never defaulted before) who miss their first-ever payment receive a one-time extended grace before default is formally declared. **This policy is disclosed to users in the onboarding flow and in the User Agreement — it is not a hidden safety net.**

```
Conditions (ALL must be true):
  - Reputation score < 10
  - Zero lifetime defaults on this wallet
  - Missed the standard grace period deadline

What happens:
  - Extended WhatsApp + push notification sent immediately
  - Message: "Parece que es la primera vez. Tienes 6 horas más para pagar."
             "It looks like this might be your first time. 6 more hours to pay."
  - 6-hour window opens — payment still accepted at full amount
  - If paid within 6 hours: No default declared. No collateral slash. Score note
    added (+0 points, but "used first-time grace" flag recorded on wallet).
  - If still not paid after 6 hours: Default declared and full default cascade applies.
```

**Limits:**
- Once per wallet, ever — regardless of how many pods the wallet joins in the future
- Does not apply if the pod organizer has set a 24h grace period (minimum grace must be ≥ 30h total for this policy to trigger — i.e. standard 24h grace + 6h extension)
- Organizers are shown which of their members have used this grace (visible in A3 admin user view)

This is documented in `docs/USER_AGREEMENT.md` Part 2 and shown during onboarding.

### 7.4 Defaulter's Payout Slot Reallocation

Organizer selects one method at pod creation. Cannot be changed after lock.

**Method A — Skip (Default)**
The defaulter's slot is removed from the rotation. Remaining members' cycle order shifts. The unclaimed pot from that cycle is split equally among all remaining members at pod completion as a bonus.

```
Example: 10-member pod, member #4 defaults.
  Cycles 1-3: normal payouts.
  Cycle 4: pot is held, no payout this cycle.
  Cycles 5-10: normal payouts.
  Pod completion: held pot ($990) split among 9 remaining members = $110 each.
```

**Method B — Auction**
The defaulter's slot is auctioned to remaining members. Members bid USDC. Highest bid takes the slot and receives the payout in that slot's cycle. Bid amount goes to insurance pool.

**Method C — Open Replacement**
The slot is listed publicly. A new member can take the slot by paying collateral plus all missed contributions to date. The replacement member starts fresh with that slot.

---

## 8. Insurance Pool Rules

### 8.1 Purpose

The insurance pool ensures the cycle winner always receives their payout on time, regardless of how many members default. This is the guarantee that makes the protocol trustworthy.

Without the insurance pool, a default would force all members to wait or absorb the loss. With it, the pod runs as if the default never happened.

### 8.2 Funding Sources

```
Permanent inflows:
  20% of every pod creation fee → insurance pool
  0.30% of every payout (from the 1% protocol fee) → insurance pool
  30% of every default collateral slash → insurance pool

Initial seeding:
  $25,000 USDC protocol commitment before any mainnet pod goes live

Organizer top-up (optional):
  Organizers can contribute additional funds to the insurance pool at pod creation
  as a signal of confidence. This does not earn them any special privileges.
```

### 8.3 Coverage Limits

The pool does not have unlimited liability. Two types of limits apply independently:

**Per-pod limits** (reset for each pod — not cumulative across pods):
```
Maximum defaulters covered per pod:      2 members
Maximum insurance draw per single event: $2,000 USDC equivalent
Maximum total draw per pod lifecycle:    $5,000 USDC equivalent
```

**Global pool limit** (applies across all pods simultaneously):
```
The pool will not make any draw that would drop the balance below $25,000 USDC.
If a draw would breach $25,000:
  → Draw is capped at the amount that keeps the pool at $25,000
  → Remaining shortfall triggers DEFAULTED state on that pod
  → New pod creation is paused until pool is replenished above $50,000
```

Per-pod limits and global limits are both enforced. Whichever triggers first determines the outcome.

If per-pod limits are exceeded, the pod enters DEFAULTED state and members vote on resolution (Section 10).

### 8.4 Pool Health Monitoring

```
Minimum balance:   $50,000 USDC equivalent at all times
Warning threshold: $75,000 — protocol alerts team to replenish
Pause threshold:   $50,000 — new pod creation paused until replenished
Emergency:         $25,000 — all existing pods paused pending resolution
```

Pool balance is on-chain and publicly verifiable at all times. Monthly insurance report published.

### 8.5 Default Debt Tracking

When the insurance pool covers a defaulter's contribution, that amount is recorded as a debt against the defaulter's wallet. Future pod participations result in a debt repayment contribution:

```
When a wallet with insurance debt joins a new pod:
  5% of each contribution in the new pod is routed to insurance debt repayment
  Until debt is fully repaid
  Transparent to the member — shown in their wallet profile
```

This is not punitive — it is accountability. The pool lent the money; the debt follows the wallet.

---

## 9. Pod Pause Rules

### 9.1 Valid Pause Triggers

| Trigger | Who Initiates | Max Duration |
|---------|--------------|-------------|
| Smart contract vulnerability confirmed | Protocol governance | Indefinite — until patch |
| Regulatory hold | Protocol admin + legal counsel | As legally required |
| Member vote (75% approval) | Any member can call vote | 30 days |
| Organizer request (60% member approval) | Organizer proposes, members vote | 14 days |

### 9.2 During a Pause

- No contributions accepted
- No payouts made
- Cycle clock frozen — pause duration does not count toward cycle windows
- Collateral continues earning yield
- Members cannot leave or be removed
- All pending default decisions suspended

### 9.3 After a Pause

Pod resumes from the exact point it paused. All future cycle windows shift forward by the exact pause duration. Members receive notification when pod resumes.

If pause exceeds 30 days without a protocol-mandated reason, members may initiate a dissolution vote (Section 10).

---

## 10. Pod Dissolution

### 10.1 When Dissolution Can Happen

- Insurance pool coverage limits exceeded (pod enters DEFAULTED state)
- Member vote initiated and approved (60% threshold)
- Forced by protocol (vulnerability, regulation, 60+ day unresolved pause)

### 10.2 Dissolution Vote

- Any active member can initiate
- 60% of active members must approve
- Voting window: 72 hours from initiation
- On-chain vote — one vote per member wallet

### 10.3 Dissolution Distribution Order

When a pod dissolves, all funds (remaining contributions in vault, collateral, accrued yield) are distributed in strict priority order:

```
Priority 1: Members who contributed but have NOT yet received a payout
  → They are owed the most. Paid first, pro-rated by number of contributions made.
  → Formula: (contributions_made / total_contributions_expected) × pot_amount

Priority 2: Members who HAVE received a payout
  → Their collateral returned (after any slashes)
  → No additional compensation — they already received their pot

Priority 3: Insurance pool reimbursement
  → Any draws the pool made on behalf of defaulters are repaid from remaining funds

Priority 4: Protocol treasury
  → Creation fee only — recouped from remaining funds
  → Protocol waives payout fee on dissolved pods
  → If insufficient funds, protocol treasury absorbs the shortfall
```

### 10.4 Forced Dissolution

Protocol can force-dissolve if:
- Vulnerability makes pod funds unsafe
- Legal requirement
- Unresolved pause > 60 days

In forced dissolution: Priority 1–3 above apply. Protocol waives its Priority 4 claim entirely.

---

## 11. Reputation System

### 11.1 How Reputation Works

Every wallet has a reputation score on-chain. It starts at 0. It goes up through good behavior and down through bad behavior. It never resets to zero — past behavior always counts (though old events lose weight over time).

The score is the key to accessing better terms: lower collateral, joining public pods, and earning organizer status.

### 11.2 Reputation Events

| Event | Points | Notes |
|-------|--------|-------|
| Pay within first 48h of cycle open | +2 | Eager payer reward |
| Pay on time (before grace period ends) | +1 | Per cycle |
| Complete a full pod (all payments on time) | +15 | Completion bonus |
| Complete a pod as organizer (no defaults) | +25 | Harder responsibility |
| Vouch for a member who completes successfully | +5 | Per person vouched |
| First default (lifetime) | -25 | |
| Second default (lifetime) | -45 | |
| Third default (lifetime) | -80 | |
| Fourth+ default (lifetime) | -120 | Per event |
| Vouch for member who defaults | -15 | Vouching carries risk |
| Organizer with 2+ defaulting invitees (same pod) | -10 | Curation responsibility |

### 11.3 Score Weight Decay on Negative Events

Old bad behavior counts less as time passes — provided no new bad behavior occurs:

```
Negative events 0–2 years old:    full weight  (100%)
Negative events 2–4 years old:    reduced to   50%
Negative events 4–6 years old:    reduced to   25%
Negative events 6+ years old:     reduced to   10%  (never fully erased)

Positive events: no decay — good history is permanent
```

Negative events never reach zero weight. A wallet cannot erase its history by simply waiting — it can only reduce the impact. The minimum weight floor of 10% ensures long-term accountability without permanently closing the door.

This gives a genuine path back for people who made one bad financial decision years ago.

### 11.4 Wallet Flags

Flags are separate from score. Flags restrict access. Score affects terms.

| Flag | Restriction | Duration | How to Clear |
|------|------------|---------|-------------|
| Yellow | Visible to organizers only. No join restrictions. | Permanent (until cleared) | Complete one pod with no defaults |
| Orange | Cannot join public pods | 90 days | Expires, or complete recovery pod |
| Red | Cannot join any pod | 12 months | Complete recovery pod |
| Black | Permanently restricted from all pods | Permanent | Complete two recovery pods |

### 11.5 Recovery Pods

A supervised pod designed to give defaulters a path back.

```
Recovery Pod rules:
  Size:              3–5 members maximum
  Pot maximum:       $300 total
  All members:       Must have at least a Yellow flag (or be vouching for one who does)
  Collateral:        Fixed at 2× regardless of score
  Defaults allowed:  Zero — any default in a recovery pod doubles flag duration
  Completion reward: One flag level removed (Black → Red → Orange → Yellow → Cleared)
  Completion score:  +20 bonus points (on top of normal completion points)
```

---

## 12. Organizer Rules

### 12.1 What the Organizer Controls

```
CAN control:
  Pod parameters (at creation only, immutable after deployment)
  Who is invited (Community Pod only)
  Payout order (Fixed method only — set before any member joins)
  Whether to request a pause (requires member consent)
  Default slot reallocation method (set at creation)

CANNOT control:
  Pod funds — ever
  Payout timing — governed by cycle clock
  Who defaults — determined by payment receipt only
  Random payout order — VRF/on-chain randomness
  Collateral — belongs to the member, returned automatically
```

### 12.2 Organizer Fraud

The most serious protocol violation. Traditional tanda failure mode #1 is organizer fraud — the organizer runs off with the money or manipulates the payout order. The protocol eliminates the first (organizer never touches funds). For payout manipulation:

**Prohibited actions:**
- Setting fixed payout order based on bribes or side payments
- Creating phantom member wallets under organizer control
- Misrepresenting pod terms to attract members
- Colluding with first-slot members

**Consequences:**
```
Allegation:   All organizer's active pods paused pending review (immediate)
Governance:   3-of-5 multisig review within 72 hours
Proven fraud: Permanent ban from organizer role across all chains
              All affected members: full refund from protocol treasury
              Organizer's reputation: Black flag + -500 points
```

Protocol absorbs the full cost of organizer fraud. This is a protocol guarantee.

### 12.3 Organizer Code of Conduct

By creating a pod, the organizer commits to:
- Not accepting side payments in exchange for early payout slots
- Truthfully representing the pod to all invitees
- Communicating honestly if a member or themselves faces difficulty
- Directing members to the official dispute process rather than handling disputes informally

---

## 13. Dispute Resolution

### 13.1 What Can Be Disputed

- Technical blockchain failure (network outage, documented by block explorer) caused missed payment
- Organizer fraud allegation
- Insurance pool calculation error
- Incorrect wallet flag applied
- Smart contract execution that deviated from documented rules

### 13.2 What Cannot Be Disputed

- Voluntary non-payment for any personal reason
- Change of mind about payout order
- Price movements or yield rate changes
- Smart contract executing exactly as the rules describe
- Decisions made by prior governance votes

### 13.3 Dispute Process

```
Step 1: Dispute submitted on-chain with supporting evidence
        (tx hashes, block explorer links, timestamps)
        Window: must be submitted within 72 hours of the event

Step 2: 48-hour public comment period
        Other pod members and protocol observers can submit evidence

Step 3: Protocol governance review
        3-of-5 multisig signers review evidence
        Decision issued within 48 hours of comment period close

Step 4: Decision executed on-chain (refunds, flag removals, etc.)

Step 5: One-time appeal within 7 days
        Full governance vote (all multisig + community token holders)
        Appeal decision is final — no further recourse
```

### 13.4 Technical Failure Policy

If a verified blockchain network outage caused a payment to fail:
- Cycle window extended by exact outage duration
- No penalty applied to any member
- Documented in pod's on-chain history
- Outage must be confirmed by independent block explorer data

---

## 14. Privacy

- Wallet addresses are public on all three chains — this is inherent to blockchain
- The protocol does not require real names, addresses, or ID documents
- Email and phone numbers for notifications are stored encrypted off-chain, never shared, never sold
- Pod membership (which wallet is in which pod) is fully public on-chain
- Transaction history is fully public on-chain — the reputation score is a public summary of this
- Protocol will not comply with data requests without a valid court order from a jurisdiction with authority over the requesting party

---

*Version 2.1 — March 2026 (risk audit + fixes)*
*DeFi Tanda Protocol — Chicago, IL*
