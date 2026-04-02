# DeFi Tanda — Product & Technical Plan

> A multi-chain rotating savings and credit protocol (ROSCA) built for real communities.
> Starting in Chicago's Latino community. Built for XRPL, Ethereum, and Solana.

---

## 1. Vision

Tandas have existed for centuries across every culture. They work because communities already trust each other. The problem is they break — when someone defaults, when members move cities, when the organizer disappears, when there's no record of who paid what.

DeFi Tanda does not reinvent the tanda. It makes the tanda unbreakable.

Smart contracts replace the handshake agreement. On-chain records replace the notebook. Automated enforcement replaces social shame. The community stays — the fragility goes.

**The core insight:** People who run tandas are already doing DeFi. They pool funds, rotate payouts, and enforce participation through trust networks. They just don't have the tools. We are building those tools — in their language, for their culture, on their phone.

**Primary target:** 2nd generation Latino, bilingual, US-based. Grew up watching their parents run tandas. Comfortable with smartphones. Has a Venmo. Has heard of Bitcoin. Still does the family tanda on WhatsApp. They understand both worlds and they are the bridge between them.

**Secondary target:** Any ROSCA community globally — Stokvel (South Africa), Hui (China), Chit Fund (India), Arisan (Indonesia). The protocol is universal. The culture-specific features are modular.

---

## 2. Understanding the Tanda

Before building, we must understand exactly what we are digitizing.

### 2.1 The Traditional Tanda

A tanda is an agreement between a trusted group of people:

- Everyone agrees on a fixed contribution (e.g. $100) and a cycle (e.g. weekly)
- Every cycle, everyone contributes and one person receives the full pot ($1,000 if 10 people)
- This rotates until every person has received the pot once
- No interest. No bank. No profit motive. Pure community coordination.

**Why it works:**
- The organizer knows everyone personally
- Defaulting means social humiliation within your community
- The amounts are meaningful but not catastrophic
- Everyone ends up exactly even — no one wins or loses, everyone just coordinates

**Why it breaks:**
- Organizer fraud — they take the money and disappear (most common failure)
- Member default — someone takes their payout early and stops contributing
- Geographic separation — harder to enforce with people in different cities or countries
- No records — disputes have no evidence
- Trust erosion — one bad experience poisons the well for everyone in the group

### 2.2 What Web3 Fixes

| Traditional problem | DeFi solution |
|--------------------|--------------|
| Organizer runs off with the money | Organizer never touches the money — smart contract holds it |
| No payment records | Every transaction permanent and public on-chain |
| Default with no consequence | Collateral slash — economic cost replaces social shame |
| Only works with people you know | Reputation system enables participation with verified strangers |
| Limited to your city | Global, borderless wallets |
| Cash only, no bank needed | Stablecoins — no bank account required |
| High remittance cost for cross-border tandas | XRPL settles globally in 5 seconds for fractions of a cent |

### 2.3 What Web3 Does Not Fix (and We Must Respect)

- **Community bonds** — a tanda is also social. Weekly meetings, mutual accountability, relationships. The app must support the community, not replace it.
- **Trust in the organizer** — people join tandas because they trust the organizer who recruited them. We keep the organizer role but change what they control.
- **Cultural ownership** — this is their tradition. The app serves them. It does not rebrand or repackage their culture.

---

## 3. Pod Types

Not all tandas are the same. The protocol supports two fundamentally different pod types.

### Type 1 — Community Pod (Private)

**Who uses it:** A group that already knows each other — family, friends, coworkers, church group, soccer team. They already run a tanda informally. They want a better tool.

**Key characteristics:**
- Invite-only — organizer controls who joins via personal invite links
- Social trust layer still intact — members know each other
- Lower default risk — social consequences still exist on top of economic ones
- Collateral can be reduced for known groups (organizer vouches for members)
- WhatsApp integration is the primary communication channel

**Economics:**
- Creation fee: 50% discount (community building)
- Protocol payout fee: 0.75% (slightly lower — lower risk)
- Collateral: organizer-adjustable between 1× and 2× contribution

### Type 2 — Public Pod (Stranger Pod)

**Who uses it:** People who want to form a tanda but don't have an existing group. They rely entirely on the protocol's reputation system for trust.

**Key characteristics:**
- Open listing — anyone with sufficient reputation can join
- No pre-existing social relationship — protocol enforcement is the only trust layer
- Higher default risk — full collateral required
- Strict reputation score minimum to join

**Economics:**
- Creation fee: standard rate
- Protocol payout fee: 1%
- Collateral: reputation-based (see Section 6)
- Minimum reputation score to join a public pod: 25 points

---

## 4. Tanda Pod — Core Mechanics

### 4.1 Pod Parameters (Set at Creation)

| Parameter | Description | Range |
|-----------|-------------|-------|
| Pod Type | Community or Public | — |
| Members | Number of participants | 3–20 |
| Contribution | Amount per cycle (in stablecoin) | $10–$10,000 |
| Cycle Duration | How often everyone pays | Weekly / Biweekly / Monthly |
| Payout Order | How winner is selected each cycle | Random / Bid / Fixed |
| Collateral | Security deposit required to join | 1×–2× contribution |
| Slot Reallocation | What happens to a defaulter's payout slot | Skip / Auction / Replace |
| Chain | Which blockchain | XRPL / Ethereum / Solana |
| Token | Which stablecoin | RLUSD / USDC / USDT |
| Grace Period | Hours after cycle close before default | 24–72 hours |

