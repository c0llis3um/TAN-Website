# DeFi Tanda — Business Model

> How the protocol generates sustainable revenue while remaining fair and accessible to the communities it serves.

---

## 1. Core Philosophy

Every fee in the protocol must answer one question: **does this fee make the tanda safer or better for the members?**

We do not extract value from people who are saving. We charge for the infrastructure, enforcement, and trust that makes the tanda work better than the informal version. If a fee cannot be justified on those terms, it does not exist.

The informal tanda organizer sometimes takes 1–2% for their time. We take 1% and in return we eliminate fraud, enforce accountability, automate payouts, and insure against defaults. Members pay the same or less for a dramatically better product.

---

## 2. Revenue Streams

### 2.1 Pod Creation Fee

**Who pays:** The organizer who deploys the pod.

**What it covers:** Protocol infrastructure, pod indexing, notification service, reputation system overhead, and initial contribution to the insurance pool.

#### Pilot Phase (now → Chicago public launch)

**$2 flat across all chains and pod types.**

The priority during pilot is adoption, not revenue. $2 is low enough that no genuine organizer hesitates. It filters bots and spam pods without creating friction for the community we are trying to serve.

| Chain | All Pods | Notes |
|-------|----------|-------|
| XRPL | 2 RLUSD | Flat rate, pilot |
| Ethereum | 2 USDC | Flat rate, pilot |
| Solana | 2 USDC | Flat rate, pilot |

#### Growth Phase (post-pilot)

| Chain | Community Pod | Public Pod | Notes |
|-------|--------------|-----------|-------|
| XRPL | 3 RLUSD | 5 RLUSD | Community pods get discount — lower risk |
| Ethereum | 5 USDC | 10 USDC | Higher due to gas costs |
| Solana | 1 USDC | 2 USDC | Low due to Solana's low fees |

**Why charge the organizer, not members:**
The organizer is starting a financial operation. Members are savers. Charging members at join creates friction at the exact moment of adoption. The organizer is already paying gas/transaction costs and their time — this fee is their platform cost.

**Fee variations (growth phase):**
- **Church / non-profit orgs:** Free (verified with documentation)
- **Micro tandas** (pot under $300 total): 50% discount — encourage first-time adoption
- **Ambassador organizers:** Free — ambassadors grow our network, we cover their creation fees

**Insurance pool allocation:** 20% of every creation fee is added to the insurance pool immediately at pod creation. This is how the pool gets seeded per pod from day one.

---

### 2.2 Protocol Fee on Payouts

**Pilot phase: $0 — waived entirely.**

We do not charge a payout fee during the pilot. The community needs to trust the product before they pay for it. Introducing a fee on day one creates resistance at the worst possible moment. We earn through yield and onramp referrals during pilot (both invisible to members).

The payout fee is introduced in the growth phase once trust is established and value is proven.

**Growth phase rate: 1% of pot value**

```
Example — 10 members, $100/week, 10 weeks:
  Gross pot each cycle:   $1,000
  Protocol fee (1%):      $10
  Member receives:        $990

  Over the full pod (10 payouts):
    Total protocol revenue:  $100
    Total member cost each:  $10 (paid once, when they receive their payout)
```

**This is the primary and most important revenue source.** It scales directly with protocol volume.

**Why 1% is fair:**
- Western Union: 3–7% for remittances
- Traditional organizer: 1–2% informally, no enforcement
- DeFi Tanda 1%: guaranteed payout, fraud-proof, default insurance, automated — objectively better value

**Fee distribution — every payout:**
```
1% of pot splits as:
  0.50% → Protocol treasury (operations, development, team)
  0.30% → Insurance pool (covers defaults, always pays winner on time)
  0.20% → Reputation rewards pool (paid to top performers monthly)
```

**Community pod discount:** 0.75% fee (vs 1%) — lower risk justifies lower fee. Breakdown: 0.40% treasury / 0.25% insurance / 0.10% rewards.

---

### 2.3 Collateral Yield

**Mechanism:** Collateral deposited at pod join does not sit idle. It earns yield through conservative, established protocols while locked.

| Chain | Yield Source | Conservative Est. APY |
|-------|-------------|----------------------|
| XRPL | RLUSD in XRPL AMM liquidity pools | 3–5% |
| Ethereum | USDC in Aave v3 | 4–6% |
| Solana | USDC in Kamino Finance | 4–7% |

**Split on all yield earned:**
```
70% → returned to the member at pod completion (with their collateral)
30% → protocol treasury
```

**Why this works for members:** A member depositing $200 collateral in a 10-week pod at 4% APY earns ~$1.54 over the pod. Small — but it turns the collateral from a pure cost into a slight positive. This matters psychologically for adoption.

**Why this works for the protocol:** At scale, idle collateral across thousands of pods generates meaningful passive revenue with no additional cost to members.

