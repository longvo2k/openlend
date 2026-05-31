// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PriceOracle
 * @notice Single-price oracle for OPN/mUSDC on IOPN testnet. Owner proposes
 *         a new price, waits TIMELOCK_DELAY, then commits. Public reads are
 *         free. See docs/superpowers/specs/2026-06-01-price-oracle-design.md.
 */
contract PriceOracle is Ownable {
    /// @notice Delay between propose and commit.
    uint256 public constant TIMELOCK_DELAY = 1 hours;

    /// @notice Active price, 1e18-scaled mUSDC per OPN.
    uint256 public currentPrice;

    /// @notice Proposed price awaiting commit, 1e18-scaled.
    uint256 public pendingPrice;

    /// @notice Unix seconds at which pendingPrice becomes committable.
    /// @dev    Zero means no proposal is pending.
    uint256 public pendingUnlockTime;

    error InvalidPrice();

    constructor(uint256 initialPrice) Ownable(msg.sender) {
        if (initialPrice == 0) revert InvalidPrice();
        currentPrice = initialPrice;
    }
}
