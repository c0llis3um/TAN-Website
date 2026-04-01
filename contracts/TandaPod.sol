// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC20.sol";

/**
 * @title  TandaPod v1.1
 * @notice Manages the full lifecycle of a single DeFi Tanda (ROSCA) pod.
 *
 * @dev  Intended flow (on-chain contributions):
 *       1. Factory or deployer creates this contract with pod parameters.
 *       2. `size` members call joinPod() depositing 2× contributionAmount as collateral.
 *          The last member to join activates the pod automatically.
 *       3. Each cycle every member calls contribute(cycle).
 *          When all active members pay, the pot releases to the cycle recipient
 *          and the next cycle begins. After the final cycle, pod COMPLETES and
 *          collateral becomes claimable.
 *       4. Cancelled pod (OPEN or ACTIVE): members call claimRefund().
 *       5. Completed pod: members call claimCollateral() — pull pattern, no loops.
 *       6. Admin escape hatch: forceComplete() marks COMPLETED so members can
 *          claim collateral when payments happened off-chain (direct transfers).
 *       7. Member default: owner calls markDefault(member) → collateral is
 *          distributed to remaining members; pod auto-completes at 1 member left.
 *
 * @dev  payoutSlot is 0-indexed on-chain.
 *       The off-chain DB stores payout_slot as 1-indexed — subtract 1 when
 *       calling getPayoutRecipient() with a DB cycle value.
 *
 * @dev  cycleDurationSeconds is passed directly by the deployer.
 *       Dev/testnet: pass hours (e.g., 3600 = 1 hour).
 *       Live:        pass days  (e.g., 604800 = 7 days).
 *
 *  Token handling:
 *       token == address(0)  →  native ETH (msg.value)
 *       token != address(0)  →  ERC-20 (USDC / USDT) via transferFrom
 *
 *  Security: ReentrancyGuard, checks-effects-interactions throughout.
 */
