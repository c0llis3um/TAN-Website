// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TandaFactory
 * @notice Creates and tracks DeFi Tanda (ROSCA) pods on EVM chains.
 *         Creation fee is paid in native ETH — no token approval needed.
 *
 * @dev Pilot version. Full payment/payout logic lives in TandaPod (Sprint 4).
 */
contract TandaFactory {

    // ── State ────────────────────────────────────────────────

    address public owner;
    address public treasury;
    uint256 public creationFee;   // in wei (e.g. 0.001 ETH)
    uint256 public podCount;

    struct Pod {
        uint256 id;
        address organizer;
        uint8   size;
        uint8   payoutMethod;   // 0=random 1=fixed 2=volunteer
        string  token;          // "ETH" | "USDC" | "USDT" — stored for off-chain use
        bool    active;
        uint256 createdAt;
    }

    mapping(uint256 => Pod) public pods;
    mapping(address => uint256[]) public podsByOrganizer;

    // ── Events ───────────────────────────────────────────────

    event PodCreated(
        uint256 indexed podId,
        address indexed organizer,
        uint8   size,
        uint8   payoutMethod,
        string  token,
        uint256 createdAt
    );

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeUpdated(uint256 oldFee, uint256 newFee);

    // ── Modifiers ────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ── Constructor ──────────────────────────────────────────

    constructor(address _treasury, uint256 _creationFee) {
        owner       = msg.sender;
        treasury    = _treasury;
        creationFee = _creationFee;
    }

    // ── Core ─────────────────────────────────────────────────

    /**
     * @notice Create a new Tanda pod.
     * @dev    Send at least `creationFee` ETH with this call.
     *         Excess ETH is refunded. No token approval needed.
     */
    function createPod(
        uint8  size,
        uint8  payoutMethod,
        string calldata token,
        string calldata name    // stored in event for off-chain indexing
    ) external payable returns (uint256 podId) {
        require(size >= 2 && size <= 20,  "Size must be 2-20");
        require(payoutMethod != 1,        "Bid-order disabled - pending legal review");
        require(payoutMethod <= 2,        "Invalid payout method");
        require(msg.value >= creationFee, "Insufficient ETH fee");

        // Forward fee to treasury
        if (creationFee > 0) {
            (bool sent, ) = payable(treasury).call{value: creationFee}("");
            require(sent, "Fee transfer failed");
        }

        // Refund excess ETH
        uint256 excess = msg.value - creationFee;
        if (excess > 0) {
            (bool refunded, ) = payable(msg.sender).call{value: excess}("");
            require(refunded, "Refund failed");
        }

        podId = ++podCount;

        pods[podId] = Pod({
            id:          podId,
            organizer:   msg.sender,
            size:        size,
            payoutMethod: payoutMethod,
            token:       token,
            active:      true,
            createdAt:   block.timestamp
        });

        podsByOrganizer[msg.sender].push(podId);

        emit PodCreated(podId, msg.sender, size, payoutMethod, token, block.timestamp);
    }

    // ── Views ────────────────────────────────────────────────

    function getPod(uint256 podId) external view returns (Pod memory) {
        return pods[podId];
    }

    function getMyPods(address organizer) external view returns (uint256[] memory) {
        return podsByOrganizer[organizer];
    }

    // ── Admin ────────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    function setFee(uint256 _fee) external onlyOwner {
        emit FeeUpdated(creationFee, _fee);
        creationFee = _fee;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    receive() external payable {}
}
