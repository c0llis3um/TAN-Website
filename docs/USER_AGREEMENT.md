# DeFi Tanda — Member & Organizer Agreement

> Every participant — member and organizer — agrees to these rules when they sign a pod transaction on-chain. The transaction hash is your signature. The smart contract is the enforcement.

---

## Plain Language Summary — Read This First

**¿Qué estás aceptando? / What are you agreeing to?**

### If you are JOINING a Tanda Pod:

1. **You lock a deposit (collateral).** You get it back when the tanda finishes — plus a small amount of interest it earned while locked.

2. **You agree to pay every cycle.** Weekly, biweekly, or monthly — whatever the pod requires. You pay the full amount, on time, every time.

3. **If you miss a payment:**
   - Part of your deposit is permanently lost
   - You lose your turn to receive the pot
   - Your wallet gets a mark that affects your ability to join future tandas
   - The more you miss, the more you lose

4. **You cannot leave once the tanda starts.** Once all members have joined and the tanda locks, you are committed until it ends.

5. **During the pilot: no payout fee.** You receive the full pot when your turn comes. A 1% protocol fee may be introduced in a future version — you will be notified before it takes effect on any pod you are in.

6. **Your payout is guaranteed.** Even if someone else in your group does not pay, you receive your full pot on your scheduled cycle. The insurance system covers defaults automatically.

7. **What you need upfront (example — $100/week pod):**
   - Security deposit (collateral): $200 — returned to you at the end with interest
   - First week's contribution: $100 — goes into the pot
   - **Total upfront: $300**
   - Every week after: $100 only

---

### If you are CREATING a Tanda Pod:

1. **You pay a creation fee.** This is non-refundable once the pod is deployed.

2. **You never touch the money.** The smart contract holds all funds. You configure the tanda but you cannot access member contributions or collateral.

3. **For private pods:** You are responsible for who you invite. Inviting people who default reflects on your reputation.

4. **You cannot change the rules after the pod is live.** Pod parameters are permanent from deployment.

5. **No fraud.** Do not accept side payments for early payout slots. Do not create fake members. This results in a permanent ban and members get fully refunded by the protocol.

---

### On all chains and all pods:

- Blockchain transactions are **permanent and irreversible**
- The smart contract is the final authority — not customer service
- Only use money you genuinely do not need access to for the pod's full duration
- This is decentralized finance — you are in control, which also means you are responsible

---

## Part 1 — Definitions

| Term | What it means |
|------|--------------|
| Protocol | DeFi Tanda — the smart contracts and services that run tandas on-chain |
| Pod | One tanda group deployed on a blockchain |
| Organizer | The wallet that creates and configures the pod |
| Member | Any wallet that joins a pod, including the organizer |
| Contribution | The fixed amount paid each cycle by every member |
| Collateral | Security deposit locked at join. Returned with yield at pod completion. |
| Pot | Total contributions from one cycle, paid to one member |
| Cycle | One period — contributions collected, one winner paid |
| Grace Period | Window after cycle close where late payment is still accepted (24–72h) |
| Default | Failure to contribute before the grace period expires |
| Slash | Permanent loss of a portion of collateral, triggered by default |
| Auto-Debit | After default, remaining collateral automatically covers future contributions |
| Reputation Score | On-chain record of payment history, visible to pod organizers |
| Protocol Fee | 1% of pot, deducted automatically at each payout |
| Insurance Pool | Shared fund that covers missing contributions so winners always get paid |
| Community Pod | Private, invite-only pod between people who know each other |
| Public Pod | Open pod where strangers form a group via reputation matching |

---

## Part 2 — Member Agreement

### 2.1 I Understand the Financial Commitment

By signing the join transaction, I confirm I have reviewed and understood:

- The contribution amount and how often I must pay
- The total duration of the pod
- The collateral amount I am locking (and that I get it back at the end)
- That I may not receive my payout until late in the cycle rotation
- That early payout = interest-free loan; late payout = forced savings plan — both are fine outcomes

