# DeFi Tanda — App Specification

> Page-by-page spec for both the user-facing app (`/app`) and the admin panel (`/admin`).
> This is the source of truth for what gets built and in what order.

---

## Part 1 — User App

The user app is mobile-first. Every screen is designed for a phone. Primary language: Spanish. All labels, buttons, and notifications have EN/ES versions via i18next.

### Authentication Model

Users do not create accounts in the traditional sense. Their **wallet address is their identity**.

```
First visit:
  1. User clicks "Connect wallet" or "Get started"
  2. Options: Xaman (XRPL), Phantom (Solana), MetaMask / Coinbase (ETH)
  3. OR: "I don't have a wallet yet" → guided setup flow → Xaman recommended
  4. Wallet signs a message (no gas fee) → session created in Supabase
  5. Profile created with wallet address as primary key

Returning visit:
  Auto-reconnect from session. Re-sign if session expired (7 days).
```

No email or password. No seed phrase entry in our app. The wallet handles all signing.

---

### U1 — User Dashboard `/app`

**Purpose:** First screen after wallet connect. Single view of everything the user needs to act on today.

**Layout:** Mobile card stack. Top nav: wallet address (truncated) + chain logo + reputation score badge.

**Sections:**

#### Action Banner (top — only shows when relevant)
- "You have a payment due in 18 hours" → CTA: Pay Now
- "Your tanda payout is this week!" → CTA: View pod
- "You have a new invitation" → CTA: Review invite
- Only one banner at a time, highest priority shown

#### My Active Pods
- Card per active pod showing:
  - Pod name / chain logo
  - Cycle progress bar (e.g. "Week 3 of 10")
  - Next payment due: relative time ("in 3 days") + exact date
  - Status dot: green (paid this cycle) / yellow (due soon) / red (overdue)
  - Tap → `/app/pod/:id`

#### Quick Actions (icon grid, 2×2)
- Pay Now (if payment due)
- Create Tanda
- Browse Pods
- Buy USDC (Apple Pay)

#### Reputation Score Card
- Score number + label (New / Trusted / Veteran)
- Mini bar showing progress to next tier
- "How to improve" link → `/app/profile#reputation`

#### Recent Activity Feed
- Last 5 events: payments made, payouts received, pod joins, flag changes
- Each row: icon + description + amount + date

---

### U2 — Pod List / Browse `/app/pods`

**Purpose:** Discover and join public pods.

**Layout:** Filter bar + scrollable card list.

**Filters:**
- Chain: All / XRPL / ETH / Solana
- Contribution range: $10–$50 / $50–$200 / $200+
- Cycle: Weekly / Biweekly / Monthly
- Spots left: Has openings (toggle)

