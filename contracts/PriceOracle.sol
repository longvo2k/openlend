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
    error ProposalAlreadyPending();
    error NoProposalPending();
    error TimelockNotElapsed();

    event PriceProposed(uint256 newPrice, uint256 unlockTime);
    event PriceProposalCanceled(uint256 canceledPrice);
    event PriceCommitted(uint256 oldPrice, uint256 newPrice);

    constructor(uint256 initialPrice) Ownable(msg.sender) {
        if (initialPrice == 0) revert InvalidPrice();
        currentPrice = initialPrice;
    }

    /**
     * @notice Owner proposes a new price. Cannot commit until
     *         TIMELOCK_DELAY has elapsed.
     */
    function proposeNewPrice(uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert InvalidPrice();
        if (pendingUnlockTime != 0) revert ProposalAlreadyPending();
        pendingPrice = newPrice;
        pendingUnlockTime = block.timestamp + TIMELOCK_DELAY;
        emit PriceProposed(newPrice, pendingUnlockTime);
    }

    /**
     * @notice Owner cancels a pending proposal before it is committed.
     */
    function cancelProposal() external onlyOwner {
        if (pendingUnlockTime == 0) revert NoProposalPending();
        uint256 canceledPrice = pendingPrice;
        pendingPrice = 0;
        pendingUnlockTime = 0;
        emit PriceProposalCanceled(canceledPrice);
    }

    /**
     * @notice Owner commits the pending proposal after the timelock has
     *         elapsed.
     */
    function commitNewPrice() external onlyOwner {
        if (pendingUnlockTime == 0) revert NoProposalPending();
        if (block.timestamp < pendingUnlockTime) revert TimelockNotElapsed();
        uint256 oldPrice = currentPrice;
        currentPrice = pendingPrice;
        pendingPrice = 0;
        pendingUnlockTime = 0;
        emit PriceCommitted(oldPrice, currentPrice);
    }
}
