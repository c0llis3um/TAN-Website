// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC20
 * @notice Minimal ERC-20 interface used by TandaPod.
 */
interface IERC20 {
    /// @notice Returns the token balance of `account`.
    function balanceOf(address account) external view returns (uint256);

    /// @notice Transfers `amount` tokens to `recipient`.
    /// @return success True if the transfer succeeded.
    function transfer(address recipient, uint256 amount) external returns (bool);

    /// @notice Transfers `amount` tokens from `sender` to `recipient` using the
    ///         caller's allowance.
    /// @return success True if the transfer succeeded.
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    /// @notice Approves `spender` to spend `amount` tokens on behalf of the caller.
    /// @return success True if the approval succeeded.
    function approve(address spender, uint256 amount) external returns (bool);

    /// @notice Returns the remaining allowance that `spender` has from `owner`.
    function allowance(address owner, address spender) external view returns (uint256);

    /// @notice Returns the number of decimals the token uses (e.g. 6 for USDC).
    function decimals() external view returns (uint8);
}