**Risk management:** Only established, battle-tested yield protocols are used. No experimental or high-yield protocols. Yield is secondary to capital preservation.

---

### 2.4 Community Ambassador Program

This is both a revenue and a distribution strategy — our most important one.

**Who ambassadors are:** Community members who already run tandas. They have established trust in their neighborhood, church, workplace, or social circle. They are the reason people will try this app.

**What ambassadors earn:**
```
Base earnings:
  0.10% of every payout in pods they create
  (Paid from protocol's 0.50% treasury share — not from members)
  Paid monthly in the pod's stablecoin
  Cap: $500/month per ambassador (anti-gaming)

Bonus earnings:
  $10 USDC for every new wallet that completes their first pod
  (Completion bonus, not signup bonus — aligns incentive with quality)

Benefits:
  Akademia Pro free
  Free creation fees
  Verified Organizer badge
  Priority support channel
  Quarterly community call with team
```

**Revenue math from ambassadors:** An ambassador who runs 5 active pods (40 members total, $150 avg contribution, monthly cycle) generates $6,000/month in payouts → 0.50% treasury share = $30/month to protocol, $12/month to ambassador. At 100 ambassadors, this is $3,000/month from ambassador pods alone — before the network effects of the communities they bring in.

**The flywheel:** Ambassadors earn more by running more pods → they recruit more community members → more pods → more revenue → protocol can pay more ambassadors. This is how tandas already spread. We are formalizing and rewarding the existing behavior.

---

### 2.5 Fiat Onramp Referral

**Source:** Stripe Crypto Onramp and MoonPay pay commission on every purchase made through the app's embedded widgets.

**Rate:** ~0.5–1% of each purchase, paid by the provider — not by the user.

**How it works:**
- User clicks "Buy with Apple Pay" in the app
- Stripe or MoonPay widget opens (embedded, same screen)
- User pays with Apple Pay / Google Pay / debit card
- Dollars converted to USDC or XRP, sent to their wallet
- Provider pays us ~0.5–1% of the transaction as referral commission

**Why this matters for the pilot:** This is passive revenue from day one with zero cost to users. A user who buys $200 USDC to join a pod generates $1–$2 in referral revenue — equal to the creation fee — without the organizer or member paying anything extra.

**Projections:**
```
100 users onboarding/month, avg $150 purchase → $15,000/month in onramp volume
At 0.7% avg commission → $105/month
1,000 users → $1,050/month
10,000 users → $10,500/month
```

Small at pilot scale — meaningful at growth scale and requires no additional work from us.

---

### 2.6 Premium Pod Features

One-time fees paid by organizers for optional enhancements.

| Feature | Price | Description |
|---------|-------|-------------|
| Featured listing | 15 USDC | Pod appears at top of public marketplace for 7 days |
| Recurring pod | 20 USDC | Auto-restarts pod with same members when cycle completes |
| Extended grace period | 10 USDC | 72-hour grace vs 24-hour default |
| Pod analytics dashboard | 8 USDC/month | Payment stats, member scores, cycle history export |
| Custom invite page | 5 USDC | Branded pod page at tanda.app/[name] with pod details |
| WhatsApp group sync | Free | Automatic — included with all pods |

---

### 2.7 Akademia Pro — Financial Education

**Free tier (always free, always Spanish + English):**
- What is a tanda? (levels 1–3)
- How to set up Xaman wallet
- How to join your first pod
- Basic security guide (seed phrases, phishing)
- Remittance guide (how to send to Mexico via XRPL)

**Pro tier: $4.99/month or $39/year**

| Module | Content |
|--------|---------|
| DeFi basics | Yield, liquidity pools, stablecoins — explained without jargon |
| Credit building | How on-chain reputation translates to real-world credit access |
| Crypto taxes | How to report USDC/RLUSD savings and income in the US |
| Remittance optimization | Best corridors for every Latin American country |
| Live workshops | Monthly Zoom in Spanish — Q&A, live demos |
| Organizer certification | Complete to become a Verified Organizer |

**Why this matters:** Akademia Pro converts one-time tanda users into financially empowered community members. That is the mission. It also generates recurring revenue with essentially zero marginal cost per user.

---

### 2.8 White-Label Protocol

**Target:** Latino credit unions, community development financial institutions (CDFIs), churches with financial ministry programs, employer benefits platforms, NGOs.

These organizations have the trust networks we need. We have the infrastructure they need.

| Tier | Monthly | Includes |
|------|---------|---------|
| Community | $299 | Up to 100 pods, our branding, basic dashboard |
| Partner | $799 | Up to 1,000 pods, custom branding, full analytics, priority support |
| Enterprise | Custom | Unlimited pods, custom smart contracts, dedicated integration team |

**Revenue share for white-label partners:**
```
Partner keeps: 60% of protocol payout fees from their pods
Protocol keeps: 40% + full creation fees
```

