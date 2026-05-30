// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Mock USDC for the IOPN testnet
/// @notice Standard ERC20 with 6 decimals and an open faucet. Testnet only.
contract MockUSDC is ERC20 {
    uint256 public constant MAX_MINT_PER_CALL = 10_000 * 1e6; // 10,000 mUSDC

    error ZeroAmount();
    error MintExceedsCap();

    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint up to MAX_MINT_PER_CALL mUSDC to the caller. Anyone may call.
    function mint(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (amount > MAX_MINT_PER_CALL) revert MintExceedsCap();
        _mint(msg.sender, amount);
    }
}