### 4.2 Pod Lifecycle

```
DEPLOY    → Organizer creates pod on-chain, pays creation fee, sets parameters
OPEN      → Members join and lock collateral. Pod visible to invited/public members.
LOCKED    → All slots filled. Payout order assigned. No new members. Clock starts.
ACTIVE    → Cycles run: all members contribute each cycle, one member receives pot.
            If member defaults: collateral auto-debits future contributions.
            Insurance pool covers any shortfall. Pot winner always paid on time.
COMPLETED → Final cycle paid out. All remaining collateral + yield returned.
```

### 4.3 Payout Order Methods

**Random (Recommended for Public Pods)**
At pod lock, verifiable on-chain randomness assigns each member a slot number 1 through N. No one — including the organizer — can predict or influence the order. Fairest for strangers.

**Fixed (Standard for Community Pods)**
Organizer assigns payout slots before the pod locks. All assignments are recorded on-chain before any member joins. Traditional tandas work this way — the organizer knows who needs the money most urgently. Transparent and immutable once set.

**Bid (Advanced) — DISABLED AT LAUNCH**
Members bid for the right to receive an early payout. The bid amount is distributed equally to all other members. This effectively means early receivers pay a small premium and late receivers earn a small bonus.

> **Status: Blocked in smart contract.** The `createPod` function rejects `payoutMethod=1` with an explicit error. Bid-order creates an interest-bearing relationship that may constitute a regulated lending product depending on jurisdiction. This method will not be enabled until legal review is complete in each target market. The UI will not show this option until it is unblocked.

### 4.4 How a Cycle Works

```
Day 1    Cycle opens. Contribution window begins. Members can pay at any time.
Day 5    Standard close. Members who have not yet contributed receive reminder.
Day 7    Grace period ends. Any unpaid contribution → default declared.
Day 7    Pot collected from all payers (+ insurance covers any default shortfall).
Day 7    Pot distributed to cycle winner (minus 1% protocol fee).
Day 8    Next cycle begins.
```

The cycle winner always receives their payout on time. Defaults do not delay payouts.

---

## 5. Multi-Chain Architecture

Each chain serves a different user segment. XRPL is the primary chain for the Latino community due to RLUSD, near-zero fees, and mobile wallet experience. Ethereum and Solana expand reach to crypto-native users.

### 5.1 XRPL (XRP Ledger) — Primary Chain

**Why XRPL for this community:**
- Near-zero fees (~$0.0001/tx) — critical for weekly small contributions
- 3–5 second settlement — instant confirmation, familiar to mobile users
- RLUSD — Ripple's regulated USD stablecoin. Pegged, audited, familiar to dollar-thinking users
- Xaman wallet (formerly XUMM) — mobile-first, QR code sign-in, already used by XRPL community
- XRPL's built-in DEX and AMM — yield on idle collateral without leaving the ecosystem
- **Bitso integration** — major Mexican exchange uses XRPL. Chicago → Mexico remittance corridor opens naturally

**Important technical note on XRPL:**
XRPL's native Escrow feature only works with XRP, not with issued currencies like RLUSD. For RLUSD-based pods, we use a **protocol-controlled multisig Pod Account**:
- A dedicated XRPL account is created per pod
- Members send RLUSD contributions directly to the Pod Account each cycle
- The Pod Account is co-signed by the protocol (automated) and cannot be unilaterally accessed
- Payouts are signed by the protocol's hot wallet after cycle conditions are verified
- Collateral sits in the Pod Account and earns yield via XRPL's AMM

This approach is more practical than escrow for tokens and maps cleanly to the tanda's natural flow.

**Wallet:** Xaman
**Token:** RLUSD
**Best for:** Latino community, unbanked users, remittance-heavy users, mobile-first

### 5.2 Ethereum — Secondary Chain

**Why ETH:**
- Largest DeFi ecosystem — users who already have USDC or MetaMask
- Most audited and battle-tested smart contract environment
- Chainlink VRF for verifiable random payout order
- Aave/Compound for collateral yield

**Wallet:** MetaMask, WalletConnect (Coinbase Wallet, Rainbow, etc.)
**Token:** USDC, USDT
**Best for:** Crypto-native users, existing DeFi users, larger pod sizes

### 5.3 Solana — Third Chain

**Why Solana:**
- Fastest and cheapest — ideal for high-frequency micro-tandas ($10–$25/week)
- Native USDC from Circle
- Phantom wallet is widely adopted
- Growing Latino crypto-native community on Solana

**Wallet:** Phantom, Solflare, Backpack
**Token:** USDC (Solana native)
**Best for:** Micro-tandas, mobile-first users, frequent cycles

### 5.4 Fiat Onramp — Apple Pay / Google Pay / Debit Card