**Why credit unions specifically:** Illinois has a strong network of Latino credit unions (Self-Help Federal Credit Union, Midwest BankCentre, etc.). They already serve this community and are looking for digital savings products. A branded "Mi Tanda" feature powered by DeFi Tanda is a natural product extension for them. They bring 10,000 members; we bring the rails.

---

### 2.9 Remittance Corridor Revenue

XRPL enables near-zero-cost transfers from Chicago to Mexico in under 10 seconds. Bitso (Mexico's largest crypto exchange) operates on XRPL and converts to MXN/SPEI.

**Revenue model:** Revenue-sharing partnership with XRPL-based corridor operators. We connect users to the best available rate. If a user sends $990 RLUSD to Mexico after receiving their tanda payout, we earn a small fee share from the corridor provider (not from the user).

**This is not our primary revenue stream.** It is a natural extension of the XRPL workflow that creates value for users (they save on remittance fees) and generates passive revenue for the protocol.

---

## 3. Insurance Pool — Capitalization

The insurance pool is what makes the protocol trustworthy. It must be adequately funded before any mainnet pods go live.

**Initial seeding:**
```
Pre-launch:
  Protocol treasury seeds pool with $25,000 USDC equivalent
  (From initial funding / grants / early revenue)

At launch:
  20% of every creation fee → insurance pool
  0.30% of every payout → insurance pool
  30% of every default collateral slash → insurance pool

Target maintained balance: $50,000 USDC minimum at all times
Auto-alert: if pool drops below $50,000, protocol pauses new pod creation
  until replenished
```

**Pool health is public.** Anyone can check the balance on-chain at any time. Monthly reports published with pool inflows, outflows, and coverage statistics.

---

## 4. Revenue Projections

### Pilot Phase Assumptions
```
Creation fee (pilot):   $2 flat
Payout fee (pilot):     $0
Onramp referral:        ~0.7% avg commission
Avg onramp purchase:    $150 per new user
Collateral yield:       30% of 4–5% APY on locked collateral
```

| Stage | Active Pods | New Users/Month | Monthly Revenue |
|-------|-------------|-----------------|----------------|
| Pilot — Chicago (Q2 2026) | 20 | 60 | ~$150 (creation + onramp referral) |
| City-wide Chicago (Q3 2026) | 150 | 300 | ~$2,000 |
| Payout fee introduced (Q4 2026) | 400 | 600 | ~$8,000 |
| 3 cities + white-label (2027) | 2,000 | 2,000 | ~$50,000 |
| National + international (2028) | 10,000 | 8,000 | ~$200,000 |

### Growth Phase Assumptions
```
Average community pod:  6 members, $100 contribution, 6-week cycle, $600 pot
Average public pod:     8 members, $150 contribution, 8-week cycle, $1,200 pot
Blend:                  7 members, $120 contribution, 7-week cycle, $840 pot
Per-pod total payout:   $840 × 7 cycles = $5,880
Protocol fee (1%):      $58.80 per pod over its lifetime
Creation fee:           $2–5 average
Total per pod:          ~$61
```

Add Akademia Pro, white-label, and collateral yield at scale: $300K+ monthly by 2028 is achievable without aggressive growth assumptions.

---

## 5. Organizer Fraud Liability Cap

The protocol commits to refunding members affected by proven organizer fraud. This commitment has a defined cap to ensure the protocol remains solvent.

```
Per-incident cap:    $10,000 USDC equivalent per fraudulent pod
                     (covers up to ~10 members at $1,000 contribution each)

Aggregate cap:       $50,000 USDC per calendar year across all fraud incidents
                     beyond which the insurance pool is drawn as backup

If both caps are exceeded:
  → Governance vote on pro-rata refund distribution
  → Protocol publishes full incident report within 7 days
  → Bug bounty or legal recovery pursued against fraudulent organizer
```

**Why a cap:** An unlimited refund commitment creates an unbounded liability that could be exploited — an attacker could create many fraudulent pods simultaneously to drain the treasury. The cap ensures the protocol survives any single incident or coordinated attack while still making affected members substantially whole.

**What the cap means in practice:** For the pod sizes we expect during the pilot ($100–$500 contributions, 3–10 members), the $10,000 per-incident cap fully covers every realistic scenario. The cap only becomes relevant for large pods with high contributions.

---

## 6. What We Commit to Never Doing

- Charging members to join a pod
- Taking any cut of members' collateral
- Charging fees on failed or dissolved pods
- Selling user data to any third party
- Adding undisclosed fees in smart contracts
- Taking a spread on token swaps
- Enabling bid-order pods without legal clearance per jurisdiction

Every fee is disclosed in this document, in `docs/USER_AGREEMENT.md`, and is verifiable on-chain. If the protocol ever charges something not on this list, it is a bug.

---

*Version 2.1 — March 2026 (risk audit + fixes)*
*DeFi Tanda — Chicago, IL*