I confirm I have funds available for every contribution for the full pod duration, and that I am not joining with money I need for rent, groceries, medical expenses, or other essential costs.

### 2.2 I Commit to Paying Every Cycle

I will submit my full contribution amount before the grace period expires, every cycle.

I understand:
- Partial payments are rejected and returned immediately
- The cycle window operates on UTC time — I am responsible for paying across any timezone
- Device problems, internet outages, or forgetting are not accepted as reasons for missed payment
- Only a verified blockchain network outage (documented independently) may qualify for an extension, and must be disputed within 72 hours

### 2.3 First-Time User Grace (One-Time Policy)

If this is my very first missed payment ever (reputation score < 10, zero prior defaults on this wallet), I receive one 6-hour extension before default is formally declared. I will be notified immediately via WhatsApp and push with instructions to pay.

This happens **once per wallet, ever.** If I receive this grace and still do not pay within the 6-hour window, the full default consequences below apply normally.

---

### 2.4 I Accept the Consequences of Default

If I miss a payment and the grace period expires:

**What happens to my collateral:**
```
1st default in this pod:
  25% of my original collateral is permanently slashed.
  Remaining collateral automatically covers my future contributions
  until exhausted.

2nd default in this pod:
  50% of my remaining collateral is permanently slashed.
  Auto-debit continues on what remains.

Collateral exhausted (3rd default or complete depletion):
  All remaining collateral slashed.
  I am permanently removed from this pod.
  I receive nothing — no collateral, no payout.
```

**What happens to my payout right:**
After my first default in a pod, I permanently lose the right to receive a payout in that pod. My slot is handled according to the method the organizer selected.

**What happens to my wallet:**
```
My 1st ever default (any pod):   Yellow flag
My 2nd ever default (any pod):   Orange flag — restricted from public pods, 90 days
My 3rd ever default (any pod):   Red flag — restricted from all pods, 12 months
My 4th ever default (any pod):   Black flag — permanently restricted
```

Flags are cumulative across my entire history, not per-pod.

**I cannot dispute or reverse these consequences.** They are automatic and final unless I successfully prove a technical failure via the dispute process.

### 2.5 The Auto-Debit Mechanism

After my first default, I do not need to do anything. My remaining collateral automatically covers my future contributions each cycle. I am not required to manually pay, but:

- I still receive notifications as if I were paying normally
- I may choose to pay manually each cycle (which does not trigger additional deductions)
- If my collateral runs out before the pod ends, I am removed from the pod

This mechanism protects other members — the pod continues uninterrupted regardless of my situation.

### 2.6 I Understand My Payout Is Guaranteed

My payout, when my cycle arrives, will be distributed on schedule — even if other members have defaulted. The insurance pool covers any missing contributions. My full pot (no payout fee during pilot) arrives in my wallet on time.

I will receive a WhatsApp message (if opted in) and push notification when my payout is sent.

### 2.7 I Cannot Leave After Lock

Once all member slots are filled and the pod locks, I am committed. There is no emergency exit. There is no withdrawal. If I stop participating, the default rules apply. I enter a pod only if I am certain I can complete it.

### 2.8 Protocol Fee — Pilot vs Growth Phase

**During the pilot:** No payout fee. I receive the full pot amount when my turn comes. On a $1,000 pot, I receive $1,000.

**After the pilot:** A 1% protocol fee will be introduced. On a $1,000 pot, I receive $990. I will be notified before this takes effect and any pod I am currently in will honor the fee structure that was active when I joined.

### 2.9 My Collateral Earns Yield — and Is Always Returned in Full

While my collateral is locked, it earns yield in conservative protocols (XRPL AMM, Aave v3, or Kamino depending on chain). 70% of this yield is returned to me with my collateral at pod completion. 30% goes to the protocol.

