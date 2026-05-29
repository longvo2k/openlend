// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title OpenLend single-asset native-OPN lending pool
contract LendingPool is ReentrancyGuard {
    // ----- Constants -----
    uint256 public constant RATE_BPS = 500;            // 5.00% APR linear
    uint256 public constant LTV_BPS = 7500;            // 75% max LTV at borrow
    uint256 public constant LIQ_THRESHOLD_BPS = 8000;  // 80% liquidation threshold
    uint256 public constant LIQ_BONUS_BPS = 500;       // 5% liquidator bonus
    uint256 public constant CLOSE_FACTOR_BPS = 5000;   // 50% max debt repayable per liquidation
    uint256 public constant BPS_DENOM = 10000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant WAD = 1e18;

    // ----- Global state -----
    uint256 public totalSupplied;
    uint256 public totalBorrowed;
    uint256 public totalShares;
    uint256 public lastAccrual;
    uint256 public borrowIndex; // 1e18-scaled, starts at WAD

    // ----- Per-user state -----
    mapping(address => uint256) public supplyShares;
    mapping(address => uint256) public collateral;
    mapping(address => uint256) public borrowed;          // principal snapshot
    mapping(address => uint256) public userBorrowIndex;   // borrowIndex at last interaction

    // ----- Errors -----
    error ZeroAmount();
    error InsufficientLiquidity();
    error InsufficientCollateral();
    error Undercollateralized();
    error HealthyPosition();
    error NoDebt();
    error TransferFailed();
    error ExcessRepayment();

    // ----- Events -----
    event Supplied(address indexed user, uint256 amount, uint256 shares);
    event Withdrawn(address indexed user, uint256 amount, uint256 shares);
    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(address indexed liquidator, address indexed user, uint256 repaid, uint256 seized);
    event InterestAccrued(uint256 interest, uint256 newIndex);

    constructor() {
        borrowIndex = WAD;
        lastAccrual = block.timestamp;
    }
}