contract TandaPod {

    string public constant VERSION = "1.1.0";

    // ── Enums ────────────────────────────────────────────────────

    enum PodStatus    { OPEN, ACTIVE, COMPLETED, CANCELLED }
    enum MemberStatus { NONE, ACTIVE, DEFAULTED }

    // ── Structs ──────────────────────────────────────────────────

    struct Member {
        address      wallet;
        uint8        payoutSlot;   // 0-indexed; DB payout_slot = payoutSlot + 1
        uint256      collateral;   // 2 × contributionAmount deposited
        MemberStatus status;
    }

    // ── Immutables ───────────────────────────────────────────────

    address public immutable factory;
    uint256 public immutable podId;
    address public immutable token;              // address(0) for ETH
    uint256 public immutable contributionAmount;
    uint8   public immutable size;
    uint256 public immutable cycleDurationSeconds;
    address public immutable treasury;

    // ── State ────────────────────────────────────────────────────

    address   public owner;
    PodStatus public podStatus;

    address[]                  public memberList;
    mapping(address => Member) public members;
    mapping(address => bool)   public isMember;
    mapping(uint256 => address) public slotRecipient; // slot → wallet (O(1) lookup)

    // Contribution tracking (used only when going through contribute())
    mapping(uint256 => mapping(address => bool)) public cyclePaid;
    mapping(uint256 => uint256)                  public cyclePaymentCount;

    uint256 public currentCycle;    // 0-indexed; increments via _releasePot()
    uint256 public cycleStartedAt;  // timestamp of current cycle start
    uint256 public activeCount;     // decremented on markDefault; set to size at activation

    // Reentrancy guard
    uint256 private _guardStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;

    // ── Events ───────────────────────────────────────────────────

    event MemberJoined(uint256 indexed podId, address indexed member, uint8 payoutSlot, uint256 collateral);
    event PodActivated(uint256 indexed podId, address[] members, uint256 activatedAt);
    event ContributionReceived(uint256 indexed podId, address indexed member, uint256 cycle, uint256 amount);
    event PayoutSent(uint256 indexed podId, address indexed recipient, uint256 cycle, uint256 amount);
    event PodCompleted(uint256 indexed podId, uint256 completedAt);
    event PodForceCompleted(uint256 indexed podId, address indexed by, uint256 completedAt);
    event PodCancelled(uint256 indexed podId, uint256 cancelledAt);
    event MemberDefaulted(uint256 indexed podId, address indexed member, uint256 slashedCollateral);
    event CollateralRefunded(uint256 indexed podId, address indexed member, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ── Modifiers ────────────────────────────────────────────────

    modifier nonReentrant() {
        require(_guardStatus != _ENTERED, "ReentrancyGuard: reentrant call");
        _guardStatus = _ENTERED;
        _;
        _guardStatus = _NOT_ENTERED;
    }

    modifier onlyOwner() {
        require(msg.sender == owner || msg.sender == factory, "Not owner");
        _;
    }

    modifier onlyActive() {
        require(podStatus == PodStatus.ACTIVE, "Pod not active");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────

    /**
     * @param _factory              Factory or deployer address (becomes owner).
     * @param _podId                Unique pod identifier.
     * @param _token                ERC-20 address, or address(0) for native ETH.
     * @param _contributionAmount   Per-cycle contribution in token units (wei for ETH).
     * @param _size                 Number of members (2–20).
     * @param _cycleDurationSeconds Cycle length in seconds. Use hours for dev, days for live.
     * @param _treasury             Protocol treasury address.
     */
    constructor(
        address _factory,
        uint256 _podId,
        address _token,
        uint256 _contributionAmount,
        uint8   _size,
        uint256 _cycleDurationSeconds,
        address _treasury
    ) {
        require(_factory              != address(0), "Zero factory");
        require(_contributionAmount   > 0,           "Zero contribution");
        require(_size >= 2 && _size  <= 20,          "Size must be 2-20");
        require(_cycleDurationSeconds > 0,           "Zero cycle duration");
        require(_treasury             != address(0), "Zero treasury");

        factory              = _factory;
        owner                = _factory;
        podId                = _podId;
        token                = _token;
        contributionAmount   = _contributionAmount;
        size                 = _size;
        cycleDurationSeconds = _cycleDurationSeconds;
        treasury             = _treasury;
        podStatus            = PodStatus.OPEN;
        _guardStatus         = _NOT_ENTERED;
    }

    // ── Join ─────────────────────────────────────────────────────

    /**
     * @notice Join the pod by depositing collateral (exactly 2 × contributionAmount).
     *
     * Payout slots are assigned in join order (slot 0 = first joiner, 1 = second, …).
     * When the last member joins the pod transitions to ACTIVE automatically.
     *
     * ETH pods:   send exactly 2 × contributionAmount as msg.value.
     * ERC-20 pods: approve this contract first, then call joinPod() with msg.value = 0.
     */
    function joinPod() external payable nonReentrant {
        require(podStatus == PodStatus.OPEN, "Pod not open");
        require(!isMember[msg.sender],       "Already a member");
        require(memberList.length < size,    "Pod is full");

        uint256 collateralRequired = contributionAmount * 2;

        if (token == address(0)) {
            // ETH: refund any overpayment rather than rejecting the tx
            require(msg.value >= collateralRequired, "Insufficient ETH collateral");
            uint256 overpaid = msg.value - collateralRequired;
            if (overpaid > 0) {
                (bool ok,) = payable(msg.sender).call{value: overpaid}("");
                require(ok, "Overpayment refund failed");
            }
        } else {
            require(msg.value == 0, "ETH not accepted for token pods");
            bool ok = IERC20(token).transferFrom(msg.sender, address(this), collateralRequired);
            require(ok, "Collateral transfer failed");
        }

        uint8 slot = uint8(memberList.length); // 0-indexed

        members[msg.sender] = Member({
            wallet:     msg.sender,
            payoutSlot: slot,
            collateral: collateralRequired,
            status:     MemberStatus.ACTIVE
        });

        isMember[msg.sender]  = true;
        slotRecipient[slot]   = msg.sender;
        memberList.push(msg.sender);

        emit MemberJoined(podId, msg.sender, slot, collateralRequired);

        // Activate when full
        if (memberList.length == size) {
            podStatus      = PodStatus.ACTIVE;
            activeCount    = size;
            cycleStartedAt = block.timestamp;
            emit PodActivated(podId, memberList, block.timestamp);
        }
    }

    // ── Contribute ───────────────────────────────────────────────

    /**
     * @notice Pay your contribution for the current cycle (on-chain payment flow).
     *
     * @param cycle The 0-indexed cycle to pay for — must equal currentCycle.
     *
     * When all active members have paid, the pot releases to the cycle recipient,
     * currentCycle increments, and the next cycle begins. After the final cycle
     * the pod is marked COMPLETED and collateral becomes claimable.
     *
     * @dev This function is used in the full on-chain flow. When payments happen
     *      off-chain (direct wallet transfers), use forceComplete() instead.
     */
    function contribute(uint256 cycle) external payable nonReentrant onlyActive {
        require(isMember[msg.sender],                              "Not a member");
        require(members[msg.sender].status == MemberStatus.ACTIVE, "Member defaulted");
        require(cycle == currentCycle,                             "Wrong cycle");
        require(!cyclePaid[cycle][msg.sender],                     "Already paid this cycle");

        if (token == address(0)) {
            require(msg.value == contributionAmount, "Wrong ETH amount");
        } else {
            require(msg.value == 0, "ETH not accepted for token pods");
            bool ok = IERC20(token).transferFrom(msg.sender, address(this), contributionAmount);
            require(ok, "Contribution transfer failed");
        }

        cyclePaid[cycle][msg.sender] = true;
        cyclePaymentCount[cycle]    += 1;

        emit ContributionReceived(podId, msg.sender, cycle, contributionAmount);

        if (cyclePaymentCount[cycle] == activeCount) {
            _releasePot(cycle);
        }
    }

    // ── Claim Collateral (pull pattern) ──────────────────────────

    /**
     * @notice Claim your collateral after the pod completes.
     *         Works after either natural completion or forceComplete().
     *         Pull pattern — each member claims individually (gas-safe).
     */
    function claimCollateral() external nonReentrant {
        require(podStatus == PodStatus.COMPLETED, "Pod not completed");
        require(isMember[msg.sender],             "Not a member");

        uint256 amount = members[msg.sender].collateral;
        require(amount > 0, "No collateral to claim");

        members[msg.sender].collateral = 0;
        _send(msg.sender, amount);
        emit CollateralRefunded(podId, msg.sender, amount);
    }

    // ── Claim Refund (cancelled pods) ────────────────────────────

    /**
     * @notice Claim collateral refund when the pod is CANCELLED.
     */
    function claimRefund() external nonReentrant {
        require(podStatus == PodStatus.CANCELLED, "Pod not cancelled");
        require(isMember[msg.sender],             "Not a member");

        uint256 amount = members[msg.sender].collateral;
        require(amount > 0, "No collateral to refund");

        members[msg.sender].collateral = 0;
        _send(msg.sender, amount);
        emit CollateralRefunded(podId, msg.sender, amount);
    }

    // ── Cancel ───────────────────────────────────────────────────

    /**
     * @notice Cancel the pod. Works on both OPEN and ACTIVE pods.
     *         Members claim their collateral via claimRefund().
     *
     * Use when the pod fails to fill (OPEN) or in an emergency (ACTIVE).
     */
    function cancelPod() external nonReentrant onlyOwner {
        require(
            podStatus == PodStatus.OPEN || podStatus == PodStatus.ACTIVE,
            "Cannot cancel a completed or already-cancelled pod"
        );
        podStatus = PodStatus.CANCELLED;
        emit PodCancelled(podId, block.timestamp);
    }

    // ── Force Complete (admin escape hatch) ──────────────────────

    /**
     * @notice Mark the pod COMPLETED so members can claim collateral via
     *         claimCollateral(). Use when payments happened off-chain (direct
     *         wallet transfers) and contribute() was never called.
     *
     * Only callable by the factory/owner. Does not push ETH — members pull
     * via claimCollateral(), keeping gas bounded per member.
     */
    function forceComplete() external nonReentrant onlyOwner {
        require(podStatus == PodStatus.ACTIVE, "Pod not active");
        podStatus = PodStatus.COMPLETED;
        emit PodForceCompleted(podId, msg.sender, block.timestamp);
        emit PodCompleted(podId, block.timestamp);
    }

    // ── Mark Default ─────────────────────────────────────────────

    /**
     * @notice Mark a member as defaulted. Their collateral is distributed
     *         proportionally to remaining active members.
     *
     * @dev No time check — the owner/admin determines default based on
     *      off-chain payment records (DB). This avoids stale cycleStartedAt
     *      when payments flow through direct wallet transfers.
     *
     * If only 1 active member remains after this call, the pod auto-completes
     * and that member's collateral becomes claimable via claimCollateral().
     *
     * @param member Address of the defaulting member.
     */
    function markDefault(address member) external nonReentrant onlyOwner {
        require(podStatus == PodStatus.ACTIVE,                   "Pod not active");
        require(isMember[member],                                "Not a member");
        require(members[member].status == MemberStatus.ACTIVE,   "Already defaulted");

        uint256 slashed = members[member].collateral;
        members[member].collateral = 0;
        members[member].status     = MemberStatus.DEFAULTED;
        activeCount               -= 1;

        emit MemberDefaulted(podId, member, slashed);

        // Distribute slashed collateral among remaining active members
        uint256 remaining = activeCount;
        if (remaining > 0 && slashed > 0) {
            uint256 share    = slashed / remaining;
            uint256 leftover = slashed - (share * remaining);

            bool firstActive = true;
            for (uint256 i = 0; i < memberList.length; i++) {
                address m = memberList[i];
                if (members[m].status == MemberStatus.ACTIVE) {
                    if (firstActive) {
                        members[m].collateral += share + leftover; // dust goes to first
                        firstActive = false;
                    } else {
                        members[m].collateral += share;
                    }
                }
            }
        }

        // Auto-complete when only 1 member remains
        if (remaining == 1) {
            podStatus = PodStatus.COMPLETED;
            emit PodCompleted(podId, block.timestamp);
            // Last member claims via claimCollateral()
        }
    }

    // ── Views ────────────────────────────────────────────────────

    /**
     * @notice Returns the wallet address of the payout recipient for a given slot.
     * @param slot 0-indexed slot number (equals on-chain cycle index).
     *             If using DB payout_slot (1-indexed), pass payout_slot - 1.
     */
    function getPayoutRecipient(uint256 slot) public view returns (address) {
        return slotRecipient[slot];
    }

    function getMemberCount() external view returns (uint256) {
        return memberList.length;
    }

    function getMember(address wallet) external view returns (Member memory) {
        return members[wallet];
    }

    function isDeadlinePassed() external view returns (bool) {
        return block.timestamp > cycleStartedAt + cycleDurationSeconds;
    }

    // ── Admin ────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── Internal ────────────────────────────────────────────────

    /**
     * @dev Release the pot for a completed cycle and advance to the next.
     *      Called internally from contribute() when all active members have paid.
     */
    function _releasePot(uint256 cycle) internal {
        uint256 pot       = contributionAmount * activeCount;
        address recipient = slotRecipient[cycle];

        // If designated recipient defaulted, send pot to treasury instead
        if (recipient == address(0) || members[recipient].status == MemberStatus.DEFAULTED) {
            recipient = treasury;
        }

        // Advance cycle state before transfer (checks-effects-interactions)
        uint256 nextCycle = currentCycle + 1;
        currentCycle      = nextCycle;
        cycleStartedAt    = block.timestamp;

        emit PayoutSent(podId, recipient, cycle, pot);
        _send(recipient, pot);

        // All cycles done → complete and let members pull their collateral
        if (nextCycle == size) {
            podStatus = PodStatus.COMPLETED;
            emit PodCompleted(podId, block.timestamp);
        }
    }

    /**
     * @dev Unified send: ETH via low-level call, ERC-20 via transfer().
     */
    function _send(address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok,) = payable(to).call{value: amount}("");
            require(ok, "ETH transfer failed");
        } else {
            bool ok = IERC20(token).transfer(to, amount);
            require(ok, "Token transfer failed");
        }
    }

    // Reject stray ETH on ERC-20 pods
    receive() external payable {
        require(token == address(0), "ETH not accepted for token pods");
    }
}