**The problem this solves:** Most of our target users do not own USDC or RLUSD. They have dollars on their phone. Without a fiat onramp, every new user must first buy crypto on an exchange before they can join a tanda. That is too many steps and too much friction for first-time users.

**Solution:** Embed third-party onramp widgets directly into the app. Users pay with Apple Pay, Google Pay, or a debit card — dollars are automatically converted to USDC or RLUSD and sent to their wallet. No exchange account needed.

**Onramp providers:**

| Provider | Apple Pay | SOL | ETH | USDC (ETH) | USDC (SOL) | XRP | Notes |
|---|---|---|---|---|---|---|---|
| **Stripe Crypto Onramp** | Yes | Yes | Yes | Yes | Yes | No | Primary — best UX, KYC built-in |
| **MoonPay** | Yes | Yes | Yes | Yes | Yes | Yes | Fallback — covers XRP for XRPL users |

- **Stripe** handles USDC on Ethereum and Solana. Apple Pay appears natively on iOS — no extra integration needed.
- **MoonPay** covers XRP purchases. User buys XRP, then swaps to RLUSD via XRPL DEX in one additional tap.

**Where it surfaces in the app:**
- `/app/buy` — dedicated buy screen with token selector
- **Contextual prompt** — when a user tries to join a pod without sufficient balance: *"You need $200 USDC to join. Buy with Apple Pay →"*
- **Onboarding step 3** — first-time setup wizard

**Revenue:** Stripe and MoonPay pay ~0.5–1% referral commission on every purchase routed through the app. Passive revenue with no cost to the user (they pay market rate regardless).

---

## 6. Collateral Model

The hardest design problem. Collateral makes the pod safe but it creates a barrier for the people who need tandas most.

### The Tension

In a traditional tanda, you don't put up a deposit. You show up because you trust your neighbors and because defaulting would humiliate you in front of everyone you know. We are replacing social collateral with economic collateral — but economic collateral requires capital that low-income users may not have.

### Our Solution — Three Phases

**Phase 1 (MVP): Standard Collateral**
All new users deposit 2× their contribution as collateral. Simple, safe, fair.
- $100/week contribution → $200 collateral deposit
- Collateral earns yield while locked (partially returned to member)
- Returned in full (plus yield) when pod completes

**Phase 2: Reputation-Based Collateral**
As users build an on-chain track record, collateral requirements decrease.

| Reputation Score | Collateral Required |
|-----------------|-------------------|
| 0–49 (New) | 2.0× contribution |
| 50–99 | 1.5× contribution |
| 100–199 | 1.0× contribution |
| 200–499 | 0.5× contribution |
| 500+ | 0.25× contribution |
| Vouched by trusted organizer | Organizer-set (min 0.5×) |

The goal: a trusted member with a 2-year track record deposits $25 instead of $200 to join a $100/week pod. Accessible and still safe.

**Phase 3: Group Insurance Pool**
A portion of every payout fee funds a shared insurance pool. As the pool grows, individual collateral requirements decrease further. The community as a whole backs each other — which is exactly what a traditional tanda does.

---

## 7. WhatsApp — The Primary Channel

WhatsApp is not a notification option. It is the primary operating environment for the target community.

Tanda organizers in Little Village, Pilsen, and Brighton Park run their tandas through WhatsApp groups today. Payment confirmations, reminders, and disputes happen there. The app must integrate with this, not compete with it.

**WhatsApp integration plan:**
- **Pod invite link** → shareable WhatsApp-formatted message with pod details in Spanish
- **Payment reminders** → sent via WhatsApp Bot 72h, 24h, and 12h before cycle close
- **Confirmation messages** → "Tu pago fue recibido ✓" after successful contribution
- **Payout notification** → "¡Felicidades! Tu tanda cayó esta semana. $990 enviados."
- **Default alert** → sent to organizer and all members when a payment is missed
- **Pod status** → members can WhatsApp the bot to check cycle status, balances, and countdown

WhatsApp Business API (Meta Cloud API) handles delivery. Opt-in required.

**Privacy and compliance:**
- Phone numbers are stored encrypted in Supabase, never shared or sold
- Users opt in explicitly during onboarding — no messages sent without consent
- Opt-out honored immediately via WhatsApp reply ("STOP") or app settings
- US users: compliant with TCPA (text messaging consent requirements)
- EU users: if the protocol expands to Europe, WhatsApp opt-in flow updated to meet GDPR consent requirements — phone numbers treated as personal data under Art. 4 GDPR
- Twilio (the delivery layer) processes data under a DPA — data residency in US by default

---

## 8. Remittance Corridor — Chicago to Mexico

This is one of the most underutilized features of XRPL and a natural fit for this community.

Millions of dollars flow from Chicago to Mexican families every week. Western Union and MoneyGram charge 3–7% per transfer plus unfavorable exchange rates. XRPL settles in 5 seconds at near-zero cost.