**I will always receive at least my full original collateral amount back.** If yield is negative for any reason on any chain — impermanent loss, rate drops, or any other scenario — the protocol absorbs the difference. I cannot receive less than I deposited. This guarantee applies on XRPL, Ethereum, and Solana equally.

### 2.10 I Am Responsible for My Wallet

I am solely responsible for:
- The security of my private key and seed phrase
- All transactions signed from my wallet
- Keeping my wallet software updated
- Not sharing access to my wallet with anyone

If my wallet is compromised and used to miss payments, the default penalties apply to my wallet address regardless of who was responsible.

---

## Part 3 — Organizer Agreement

### 3.1 My Role as Organizer

As organizer, I configure the pod and (for community pods) curate the members. I do not control any funds. My responsibilities are:

- Set accurate, fair pod parameters
- Communicate all rules clearly to members before they join
- (Community pods) Invite only members I genuinely trust
- Not accept any payment or compensation for assigning payout slots

### 3.2 I Cannot Change Pod Parameters

Once the pod is deployed, all parameters are permanent. Members join based on what they read. I cannot change:
- Contribution amount
- Cycle duration or frequency
- Number of members or collateral requirement
- Payout order method
- Slot reallocation method

### 3.3 Payout Order is Tamper-Proof

**Random method:** Determined by on-chain verifiable randomness at pod lock. I cannot see, predict, or influence it.

**Fixed method:** I set all payout slots before any member joins. All assignments are recorded on-chain before the first member can see the pod. I cannot change them after deployment. I confirm I have not received, will not receive, and have not promised compensation to any member in exchange for a particular slot assignment.

**Bid method:** Members set their own bids. I receive no portion of bid proceeds. All bids go to other members or the insurance pool as documented.

### 3.4 Anti-Fraud Commitments

I will not:
- Create wallet addresses I control to fill member slots
- Accept money, goods, or services in exchange for payout slot assignments
- Misrepresent pod terms, token types, contribution amounts, or cycle schedules
- Collude with any member to manipulate outcomes

**If I violate any of the above:**
- All my active pods are paused immediately
- Governance review within 72 hours
- If proven: permanent ban from organizer role, -500 reputation points, Black flag
- All affected members receive a full refund at protocol expense

### 3.5 Community Pod — Member Curation Responsibility

If I create a private community pod, I am vouching for the people I invite. If members I personally invited default at abnormally high rates in the same pod, my reputation score is affected (-10 points per excess defaulter beyond the first). I invite people I trust, not people I want to do a favor for.

### 3.6 My Creation Fee is Non-Refundable

