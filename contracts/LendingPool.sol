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

    // ----- Interest accrual -----

    /// @dev Lazy linear interest accrual. Updates totalBorrowed, totalSupplied,
    ///      and the global borrowIndex based on elapsed time since lastAccrual.
    function _accrueInterest() internal {
        uint256 dt = block.timestamp - lastAccrual;
        if (dt == 0 || totalBorrowed == 0) {
            lastAccrual = block.timestamp;
            return;
        }
        // interestFactor = RATE_BPS * dt * WAD / (SECONDS_PER_YEAR * BPS_DENOM)
        uint256 interestFactor = (RATE_BPS * dt * WAD) / (SECONDS_PER_YEAR * BPS_DENOM);
        uint256 interest = (totalBorrowed * interestFactor) / WAD;
        totalBorrowed += interest;
        totalSupplied += interest;
        borrowIndex += (borrowIndex * interestFactor) / WAD;
        lastAccrual = block.timestamp;
        emit InterestAccrued(interest, borrowIndex);
    }

    /// @dev Test-only entry point so tests can advance accrual without
    ///      requiring supply/borrow paths to already exist. Safe to leave
    ///      in production: it only triggers accrual, never moves funds.
    function pokeAccrual() external {
        _accrueInterest();
    }

    /// @dev Test-only seed for accrual tests. Hardhat chain only (31337).
    ///      Removed entirely in Task 12 once real entry points exist.
    function testSeed(uint256 supplied, uint256 borrowedAmt) external {
        require(block.chainid == 31337, "test-only");
        require(totalSupplied == 0 && totalBorrowed == 0, "already seeded");
        totalSupplied = supplied;
        totalBorrowed = borrowedAmt;
        lastAccrual = block.timestamp;
    }

    // ----- Views -----

    function exchangeRate() public view returns (uint256) {
        if (totalShares == 0) return WAD;
        return (totalSupplied * WAD) / totalShares;
    }

    // ----- Supply -----

    function supply() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        _accrueInterest();
        uint256 shares = (msg.value * WAD) / exchangeRate();
        supplyShares[msg.sender] += shares;
        totalShares += shares;
        totalSupplied += msg.value;
        emit Supplied(msg.sender, msg.value, shares);
    }

    function withdraw(uint256 shares) external nonReentrant {
        if (shares == 0) revert ZeroAmount();
        _accrueInterest();
        uint256 amount = (shares * totalSupplied) / totalShares;
        if (amount > availableLiquidity()) revert InsufficientLiquidity();
        supplyShares[msg.sender] -= shares; // panics on overflow if user has fewer
        totalShares -= shares;
        totalSupplied -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount, shares);
    }

    function availableLiquidity() public view returns (uint256) {
        return totalSupplied - totalBorrowed;
    }

    // ----- Collateral -----

    function depositCollateral() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        _accrueInterest();
        collateral[msg.sender] += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    function withdrawCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrueInterest();
        uint256 bal = collateral[msg.sender];
        if (amount > bal) revert InsufficientCollateral();
        // Health check is enforced only when user has debt; debt path lands in Task 8.
        collateral[msg.sender] = bal - amount;
        if (_healthFactorAfter(msg.sender, collateral[msg.sender], debtOf(msg.sender)) < WAD) {
            revert Undercollateralized();
        }
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit CollateralWithdrawn(msg.sender, amount);
    }

    // ----- Debt views (stub bodies; full logic added in Borrow task) -----

    function debtOf(address user) public view returns (uint256) {
        uint256 principal = borrowed[user];
        if (principal == 0) return 0;
        return (principal * borrowIndex) / userBorrowIndex[user];
    }

    function _healthFactorAfter(
        address /*user*/,
        uint256 newCollateral,
        uint256 newDebt
    ) internal pure returns (uint256) {
        if (newDebt == 0) return type(uint256).max;
        return (newCollateral * LIQ_THRESHOLD_BPS * WAD) / (newDebt * BPS_DENOM);
    }
}
