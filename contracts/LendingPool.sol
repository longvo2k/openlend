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
        uint256 newCollateral = bal - amount;
        if (_healthFactorAfter(msg.sender, newCollateral, debtOf(msg.sender)) < WAD) {
            revert Undercollateralized();
        }
        collateral[msg.sender] = newCollateral;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit CollateralWithdrawn(msg.sender, amount);
    }

    // ----- Borrow -----

    function borrow(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrueInterest();
        if (amount > availableLiquidity()) revert InsufficientLiquidity();

        // Snapshot current debt to user accounting.
        uint256 currentDebt = debtOf(msg.sender);
        uint256 newDebt = currentDebt + amount;

        // LTV check at borrow time (stricter than liquidation threshold).
        uint256 maxBorrow = (collateral[msg.sender] * LTV_BPS) / BPS_DENOM;
        if (newDebt > maxBorrow) revert Undercollateralized();

        // Persist user debt at current borrowIndex.
        borrowed[msg.sender] = newDebt;
        userBorrowIndex[msg.sender] = borrowIndex;
        totalBorrowed += amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Borrowed(msg.sender, amount);
    }

    // ----- Repay -----

    function repay() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        _accrueInterest();
        uint256 debt = debtOf(msg.sender);
        if (debt == 0) revert NoDebt();

        uint256 payment = msg.value > debt ? debt : msg.value;
        uint256 refund = msg.value - payment;

        // Update user debt: principal = remaining debt at current index.
        uint256 remaining = debt - payment;
        borrowed[msg.sender] = remaining;
        userBorrowIndex[msg.sender] = remaining == 0 ? 0 : borrowIndex;
        totalBorrowed -= payment;

        if (refund > 0) {
            (bool ok, ) = msg.sender.call{value: refund}("");
            if (!ok) revert TransferFailed();
        }
        emit Repaid(msg.sender, payment);
    }

    // ----- Liquidation -----

    function liquidate(address user) external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        _accrueInterest();

        uint256 debt = debtOf(user);
        if (debt == 0) revert NoDebt();
        if (healthFactor(user) >= WAD) revert HealthyPosition();

        // Close factor cap.
        uint256 maxRepay = (debt * CLOSE_FACTOR_BPS) / BPS_DENOM;
        uint256 payment = msg.value > maxRepay ? maxRepay : msg.value;
        uint256 refund = msg.value - payment;

        // Seize collateral = payment * (1 + bonus).
        uint256 seize = (payment * (BPS_DENOM + LIQ_BONUS_BPS)) / BPS_DENOM;
        uint256 userCollateral = collateral[user];
        if (seize > userCollateral) revert InsufficientCollateral();

        // Update borrower debt.
        uint256 remaining = debt - payment;
        borrowed[user] = remaining;
        userBorrowIndex[user] = remaining == 0 ? 0 : borrowIndex;
        totalBorrowed -= payment;

        // Move collateral.
        collateral[user] = userCollateral - seize;

        // Pay liquidator: seized collateral + any refund.
        uint256 toLiquidator = seize + refund;
        (bool ok, ) = msg.sender.call{value: toLiquidator}("");
        if (!ok) revert TransferFailed();

        emit Liquidated(msg.sender, user, payment, seize);
    }

    // ----- Debt + health factor views -----

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

    function healthFactor(address user) public view returns (uint256) {
        return _healthFactorAfter(user, collateral[user], debtOf(user));
    }

    function getAccountData(address user)
        external
        view
        returns (uint256 userCollateral, uint256 userDebt, uint256 hf, uint256 shares)
    {
        userCollateral = collateral[user];
        userDebt = debtOf(user);
        hf = healthFactor(user);
        shares = supplyShares[user];
    }
}
