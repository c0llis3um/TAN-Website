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