The creation fee is paid when the pod is deployed. It is not returned if:
- The pod never fills (CANCELLED state — members' collateral is returned, not the creation fee)
- Members default
- I change my mind

**Exception:** If the protocol force-dissolves the pod due to a smart contract vulnerability or regulatory action, the creation fee is refunded.

---

## Part 4 — All Fees — Complete Disclosure

No hidden fees exist. Every fee is listed here and verifiable on-chain.

### Pilot Phase Fees (current)

| Fee | Amount | Who Pays | When | Goes To |
|-----|--------|----------|------|---------|
| Pod creation — all chains | **$2 flat** | Organizer | At deployment | Treasury + insurance pool |
| Protocol payout fee | **$0 — waived during pilot** | — | — | — |
| Collateral yield share | 30% of yield earned | Protocol keeps (silent) | Pod completion | Protocol treasury |
| Default collateral slash | 25–100% of collateral | Defaulting member | At grace period expiry | Other members / insurance / treasury |
| Akademia Pro | $4.99/month | Individual user | Monthly | Protocol treasury |

### Growth Phase Fees (post-pilot)

| Fee | Amount | Who Pays | When | Goes To |
|-----|--------|----------|------|---------|
| Pod creation — XRPL | 3–5 RLUSD | Organizer | At deployment | Treasury + insurance pool |
| Pod creation — Ethereum | 5–10 USDC | Organizer | At deployment | Treasury + insurance pool |
| Pod creation — Solana | 1–2 USDC | Organizer | At deployment | Treasury + insurance pool |
| Protocol payout fee | 1% of pot (0.75% community pod) | Winner — deducted automatically | Each cycle payout | Treasury / insurance / rewards |
| Collateral yield share | 30% of yield earned | Protocol keeps | Pod completion | Protocol treasury |
| Default collateral slash | 25–100% of collateral | Defaulting member | At grace period expiry | Other members / insurance / treasury |
| Premium features | Varies | Organizer | At selection | Protocol treasury |
| Akademia Pro | $4.99/month | Individual user | Monthly | Protocol treasury |

**There are no other fees.** If any fee not listed above appears in a transaction, report it immediately — it is a bug or an exploit.

---

## Part 5 — Risks

### 5.1 Smart Contract Risk

Smart contracts are code. Code can have bugs. We audit all contracts before mainnet launch and maintain a public bug bounty program. Despite this:

- There is a non-zero probability of an undiscovered vulnerability
- If a critical vulnerability is discovered, pods are paused and funds protected to the best of our ability
- We cannot guarantee full recovery in an exploit scenario
- By participating, you accept this risk

### 5.2 Stablecoin Risk

Pods use RLUSD, USDC, or USDT — USD-pegged stablecoins. These tokens maintain their peg through reserves, smart contracts, or algorithms. They are not government-insured.

- A stablecoin could theoretically lose its USD peg
- We are not responsible for stablecoin issuer decisions or failures
- RLUSD (Ripple) and USDC (Circle) are among the most regulated and audited stablecoins available

### 5.3 Network Risk

Blockchain networks can experience congestion, outages, or forks. We have policies for verified outages (see PROTOCOL_RULES.md). However:

- You are responsible for paying gas/transaction fees on Ethereum
- High congestion may make transactions expensive — plan accordingly
- Network timing events outside our control are your responsibility unless formally disputed

### 5.4 Regulatory Risk

DeFi regulation is evolving rapidly. What is legal today may be regulated differently in the future. You are responsible for understanding whether participation is legal in your jurisdiction. We maintain legal review for our primary markets but cannot guarantee compliance for every jurisdiction.

---

## Part 6 — Dispute Resolution Summary

For technical failures (blockchain outage caused missed payment):
- Submit dispute within 72 hours with block explorer evidence
- Review takes up to 96 hours
- If approved, cycle window extended retroactively

For organizer fraud:
- Submit dispute with transaction evidence
- Governance review within 72 hours
- If proven, full refund to members at protocol expense

For voluntary non-payment:
- Not disputable. Default rules apply.

Full dispute process: see `docs/PROTOCOL_RULES.md` Section 13.

---

## Part 7 — Your Acknowledgment

By submitting the join or create transaction on-chain, you confirm:

1. You have read this agreement in full (or had it explained to you by a trusted person)
2. You understand the contribution schedule and financial commitment you are making
3. You have funds available for all contributions without borrowing or hardship
4. You accept that default consequences are automatic and non-negotiable
5. You understand blockchain transactions are irreversible
6. You are 18 years or older (or the age of legal majority in your jurisdiction)
7. The funds you are using are legitimately yours and not proceeds of illegal activity
8. You are not on any government or international sanctions list
9. You understand this protocol operates without traditional customer service — disputes go through on-chain governance

**The transaction hash from your join or create transaction is your permanent, irrevocable signature to these terms.**

---

*Version 2.1 — March 2026 (risk audit + fixes)*
*DeFi Tanda Protocol — Chicago, IL*

---

> **Para miembros que prefieren leer en español:**
> Una versión en español de este acuerdo está disponible en `/docs/USER_AGREEMENT_ES.md`
> y en la aplicación bajo Configuración → Idioma → Español.
> El acuerdo legal es idéntico — solo el idioma cambia.
