// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title OpenSwap native-OPN <> mUSDC constant-product AMM
/// @notice Single pool, 0.30% fee retained in pool (LP yield), no admin.
contract OpenSwapPair is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ----- Constants -----
    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    uint256 public constant FEE_NUM = 997;
    uint256 public constant FEE_DEN = 1000;

    // ----- Storage (packed: 112 + 112 + 32 = 256 bits, slot 0) -----
    uint112 public reserveOPN;
    uint112 public reserveMUSDC;
    uint32 public blockTimestampLast; // reserved for future TWAP, no use in v1

    // ----- Immutable -----
    IERC20 public immutable mUSDC;

    // ----- Errors -----
    error ZeroAmount();
    error InsufficientLiquidity();
    error InsufficientLPMinted();
    error InsufficientOutput();
    error InvariantViolated();
    error TransferFailed();
    error Overflow();

    // ----- Events -----
    event Mint(address indexed provider, uint256 opnIn, uint256 mUSDCIn, uint256 lpMinted);
    event Burn(address indexed provider, uint256 opnOut, uint256 mUSDCOut, uint256 lpBurned);
    event Swap(address indexed trader, bool opnIsInput, uint256 amountIn, uint256 amountOut);
    event Sync(uint112 reserveOPN, uint112 reserveMUSDC);

    constructor(address mUSDCAddress) ERC20("OpenSwap LP", "OSP-LP") {
        mUSDC = IERC20(mUSDCAddress);
    }

    /// @notice Returns packed reserves and the last update timestamp.
    function getReserves() public view returns (uint112, uint112, uint32) {
        return (reserveOPN, reserveMUSDC, blockTimestampLast);
    }

    /// @dev Babylonian square root. From Uniswap v2.
    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    /// @dev Update packed reserves and timestamp. Reverts on uint112 overflow.
    function _update(uint256 newReserveOPN, uint256 newReserveMUSDC) internal {
        if (newReserveOPN > type(uint112).max || newReserveMUSDC > type(uint112).max) {
            revert Overflow();
        }
        reserveOPN = uint112(newReserveOPN);
        reserveMUSDC = uint112(newReserveMUSDC);
        blockTimestampLast = uint32(block.timestamp);
        emit Sync(reserveOPN, reserveMUSDC);
    }

    /// @dev Safe native-OPN send.
    function _sendOPN(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function addLiquidity(uint256 mUSDCIn) external payable nonReentrant returns (uint256 lpMinted) {
        uint256 opnIn = msg.value;
        if (opnIn == 0 || mUSDCIn == 0) revert ZeroAmount();

        uint256 supply = totalSupply();
        (uint112 r0, uint112 r1, ) = getReserves();

        // Pull mUSDC first (CEI: we'll send OPN refund in subsequent ratio case if needed,
        // but v1 has no refund — caller is responsible for ratio).
        IERC20(mUSDC).safeTransferFrom(msg.sender, address(this), mUSDCIn);

        if (supply == 0) {
            // First add: bootstrap. Lock MINIMUM_LIQUIDITY to dead address.
            // OZ v5 ERC20 rejects _mint(address(0)), so use canonical dead address instead.
            uint256 root = _sqrt(opnIn * mUSDCIn);
            if (root <= MINIMUM_LIQUIDITY) revert InsufficientLPMinted();
            lpMinted = root - MINIMUM_LIQUIDITY;
            _mint(address(0xdead), MINIMUM_LIQUIDITY);
        } else {
            uint256 fromOPN = (opnIn * supply) / uint256(r0);
            uint256 fromMUSDC = (mUSDCIn * supply) / uint256(r1);
            lpMinted = fromOPN < fromMUSDC ? fromOPN : fromMUSDC;
            if (lpMinted == 0) revert InsufficientLPMinted();
        }

        _mint(msg.sender, lpMinted);
        _update(uint256(r0) + opnIn, uint256(r1) + mUSDCIn);
        emit Mint(msg.sender, opnIn, mUSDCIn, lpMinted);
    }

    function removeLiquidity(uint256 lpAmount)
        external
        nonReentrant
        returns (uint256 opnOut, uint256 mUSDCOut)
    {
        if (lpAmount == 0) revert ZeroAmount();
        uint256 supply = totalSupply();
        if (supply == 0) revert InsufficientLiquidity();

        (uint112 r0, uint112 r1, ) = getReserves();
        opnOut = (lpAmount * uint256(r0)) / supply;
        mUSDCOut = (lpAmount * uint256(r1)) / supply;
        if (opnOut == 0 || mUSDCOut == 0) revert InsufficientLiquidity();

        _burn(msg.sender, lpAmount); // panics on overflow if user has fewer
        _update(uint256(r0) - opnOut, uint256(r1) - mUSDCOut);

        IERC20(mUSDC).safeTransfer(msg.sender, mUSDCOut);
        _sendOPN(msg.sender, opnOut);

        emit Burn(msg.sender, opnOut, mUSDCOut, lpAmount);
    }

    function swapOPNForMUSDC(uint256 minOut)
        external
        payable
        nonReentrant
        returns (uint256 amountOut)
    {
        uint256 amountIn = msg.value;
        if (amountIn == 0) revert ZeroAmount();
        (uint112 r0, uint112 r1, ) = getReserves();
        if (r0 == 0 || r1 == 0) revert InsufficientLiquidity();

        uint256 inWithFee = (amountIn * FEE_NUM) / FEE_DEN;
        amountOut = (inWithFee * uint256(r1)) / (uint256(r0) + inWithFee);
        if (amountOut < minOut) revert InsufficientOutput();
        if (amountOut == 0 || amountOut >= r1) revert InsufficientLiquidity();

        uint256 newR0 = uint256(r0) + amountIn;
        uint256 newR1 = uint256(r1) - amountOut;
        if (newR0 * newR1 < uint256(r0) * uint256(r1)) revert InvariantViolated();
        _update(newR0, newR1);

        IERC20(mUSDC).safeTransfer(msg.sender, amountOut);
        emit Swap(msg.sender, true, amountIn, amountOut);
    }

    function swapMUSDCForOPN(uint256 mUSDCIn, uint256 minOut)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (mUSDCIn == 0) revert ZeroAmount();
        (uint112 r0, uint112 r1, ) = getReserves();
        if (r0 == 0 || r1 == 0) revert InsufficientLiquidity();

        IERC20(mUSDC).safeTransferFrom(msg.sender, address(this), mUSDCIn);

        uint256 inWithFee = (mUSDCIn * FEE_NUM) / FEE_DEN;
        amountOut = (inWithFee * uint256(r0)) / (uint256(r1) + inWithFee);
        if (amountOut < minOut) revert InsufficientOutput();
        if (amountOut == 0 || amountOut >= r0) revert InsufficientLiquidity();

        uint256 newR0 = uint256(r0) - amountOut;
        uint256 newR1 = uint256(r1) + mUSDCIn;
        if (newR0 * newR1 < uint256(r0) * uint256(r1)) revert InvariantViolated();
        _update(newR0, newR1);

        _sendOPN(msg.sender, amountOut);
        emit Swap(msg.sender, false, mUSDCIn, amountOut);
    }

    function quoteSwap(uint256 amountIn, bool opnIsInput) external view returns (uint256) {
        (uint112 r0, uint112 r1, ) = getReserves();
        if (r0 == 0 || r1 == 0) revert InsufficientLiquidity();
        uint256 inWithFee = (amountIn * FEE_NUM) / FEE_DEN;
        if (opnIsInput) {
            return (inWithFee * uint256(r1)) / (uint256(r0) + inWithFee);
        }
        return (inWithFee * uint256(r0)) / (uint256(r1) + inWithFee);
    }

    function quoteAddLiquidity(uint256 opnIn, uint256 mUSDCIn)
        external
        view
        returns (uint256 lpToMint, uint256 opnUsed, uint256 mUSDCUsed)
    {
        if (opnIn == 0 || mUSDCIn == 0) revert ZeroAmount();
        uint256 supply = totalSupply();
        (uint112 r0, uint112 r1, ) = getReserves();
        if (supply == 0) {
            uint256 root = _sqrt(opnIn * mUSDCIn);
            if (root <= MINIMUM_LIQUIDITY) revert InsufficientLPMinted();
            return (root - MINIMUM_LIQUIDITY, opnIn, mUSDCIn);
        }
        uint256 fromOPN = (opnIn * supply) / uint256(r0);
        uint256 fromMUSDC = (mUSDCIn * supply) / uint256(r1);
        lpToMint = fromOPN < fromMUSDC ? fromOPN : fromMUSDC;
        return (lpToMint, opnIn, mUSDCIn);
    }
}
