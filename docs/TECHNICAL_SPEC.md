# DeFi Tanda — Technical Specification

> Detailed technical reference for the DeFi Tanda protocol implementation across XRPL, Ethereum, and Solana.

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend (React PWA)                      │
│         Spanish / English  |  Mobile-first  |  Installable   │
└────────────┬─────────────────────────────────────┬───────────┘
             │                                     │
      ┌──────▼──────┐                       ┌──────▼──────┐
      │   Wallet    │                       │   Backend   │
      │  Adapters   │                       │  (Node.js)  │
      │ XRPL/ETH/   │                       │  Indexer    │
      │  Solana     │                       │  Notifier   │
      └──────┬──────┘                       │  Fulfiller  │
             │                              └──────┬──────┘
  ┌──────────▼──────────────────────────────────────▼───────┐
  │                    Blockchain Layer                       │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
  │  │    XRPL     │  │  Ethereum   │  │     Solana      │  │
  │  │ Multisig    │  │  Solidity   │  │  Anchor/Rust    │  │
  │  │ Pod Account │  │  Contracts  │  │  Program/PDAs   │  │
  │  │ RLUSD AMM   │  │  Aave yield │  │  Kamino yield   │  │
  │  └─────────────┘  └─────────────┘  └─────────────────┘  │
  └──────────────────────────────────────────────────────────┘
             │
  ┌──────────▼──────────────┐
  │       Supabase          │
  │  Pod metadata           │
  │  Reputation scores      │
  │  Notification prefs     │
  │  Insurance pool records │
  └─────────────────────────┘