**How this integrates with tandas:**
- A tanda member in Chicago receives their $990 payout in RLUSD
- With one additional step in the Xaman wallet, they send it to a family member in Mexico via XRPL
- Bitso (Mexico's largest crypto exchange, built on XRPL) converts RLUSD to MXN
- Family member withdraws MXN to their SPEI bank account or cash

**Result:** The tanda payout doubles as a zero-fee remittance. The app helps members set this up automatically as a post-payout action.

**Revenue opportunity:** Revenue-sharing partnership with XRPL-based remittance corridors. Not extractive — we connect users to the best available rates.

---

## 9. Community Ambassador Program

Traditional tandas spread through trusted people, not advertising. Our distribution strategy mirrors this.

**Who is an Ambassador?**
A community member who runs tandas — already trusted in their neighborhood, church, workplace, or soccer league. They are the person everyone goes to when they need to organize a group financially.

**What they do:**
- Run their existing tandas through our app
- Onboard their community members (family, friends, coworkers)
- Run in-person workshops ("Cómo usar DeFi Tanda") at community spaces
- Share the app through their existing WhatsApp networks

**What they earn:**
- 0.1% of every payout generated in pods they organize (from protocol's treasury share — not from members)
- Free Akademia Pro access
- Priority support
- "Verified Organizer" badge visible to members on their profile
- Invited to quarterly community calls with the team

**The flywheel:** Ambassadors earn more as their pod network grows. They have a financial incentive to run good pods and onboard trustworthy members. This is exactly how informal tandas spread — through respected community members. We are just making it official and rewarding it.

**Chicago launch target:** 10 verified ambassadors in Pilsen and Little Village before public launch. Each should run at least one successful test pod on testnet.

---

## 10. Akademia — Financial Education Layer

Education is not marketing. It is the trust-building layer that makes someone comfortable putting $200 collateral into a smart contract they can't see.

The education journey maps to the adoption journey:

```
Level 1: ¿Qué es una tanda?          (They already know this — validation)
Level 2: ¿Qué es crypto?              (Simple: digital money on the internet)
Level 3: ¿Qué es una wallet?          (Your digital piggy bank)
Level 4: ¿Cómo funciona RLUSD?        (Dollars on the blockchain)
Level 5: Cómo hacer tu primera tanda  (Step-by-step with Xaman)
Level 6: Cómo enviar dinero a México  (Remittance guide)
Level 7: Cómo construir tu reputación (Reputation score explainer)
Level 8: Tanda avanzada               (Multi-chain, yield, larger pods)
```

**Content format:** Short videos (< 3 minutes), Spanish-first, WhatsApp-shareable. Hosted on the app and on YouTube.

**Akademia Pro ($4.99/month):** Tax basics for crypto savings, credit building with on-chain reputation, DeFi yield basics, live monthly Zoom workshops in Spanish, organizer certification.

---

## 11. Frontend Architecture

### Stack
```
Framework:    React 18 + Vite — fast build, modern ecosystem
Styling:      Tailwind CSS — mobile-first utility classes
State:        Zustand — simple, lightweight global store
Routing:      React Router v6 — nested layouts, protected routes
i18n:         i18next — English / Spanish (Spanish-first for community pages)
Charts:       Recharts — cycle progress, contribution timelines, revenue graphs
Tables:       TanStack Table v8 — admin data tables with sort/filter/pagination
Forms:        React Hook Form + Zod — validated pod creation, settings
PWA:          Vite PWA plugin — installable on any phone, works offline
```

### Wallet Connections
```
XRPL:    Xaman SDK (xumm-universal-sdk) + xrpl.js
ETH:     wagmi v2 + viem + WalletConnect v2
Solana:  @solana/wallet-adapter (Phantom, Solflare, Backpack)
```

### Fiat Onramp
```
Primary:  Stripe Crypto Onramp (@stripe/crypto-onramp-js)
          → USDC on Ethereum and Solana
          → Apple Pay, Google Pay, debit card, bank transfer
Fallback: MoonPay widget (iframe)
          → XRP for XRPL users → swap to RLUSD on XRPL DEX
```

### Route Structure

```
── Public ──────────────────────────────────────────────────
/                       Marketing landing page (done ✓)
/learn                  Akademia — education hub
/learn/:slug            Individual lesson
/ambassador             Ambassador program info + application

── User App (requires wallet connection) ───────────────────
/app                    Dashboard — pods summary, reputation, next payment
/app/pods               Browse & join public pods
/app/create             Create pod — step-by-step wizard (4 steps)
/app/pod/:id            Pod overview — members, timeline, cycle status
/app/pod/:id/pay        One-tap contribution screen
/app/wallet             Balances across all connected chains
/app/buy                Fiat onramp — Apple Pay / Google Pay → USDC
/app/history            Past tandas + reputation timeline
/app/remit              Send payout to Mexico (XRPL corridor)
/app/profile            Settings, notifications, language, connected wallets
/app/notifications      Notification center (payments, reminders, alerts)

── Admin (requires admin auth — separate from wallet) ──────
/admin                  Admin dashboard — platform health overview
/admin/pods             All pods — filter by status, chain, size
/admin/pods/:id         Single pod deep view + manual controls
/admin/users            Wallet management — flags, reputation, history
/admin/users/:wallet    Single wallet profile + full history
/admin/ambassadors      Ambassador roster, earnings, approval queue
/admin/insurance        Insurance pool — balance, draws, replenishment
/admin/disputes         Dispute queue — open, in review, resolved
/admin/revenue          Revenue reports — fees, yield, onramp commissions
/admin/waitlist         Email waitlist — view, export, send invites
/admin/content          Akademia content manager
/admin/treasury         Treasury wallets — addresses where fees are received per chain
/admin/settings         Platform settings — fee toggles, chain config
```

### Mobile-First Principles
- All primary user actions reachable within 2 taps
- Large tap targets — designed for non-technical users
- Spanish as the default language for onboarding flow
- QR code wallet connection (Xaman standard)
- Works on 4-year-old Android phones on slow mobile networks
- Admin is desktop-first (internal tool, not mobile-optimized)

Full page-by-page specs for both user app and admin in `docs/APP_SPEC.md`.

---

## 12. Revenue Model Summary

### Pilot Phase (now → Chicago launch)

Community first. Low friction. Build trust before charging.

| Source | Rate | Who Pays | When |
|--------|------|----------|------|
| Pod creation fee | **$2 flat** | Organizer | At deployment |
| Protocol payout fee | **$0 — waived during pilot** | — | — |
| Collateral yield share | 30% of yield | Protocol keeps (silent) | Pod completion |
| Fiat onramp referral | ~0.5–1% commission | Stripe/MoonPay pay us | Per purchase |

### Growth Phase (post-pilot)

| Source | Rate | Who Pays | When |
|--------|------|----------|------|
| Pod creation fee | $2 flat | Organizer | At deployment |
| Protocol payout fee | 1% of pot | Auto-deducted | Each cycle payout |
| Collateral yield share | 30% of yield | Protocol keeps | Pod completion |
| Fiat onramp referral | ~0.5–1% | Stripe/MoonPay pay us | Per purchase |
| Akademia Pro | $4.99/month | Individual users | Monthly |
| White-label | $299–799/month | Orgs/credit unions | Monthly |

**Why keep the $2 creation fee even during pilot:** It filters out bots and casual spam pods while being low enough that no genuine organizer hesitates. A real tanda organizer who is about to commit their community to a 10-week savings circle will not balk at $2.

Full detail in `docs/BUSINESS_MODEL.md`.

---

## 13. Tech Stack Summary

```
Frontend:     React 18 + Vite + Tailwind + i18next + PWA
              TanStack Table (admin) + Recharts + React Hook Form + Zod
XRPL:         xrpl.js + Xaman SDK + RLUSD + XRPL AMM (yield)
Ethereum:     Solidity + Hardhat + wagmi v2 + Chainlink VRF + Aave (yield)
Solana:       Rust + Anchor + @solana/wallet-adapter + Kamino (yield)
Onramp:       Stripe Crypto Onramp (Apple Pay / Google Pay) + MoonPay (XRP)
Backend:      Node.js / Express — pod indexer, fulfillment service, notifications
Database:     Supabase — pod metadata, reputation, user profiles, platform_settings
Notifications: WhatsApp Business API (Twilio) + Firebase (push) + Resend (email)
Hosting:      Vercel (frontend) + Railway (backend)

Environment:
  DEV:   XRPL Testnet + Ethereum Sepolia + Solana Devnet
         contracts.dev.json — test tokens only, no real funds
         Admin: orange DEV banner | User: TESTNET badge on all pods
         Share buttons disabled, notifications in sandbox mode
  LIVE:  XRPL Mainnet + Ethereum Mainnet + Solana Mainnet
         contracts.live.json — real RLUSD/USDC, real user funds
         Switched via 2-of-3 super_admin approval in admin settings
```

---

## 14. Roadmap

### Q1 2026 — Foundation
- [x] Architecture finalized, XRPL multisig pod account design confirmed
- [x] Marketing landing page live (index.html) — plain language, bilingual, Apple Pay highlighted
- [ ] React + Vite project scaffolded with Tailwind, i18next (ES/EN)
- [ ] Xaman wallet connection working
- [ ] Basic pod creation UI (XRPL only, testnet)
- [ ] Stripe Crypto Onramp integrated (`/app/buy`) — Apple Pay / Google Pay → USDC
- [ ] MoonPay fallback for XRP/RLUSD onramp
- [ ] WhatsApp notification service operational
- [ ] Waitlist email capture wired to Supabase/Resend
- [ ] 10 community ambassadors identified in Chicago

### Q2 2026 — MVP on XRPL Testnet
- [ ] Full XRPL pod lifecycle: create → join → contribute → payout → complete
- [ ] Default handling: collateral slash, auto-debit, insurance pool coverage
- [ ] Reputation score v1
- [ ] Akademia levels 1–5 in Spanish
- [ ] 5 pilot pods with real Chicago community members (testnet)
- [ ] WhatsApp integration live for notifications and reminders

### Q3 2026 — Mainnet + Multi-Chain
- [ ] XRPL mainnet launch (RLUSD, small pods, community users)
- [ ] Ethereum smart contracts deployed (Sepolia testnet → mainnet)
- [ ] Solana program deployed (devnet → mainnet)
- [ ] Chain selector UI
- [ ] Remittance corridor live (RLUSD → Mexico via Bitso)
- [ ] Ambassador program formal launch

### Q4 2026 — Scale
- [ ] Reputation-based collateral reduction (Phase 2)
- [ ] Insurance pool v2 (group pool, reduced individual collateral)
- [ ] White-label v1 (one pilot credit union partner)
- [ ] Akademia Pro launch
- [ ] Expand to Los Angeles, Houston, Miami
- [ ] 1,000 active pods target

---

## 15. Risks and Mitigations

| Risk | Reality | Mitigation |
|------|---------|-----------|
| Smart contract bug | Real — bugs in financial contracts cause real losses | Audits before mainnet, bug bounty, start small |
| XRPL centralization concern | Protocol signs payouts — introduces some trust | Hot wallet with minimum balance, transparent signing, roadmap to XRPL Hooks |
| Community distrust of code | Real — "I don't trust a computer with my money" | Ambassadors they trust vouch for the app. Akademia builds understanding. |
| Wallet confusion for new users | Real — seed phrases are scary | Xaman abstracts most complexity. In-person workshops by ambassadors. |
| Regulatory — money transmission | Evolving — ROSCA regulation varies by state | Non-custodial design, legal review per state, Illinois ROSCA laws reviewed |
| Bid-order = lending product | Real legal risk | Bid-order only enabled after legal clearance per jurisdiction |
| RLUSD / USDC depeg | Low probability, real risk | Conservative yield protocols only, insurance pool, user-chosen tokens |
| Organizer fraud | Most common real-world tanda failure | Organizer never touches funds. Smart contract holds everything. Protocol refund capped at $10K/incident, $50K/year — see `docs/BUSINESS_MODEL.md` Section 5. |
| Unlimited refund liability | Protocol promises refunds for fraud — could be exploited at scale | Hard caps in BUSINESS_MODEL.md. Governance vote required above cap. |
| Yield loss on collateral | Yield protocols (AMM, Aave, Kamino) can produce negative returns | Protocol guarantees full collateral return on all chains — absorbs any shortfall. |

---

## 16. Open Questions

1. **XRPL Hooks vs server-side fulfillment** — XRPL Hooks would make payout automation fully on-chain. Currently in beta. Server-side fulfillment is pragmatic for MVP but introduces centralization. Plan: server-side now, migrate to Hooks when stable.

2. **Identity layer** — fully pseudonymous (wallet only) vs optional identity (for credit reporting). Answer: fully pseudonymous at launch. Optional identity link (via World ID or similar) as a future upgrade for credit products.

3. **Pod minimums** — minimum 3 members to form a pod. Maximum 20. Reasoning: below 3, not a ROSCA. Above 20, coordination risk too high for MVP.

4. **Mobile app vs PWA** — PWA avoids App Store complexity and policy risk. Native app increases trust. Decision: PWA first, native app if adoption justifies it.

5. **Mexico expansion** — XRPL + Bitso makes this technically ready. Regulatory review for Mexican users needed. Post-Chicago priority.

---

*Version 2.1 — March 2026 (risk audit + fixes)*
*DeFi Tanda — Chicago, IL*

---

## 17. Yield Tanda Feature Plan

> Added April 2026. XRPL-only. Minimum 1-year lock. Collateral earns yield while the tanda runs.

### 17.1 Overview

Add a second tanda type at pod creation:

| Type | Cycles | Min Duration | Chain | Collateral |
|---|---|---|---|---|
| **Standard** | Weekly / Biweekly / Monthly | Any | XRPL + ETH | Sits idle in escrow |
| **Yield** | Monthly only | 12 months | XRPL only | Deployed into yield strategy |

At tanda completion, collateral is returned plus proportional yield share distributed to all members (minus a 10% protocol cut).

### 17.2 Yield Strategies

| Strategy | Protocol | Risk | Est. APY | Phase |
|---|---|---|---|---|
| **Vault (XLS-66d)** | XRPL Lending Protocol v3.1 | Low — Capital Protected | ~4–8% | Phase 2 |
| **AMM (XLS-30)** | XRPL Native AMM | Medium — Impermanent Loss | ~5–15% | Phase 3 |
| **Smart Escrow + Hooks** | XRPL Hooks (L1) | Very Low | TBD | Phase 5 |

### 17.3 Database Changes

**Migration 017 — add to `pods` table:**
```sql
create type tanda_type     as enum ('standard', 'yield');
create type yield_strategy as enum ('vault', 'amm', 'smart_escrow');

alter table public.pods
  add column tanda_type          tanda_type      not null default 'standard',
  add column yield_strategy      yield_strategy,
  add column lock_period_months  integer,
  add column yield_earned        numeric(18,6)   not null default 0,
  add column yield_deposited_at  timestamptz,
  add column yield_withdrawn_at  timestamptz,
  add column yield_position_id   text;

-- Constraints: yield tandas must be monthly and at least 12 members
alter table public.pods
  add constraint yield_requires_monthly
    check (tanda_type = 'standard' or (tanda_type = 'yield' and cycle_frequency_days = 30));
alter table public.pods
  add constraint yield_min_duration
    check (tanda_type = 'standard' or (tanda_type = 'yield' and size >= 12));
```

**Migration 018 — `pod_yield_snapshots`** (daily yield balance time-series for charts + audit)
```sql
create table pod_yield_snapshots (
  id               uuid primary key default uuid_generate_v4(),
  pod_id           uuid not null references pods(id) on delete cascade,
  snapshot_at      timestamptz not null default now(),
  balance_xrp      numeric(18,6) not null,
  yield_accrued    numeric(18,6) not null,
  yield_cumulative numeric(18,6) not null,
  apy_estimate     numeric(8,4),
  strategy         yield_strategy not null,
  raw_response     jsonb
);
```

**Migration 019 — `pod_yield_distributions`** (per-member payout record at completion)
```sql
create table pod_yield_distributions (
  id             uuid primary key default uuid_generate_v4(),
  pod_id         uuid not null references pods(id) on delete cascade,
  user_id        uuid not null references users(id),
  amount         numeric(18,6) not null,
  token          token_type not null,
  tx_hash        text,
  distributed_at timestamptz not null default now()
);
```

**Migration 020 — `platform_settings` config rows:**
```
vault_id_xrp_dev / vault_id_xrp_live       XLS-66d vault object IDs
vault_id_rlusd_dev / vault_id_rlusd_live    XLS-66d RLUSD vault IDs
amm_pool_account_dev / amm_pool_account_live XRPL AMM pool accounts
yield_poll_interval_h = 24
yield_protocol_fee_pct = 10
yield_feature_enabled = false               Feature flag
```

### 17.4 UI Changes

**CreatePod wizard — new Step 0 (Tanda Type):**
- Two cards: Standard (existing behavior) vs Yield (XRPL only, 12 mo min)
- Selecting Yield forces: `chain = XRPL`, `frequencyDays = 30`, `size min = 12`

**CreatePod wizard — new Step 2 (Yield Strategy, yield type only):**
- Three cards: Vault / AMM / Smart Escrow (Coming Soon)
- AMM card shows persistent impermanent loss warning
- APY shown as ranges, never fixed numbers

**CreatePod Review step (yield):**
- Shows lock period, collateral destination, estimated yield range
- Risk disclosure checkbox required before Deploy button enables
- AMM requires a second IL acknowledgement checkbox

**PodView — Yield Progress panel** (after cycle timeline, yield pods only):
```
YIELD STRATEGY  [badge]
Collateral Pool:      120 XRP
Yield Earned (est.):  3.47 XRP  (+2.9% APY)
Your Share:           0.58 XRP
Month 6 of 12
[Sparkline from pod_yield_snapshots]
```
AMM pods show: "⚠ Impermanent Loss Active" banner with Learn More.

**Dashboard:** Yield pods show extra line "Est. yield: 1.2 XRP · 3.1% APY".

**BrowsePods:** Type filter toggle "All | Standard | Yield".

### 17.5 Netlify Function Changes

| Function | Change |
|---|---|
| `create-xrpl-escrow.js` | After escrow created, call `yield-deposit` if `tandaType = 'yield'` |
| `yield-deposit.js` | **NEW** — dispatch to vault or AMM deposit. Keep slash reserve (2× contribution) in escrow before depositing. |
| `yield-poll.js` | **NEW scheduled** (daily 08:00 UTC) — snapshot yield balance for all active yield pods |
| `yield-withdraw.js` | **NEW** — close vault/AMM position, return funds to escrow wallet |
| `distribute-yield.js` | **NEW** — split `yield_earned` among active members (10% to protocol treasury) |
| `release-xrpl-collateral.js` | Pre-flight: call withdraw + distribute before existing collateral return logic |
| `check-overdue.js` | After slash logic, trigger yield poll for yield pods |

**Slash reserve:** Before depositing collateral into yield, keep `contribution_amount × 2` in the escrow wallet to fund slash payments. Only the remainder goes to yield. If reserve is exhausted by defaults, emergency-withdraw from yield position.

### 17.6 XRPL Integration

**XLS-66d Vault deposit/withdraw:**
```js
// Deposit
{ TransactionType: 'VaultDeposit', Account: escrow.address, VaultID, Amount: xrpToDrops(amount) }
// Balance query (new RPC)
client.request({ command: 'vault_info', vault_id: VaultID, account: escrow.address })
// Withdraw all
{ TransactionType: 'VaultWithdraw', Account: escrow.address, VaultID, Amount: MAX_UINT256 }
```

**XLS-30 AMM single-sided deposit/withdraw:**
```js
// Deposit XRP single-sided (tfSingleAsset flag)
{ TransactionType: 'AMMDeposit', ..., Amount: xrpToDrops(amount), Flags: 0x00080000 }
// Balance: amm_info → shareRatio × pool.amount
// Withdraw all LP tokens (tfLPToken flag)
{ TransactionType: 'AMMWithdraw', ..., LPTokenIn: { value: fullLpBalance }, Flags: 0x00010000 }
```

Store LP token currency + issuer in `pods.yield_position_id` (JSON string).

**Impermanent loss formula for display:**
```
IL% = (2 × sqrt(priceRatio) / (1 + priceRatio)) − 1
```
Entry price ratio stored in `raw_response` of first snapshot.

### 17.7 Risk Disclosures Required

| Touchpoint | Disclosure |
|---|---|
| Type selection card | "Early exit not available once active" |
| Strategy selection (AMM) | Impermanent loss warning (always visible) |
| Review step | Lock period + completion date; risk checkbox |
| Review step (AMM) | Second IL acknowledgement checkbox |
| PodView header | "Yield Tanda · Unlocks {date}" |
| PodView panel (AMM) | Live IL estimate; "Learn More" modal |
| Join modal | Explicit checkbox for lock period |

**Yield disclaimer (all touchpoints):** "APY estimates are not guaranteed. Past performance does not predict future yield."

**Capital protection labels:**
- Vault → "Capital Protected" (green)
- AMM → "Capital at Risk" (amber)

### 17.8 db.js Changes

```js
// Extend createPod with new fields
createPod({ ..., tanda_type = 'standard', yield_strategy = null, lock_period_months = null })

// New helpers
getYieldSnapshots(podId, limit = 30)    // → pod_yield_snapshots ordered desc
getYieldDistributions(podId)             // → pod_yield_distributions with user join
updatePodYieldPosition(podId, fields)    // → update yield_position_id + yield_deposited_at
```

### 17.9 i18n — New `yield` section

Add to `en.json` and `es.json`:
```json
"yield": {
  "typeStepTitle": "Choose Tanda Type",
  "standard": "Standard Tanda",
  "standardSub": "Short-term · Weekly or monthly cycles",
  "yieldTanda": "Yield Tanda",
  "yieldSub": "Long-term · Monthly cycles · Minimum 12 months",
  "strategyTitle": "Choose Yield Strategy",
  "vault": "XRPL Vault (XLS-66d)",
  "vaultSub": "Institutional lending vault. Low risk, predictable yield.",
  "vaultRisk": "Low Risk",
  "amm": "AMM Liquidity (XLS-30)",
  "ammSub": "Single-sided AMM liquidity. Earn trading fees.",
  "ammRisk": "Medium Risk",
  "smartEscrow": "Smart Escrow + Hooks",
  "lockPeriod": "Lock period: {{n}} months",
  "minDuration": "Minimum 12 months required for yield tandas.",
  "ammWarning": "AMM pools carry impermanent loss risk.",
  "capitalProtected": "Capital Protected",
  "capitalAtRisk": "Capital at Risk",
  "earnedSoFar": "Yield earned so far",
  "yourShare": "Your estimated share",
  "apy": "Est. APY",
  "disclaimer": "APY estimates are not guaranteed.",
  "ilWarning": "Impermanent Loss Active",
  "ilExplainer": "Your collateral is in an AMM pool. Final value depends on price movements.",
  "riskAck": "I understand this is a {{n}}-month commitment and I accept the yield strategy risks.",
  "completionDate": "Unlocks {{date}}",
  "comingSoon": "Coming Soon"
}
```

### 17.10 Phased Build Order

```
Phase 1 — Foundation (Weeks 1–4)        ← Start here
  Apply migrations 017–020
  Extend createPod in db.js
  Add Step 0 (type) + Step 2 (strategy) to CreatePod wizard
  Add i18n keys
  Feature flag OFF — standard users unaffected

Phase 2 — Vault Strategy (Weeks 5–8)    ← Requires XLS-66d devnet
  yield-deposit.js (vault branch)
  yield-poll.js (scheduled)
  yield-withdraw.js (vault branch)
  distribute-yield.js
  Modify create-xrpl-escrow + release-xrpl-collateral
  PodView yield progress panel + sparkline
  Devnet end-to-end: 12-member vault tanda full lifecycle

Phase 3 — AMM Strategy (Weeks 9–12)     ← XLS-30 already live
  yield-deposit.js (AMM branch)
  yield-withdraw.js (AMM branch)
  IL calculation in yield-poll.js
  PodView IL banner + info modal
  Slash reserve logic
  Devnet: AMM tanda with simulated member default

Phase 4 — Mainnet Readiness (Weeks 13–16)
  Escrow seed KMS encryption (replace plaintext in DB)
  Populate vault IDs + AMM accounts for mainnet
  Admin yield health dashboard
  Security audit of deposit/withdraw/distribute functions
  Feature flag ON for beta users

Phase 5 — Smart Escrow + Hooks (Future)
  Blocked on XRPL Hooks mainnet availability
```

### 17.11 Key Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| XLS-66d vault RPC not finalized | Medium | Abstract behind `vaultClient` interface; one-file swap |
| AMM withdrawal yields RLUSD, member has no trust line | High | Phase 3: swap RLUSD→XRP on withdrawal, or require trust line to join AMM pod |
| Slash reserve exhausted by multiple defaults | Medium | Keep 2× contribution in escrow before depositing; emergency withdraw if reserve runs out |
| Impermanent loss erodes collateral principal | Low short-term | AMM labeled "Capital at Risk"; explicit checkbox; consider capping AMM allocation at 80% of collateral |
| `yield-poll` timeout with many pods | Low | Process one pod per invocation; add queue in Phase 3 |
