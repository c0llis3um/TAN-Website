// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC20.sol";

/**
 * @title TandaPod
 * @notice Manages the full lifecycle of a single DeFi Tanda (ROSCA) pod on EVM chains.
 *
 * @dev  Flow:
 *       1. Factory deploys a TandaPod with the agreed parameters.
 *       2. `size` members call joinPod() and deposit 2× collateral.
 *          When the last member joins the pod becomes ACTIVE.
 *       3. Each cycle, every member calls contribute(cycle).
 *          When all N members have paid, the pot is released to the
 *          payout recipient for that cycle and the next cycle begins.
 *          After cycle `size - 1` (0-indexed) the pod is COMPLETED and
 *          all collateral is refunded automatically.
 *       4. If the pod is cancelled while OPEN, members call claimRefund().
 *       5. If a member defaults (owner calls markDefault), their collateral
 *          is split among the remaining non-defaulted members.
 *
 *  Token handling:
 *       _token == address(0)  →  native ETH (msg.value)
 *       _token != address(0)  →  ERC-20 (USDC / USDT) via transferFrom
 *
 *  Security: ReentrancyGuard, checks-effects-interactions throughout.
 */
contract TandaPod {

    // ── Enums ────────────────────────────────────────────────────

    enum PodStatus { OPEN, ACTIVE, COMPLETED, CANCELLED }
    enum MemberStatus { NONE, ACTIVE, DEFAULTED }

    // ── Structs ──────────────────────────────────────────────────

    struct Member {
        address wallet;
        uint8   payoutSlot;      // 0-indexed cycle in which this member receives the pot
        uint256 collateral;      // collateral deposited (2 × contributionAmount)
        uint256 lastCyclePaid;   // last cycle index for which the member contributed (1-indexed sentinel: 0 = never)
        MemberStatus status;
    }

    // ── Immutables ───────────────────────────────────────────────

    address public immutable factory;
    uint256 public immutable podId;
    address public immutable token;       // address(0) for ETH
    uint256 public immutable contributionAmount;
    uint8   public immutable size;
    uint256 public immutable cycleDuration; // in seconds (cycleDays * 1 days)
    address public immutable treasury;

    // ── State ────────────────────────────────────────────────────

    address public owner;          // factory at deploy; can be transferred
    PodStatus public podStatus;

    address[]                  public memberList;        // join order
    mapping(address => Member) public members;
    mapping(address => bool)   public isMember;

    // cycle → member → paid
    mapping(uint256 => mapping(address => bool)) public cyclePaid;
    mapping(uint256 => uint256) public cyclePaymentCount; // how many paid in each cycle

    uint256 public currentCycle;    // 0-indexed, increments after each full round of payments
    uint256 public cycleStartedAt;  // timestamp when currentCycle began

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
    event MemberDefaulted(uint256 indexed podId, address indexed member, uint256 slashedCollateral);
    event CollateralRefunded(uint256 indexed podId, address indexed member, uint256 amount);
    event PodCancelled(uint256 indexed podId, uint256 cancelledAt);

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
     * @param _factory           Address of the TandaFactory (also acts as owner).
     * @param _podId             Unique pod ID assigned by the factory.
     * @param _token             ERC-20 token address, or address(0) for native ETH.
     * @param _contributionAmount Amount each member contributes per cycle.
     * @param _size              Number of members (2-20).
     * @param _cycleDays         Duration of each cycle in days.
     * @param _treasury          Address that receives protocol fees (unused in MVP, kept for extensibility).
     */
    constructor(
        address _factory,
        uint256 _podId,
        address _token,
        uint256 _contributionAmount,
        uint8   _size,
        uint256 _cycleDays,
        address _treasury
    ) {
        require(_factory   != address(0), "Zero factory");
        require(_contributionAmount > 0,  "Zero contribution");
        require(_size >= 2 && _size <= 20, "Size must be 2-20");
        require(_cycleDays > 0,           "Zero cycle days");
        require(_treasury  != address(0), "Zero treasury");

        factory            = _factory;
        owner              = _factory;
        podId              = _podId;
        token              = _token;
        contributionAmount = _contributionAmount;
        size               = _size;
        cycleDuration      = _cycleDays * 1 days;
        treasury           = _treasury;
        podStatus          = PodStatus.OPEN;
        _guardStatus       = _NOT_ENTERED;
    }

    // ── Join ─────────────────────────────────────────────────────

    /**
     * @notice Join the pod by depositing collateral (2 × contributionAmount).
     *
     * For ETH pods: send exactly 2 × contributionAmount as msg.value.
     * For ERC-20 pods: approve this contract first, then call joinPod().
     *
     * Payout slots are assigned in join order (slot 0 = first joiner, etc.).
     * When the pod fills up it automatically transitions to ACTIVE.
     */
    function joinPod() external payable nonReentrant {
        require(podStatus == PodStatus.OPEN, "Pod not open");
        require(!isMember[msg.sender],       "Already a member");
        require(memberList.length < size,    "Pod is full");

        uint256 collateralRequired = contributionAmount * 2;

        if (token == address(0)) {
            // Native ETH collateral
            require(msg.value == collateralRequired, "Wrong ETH collateral amount");
        } else {
            // ERC-20 collateral — no ETH expected
            require(msg.value == 0, "ETH not accepted for token pods");
            bool ok = IERC20(token).transferFrom(msg.sender, address(this), collateralRequired);
            require(ok, "Collateral transfer failed");
        }

        uint8 slot = uint8(memberList.length); // 0-indexed join order == payout slot

        members[msg.sender] = Member({
            wallet:       msg.sender,
            payoutSlot:   slot,
            collateral:   collateralRequired,
            lastCyclePaid: 0,
            status:       MemberStatus.ACTIVE
        });

        isMember[msg.sender] = true;
        memberList.push(msg.sender);

        emit MemberJoined(podId, msg.sender, slot, collateralRequired);

        // Activate when the pod is full
        if (memberList.length == size) {
            podStatus     = PodStatus.ACTIVE;
            cycleStartedAt = block.timestamp;
            emit PodActivated(podId, memberList, block.timestamp);
        }
    }

    // ── Contribute ───────────────────────────────────────────────

    /**
     * @notice Pay your contribution for the given cycle.
     *
     * @param cycle The cycle index (0-indexed) to pay for.
     *              Must equal currentCycle.
     *
     * When all N active members have paid:
     *   - The pot (N × contributionAmount) is sent to the payout recipient.
     *   - currentCycle is incremented.
     *   - If all cycles are done: pod is COMPLETED and collateral is refunded.
     */
    function contribute(uint256 cycle) external payable nonReentrant onlyActive {
        require(isMember[msg.sender],                       "Not a member");
        require(members[msg.sender].status == MemberStatus.ACTIVE, "Member defaulted");
        require(cycle == currentCycle,                      "Wrong cycle");
        require(!cyclePaid[cycle][msg.sender],              "Already paid this cycle");

        if (token == address(0)) {
            require(msg.value == contributionAmount, "Wrong ETH contribution amount");
        } else {
            require(msg.value == 0, "ETH not accepted for token pods");
            bool ok = IERC20(token).transferFrom(msg.sender, address(this), contributionAmount);
            require(ok, "Contribution transfer failed");
        }

        // Mark paid (effects before interactions)
        cyclePaid[cycle][msg.sender]   = true;
        cyclePaymentCount[cycle]      += 1;
        members[msg.sender].lastCyclePaid = cycle + 1; // 1-indexed sentinel

        emit ContributionReceived(podId, msg.sender, cycle, contributionAmount);

        // Count active (non-defaulted) members to determine quorum
        uint256 activeCount = _activeCount();

        if (cyclePaymentCount[cycle] == activeCount) {
            // All active members have paid — release the pot
            _releasePot(cycle, activeCount);
        }
    }

    // ── Claim Refund ─────────────────────────────────────────────

    /**
     * @notice Claim collateral refund when the pod is CANCELLED.
     */
    function claimRefund() external nonReentrant {
        require(podStatus == PodStatus.CANCELLED, "Pod not cancelled");
        require(isMember[msg.sender],             "Not a member");

        uint256 amount = members[msg.sender].collateral;
        require(amount > 0, "No collateral to refund");

        // Effects before interactions
        members[msg.sender].collateral = 0;

        _send(msg.sender, amount);
        emit CollateralRefunded(podId, msg.sender, amount);
    }

    // ── Cancel ───────────────────────────────────────────────────

    /**
     * @notice Cancel an OPEN pod (before any member joins or immediately after
     *         the factory decides to abort). Collateral is not affected here —
     *         members must call claimRefund() individually.
     *
     * @dev  Only the factory/owner may cancel.
     */
    function cancelPod() external nonReentrant onlyOwner {
        require(podStatus == PodStatus.OPEN, "Can only cancel OPEN pods");
        podStatus = PodStatus.CANCELLED;
        emit PodCancelled(podId, block.timestamp);
    }

    // ── Mark Default ─────────────────────────────────────────────

    /**
     * @notice Mark a member as defaulted and distribute their collateral
     *         proportionally among the remaining active members.
     *
     * @dev  Call after the cycle deadline has passed without payment.
     *       The defaulting member forfeits their entire remaining collateral.
     *       Distribution is done here to avoid gas issues; if only 1 active
     *       member remains the contract completes automatically.
     *
     * @param member  Address of the defaulting member.
     */
    function markDefault(address member) external nonReentrant onlyOwner {
        require(podStatus == PodStatus.ACTIVE,                  "Pod not active");
        require(isMember[member],                               "Not a member");
        require(members[member].status == MemberStatus.ACTIVE,  "Already defaulted");
        require(
            block.timestamp > cycleStartedAt + cycleDuration,
            "Cycle deadline not passed"
        );

        uint256 slashed = members[member].collateral;
        members[member].collateral = 0;
        members[member].status     = MemberStatus.DEFAULTED;

        emit MemberDefaulted(podId, member, slashed);

        // Distribute slashed collateral to remaining active members
        uint256 remaining = _activeCount(); // recomputed after status change
        if (remaining > 0 && slashed > 0) {
            uint256 share  = slashed / remaining;
            uint256 leftover = slashed - (share * remaining);

            bool firstActive = true;
            for (uint256 i = 0; i < memberList.length; i++) {
                address m = memberList[i];
                if (members[m].status == MemberStatus.ACTIVE) {
                    if (firstActive && leftover > 0) {
                        // Give dust to first active member
                        members[m].collateral += share + leftover;
                        firstActive = false;
                    } else {
                        members[m].collateral += share;
                    }
                }
            }
        }

        // If only one member left, complete the pod and refund them
        if (remaining == 1) {
            _completeAndRefundAll();
        }
    }

    // ── Views ────────────────────────────────────────────────────

    function getMemberCount() external view returns (uint256) {
        return memberList.length;
    }

    function getMember(address wallet) external view returns (Member memory) {
        return members[wallet];
    }

    function getPayoutRecipient(uint256 cycle) public view returns (address) {
        // The member whose payoutSlot equals cycle receives the pot for that cycle
        for (uint256 i = 0; i < memberList.length; i++) {
            if (members[memberList[i]].payoutSlot == uint8(cycle)) {
                return memberList[i];
            }
        }
        return address(0);
    }

    function isDeadlinePassed() external view returns (bool) {
        return block.timestamp > cycleStartedAt + cycleDuration;
    }

    // ── Internal ─────────────────────────────────────────────────

    /**
     * @dev Release the pot for a completed cycle.
     *      Pot = activeCount × contributionAmount (defaulted members don't pay,
     *      so we use actual payment count which equals activeCount at trigger point).
     */
    function _releasePot(uint256 cycle, uint256 activeCount) internal {
        uint256 pot      = contributionAmount * activeCount;
        address recipient = getPayoutRecipient(cycle);

        // If the designated recipient defaulted, send to treasury
        if (recipient == address(0) || members[recipient].status == MemberStatus.DEFAULTED) {
            recipient = treasury;
        }

        // Advance cycle state before transfer (CEI)
        uint256 nextCycle = currentCycle + 1;
        currentCycle      = nextCycle;
        cycleStartedAt    = block.timestamp;

        emit PayoutSent(podId, recipient, cycle, pot);

        _send(recipient, pot);

        // If all cycles complete, wrap up
        if (nextCycle == size) {
            _completeAndRefundAll();
        }
    }

    /**
     * @dev Mark pod COMPLETED and refund all remaining collateral.
     */
    function _completeAndRefundAll() internal {
        podStatus = PodStatus.COMPLETED;
        emit PodCompleted(podId, block.timestamp);

        for (uint256 i = 0; i < memberList.length; i++) {
            address m = memberList[i];
            uint256 refund = members[m].collateral;
            if (refund > 0) {
                members[m].collateral = 0;
                _send(m, refund);
                emit CollateralRefunded(podId, m, refund);
            }
        }
    }

    /**
     * @dev Count members with ACTIVE status.
     */
    function _activeCount() internal view returns (uint256 count) {
        for (uint256 i = 0; i < memberList.length; i++) {
            if (members[memberList[i]].status == MemberStatus.ACTIVE) {
                count++;
            }
        }
    }

    /**
     * @dev Unified send: ETH or ERC-20.
     */
    function _send(address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok, ) = payable(to).call{value: amount}("");
            require(ok, "ETH transfer failed");
        } else {
            bool ok = IERC20(token).transfer(to, amount);
            require(ok, "Token transfer failed");
        }
    }

    // ── Admin ────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    // Reject stray ETH sends to token pods
    receive() external payable {
        require(token == address(0), "ETH not accepted for token pods");
    }
}