**Pod Card shows:**
- Chain logo + token
- Contribution amount + cycle
- Members: 6/10 filled (visual dot row)
- Collateral required (calculated for user's reputation tier)
- Payout order: Random / Fixed / Bid
- "Join" button → triggers collateral check → onramp if needed → join flow

**Empty state:** "No public pods match your filters. Create your own →"

---

### U3 — Create Pod Wizard `/app/create`

Four-step wizard. Progress bar at top. Back/Next navigation. All state held in memory until final submit.

**Step 1 — Pod Type**
- Community (private, I'll invite people) vs Public (open listing)
- Visual cards with pros/cons
- Selecting Community unlocks invite controls in Step 4

**Step 2 — Pod Settings**
- Chain selector: XRPL / ETH / Solana (with recommended label on XRPL)
- Contribution amount: number input with $ prefix
- Cycle: Weekly / Biweekly / Monthly (button group)
- Number of members: slider 3–20
- Duration: auto-calculated (members × cycle)
- Collateral: slider 1×–2× (community pods) or fixed 2× (public)
- Grace period: 24h / 48h / 72h
- Slot reallocation: Skip / Auction / Replace

**Step 3 — Payout Order**
- Random (recommended): description + VRF explanation in plain language
- Fixed: organizer assigns order (drag-and-drop slot list, filled after members join)
- Bid: explained with legal note — not available until legal clearance

**Step 4 — Review + Deploy**
- Full summary of all settings
- Cost to create: $2 (shown clearly)
- For community pods: invite link preview + WhatsApp share button
- "Deploy Pod" button → wallet signs transaction → pod created on-chain

**Post-deploy:** Confetti + share screen. Two share buttons shown immediately:

```
┌─────────────────────────────────────┐
│  🎉 Your tanda is live!             │
│  Share it to fill your spots        │
│                                     │
│  [ Share on WhatsApp ]              │
│  [ Share on Telegram ]              │
│                                     │
│  Or copy link: defitanda.app/pod/…  │
└─────────────────────────────────────┘
```

WhatsApp message is pre-written in the user's language with contribution amount and pod link. Telegram share includes pod URL and a short invite text.

---

### U4 — Pod View `/app/pod/:id`

**Purpose:** Everything about one pod. The organizer and members both use this view (slightly different controls per role).

**Header:**
- Pod name + chain + token
- Status badge (OPEN / LOCKED / ACTIVE / COMPLETED)
- Members: filled/total with avatar dots

**Cycle Timeline (visual — most important element)**
```
[Week 1 ✓] [Week 2 ✓] [Week 3 → YOU] [Week 4] [Week 5] ... [Week 10]
             Paid        Your payout!    Future   Future
```
- Each slot: member avatar or "?" for unfilled public slots
- Hover/tap slot: member's alias + payment status for this cycle

**This Cycle Panel:**
- Countdown timer to grace period
- Contribution status per member: paid ✓ / pending ○ / defaulted ✗
- Pot total so far this cycle
- Winner for this cycle (highlighted)
- CTA: "Pay Your $100" → `/app/pod/:id/pay`

**Collateral & Balance:**
- Your collateral locked: $200 + $X yield earned so far
- Your total contributions to date
- Your payout received (if applicable)

**Members List:**
- Each member: truncated wallet + alias + reputation badge + payment status
- Organizer sees full flag status

**Organizer Controls (organizer only):**
- Pause pod (requires 60% member approval)
- Request dissolution vote
- For OPEN pods: copy invite link, cancel specific invitations (before member deposits collateral — once collateral is locked, slot cannot be removed without member's consent or pod cancellation)

**Share Pod (visible to all members, prominent for organizer):**

Share buttons appear on every pod card and at the bottom of the pod detail view. Two buttons side by side:

```
[ Share on WhatsApp ]   [ Share on Telegram ]
```

**WhatsApp share** opens `https://wa.me/?text=<encoded>` with a pre-written message:

```
EN: "Join my DeFi Tanda! 💰
     $100/week for 10 weeks. Everyone puts in, everyone gets paid.
     Safe, automatic, no bank needed.
     👉 defitanda.app/pod/abc123
     Spots left: 4/10"

ES: "¡Únete a mi Tanda DeFi! 💰
     $100 por semana durante 10 semanas. Todos ponemos, todos ganamos.
     Seguro, automático, sin necesidad de banco.
     👉 defitanda.app/pod/abc123
     Lugares disponibles: 4/10"
```

Language matches the user's app language setting.

**Telegram share** opens `https://t.me/share/url?url=<pod_url>&text=<encoded>`:

```
EN: "Join my DeFi Tanda — $100/week rotating savings circle.
     Secure, automated, no bank needed. Spots: 4/10"

ES: "Únete a mi Tanda DeFi — $100 por semana.
     Seguro, automático. Lugares: 4/10"
```

**Share content is dynamic** — contribution amount, spots left, and pod URL are injected at render time. The pod URL is a short link (`defitanda.app/pod/:id`) that deep-links directly to the pod join screen.

**In TESTNET / DEV mode:** Share buttons are disabled. A tooltip shows "Sharing disabled in testnet mode" to prevent test pod links from reaching real users.

**Activity Feed:** All pod events in reverse-chron order (payments, defaults, payouts, flags)

---

### U5 — Payment Screen `/app/pod/:id/pay`

**Purpose:** One-tap contribution. Designed to be as fast and simple as possible.

**Layout:** Single card, large amount, two payment options.

```
┌─────────────────────────────────┐
│  Tanda: Rodriguez Family        │
│  Week 4 of 10                   │
│                                 │
│         $100.00 USDC            │
│                                 │
│  Due in: 18 hours               │
│                                 │
│  [  Pay with Apple Pay  ]       │
│  [  Pay from Wallet     ]       │
│                                 │
│  ✓ Payment confirmed on-chain   │
└─────────────────────────────────┘
```

- Apple Pay button triggers Stripe Onramp if balance insufficient, or direct wallet transfer if sufficient
- Wallet button: sends from connected wallet directly
- Confirmation state: green checkmark + tx hash link + two share buttons:
  ```
  [ Share on WhatsApp ]   [ Share on Telegram ]
  ```
  WhatsApp: `"Pagué mi tanda esta semana ✓ — defitanda.app/pod/abc123"`
  Telegram: `"Just paid my DeFi Tanda contribution ✓"`
- Error state: clear message + retry

---

### U6 — Wallet & Buy `/app/wallet` and `/app/buy`

**`/app/wallet` — Balances**
- Balance per connected chain + token
- Total across all chains in USD equivalent
- Recent transactions (on-chain, pulled from chain explorers)
- "Add funds" button → `/app/buy`
- "Send to Mexico" button → `/app/remit`

**`/app/buy` — Fiat Onramp**
- Token selector: USDC (Solana) / USDC (Ethereum) / XRP → RLUSD
- Amount selector: $50 / $100 / $200 / custom
- Payment method: Apple Pay (prominent) / Google Pay / Debit Card
- Stripe widget loads inline (not a new tab)
- Confirmation + balance update after purchase

---

### U7 — History `/app/history`

**Purpose:** Full record of all past participation. Doubles as a financial statement.

**Sections:**

**Reputation Timeline**
- Line chart: score over time
- Events marked on line: pod completions, defaults, vouches

**Past Pods**
- Card per completed pod
- Outcome: received $990 / contributed $700 / completed on time
- Chain + dates + members count
- Downloadable receipt (PDF) — useful for tax reporting

**Lifetime Stats**
- Total saved through tandas
- Total received in payouts
- Pods completed / pods defaulted
- Reputation score history

---

### U8 — Remittance `/app/remit`

**Purpose:** Send tanda payout (RLUSD) to Mexico or other LATAM countries.

**Flow:**
1. Source: select from wallet balances (RLUSD recommended)
2. Amount to send
3. Destination: Mexico → Bitso → MXN to SPEI / cash
4. Estimated arrival: ~10 seconds / ~1 hour to bank
5. Fee comparison shown: "Western Union would charge $14.70. Your cost: $0.01"
6. Confirm → Xaman signs → done

---

### U9 — Profile & Settings `/app/profile`

**Tabs:**

**Reputation**
- Score + tier + progress
- Events list (what earned/lost points and when)
- Active flags (if any) + how to clear them
- Recovery pod CTA (if flagged)

**Notifications**
- Toggle: WhatsApp / Push / Email per event type
- Event types: Payment reminders / Payout received / Default alerts / Pod updates
- WhatsApp: shows opt-in status + how to opt in via bot

**Wallets**
- Connected wallets per chain
- Connect new wallet
- Primary wallet selector

**Language**
- English / Español toggle

**Akademia**
- Progress through education levels
- Upgrade to Pro

---

## Part 2 — Admin Panel

The admin panel is a **desktop-first internal tool**. It is not accessible from the user-facing app. Separate auth: email + password + TOTP (2FA required). Four roles exist — each role can only see and act on what it needs.

### Admin Role Permission Matrix

| Capability | super_admin | support | ambassador_mgr | finance |
|---|---|---|---|---|
| View admin dashboard | ✓ | ✓ | ✓ | ✓ |
| View all pods | ✓ | ✓ | — | ✓ |
| Force pause / dissolve pod | ✓ | — | — | — |
| View user wallets | ✓ | ✓ | — | — |
| Apply wallet flag | ✓ | ✓ | — | — |
| Remove wallet flag | ✓ | — | — | — |
| Add internal note to wallet | ✓ | ✓ | — | — |
| View ambassador list | ✓ | — | ✓ | — |
| Approve / reject ambassador | ✓ | — | ✓ | — |
| Suspend ambassador | ✓ | — | — | — |
| View insurance pool | ✓ | ✓ | — | ✓ |
| Replenish insurance pool | ✓ | — | — | — |
| View dispute queue | ✓ | ✓ | — | — |
| Resolve dispute | ✓ | ✓ | — | — |
| Escalate to governance | ✓ | — | — | — |
| View revenue reports | ✓ | — | — | ✓ |
| Export revenue CSV/PDF | ✓ | — | — | ✓ |
| View waitlist | ✓ | ✓ | ✓ | — |
| Send waitlist invites | ✓ | ✓ | — | — |
| Manage Akademia content | ✓ | — | — | — |
| View treasury wallets | ✓ | — | — | ✓ |
| Change treasury wallet | ✓ | — | — | — |
| Change platform settings | ✓ | — | — | — |
| Create / remove admin users | ✓ | — | — | — |
| View audit log | ✓ | — | — | ✓ |

**Role descriptions:**
- **super_admin** — full access. Maximum 3 seats. Each seat requires 2FA.
- **support** — handles member issues, flags, disputes. Cannot touch money or settings.
- **ambassador_mgr** — manages ambassador pipeline only. No access to financial data.
- **finance** — read-only on financials. Can export reports. Cannot modify anything.

Access: `defitanda.app/admin` — protected at both route and API level.

---

### A1 — Admin Dashboard `/admin`

**Purpose:** Platform health at a glance. The first thing you see every morning.

**KPI Cards (top row):**
| Metric | Description |
|--------|-------------|
| Active Pods | Total pods in ACTIVE state right now |
| Total Value Locked | Sum of all collateral across all chains in USD |
| Wallets Connected | Unique wallets that have ever joined a pod |
| Insurance Pool | Current balance + % of minimum threshold |
| Revenue MTD | Month-to-date: creation fees + yield share + onramp referral |
| Defaults This Week | Count + trend vs last week |

**Charts:**
- Pod creation over time (line, 30/60/90 day toggle)
- Revenue breakdown (stacked bar: creation fees / yield / onramp)
- Active pods by chain (donut: XRPL / ETH / Solana)
- Default rate by pod type (community vs public)

**Alerts Panel (right sidebar):**
- Insurance pool below warning threshold → red alert
- Dispute older than 48h with no response → yellow
- Pod in DEFAULTED state → orange
- New ambassador application → blue
- Flag escalation (new Black flag) → red

**Quick Actions:**
- View dispute queue
- Replenish insurance pool
- Export weekly report

---

### A2 — Pod Management `/admin/pods`

**Purpose:** View and manage every pod on the platform.

**Table columns:**
- Pod ID (link to detail)
- Status badge (OPEN / LOCKED / ACTIVE / COMPLETED / PAUSED / DEFAULTED / CANCELLED)
- Chain + Token
- Members (filled/total)
- Contribution × Cycle
- Total pot value
- Created date
- Organizer wallet (link to user detail)
- Defaults in pod (count)
- Actions menu

**Filters:** Status / Chain / Created date range / Has defaults / Organizer flag status

**Bulk actions:** Export CSV, Pause selected (requires confirmation)

**Single Pod View `/admin/pods/:id`**

Everything from the user pod view, plus:
- Full member list with wallet links, reputation scores, flag status
- Complete on-chain event log (every transaction with tx hash)
- Manual controls (super_admin only):
  - Force pause pod
  - Force dissolve pod (with reason field — logged)
  - Override cycle timing (for verified outages)
  - Apply insurance pool draw manually
  - Add note to pod record

---

### A3 — User / Wallet Management `/admin/users`

**Purpose:** Look up any wallet, manage flags, review history.

**Table columns:**
- Wallet address (truncated + copy)
- Chain(s) active on
- Reputation score + tier
- Flag status (colored badge)
- Pods completed / defaulted
- Joined date
- Last activity

**Filters:** Chain / Flag status / Reputation tier / Date range

**Single Wallet `/admin/users/:wallet`**

```
Header: wallet address + reputation score + flags

Tabs:
  Overview     — stats, score breakdown, flag history
  Pod History  — every pod this wallet has been in (as member and organizer)
  Transactions — all contributions and payouts (linked to chain explorer)
  Flags        — full flag history with timestamps and reasons
  Notes        — internal admin notes (logged with who wrote them)
```

**Flag controls (support role):**
- Apply flag manually (with required reason)
- Remove flag (with required reason + approval)
- Escalate flag level
- Apply recovery pod assignment

---

### A4 — Ambassador Management `/admin/ambassadors`

**Purpose:** Manage the ambassador program — approvals, earnings, activity.

**Table columns:**
- Name / alias
- Wallet address
- Status: Pending / Active / Suspended
- City / neighborhood
- Pods created (lifetime)
- Active pods
- Total payouts generated (their pods)
- Earnings MTD (0.1% commission)
- Last activity

**Application Queue:**
- New ambassador applications in order of submission
- Each row: applicant info + self-description + pods they've run before
- Actions: Approve / Reject / Schedule call

**Single Ambassador:**
- All their pods (past + active)
- Earnings history (monthly breakdown)
- Activity log
- Notes field
- Suspend / revoke (with reason — super_admin only)
- Commission payout history

---

### A5 — Insurance Pool `/admin/insurance`

**Purpose:** Monitor and manage the safety net that guarantees every payout.

**Status Panel:**
```
Current balance:        $42,350 USDC
Minimum threshold:      $50,000 USDC      ← BELOW MINIMUM — alert shown
Warning threshold:      $75,000 USDC
Status:                 ⚠ WARNING — replenishment needed

Total drawn (all time): $1,240 USDC
Recovered from slashes: $890 USDC
Net insurance cost:     $350 USDC
```

**Charts:**
- Balance over time (30/90/180 days)
- Inflows vs outflows (creation fees / payout fees / slashes vs draws)

**Inflow History table:** Every deposit into the pool (source + amount + date + tx hash)

**Draw History table:** Every time the pool covered a default (pod ID + amount + date + recovery status)

**Replenish button:** Opens form to manually top up the pool from treasury wallet. Requires super_admin. Logs the action.

---

### A6 — Dispute Queue `/admin/disputes`

**Purpose:** Review and resolve member disputes within the 48h SLA.

**Queue table:**
- Dispute ID
- Type: Technical failure / Organizer fraud / Flag appeal / Calculation error
- Submitted by (wallet)
- Pod involved
- Submitted date
- Age (hours) — turns red at 36h, critical at 48h
- Status: Open / In Review / Awaiting evidence / Resolved
- Assigned to (admin)

**Single Dispute view:**
- Claim description (member-written)
- Evidence submitted (tx hashes, screenshots, block explorer links)
- Relevant on-chain data auto-pulled (cycle timestamps, payment records)
- Timeline of events
- Public comment period responses
- Decision field (text) + outcome selector
- Resolution actions:
  - Extend cycle window (verified outage)
  - Remove flag
  - Refund amount
  - Escalate to full governance vote
  - Dismiss

All decisions are logged with timestamp, admin name, and reason. Immutable.

---

### A7 — Revenue Reports `/admin/revenue`

**Purpose:** Financial reporting for the protocol.

**Period selector:** MTD / Last 30 / Last 90 / Last 12 months / Custom range

**Summary cards:**
- Total revenue (period)
- Creation fees collected
- Payout fees collected (will be $0 during pilot)
- Yield share (collateral yield)
- Onramp referral commissions

**Breakdown table (by week):**
| Week | Creation Fees | Payout Fees | Yield Share | Onramp Referral | Total |
|------|--------------|-------------|-------------|-----------------|-------|

**By chain split:** XRPL / ETH / Solana revenue comparison

**By pod type:** Community vs Public revenue

**Exports:**
- CSV (all transactions)
- PDF summary report (for accountant / investor use)

---

### A8 — Waitlist `/admin/waitlist`

**Purpose:** Manage the email waitlist from the landing page.

**Table:** Email / Signup date / Source (UTM if tracked) / Status (Pending / Invited / Joined)

**Actions:**
- Export CSV
- Send invite batch (select rows → send invite email via Resend)
- Mark as invited
- Delete entry

**Stats:**
- Total signups
- Invited (%)
- Converted to wallet connect (%)

---

### A9 — Content Manager `/admin/content`

**Purpose:** Manage Akademia lessons without a code deploy.

**Lesson list:**
- Title (EN + ES)
- Level (1–8)
- Status: Draft / Published / Archived
- Video URL (YouTube)
- Last updated

**Lesson editor:**
- Title (EN + ES)
- Description (EN + ES)
- Video embed URL
- Transcript / text content (rich text, EN + ES)
- Quiz questions (optional, for Pro completion tracking)
- Publish / Unpublish toggle

---

### A10 — Treasury Wallets `/admin/treasury`

**Purpose:** Manage the wallet addresses where protocol fees are received. This is a financial-critical section — every change is logged and requires super_admin access + confirmation.

**super_admin only.**

---

#### Active Treasury Wallets

One active wallet per chain at any time. All creation fees and protocol revenue for that chain are sent to the active wallet.

```
┌─────────────────────────────────────────────────────────────┐
│  XRPL (RLUSD)                                               │
│  Active wallet:  rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX          │
│  Balance:        142.50 RLUSD                               │
│  Fees received:  $28.00 (14 pods × $2)                      │
│  Last received:  2026-03-28                                  │
│  [Change wallet]  [View on explorer]                        │
├─────────────────────────────────────────────────────────────┤
│  Ethereum (USDC)                                            │
│  Active wallet:  0xXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX │
│  Balance:        16.00 USDC                                 │
│  Fees received:  $16.00 (8 pods × $2)                       │
│  Last received:  2026-03-25                                  │
│  [Change wallet]  [View on explorer]                        │
├─────────────────────────────────────────────────────────────┤
│  Solana (USDC)                                              │
│  Active wallet:  XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX │
│  Balance:        8.00 USDC                                  │
│  Fees received:  $8.00 (4 pods × $2)                        │
│  Last received:  2026-03-20                                  │
│  [Change wallet]  [View on explorer]                        │
└─────────────────────────────────────────────────────────────┘
```

---

#### Change Wallet Flow

Changing a treasury wallet is a sensitive operation. The flow has deliberate friction to prevent mistakes:

```
Step 1: Click "Change wallet" for a chain
Step 2: Enter the new wallet address
Step 3: Validation:
          - Address format check (XRPL r-address / EVM 0x / Solana base58)
          - Confirm it is NOT a pod account or user wallet (cross-check DB)
          - Warning if address has never received tokens before (new wallet)
Step 4: Enter reason (required text field — logged)
Step 5: "Confirm change" button → sends verification email to all super_admins
Step 6: One other super_admin must approve within 24h
        Quorum: 2-of-3 (exactly 3 super_admin seats exist — always requires 2 to act)
        If fewer than 2 super_admins are available, treasury changes are frozen until quorum is restored
Step 7: Once approved → new wallet becomes active for all future fee sends
        Old wallet remains in history, fees already received stay there
```

**The old wallet is never auto-emptied.** Funds in retired treasury wallets must be moved manually by the team. This prevents an accidental wallet change from misdirecting funds.

---

#### Fee Type Configuration

Different fee types can be routed to different wallets (optional). By default all fees go to the chain's active treasury wallet.

| Fee Type | Current Destination | Override |
|----------|-------------------|---------|
| Pod creation fees | Active treasury wallet | Optional separate wallet |
| Payout fees (growth phase) | Active treasury wallet | Optional separate wallet |
| Yield share | Active treasury wallet | Optional separate wallet |
| Ambassador commissions | Paid out directly to ambassador wallets | N/A — auto |
| Insurance pool draws | Insurance pool account (separate) | Not configurable |

---

#### Wallet History

Full log of every treasury wallet that has ever been active:

| Chain | Wallet Address | Active From | Active Until | Total Received | Changed By | Reason |
|-------|---------------|------------|-------------|----------------|-----------|--------|
| XRPL | rXXXX... | 2026-03-01 | — (active) | 142.50 RLUSD | admin@... | Initial setup |

All rows are read-only. Cannot be deleted. Retained forever.

---

#### Balance Alerts

- If a treasury wallet balance exceeds $5,000 equivalent → yellow alert on admin dashboard
  ("Treasury balance high — consider sweeping to cold storage")
- If a treasury wallet address is flagged on any sanctions list → red alert + auto-freeze fee routing

---

### A11 — Platform Settings `/admin/settings`

**super_admin only**

---

#### Environment Mode — CRITICAL SETTING

The most important setting in the entire admin panel. Controls whether the app connects to **real blockchains with real money** or **test networks with fake tokens**.

```
┌─────────────────────────────────────────────────────────────┐
│  ENVIRONMENT MODE                                           │
│                                                             │
│  ● DEV   (currently active)                                 │
│  ○ LIVE                                                     │
│                                                             │
│  DEV mode: test networks only. No real funds at risk.       │
│  LIVE mode: mainnet contracts. Real money. Real users.      │
│                                                             │
│  [ Switch to LIVE ]  ← requires 2-of-3 super_admin approval│
└─────────────────────────────────────────────────────────────┘
```

**DEV mode behavior:**
- All three chains connect to their test networks only:
  ```
  XRPL:     XRPL Testnet     (test RLUSD, faucet-funded wallets)
  Ethereum: Sepolia Testnet  (test USDC, no real ETH)
  Solana:   Devnet            (test USDC, airdrop-funded wallets)
  ```
- Mainnet contract addresses are hidden from the UI entirely — no dropdown option, no accidental selection
- Admin panel shows a permanent **orange "DEV" banner** across the top of every page
- User app shows a **"TESTNET — No real money"** badge on every pod card and in the nav bar
- Creation fees charged in test tokens only — no real $2 deducted
- All pod deployments use test contract addresses from `contracts.dev.json`
- Emails and WhatsApp notifications are routed to a sandbox (no real messages sent to users)
- Fiat onramp (Stripe/MoonPay) uses sandbox/test mode — no real card charges

**LIVE mode behavior:**
- Connects to mainnet contracts on all enabled chains
- Real RLUSD, USDC, USDT — real user funds
- Real creation fees collected to treasury wallets
- Real WhatsApp/email notifications sent to users
- Fiat onramp in production mode — real Apple Pay charges processed
- Admin panel shows a **green "LIVE" badge** — no banner, clean UI

**Switching from DEV → LIVE:**
```
Step 1: Click "Switch to LIVE"
Step 2: Confirmation dialog — lists every consequence:
          "This will connect to mainnet contracts.
           Real user funds will be at risk.
           Ensure all contracts are audited.
           Ensure treasury wallets are configured.
           Ensure insurance pool is seeded ($25,000 minimum)."
Step 3: Type "SWITCH TO LIVE" to confirm (prevents accidental clicks)
Step 4: 2-of-3 super_admin email approval required (same flow as treasury wallet change)
Step 5: Mode switches — logged with timestamp, who initiated, who approved
```

**Switching from LIVE → DEV:**
```
Immediately available — no approval needed.
Use this to pause the platform quickly in an emergency.
All active pods are not affected — they continue on-chain.
Only new pod creation and UI interactions are suspended.
```

**Contract address config** (`contracts.dev.json` / `contracts.live.json`):
```json
{
  "xrpl": {
    "networkUrl": "wss://s.altnet.rippletest.net:51233",
    "fulfillmentAccount": "rXXXXXX...",
    "insuranceAccount": "rXXXXXX..."
  },
  "ethereum": {
    "chainId": 11155111,
    "rpcUrl": "https://sepolia.infura.io/...",
    "factory": "0xXXXX...",
    "insurance": "0xXXXX...",
    "reputation": "0xXXXX...",
    "usdc": "0xXXXX..."
  },
  "solana": {
    "cluster": "devnet",
    "programId": "XXXX...",
    "usdc": "XXXX..."
  }
}
```

The active environment determines which config file the frontend and backend services load. Stored in Supabase `platform_settings` table — not in `.env` files — so it can be changed at runtime without a redeploy.

---

**Fee Configuration:**
- Pilot mode toggle: ON = $0 payout fee / OFF = 1% payout fee (requires confirmation)
- Creation fee per chain (editable, currently $2 flat)
- Yield share split: member % / protocol % (editable, requires confirmation)
- Treasury wallet addresses → managed in A10 (`/admin/treasury`)

**Chain Configuration:**
- Enable / disable individual chains (XRPL / ETH / Solana)
- Note: chain enable/disable is separate from environment mode — a chain can be disabled in both DEV and LIVE (e.g. ETH disabled during early pilot)

**Pod Limits:**
- Max pod size (currently 20)
- Max contribution (currently $10,000)
- Min contribution (currently $10)

**Insurance Pool Config:**
- Minimum threshold (currently $50,000)
- Warning threshold (currently $75,000)
- Auto-pause new pods below threshold: ON/OFF

**Notification Config:**
- WhatsApp Business API status (shows sandbox vs production)
- Push notification service status
- Email (Resend) status (shows test vs production mode)

**Audit Log:**
All settings changes logged with: who / what changed / old value / new value / timestamp. Read-only. Retained forever. Environment mode switches are highlighted in red/green.

---

## Part 3 — Build Order

### Sprint 1 (MVP user flow — XRPL testnet)
1. React + Vite scaffold + Tailwind + i18next + Zustand + React Router
2. Xaman wallet connect
3. U1 Dashboard (static mock data)
4. U4 Pod View (static)
5. U5 Payment screen (testnet RLUSD)
6. Supabase schema: wallets, pods, members, contributions, events

### Sprint 2 (Create + Join)
7. U3 Create Pod wizard → on-chain deployment
8. U2 Pod marketplace
9. Contribution on-chain with cycle validation
10. U6 Wallet + Apple Pay onramp (Stripe)
11. WhatsApp notifications (cycle reminders + confirmation)

### Sprint 3 (Admin foundation)
12. Admin auth (email + TOTP)
13. A11 Environment mode (DEV/LIVE toggle) — wire `contracts.dev.json` / `contracts.live.json`, DEV banner, testnet badge on user app
14. A10 Treasury wallets — MUST be configured before switching to LIVE
15. A1 Admin dashboard (live data from Supabase)
16. A2 Pod management table + detail view
17. A3 User / wallet management
18. A8 Waitlist management

### Sprint 4 (User completeness)
17. U7 History + reputation timeline
18. U8 Remittance (XRPL corridor)
19. U9 Profile + notification settings
20. Akademia levels 1–5

### Sprint 5 (Admin completeness + multi-chain)
21. A4 Ambassador management
22. A5 Insurance pool monitor
23. A6 Dispute queue
24. A7 Revenue reports
25. ETH + Solana wallet connections + pod support

---

*Version 1.0 — March 2026*
*DeFi Tanda — Chicago, IL*