```

---

## 2. XRPL Implementation

### 2.1 Important Technical Clarification — No Escrow for RLUSD

**XRPL's native Escrow feature only works with XRP (the native ledger currency). It does NOT work with issued currencies (IOUs) like RLUSD.**

RLUSD is an issued currency on XRPL — it lives as trust line balances and moves via Payment transactions, not via EscrowCreate/EscrowFinish. This is a fundamental XRPL design distinction.

For RLUSD-based pods, the protocol uses a **Multisig Pod Account** pattern instead.

### 2.2 XRPL Pod Account — Architecture

Each pod is represented by a dedicated XRPL account (the "Pod Account") created and managed by the protocol.

```
Pod Account structure:
  ┌─────────────────────────────────────────────────────┐
  │  Pod Account (protocol-generated keypair)           │
  │                                                     │
  │  Regular Key:  Protocol hot wallet address          │
  │  (Protocol can sign transactions as Pod Account     │
  │   without needing Pod Account's master key)        │
  │                                                     │
  │  AccountSet flags:                                  │
  │    asfDisallowXRP = true  (XRP payments rejected)   │
  │    asfRequireAuth = false (trust lines self-serve)  │
  │                                                     │
  │  Trust lines:                                       │
  │    RLUSD (Ripple issuer) — limit: pod max exposure  │
  └─────────────────────────────────────────────────────┘
```

The Pod Account's master keypair is generated, the regular key set to the protocol hot wallet, and then the master key is **permanently disabled** (via AccountSet asfDisableMaster). After this:
- Only the protocol hot wallet can sign for the Pod Account
- No human can access it unilaterally — protocol software signs
- All signing is automated, logged, and auditable on-chain

### 2.3 RLUSD Flow — Joining (Collateral)

```
Member wallet → Payment (RLUSD) → Pod Account
  Amount: collateral amount (1×–2× contribution)
  Memo: { type: "collateral", pod_id: "...", member: "..." }
  Confirmed: ~4 seconds (1 ledger close)

Protocol records:
  member_collateral[pod_id][wallet] = amount
```

### 2.4 RLUSD Flow — Contribution (Each Cycle)

```
Member wallet → Payment (RLUSD) → Pod Account
  Amount: contribution amount exactly
  Memo: { type: "contribution", pod_id: "...", cycle: N }

Protocol validates:
  1. Amount matches exactly
  2. Cycle N is currently open
  3. Member has not already contributed this cycle
  4. Before grace period end timestamp

If all pass: contribution recorded on-chain (Memo permanent in ledger)
```

### 2.5 RLUSD Flow — Payout (Each Cycle Close)

After the cycle close (or default processing), the protocol hot wallet signs a payout:

```
Pod Account → Payment (RLUSD) → cycle_winner_wallet
  Amount: gross_pot - protocol_fee
  Memo: { type: "payout", pod_id: "...", cycle: N }

Protocol fee splits (separate payments from Pod Account):
  0.50% → protocol treasury account
  0.30% → insurance pool account
  0.20% → rewards pool account
```

### 2.6 Default Handling on XRPL

When a member defaults, the protocol processes this server-side and executes the following signed transactions from the Pod Account:

```
1. Slash allocation:
   (60% of slash) → Payment → distribute to each other member proportionally
   (30% of slash) → Payment → insurance pool
   (10% of slash) → Payment → treasury

2. If shortfall exists:
   Insurance pool → Payment → Pod Account (covers missing contribution)

3. Future cycles (auto-debit):
   Each cycle, if member hasn't paid:
     Pod Account internal accounting reduces member's collateral balance
     On final pod reconciliation, deducted from collateral return
```

Note: On XRPL, "auto-debit" is implemented as accounting on the protocol's side — the collateral sits in the Pod Account and the protocol tracks per-member balances. At pod close, each member receives exactly `(original_collateral - total_slashes - auto_debits + 70%_yield)`.

### 2.7 RLUSD Yield on XRPL

RLUSD in the Pod Account can be deployed to XRPL's built-in AMM to earn yield. The Pod Account provides liquidity to the RLUSD/XRP or RLUSD/USDC pool and receives LP tokens.

```
At pod creation + all collateral received:
  Pod Account → AMMDeposit → RLUSD/XRP pool
  Protocol records: lp_tokens_held, rlusd_deposited

At pod completion (returning collateral):
  Pod Account → AMMWithdraw → receive RLUSD + yield
  Yield = withdrawn_RLUSD - deposited_RLUSD
  Member share = yield × 0.70
  Protocol share = yield × 0.30
```

⚠️ AMM yield is variable and not guaranteed. If yield is negative (impermanent loss), members are still returned their full original collateral — protocol absorbs any impermanent loss. Conservative pool selection only.

### 2.8 XRPL Account Reserve Handling

Every XRPL account requires a base reserve (currently 10 XRP) and additional reserves for trust lines (2 XRP each). The protocol covers these reserves:

```
Pod Account creation cost:
  10 XRP base reserve  (covered by protocol)
  2 XRP for RLUSD trust line  (covered by protocol)
  Total: ~12 XRP funded by protocol at pod creation

At pod completion:
  Pod Account deleted via AccountDelete transaction
  Remaining XRP returned to protocol reserve pool
```

The protocol maintains an XRP reserve pool to fund new pod accounts. Creation fees (partially) replenish this pool.

### 2.9 Wallet Integration (Xaman SDK)

```javascript
import { Xumm } from 'xumm'
import { Client, xrpToDrops } from 'xrpl'

const xumm = new Xumm(process.env.XAMAN_API_KEY)
const client = new Client('wss://xrplcluster.com')

// Sign in
const signIn = async () => {
  const { created, resolved } = await xumm.payload.createAndSubscribe({
    txjson: { TransactionType: 'SignIn' }
  })
  const result = await resolved
  return result.response.account  // user's XRPL wallet address
}

// Submit collateral
const submitCollateral = async (podAccountAddress, rlusdAmount, podId) => {
  const payload = await xumm.payload.create({
    txjson: {
      TransactionType: 'Payment',
      Destination: podAccountAddress,
      Amount: {
        currency: 'USD',
        issuer: process.env.RLUSD_ISSUER,
        value: rlusdAmount.toString()
      },
      Memos: [{
        Memo: {
          MemoType: Buffer.from('defi-tanda/collateral').toString('hex').toUpperCase(),
          MemoData: Buffer.from(JSON.stringify({ pod_id: podId })).toString('hex').toUpperCase()
        }
      }]
    }
  })
  // Open Xaman signing request (QR or deep link)
  window.open(payload.next.always)
  return payload.uuid  // poll for result
}

// Submit contribution
const submitContribution = async (podAccountAddress, amount, podId, cycle) => {
  const payload = await xumm.payload.create({
    txjson: {
      TransactionType: 'Payment',
      Destination: podAccountAddress,
      Amount: {
        currency: 'USD',
        issuer: process.env.RLUSD_ISSUER,
        value: amount.toString()
      },
      Memos: [{
        Memo: {
          MemoType: Buffer.from('defi-tanda/contribution').toString('hex').toUpperCase(),
          MemoData: Buffer.from(JSON.stringify({ pod_id: podId, cycle })).toString('hex').toUpperCase()
        }
      }]
    }
  })
  window.open(payload.next.always)
  return payload.uuid
}
```

### 2.10 Fulfillment Service (Server-Side Automation)

Until XRPL Hooks reach stable mainnet, all automated actions (payouts, default declarations, collateral returns) are executed by a server-side fulfillment service.

```typescript
class XRPLFulfillmentService {
  private client: Client
  private wallet: Wallet  // protocol hot wallet

  // Runs every 60 seconds via cron
  async runCycle() {
    const now = Math.floor(Date.now() / 1000)
    const activePods = await this.getActivePods()

    for (const pod of activePods) {
      // Check for grace period expirations
      if (pod.graceEndTimestamp <= now && !pod.defaultsProcessed) {
        await this.processDefaults(pod)
      }

      // Check for cycle close
      if (pod.cycleEndTimestamp <= now && !pod.payoutSent) {
        await this.distributePayout(pod)
      }
    }
  }

  async processDefaults(pod: Pod) {
    const defaulters = await this.getUnpaidMembers(pod)
    for (const member of defaulters) {
      await this.executeSlash(pod, member)
      await this.coverMissingContribution(pod, member)
      await this.flagWallet(member.wallet)
      await this.updateReputation(member.wallet, 'default')
    }
  }

  async distributePayout(pod: Pod) {
    const winner = pod.payoutOrder[pod.currentCycle]
    const grossPot = pod.contribution * pod.currentMemberCount
    const fee = Math.floor(grossPot * 100) / 10000  // 1%
    const netPayout = grossPot - fee

    // Send payout to winner
    await this.signAndSubmit({
      TransactionType: 'Payment',
      Account: pod.accountAddress,
      Destination: winner,
      Amount: { currency: 'USD', issuer: RLUSD_ISSUER, value: netPayout.toString() }
    })

    // Distribute fee splits
    await this.distributeFees(pod.accountAddress, fee)
    await this.updateReputation(winner, 'payout_received')
    await this.notifyAllMembers(pod, 'payout', winner, netPayout)
  }
}
```

**Security note:** The hot wallet holds the minimum XRP for transaction fees and has its send limit set to only the amounts required for pod operations. It is rate-limited and monitored. All transactions are logged to Supabase and verifiable on-chain.

**Migration plan:** XRPL Hooks (smart contract-like functionality native to XRPL) are in active development. When they reach stable mainnet status, the fulfillment service will be replaced with Hook-based automation, making the XRPL implementation fully trustless.

---

## 3. Ethereum Implementation

### 3.1 Contract Architecture

```
contracts/
├── core/
│   ├── TandaFactory.sol         — deploys pods, maintains registry
│   ├── TandaPod.sol             — individual pod logic
│   └── TandaEscrow.sol          — holds funds, manages yield via Aave
├── governance/
│   ├── InsurancePool.sol        — protocol-wide insurance fund
│   ├── ReputationRegistry.sol   — on-chain reputation scores + flags
│   └── DisputeResolution.sol    — dispute submission and governance voting
├── interfaces/
│   ├── ITandaPod.sol
│   ├── IInsurancePool.sol
│   └── IReputationRegistry.sol
└── lib/
    ├── VRFConsumerBase.sol      — Chainlink VRF v2.5 integration
    └── FeeDistributor.sol       — splits 1% fee to treasury/insurance/rewards
```

### 3.2 TandaFactory.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./TandaPod.sol";

contract TandaFactory is Ownable, Pausable {

    address public immutable insurancePool;
    address public immutable reputationRegistry;
    address public treasury;

    // Creation fees in USDC (6 decimals)
    uint256 public communityPodFee = 5e6;   // $5
    uint256 public publicPodFee    = 10e6;  // $10

    // Insurance pool allocation: 20% of creation fee
    uint256 public constant INSURANCE_ALLOC = 20;

    mapping(address => bool) public isPod;
    mapping(address => address[]) public podsByOrganizer;
    address[] public allPods;

    event PodCreated(
        address indexed pod,
        address indexed organizer,
        bool isPrivate,
        address token,
        uint256 contribution,
        uint8 memberCount,
        uint256 cycleDuration
    );

    struct PodParams {
        bool isPrivate;           // community (true) or public (false)
        address token;            // USDC or USDT
        uint256 contribution;     // per-cycle amount (token decimals)
        uint8 memberCount;        // 3–20
        uint256 cycleDuration;    // seconds
        uint8 payoutMethod;       // 0=random, 2=fixed  (1=bid is blocked — pending legal review)
        uint8 slotRealloc;        // 0=skip, 1=auction, 2=replace
        uint256 gracePeriod;      // 24h–72h in seconds
        uint256 collateralMult;   // 100–200 (basis points × 100), e.g. 150 = 1.5×
    }

    function createPod(PodParams calldata params)
        external
        whenNotPaused
        returns (address pod)
    {
        require(params.memberCount >= 3 && params.memberCount <= 20, "Invalid member count");
        require(params.contribution >= 10e6 && params.contribution <= 10_000e6, "Invalid contribution");
        require(params.cycleDuration >= 7 days && params.cycleDuration <= 90 days, "Invalid cycle");
        require(params.gracePeriod >= 24 hours && params.gracePeriod <= 72 hours, "Invalid grace");
        require(params.collateralMult >= 100 && params.collateralMult <= 200, "Invalid collateral");
        // Bid-order (payoutMethod=1) is disabled until legal clearance is obtained per jurisdiction.
        // Bid-order creates an interest-bearing relationship that may constitute a lending product.
        // Only random (0) and fixed (2) are permitted at launch.
        require(params.payoutMethod != 1, "Bid order not enabled — pending legal review");

        // Collect creation fee
        uint256 fee = params.isPrivate ? communityPodFee : publicPodFee;
        IERC20(params.token).transferFrom(msg.sender, address(this), fee);

        // Allocate 20% to insurance pool
        uint256 insuranceShare = (fee * INSURANCE_ALLOC) / 100;
        IERC20(params.token).transfer(insurancePool, insuranceShare);
        IERC20(params.token).transfer(treasury, fee - insuranceShare);

        // Deploy pod
        pod = address(new TandaPod(
            msg.sender,
            params,
            insurancePool,
            reputationRegistry
        ));

        isPod[pod] = true;
        podsByOrganizer[msg.sender].push(pod);
        allPods.push(pod);

        emit PodCreated(pod, msg.sender, params.isPrivate, params.token,
            params.contribution, params.memberCount, params.cycleDuration);
    }
}
```

### 3.3 TandaPod.sol — Core Logic

```solidity
contract TandaPod is ReentrancyGuard, Pausable {

    // ── State ────────────────────────────────────────────────
    enum PodState { OPEN, LOCKED, ACTIVE, PAUSED, DEFAULTED, COMPLETED, CANCELLED }
    PodState public state;

    struct Member {
        address wallet;
        uint256 collateralDeposited;
        uint256 collateralRemaining;
        uint256 totalContributed;
        uint8   payoutSlot;
        bool    hasReceivedPayout;
        uint8   defaultCountInPod;
        bool    isActive;
    }

    struct Cycle {
        uint256 openTime;
        uint256 closeTime;
        uint256 graceEnd;
        address winner;
        uint256 potAmount;
        bool    paid;
        mapping(address => bool) contributed;
    }

    address   public immutable organizer;
    IERC20    public immutable token;
    bool      public immutable isPrivate;
    uint256   public immutable contribution;
    uint256   public immutable collateralRequired;
    uint8     public immutable maxMembers;
    uint8     public immutable payoutMethod;    // 0=random, 2=fixed  (1=bid blocked at factory level)
    uint8     public immutable slotRealloc;
    uint256   public immutable cycleDuration;
    uint256   public immutable gracePeriod;
    uint256   public immutable feeRate;         // 75 for community (0.75%), 100 for public (1%)

    uint8     public currentMemberCount;
    uint8     public currentCycle;
    address[] public memberList;

    mapping(address => Member) public members;
    mapping(uint8  => Cycle)   public cycles;
    mapping(uint8  => address) public payoutOrder;   // slot → wallet

    IInsurancePool     public insurancePool;
    IReputationRegistry public reputationRegistry;

    // ── Events ──────────────────────────────────────────────
    event MemberJoined(address indexed member, uint256 collateral, uint8 slot);
    event PodLocked(uint8 memberCount, uint256 lockTime);
    event ContributionReceived(address indexed member, uint8 cycle, uint256 amount);
    event DefaultDeclared(address indexed member, uint8 cycle, uint256 slashed);
    event PayoutDistributed(address indexed winner, uint8 cycle, uint256 amount);
    event CollateralReturned(address indexed member, uint256 amount, uint256 yield);
    event PodCompleted(uint256 completionTime);

    // ── Join ─────────────────────────────────────────────────
    function join() external nonReentrant {
        require(state == PodState.OPEN, "Pod not open");
        require(currentMemberCount < maxMembers, "Pod full");
        require(!members[msg.sender].isActive, "Already joined");

        if (!isPrivate) {
            require(reputationRegistry.getScore(msg.sender) >= 25, "Insufficient reputation");
            require(!reputationRegistry.isRestricted(msg.sender), "Wallet restricted");
        }

        // Transfer collateral
        token.transferFrom(msg.sender, address(this), collateralRequired);

        // Deploy to Aave for yield
        _depositToAave(collateralRequired);

        uint8 slot = currentMemberCount;
        members[msg.sender] = Member({
            wallet:              msg.sender,
            collateralDeposited: collateralRequired,
            collateralRemaining: collateralRequired,
            totalContributed:    0,
            payoutSlot:          slot,
            hasReceivedPayout:   false,
            defaultCountInPod:   0,
            isActive:            true
        });
        memberList.push(msg.sender);
        currentMemberCount++;

        if (currentMemberCount == maxMembers) {
            _lock();
        }

        emit MemberJoined(msg.sender, collateralRequired, slot);
    }

    // ── Contribute ───────────────────────────────────────────
    function contribute(uint8 cycle) external nonReentrant {
        require(state == PodState.ACTIVE, "Pod not active");
        require(cycle == currentCycle, "Wrong cycle");
        require(block.timestamp <= cycles[cycle].graceEnd, "Grace period expired");
        require(!cycles[cycle].contributed[msg.sender], "Already contributed");
        require(members[msg.sender].isActive, "Not an active member");

        token.transferFrom(msg.sender, address(this), contribution);
        cycles[cycle].contributed[msg.sender] = true;
        cycles[cycle].potAmount += contribution;
        members[msg.sender].totalContributed += contribution;

        reputationRegistry.recordPayment(msg.sender, block.timestamp, cycles[cycle].openTime);

        emit ContributionReceived(msg.sender, cycle, contribution);
    }

    // ── Process Cycle Close ──────────────────────────────────
    // Called by protocol keeper after grace period ends
    function processCycleClose(uint8 cycle) external onlyKeeper {
        require(block.timestamp > cycles[cycle].graceEnd, "Grace period active");
        require(!cycles[cycle].paid, "Already processed");

        // 1. Declare defaults for non-payers
        for (uint8 i = 0; i < memberList.length; i++) {
            address m = memberList[i];
            if (members[m].isActive && !cycles[cycle].contributed[m]) {
                _processDefault(m, cycle);
            }
        }

        // 2. Ensure pot is fully funded (insurance covers any shortfall)
        uint256 expectedPot = contribution * currentMemberCount;
        if (cycles[cycle].potAmount < expectedPot) {
            uint256 shortfall = expectedPot - cycles[cycle].potAmount;
            uint256 covered = insurancePool.drawForDefault(
                address(this), address(0), shortfall
            );
            cycles[cycle].potAmount += covered;
        }

        // 3. Distribute payout
        _distributePayout(cycle);
    }

    // ── Default Processing ───────────────────────────────────
    function _processDefault(address member, uint8 cycle) internal {
        Member storage m = members[member];
        m.defaultCountInPod++;

        uint256 slashPct = m.defaultCountInPod == 1 ? 25 :
                           m.defaultCountInPod == 2 ? 50 : 100;

        uint256 slashAmount = (m.collateralRemaining * slashPct) / 100;
        m.collateralRemaining -= slashAmount;

        // Distribute slashed collateral
        uint256 toMembers  = (slashAmount * 60) / 100;
        uint256 toInsurance = (slashAmount * 30) / 100;
        uint256 toTreasury  = slashAmount - toMembers - toInsurance;

        _distributeToMembers(member, toMembers);
        token.transfer(address(insurancePool), toInsurance);
        token.transfer(treasury, toTreasury);

        // Forfeit payout right
        m.hasReceivedPayout = true;  // marks them as unable to receive

        // If fully slashed, remove member
        if (m.collateralRemaining == 0 || slashPct == 100) {
            m.isActive = false;
            currentMemberCount--;
        }

        // Update reputation and flags
        reputationRegistry.recordDefault(member, _lifetimeDefaultCount(member));

        emit DefaultDeclared(member, cycle, slashAmount);
    }

    // ── Payout ───────────────────────────────────────────────
    function _distributePayout(uint8 cycle) internal {
        address winner = payoutOrder[cycle];
        require(members[winner].isActive, "Winner not active");
        require(!members[winner].hasReceivedPayout, "Already paid");

        uint256 gross = cycles[cycle].potAmount;
        uint256 fee   = (gross * feeRate) / 10000;
        uint256 net   = gross - fee;

        token.transfer(winner, net);
        _distributeFee(fee);

        members[winner].hasReceivedPayout = true;
        cycles[cycle].winner = winner;
        cycles[cycle].paid = true;

        reputationRegistry.recordPayout(winner);

        emit PayoutDistributed(winner, cycle, net);

        // Advance or complete
        if (currentCycle + 1 == maxMembers) {
            _complete();
        } else {
            _openNextCycle();
        }
    }
}
```

### 3.4 InsurancePool.sol

```solidity
contract InsurancePool {
    IERC20 public usdc;
    uint256 public poolBalance;

    uint256 public constant MIN_BALANCE        = 50_000e6;  // $50,000
    uint256 public constant WARN_BALANCE       = 75_000e6;  // $75,000
    uint256 public constant MAX_PER_EVENT      = 2_000e6;   // $2,000
    uint256 public constant MAX_PER_POD        = 5_000e6;   // $5,000

    mapping(address => uint256) public podDrawTotal;    // total drawn per pod
    mapping(address => uint256) public walletDebt;      // debt per defaulter wallet

    event InsuranceDraw(address indexed pod, address indexed defaulter, uint256 amount);
    event InsuranceFunded(address indexed source, uint256 amount);
    event LowBalanceAlert(uint256 balance);

    function drawForDefault(
        address pod,
        address defaulter,
        uint256 shortfall
    ) external onlyAuthorizedPod returns (uint256 covered) {
        require(podDrawTotal[pod] + shortfall <= MAX_PER_POD, "Pod coverage limit");
        covered = shortfall > MAX_PER_EVENT ? MAX_PER_EVENT : shortfall;
        covered = covered > poolBalance ? poolBalance : covered;

        poolBalance -= covered;
        podDrawTotal[pod] += covered;
        if (defaulter != address(0)) {
            walletDebt[defaulter] += covered;
        }

        if (poolBalance < WARN_BALANCE) emit LowBalanceAlert(poolBalance);

        emit InsuranceDraw(pod, defaulter, covered);
    }

    function repayDebt(address wallet, uint256 amount) external {
        uint256 debt = walletDebt[wallet];
        uint256 repay = amount > debt ? debt : amount;
        walletDebt[wallet] -= repay;
        poolBalance += repay;
        usdc.transferFrom(msg.sender, address(this), repay);
    }

    function getPoolHealth() external view returns (
        uint256 balance,
        bool healthy,
        bool warning
    ) {
        return (poolBalance, poolBalance >= MIN_BALANCE, poolBalance < WARN_BALANCE);
    }
}
```

### 3.5 ReputationRegistry.sol

```solidity
contract ReputationRegistry {
    struct WalletRecord {
        int256  score;
        uint8   flagLevel;          // 0=clean, 1=yellow, 2=orange, 3=red, 4=black
        uint32  podsCompleted;
        uint32  defaultCount;       // lifetime
        uint256 lastActivityTime;
        uint256 orangeFlagExpiry;
        uint256 redFlagExpiry;
    }

    mapping(address => WalletRecord) public records;
    mapping(address => bool) public authorizedPods;

    int256 public constant SCORE_EARLY_PAYMENT     =  2;
    int256 public constant SCORE_ONTIME_PAYMENT    =  1;
    int256 public constant SCORE_POD_COMPLETE      = 15;
    int256 public constant SCORE_ORGANIZER_COMPLETE = 25;
    int256 public constant SCORE_DEFAULT_1         = -25;
    int256 public constant SCORE_DEFAULT_2         = -45;
    int256 public constant SCORE_DEFAULT_3         = -80;
    int256 public constant SCORE_DEFAULT_4_PLUS    = -120;

    function recordPayment(address wallet, uint256 payTime, uint256 cycleOpen) external onlyPod {
        int256 delta = (payTime - cycleOpen) < 48 hours
            ? SCORE_EARLY_PAYMENT
            : SCORE_ONTIME_PAYMENT;
        records[wallet].score += delta;
        records[wallet].lastActivityTime = block.timestamp;
    }

    function recordDefault(address wallet, uint32 lifetimeDefaults) external onlyPod {
        WalletRecord storage r = records[wallet];
        r.defaultCount = lifetimeDefaults;

        int256 delta = lifetimeDefaults == 1 ? SCORE_DEFAULT_1 :
                       lifetimeDefaults == 2 ? SCORE_DEFAULT_2 :
                       lifetimeDefaults == 3 ? SCORE_DEFAULT_3 : SCORE_DEFAULT_4_PLUS;
        r.score += delta;

        // Apply flag
        if (lifetimeDefaults == 1 && r.flagLevel < 1) r.flagLevel = 1;
        else if (lifetimeDefaults == 2) { r.flagLevel = 2; r.orangeFlagExpiry = block.timestamp + 90 days; }
        else if (lifetimeDefaults == 3) { r.flagLevel = 3; r.redFlagExpiry = block.timestamp + 365 days; }
        else if (lifetimeDefaults >= 4) r.flagLevel = 4;
    }

    function isRestricted(address wallet) external view returns (bool) {
        WalletRecord storage r = records[wallet];
        if (r.flagLevel == 4) return true;
        if (r.flagLevel == 3 && block.timestamp < r.redFlagExpiry) return true;
        if (r.flagLevel == 2 && block.timestamp < r.orangeFlagExpiry) return true;
        return false;
    }

    function getCollateralMultiplier(address wallet) external view returns (uint256) {
        int256 score = records[wallet].score;
        if (score >= 500) return 50;   // 0.5× collateral
        if (score >= 200) return 100;  // 1.0×
        if (score >= 100) return 150;  // 1.5×
        if (score >=  50) return 175;  // 1.75×
        return 200;                    // 2.0× (new wallet)
    }
}
```

### 3.6 Chainlink VRF — Random Payout Order

```solidity
contract TandaVRFConsumer is VRFConsumerBaseV2Plus {
    IVRFCoordinatorV2Plus coordinator;

    VRFV2PlusClient.RandomWordsRequest public vrfRequest = VRFV2PlusClient.RandomWordsRequest({
        keyHash:            0x...,  // network-specific
        subId:              subscriptionId,
        requestConfirmations: 3,
        callbackGasLimit:   150_000,
        numWords:           1,      // one random seed, shuffle deterministically
        extraArgs:          VRFV2PlusClient._argsToBytes(
                              VRFV2PlusClient.ExtraArgsV1({ nativePayment: false })
                            )
    });

    mapping(uint256 => address) public requestToPod;

    function requestPodOrder(address pod) internal returns (uint256 requestId) {
        requestId = coordinator.requestRandomWords(vrfRequest);
        requestToPod[requestId] = pod;
    }

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        address pod = requestToPod[requestId];
        uint256 seed = randomWords[0];
        // Fisher-Yates shuffle using the seed
        ITandaPod(pod).assignPayoutOrder(seed);
    }
}
```

### 3.7 Aave Yield Integration (Ethereum)

```solidity
interface IAaveV3Pool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referral) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

// Within TandaEscrow.sol
IAaveV3Pool constant AAVE = IAaveV3Pool(0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2); // Ethereum mainnet

function _depositToAave(uint256 amount) internal {
    token.approve(address(AAVE), amount);
    AAVE.supply(address(token), amount, address(this), 0);
    // aTokens received (AUSDC) represent our position
}

function _withdrawFromAave(uint256 originalAmount) internal returns (uint256 withdrawn) {
    withdrawn = AAVE.withdraw(address(token), type(uint256).max, address(this));
    uint256 yield = withdrawn > originalAmount ? withdrawn - originalAmount : 0;
    return withdrawn;
}
```

---

## 4. Solana Implementation

### 4.1 Program Structure (Anchor)

```
programs/defi-tanda/src/
├── lib.rs
├── instructions/
│   ├── create_pod.rs
│   ├── join_pod.rs
│   ├── lock_pod.rs
│   ├── contribute.rs
│   ├── process_cycle_close.rs
│   ├── slash_member.rs
│   └── close_pod.rs
├── state/
│   ├── pod.rs
│   ├── member.rs
│   ├── cycle.rs
│   └── insurance_pool.rs
└── errors.rs
```

### 4.2 Account Structures

```rust
#[account]
#[derive(Default)]
pub struct Pod {
    pub organizer: Pubkey,
    pub token_mint: Pubkey,
    pub vault: Pubkey,              // holds contributions during active cycle
    pub collateral_vault: Pubkey,   // holds all member collateral
    pub contribution: u64,
    pub collateral_required: u64,
    pub member_count: u8,
    pub current_members: u8,
    pub cycle_count: u8,            // = member_count
    pub current_cycle: u8,
    pub cycle_duration_secs: i64,
    pub grace_period_secs: i64,
    pub cycle_start: i64,
    pub payout_method: u8,
    pub slot_realloc: u8,
    pub is_private: bool,
    pub fee_rate_bps: u16,          // 75 for community, 100 for public
    pub state: PodState,
    pub bump: u8,
}

#[account]
pub struct Member {
    pub pod: Pubkey,
    pub wallet: Pubkey,
    pub collateral_deposited: u64,
    pub collateral_remaining: u64,
    pub total_contributed: u64,
    pub payout_slot: u8,
    pub has_received_payout: bool,
    pub default_count_in_pod: u8,
    pub is_active: bool,
    pub bump: u8,
}

#[account]
pub struct Cycle {
    pub pod: Pubkey,
    pub cycle_number: u8,
    pub open_time: i64,
    pub close_time: i64,
    pub grace_end: i64,
    pub winner: Pubkey,
    pub pot_amount: u64,
    pub paid: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum PodState {
    Open,
    Locked,
    Active,
    Paused,
    Defaulted,
    Completed,
    Cancelled,
}
```

### 4.3 PDAs

```rust
// Pod account
seeds = [b"pod", organizer.key().as_ref(), pod_id.to_le_bytes().as_ref()]

// Contribution vault (USDC token account, owned by pod)
seeds = [b"vault", pod.key().as_ref()]

// Collateral vault (USDC token account, owned by pod)
seeds = [b"collateral-vault", pod.key().as_ref()]

// Member record
seeds = [b"member", pod.key().as_ref(), wallet.key().as_ref()]

// Cycle record
seeds = [b"cycle", pod.key().as_ref(), &[cycle_number]]

// Protocol insurance pool (singleton)
seeds = [b"insurance-pool", protocol_authority.key().as_ref()]
```

### 4.4 Frontend Integration (Anchor client)

```typescript
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token'

const useTandaProgram = () => {
  const { connection } = useConnection()
  const wallet = useWallet()
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
  return new Program(IDL, PROGRAM_ID, provider)
}

const joinPod = async (podPubkey: PublicKey, memberWallet: PublicKey) => {
  const program = useTandaProgram()
  const [memberPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('member'), podPubkey.toBuffer(), memberWallet.toBuffer()],
    program.programId
  )
  const [collateralVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('collateral-vault'), podPubkey.toBuffer()],
    program.programId
  )
  const memberUsdcAccount = await getAssociatedTokenAddress(USDC_MINT, memberWallet)

  const tx = await program.methods
    .joinPod()
    .accounts({
      pod: podPubkey,
      member: memberPda,
      collateralVault,
      memberToken: memberUsdcAccount,
      payer: memberWallet,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  return tx
}
```

---

## 5. Backend Services

### 5.1 Architecture

```
backend/
├── src/
│   ├── services/
│   │   ├── XRPLFulfillmentService.ts   — XRPL cycle automation
│   │   ├── ETHKeeperService.ts         — ETH cycle close calls
│   │   ├── SolanaKeeperService.ts      — Solana instruction submitter
│   │   ├── IndexerService.ts           — on-chain event listener → Supabase
│   │   └── NotificationService.ts      — WhatsApp / push / email
│   ├── jobs/
│   │   ├── cycleWatcher.ts             — cron: check all active pods every 60s
│   │   ├── defaultProcessor.ts         — cron: process grace period expirations
│   │   └── poolHealthMonitor.ts        — cron: check insurance pool balance
│   └── api/
│       ├── pods.ts                     — pod CRUD for frontend
│       ├── members.ts                  — member lookup
│       ├── reputation.ts               — score queries
│       └── notifications.ts            — WhatsApp opt-in management
```

### 5.2 Notification Service

```typescript
import Twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

class NotificationService {

  // WhatsApp via Twilio WhatsApp Business API
  async sendWhatsApp(to: string, template: string, vars: object) {
    const client = Twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN)
    await client.messages.create({
      from: `whatsapp:${process.env.WHATSAPP_NUMBER}`,
      to: `whatsapp:${to}`,
      contentSid: TEMPLATES[template],
      contentVariables: JSON.stringify(vars)
    })
  }

  // Templates (Spanish + English)
  async notifyPaymentDue(member: Member, pod: Pod, hoursRemaining: number) {
    const msg = member.language === 'es'
      ? `Tu tanda vence en ${hoursRemaining} horas. Paga ahora para evitar perder tu depósito.`
      : `Your tanda payment is due in ${hoursRemaining} hours. Pay now to avoid losing your deposit.`

    await this.sendWhatsApp(member.phone, 'payment_reminder', {
      hours: hoursRemaining,
      amount: pod.contribution,
      pod_name: pod.name
    })
  }

  async notifyPayoutReceived(member: Member, amount: number) {
    await this.sendWhatsApp(member.phone, 'payout_received', {
      amount,
      currency: 'RLUSD'
    })
    // Also offer remittance option if XRPL chain
    if (member.chain === 'xrpl') {
      await this.sendWhatsApp(member.phone, 'remittance_offer', {
        amount
      })
    }
  }

  async notifyDefault(pod: Pod, defaulter: Member, allMembers: Member[]) {
    // Notify defaulter
    await this.sendWhatsApp(defaulter.phone, 'default_declared', {
      slashed: defaulter.slashAmount
    })
    // Notify all other members (their pot is still covered)
    for (const m of allMembers.filter(m => m.wallet !== defaulter.wallet)) {
      await this.sendWhatsApp(m.phone, 'member_defaulted', {
        payout_protected: true
      })
    }
  }
}
```

---

## 6. Database Schema (Supabase)

```sql
-- Pods
CREATE TABLE pods (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain             TEXT NOT NULL CHECK (chain IN ('xrpl', 'ethereum', 'solana')),
  pod_type          TEXT NOT NULL CHECK (pod_type IN ('community', 'public')),
  on_chain_address  TEXT NOT NULL UNIQUE,
  organizer_wallet  TEXT NOT NULL,
  token             TEXT NOT NULL,
  contribution      NUMERIC(20, 6) NOT NULL,
  collateral_mult   NUMERIC(4, 2) NOT NULL,   -- e.g. 1.5
  member_count      SMALLINT NOT NULL,
  cycle_count       SMALLINT NOT NULL,
  cycle_duration_s  INTEGER NOT NULL,
  grace_period_s    INTEGER NOT NULL,
  payout_method     SMALLINT NOT NULL,
  slot_realloc      SMALLINT NOT NULL,
  fee_rate_bps      SMALLINT NOT NULL,
  state             TEXT NOT NULL DEFAULT 'OPEN',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  locked_at         TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ
);

-- Members
CREATE TABLE pod_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id                UUID REFERENCES pods(id) ON DELETE CASCADE,
  wallet_address        TEXT NOT NULL,
  payout_slot           SMALLINT,
  collateral_deposited  NUMERIC(20, 6) NOT NULL,
  collateral_remaining  NUMERIC(20, 6) NOT NULL,
  has_received_payout   BOOLEAN DEFAULT FALSE,
  default_count_in_pod  SMALLINT DEFAULT 0,
  is_active             BOOLEAN DEFAULT TRUE,
  joined_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pod_id, wallet_address)
);

-- Cycles
CREATE TABLE pod_cycles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id         UUID REFERENCES pods(id),
  cycle_number   SMALLINT NOT NULL,
  open_time      TIMESTAMPTZ NOT NULL,
  close_time     TIMESTAMPTZ NOT NULL,
  grace_end      TIMESTAMPTZ NOT NULL,
  winner_wallet  TEXT,
  gross_pot      NUMERIC(20, 6),
  protocol_fee   NUMERIC(20, 6),
  net_payout     NUMERIC(20, 6),
  paid           BOOLEAN DEFAULT FALSE,
  paid_at        TIMESTAMPTZ,
  UNIQUE (pod_id, cycle_number)
);

-- Contributions
CREATE TABLE contributions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id        UUID REFERENCES pods(id),
  cycle_id      UUID REFERENCES pod_cycles(id),
  member_wallet TEXT NOT NULL,
  amount        NUMERIC(20, 6) NOT NULL,
  tx_hash       TEXT NOT NULL UNIQUE,
  chain         TEXT NOT NULL,
  submitted_at  TIMESTAMPTZ DEFAULT NOW(),
  is_auto_debit BOOLEAN DEFAULT FALSE
);

-- Reputation
CREATE TABLE reputation (
  wallet_address    TEXT PRIMARY KEY,
  chain_primary     TEXT,
  score             INTEGER DEFAULT 0,
  flag_level        SMALLINT DEFAULT 0,
  orange_flag_expiry TIMESTAMPTZ,
  red_flag_expiry   TIMESTAMPTZ,
  pods_completed    INTEGER DEFAULT 0,
  default_count     INTEGER DEFAULT 0,
  insurance_debt    NUMERIC(20, 6) DEFAULT 0,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Insurance pool events
CREATE TABLE insurance_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL CHECK (event_type IN ('fund', 'draw', 'repay')),
  pod_id          UUID REFERENCES pods(id),
  defaulter_wallet TEXT,
  amount          NUMERIC(20, 6) NOT NULL,
  pool_balance_after NUMERIC(20, 6) NOT NULL,
  tx_hash         TEXT,
  occurred_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Notification preferences
CREATE TABLE notification_prefs (
  wallet_address TEXT PRIMARY KEY,
  whatsapp_number TEXT,
  whatsapp_opted_in BOOLEAN DEFAULT FALSE,
  email           TEXT,
  email_opted_in  BOOLEAN DEFAULT FALSE,
  language        TEXT DEFAULT 'es',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. Security Plan

### 7.1 Smart Contract Security
- Independent audit by 2 firms before any mainnet deployment
- Formal verification of payout, slash, and collateral return paths
- OpenZeppelin `ReentrancyGuard` on all external token calls
- `Pausable` on all contracts (protocol 3-of-5 multisig can pause)
- Transparent proxy with 48-hour timelock on all upgrades
- Public bug bounty: $10K–$100K USDC depending on severity

### 7.2 XRPL Hot Wallet Security
- Holds only enough XRP for ~100 transaction fees at any time
- Replenished from cold wallet as needed
- All signing operations logged to immutable audit log
- Rate limited: cannot sign more than 50 pod transactions per minute
- Anomaly detection: unusual signing patterns trigger automatic suspension

### 7.3 Protocol Multisig
- 3-of-5 Gnosis Safe (Ethereum) for governance actions
- Signers: protocol founders + independent security advisors
- All multisig transactions require 48-hour timelock (except emergency pause)
- Emergency pause: 2-of-5 quorum, no timelock, audit required within 24h

### 7.4 Frontend Security
- No private keys ever processed by frontend
- All signing done in wallet extension/app (Xaman, MetaMask, Phantom)
- Content Security Policy headers enforced
- No third-party scripts beyond analytics
- HTTPS enforced with HSTS preload

---

## 8. Testing Plan

### Unit Tests
- All contract functions: happy path + boundary conditions + failure modes
- Reputation score arithmetic
- Fee distribution math (1% splits correctly)
- Collateral slash cascade (25% → 50% → 100%)
- Auto-debit accounting
- Insurance pool draw and replenishment

### Integration Tests
- Full pod lifecycle on each chain (create → join → lock → N cycles → complete)
- Default handling: single default, multiple defaults, full pod dissolution
- Insurance pool coverage and limits
- Cross-cycle default recovery (member defaults cycle 3, pod still completes cycle 10)

### Testnet Milestones
- XRPL Testnet: 3 full pod lifecycles with simulated defaults
- Ethereum Sepolia: 3 full pod lifecycles with VRF randomness
- Solana Devnet: 3 full pod lifecycles with keeper automation
- All three chains: insurance pool draw tested in each

### Community Testing (Pilot Phase)
- 5 community pods with Chicago ambassadors on XRPL testnet
- Real users, real feedback, real UX issues captured
- Spanish-language UX specifically tested with non-technical participants

---

*Version 2.0 — March 2026*
*DeFi Tanda — Chicago, IL*
