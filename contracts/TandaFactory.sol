// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  TandaFactory v1.1
 * @notice Registry for DeFi Tanda (ROSCA) pods. Collects a creation fee in
 *         native ETH and forwards it to the treasury. Pod payment logic lives
 *         in TandaPod (deployed separately per pod).
 *
 * Payout methods:
 *   0 = random  (shuffled at pod activation)
 *   2 = fixed   (join order; slot 0 pays out first)
 *   (method 1 — bid-order — is reserved for a future governance vote)
 */
contract TandaFactory {

    string public constant VERSION = "1.1.0";

    // ── State ────────────────────────────────────────────────────

    address public owner;
    address public treasury;
    uint256 public creationFee;
    uint256 public podCount;
    bool    public paused;

    struct Pod {
        uint256 id;
        address organizer;
        uint8   size;
        uint8   payoutMethod;
        string  token;
        string  name;
        bool    active;
        uint256 createdAt;
    }

    mapping(uint256 => Pod)       public pods;
    mapping(address => uint256[]) public podsByOrganizer;

    // ── Events ───────────────────────────────────────────────────

    event PodCreated(
        uint256 indexed podId,
        address indexed organizer,
        uint8   size,
        uint8   payoutMethod,
        string  token,
        string  name,
        uint256 createdAt
    );
    event PodDeactivated(uint256 indexed podId);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event ETHRescued(address indexed to, uint256 amount);

    // ── Modifiers ────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Factory is paused");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────

    constructor(address _treasury, uint256 _creationFee) {
        require(_treasury != address(0), "Zero treasury");
        owner       = msg.sender;
        treasury    = _treasury;
        creationFee = _creationFee;
    }

    // ── Core ─────────────────────────────────────────────────────

    /**
     * @notice Register a new Tanda pod and pay the creation fee.
     *         Send at least `creationFee` ETH — excess is refunded.
     * @param size          Number of members (2–20).
     * @param payoutMethod  0 = random, 2 = fixed order.
     * @param token         Token symbol string ("ETH", "USDC", "RLUSD", …).
     * @param name          Human-readable pod name (1–64 chars).
     */
    function createPod(
        uint8          size,
        uint8          payoutMethod,
        string calldata token,
        string calldata name
    ) external payable whenNotPaused returns (uint256 podId) {
        require(size >= 2 && size <= 20,                  "Size must be 2-20");
        require(payoutMethod == 0 || payoutMethod == 2,   "Method: 0=random 2=fixed");
        require(msg.value >= creationFee,                 "Insufficient fee");
        require(bytes(name).length > 0 &&
                bytes(name).length <= 64,                 "Name must be 1-64 chars");
        require(bytes(token).length > 0,                  "Token required");

        // Forward fee to treasury
        if (creationFee > 0) {
            (bool sent,) = payable(treasury).call{value: creationFee}("");
            require(sent, "Fee transfer failed");
        }

        // Refund any excess ETH
        uint256 excess = msg.value - creationFee;
        if (excess > 0) {
            (bool ok,) = payable(msg.sender).call{value: excess}("");
            require(ok, "Excess refund failed");
        }

        podId = ++podCount;
        pods[podId] = Pod({
            id:           podId,
            organizer:    msg.sender,
            size:         size,
            payoutMethod: payoutMethod,
            token:        token,
            name:         name,
            active:       true,
            createdAt:    block.timestamp
        });
        podsByOrganizer[msg.sender].push(podId);

        emit PodCreated(podId, msg.sender, size, payoutMethod, token, name, block.timestamp);
    }

    // ── Views ────────────────────────────────────────────────────

    function getPod(uint256 podId) external view returns (Pod memory) {
        return pods[podId];
    }

    function getMyPods(address organizer) external view returns (uint256[] memory) {
        return podsByOrganizer[organizer];
    }

    // ── Admin ────────────────────────────────────────────────────

    /**
     * @notice Mark a pod as inactive (off-chain signal — does not affect TandaPod).
     */
    function deactivatePod(uint256 podId) external onlyOwner {
        require(pods[podId].id != 0, "Pod not found");
        pods[podId].active = false;
        emit PodDeactivated(podId);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero treasury");
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    function setFee(uint256 _fee) external onlyOwner {
        emit FeeUpdated(creationFee, _fee);
        creationFee = _fee;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice Rescue ETH accidentally sent directly to this contract.
     *         Forwards to treasury.
     */
    function rescueETH() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "Nothing to rescue");
        (bool ok,) = payable(treasury).call{value: bal}("");
        require(ok, "Rescue failed");
        emit ETHRescued(treasury, bal);
    }

    receive() external payable {}
}
