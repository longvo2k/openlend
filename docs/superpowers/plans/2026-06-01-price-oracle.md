# PriceOracle v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone admin-set OPN/mUSDC price oracle on IOPN testnet with a 1-hour propose-then-commit timelock, plus a small frontend badge that surfaces the current price on the Lending Dashboard.

**Architecture:** A tiny Ownable contract holds three storage words (currentPrice, pendingPrice, pendingUnlockTime) and four state-changing functions (proposeNewPrice, cancelProposal, commitNewPrice, plus the constructor). Reads are free. The contract has no consumers in this phase: the frontend reads `getPrice()` for display only. Multi-asset lending will integrate it later.

**Tech Stack:** Solidity 0.8.24, OpenZeppelin v5 (`Ownable`), Hardhat, TypeScript, Mocha+chai via `@nomicfoundation/hardhat-toolbox`. Frontend: Next.js 14 App Router, wagmi v2, viem, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-01-price-oracle-design.md` (commit `c223ac1`)

**Branch:** `feat/price-oracle` (already created off `develop`).

**Spec-vs-codebase note:** Spec said "require-string errors to match existing"; in fact `LendingPool` uses custom errors (`error ZeroAmount();`). This plan uses custom errors, matching the actual codebase pattern.

**Verification model:**
- Contracts: TDD via `npm run test` (Mocha+chai). Coverage target ≥ 90% lines via `npm run coverage`.
- Frontend: `npm run typecheck` (no test runner per CLAUDE.md).

---

## Task 1: Contract skeleton + constructor (TDD)

**Files:**
- Create: `contracts/PriceOracle.sol`
- Create: `test/PriceOracle.test.ts`

- [ ] **Step 1: Write the failing test for the constructor**

Write `test/PriceOracle.test.ts`:

```ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { PriceOracle } from "../typechain-types";

describe("PriceOracle", () => {
  async function deploy(initialPrice = ethers.parseEther("100")) {
    const [deployer, alice] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PriceOracle");
    const oracle = (await Factory.deploy(initialPrice)) as unknown as PriceOracle;
    await oracle.waitForDeployment();
    return { oracle, deployer, alice, initialPrice };
  }

  describe("Construction", () => {
    it("stores the initial price", async () => {
      const { oracle, initialPrice } = await deploy();
      expect(await oracle.currentPrice()).to.equal(initialPrice);
    });

    it("sets deployer as owner", async () => {
      const { oracle, deployer } = await deploy();
      expect(await oracle.owner()).to.equal(deployer.address);
    });

    it("starts with no pending proposal", async () => {
      const { oracle } = await deploy();
      expect(await oracle.pendingPrice()).to.equal(0n);
      expect(await oracle.pendingUnlockTime()).to.equal(0n);
    });

    it("exposes the 1-hour timelock as a constant", async () => {
      const { oracle } = await deploy();
      expect(await oracle.TIMELOCK_DELAY()).to.equal(3600n);
    });

    it("reverts on zero initial price", async () => {
      const Factory = await ethers.getContractFactory("PriceOracle");
      await expect(Factory.deploy(0)).to.be.revertedWithCustomError(
        Factory,
        "InvalidPrice",
      );
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm run test -- --grep "PriceOracle"
```

Expected: failure compiling because `contracts/PriceOracle.sol` does not exist.

- [ ] **Step 3: Implement the minimal contract**

Write `contracts/PriceOracle.sol`:

```solidity
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
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npm run test -- --grep "PriceOracle"
```

Expected: 5 passing in the `Construction` describe block.

- [ ] **Step 5: Commit**

```bash
git add contracts/PriceOracle.sol test/PriceOracle.test.ts
git commit -m "$(cat <<'EOF'
feat(contracts): PriceOracle skeleton with constructor + state fields

Adds the contract shell plus failing-then-passing tests for the
constructor: stores initialPrice, sets deployer owner, leaves the
pending slots at zero, exposes TIMELOCK_DELAY as 1 hour, reverts
on zero initialPrice via InvalidPrice custom error.

Spec: docs/superpowers/specs/2026-06-01-price-oracle-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `proposeNewPrice` (TDD)

**Files:**
- Modify: `contracts/PriceOracle.sol`
- Modify: `test/PriceOracle.test.ts`

- [ ] **Step 1: Add failing tests for propose**

Append inside the `describe("PriceOracle", ...)` block of `test/PriceOracle.test.ts`, after the `Construction` describe:

```ts
  describe("proposeNewPrice", () => {
    it("stores pending price and computes unlock time", async () => {
      const { oracle } = await deploy();
      const newPrice = ethers.parseEther("120");
      const tx = await oracle.proposeNewPrice(newPrice);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const expectedUnlock = BigInt(block!.timestamp) + 3600n;
      expect(await oracle.pendingPrice()).to.equal(newPrice);
      expect(await oracle.pendingUnlockTime()).to.equal(expectedUnlock);
    });

    it("emits PriceProposed with the unlock time", async () => {
      const { oracle } = await deploy();
      const newPrice = ethers.parseEther("120");
      const tx = await oracle.proposeNewPrice(newPrice);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const expectedUnlock = BigInt(block!.timestamp) + 3600n;
      await expect(tx)
        .to.emit(oracle, "PriceProposed")
        .withArgs(newPrice, expectedUnlock);
    });

    it("reverts when a proposal is already pending", async () => {
      const { oracle } = await deploy();
      await oracle.proposeNewPrice(ethers.parseEther("120"));
      await expect(
        oracle.proposeNewPrice(ethers.parseEther("130")),
      ).to.be.revertedWithCustomError(oracle, "ProposalAlreadyPending");
    });

    it("reverts on zero new price", async () => {
      const { oracle } = await deploy();
      await expect(oracle.proposeNewPrice(0)).to.be.revertedWithCustomError(
        oracle,
        "InvalidPrice",
      );
    });

    it("reverts when called by non-owner", async () => {
      const { oracle, alice } = await deploy();
      await expect(
        oracle.connect(alice).proposeNewPrice(ethers.parseEther("120")),
      ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- --grep "proposeNewPrice"
```

Expected: 5 failures (function does not exist).

- [ ] **Step 3: Implement `proposeNewPrice`**

In `contracts/PriceOracle.sol`, add the error and event under the existing `error InvalidPrice();` line:

```solidity
    error InvalidPrice();
    error ProposalAlreadyPending();

    event PriceProposed(uint256 newPrice, uint256 unlockTime);
```

Then add this function below the constructor:

```solidity
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test -- --grep "proposeNewPrice"
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add contracts/PriceOracle.sol test/PriceOracle.test.ts
git commit -m "$(cat <<'EOF'
feat(contracts): PriceOracle.proposeNewPrice with onlyOwner timelock seed

Owner-only entry that records pendingPrice and computes unlockTime as
block.timestamp + TIMELOCK_DELAY. Reverts on zero newPrice
(InvalidPrice) and when a proposal is already pending
(ProposalAlreadyPending). Emits PriceProposed(newPrice, unlockTime).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `cancelProposal` (TDD)

**Files:**
- Modify: `contracts/PriceOracle.sol`
- Modify: `test/PriceOracle.test.ts`

- [ ] **Step 1: Add failing tests**

Append a new describe inside `describe("PriceOracle", ...)`, after the `proposeNewPrice` describe:

```ts
  describe("cancelProposal", () => {
    it("clears the pending proposal and emits PriceProposalCanceled", async () => {
      const { oracle } = await deploy();
      const newPrice = ethers.parseEther("120");
      await oracle.proposeNewPrice(newPrice);
      await expect(oracle.cancelProposal())
        .to.emit(oracle, "PriceProposalCanceled")
        .withArgs(newPrice);
      expect(await oracle.pendingPrice()).to.equal(0n);
      expect(await oracle.pendingUnlockTime()).to.equal(0n);
    });

    it("reverts when there is no pending proposal", async () => {
      const { oracle } = await deploy();
      await expect(oracle.cancelProposal()).to.be.revertedWithCustomError(
        oracle,
        "NoProposalPending",
      );
    });

    it("reverts when called by non-owner", async () => {
      const { oracle, alice } = await deploy();
      await oracle.proposeNewPrice(ethers.parseEther("120"));
      await expect(
        oracle.connect(alice).cancelProposal(),
      ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- --grep "cancelProposal"
```

Expected: 3 failures.

- [ ] **Step 3: Implement `cancelProposal`**

Add error + event:

```solidity
    error NoProposalPending();

    event PriceProposalCanceled(uint256 canceledPrice);
```

Add the function below `proposeNewPrice`:

```solidity
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test -- --grep "cancelProposal"
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add contracts/PriceOracle.sol test/PriceOracle.test.ts
git commit -m "$(cat <<'EOF'
feat(contracts): PriceOracle.cancelProposal

Owner-only entry that clears a pending proposal and emits
PriceProposalCanceled with the cancelled price. Reverts when no
proposal is pending (NoProposalPending) and when called by non-owner.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `commitNewPrice` (TDD)

**Files:**
- Modify: `contracts/PriceOracle.sol`
- Modify: `test/PriceOracle.test.ts`

- [ ] **Step 1: Add failing tests**

Append a new describe inside `describe("PriceOracle", ...)`, after `cancelProposal`:

```ts
  describe("commitNewPrice", () => {
    it("reverts when no proposal is pending", async () => {
      const { oracle } = await deploy();
      await expect(oracle.commitNewPrice()).to.be.revertedWithCustomError(
        oracle,
        "NoProposalPending",
      );
    });

    it("reverts before the timelock elapses", async () => {
      const { oracle } = await deploy();
      await oracle.proposeNewPrice(ethers.parseEther("120"));
      // Advance 59 minutes 50 seconds — still before the 1-hour unlock.
      await ethers.provider.send("evm_increaseTime", [3590]);
      await ethers.provider.send("evm_mine", []);
      await expect(oracle.commitNewPrice()).to.be.revertedWithCustomError(
        oracle,
        "TimelockNotElapsed",
      );
    });

    it("succeeds at the unlock time and updates currentPrice", async () => {
      const { oracle, initialPrice } = await deploy();
      const newPrice = ethers.parseEther("120");
      await oracle.proposeNewPrice(newPrice);
      // Advance exactly TIMELOCK_DELAY.
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine", []);
      await expect(oracle.commitNewPrice())
        .to.emit(oracle, "PriceCommitted")
        .withArgs(initialPrice, newPrice);
      expect(await oracle.currentPrice()).to.equal(newPrice);
      expect(await oracle.pendingPrice()).to.equal(0n);
      expect(await oracle.pendingUnlockTime()).to.equal(0n);
    });

    it("reverts when called by non-owner", async () => {
      const { oracle, alice } = await deploy();
      await oracle.proposeNewPrice(ethers.parseEther("120"));
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine", []);
      await expect(
        oracle.connect(alice).commitNewPrice(),
      ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
    });

    it("supports multiple propose-commit cycles", async () => {
      const { oracle } = await deploy();
      const p1 = ethers.parseEther("120");
      const p2 = ethers.parseEther("130");
      await oracle.proposeNewPrice(p1);
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine", []);
      await oracle.commitNewPrice();
      expect(await oracle.currentPrice()).to.equal(p1);

      await oracle.proposeNewPrice(p2);
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine", []);
      await oracle.commitNewPrice();
      expect(await oracle.currentPrice()).to.equal(p2);
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- --grep "commitNewPrice"
```

Expected: 5 failures.

- [ ] **Step 3: Implement `commitNewPrice`**

Add error + event:

```solidity
    error TimelockNotElapsed();

    event PriceCommitted(uint256 oldPrice, uint256 newPrice);
```

Add the function below `cancelProposal`:

```solidity
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test -- --grep "commitNewPrice"
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add contracts/PriceOracle.sol test/PriceOracle.test.ts
git commit -m "$(cat <<'EOF'
feat(contracts): PriceOracle.commitNewPrice with TimelockNotElapsed guard

Owner-only entry that promotes pendingPrice to currentPrice once
block.timestamp >= pendingUnlockTime. Clears pending state and
emits PriceCommitted(oldPrice, newPrice). Reverts when no proposal
is pending or when called before the timelock elapses.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `pendingProposal` view + getPrice alias

**Files:**
- Modify: `contracts/PriceOracle.sol`
- Modify: `test/PriceOracle.test.ts`

- [ ] **Step 1: Add failing tests for the view**

Append a new describe inside `describe("PriceOracle", ...)`:

```ts
  describe("pendingProposal view", () => {
    it("returns zero/zero/false when no proposal exists", async () => {
      const { oracle } = await deploy();
      const [price, unlockTime, canCommit] = await oracle.pendingProposal();
      expect(price).to.equal(0n);
      expect(unlockTime).to.equal(0n);
      expect(canCommit).to.equal(false);
    });

    it("returns pending price + unlock + canCommit=false before unlock", async () => {
      const { oracle } = await deploy();
      const newPrice = ethers.parseEther("120");
      await oracle.proposeNewPrice(newPrice);
      const [price, unlockTime, canCommit] = await oracle.pendingProposal();
      expect(price).to.equal(newPrice);
      expect(unlockTime).to.be.gt(0n);
      expect(canCommit).to.equal(false);
    });

    it("returns canCommit=true once block.timestamp reaches unlockTime", async () => {
      const { oracle } = await deploy();
      await oracle.proposeNewPrice(ethers.parseEther("120"));
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine", []);
      const [, , canCommit] = await oracle.pendingProposal();
      expect(canCommit).to.equal(true);
    });
  });

  describe("getPrice", () => {
    it("returns currentPrice", async () => {
      const { oracle, initialPrice } = await deploy();
      expect(await oracle.getPrice()).to.equal(initialPrice);
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- --grep "pendingProposal view"
```

Expected: 3 failures.

```bash
npm run test -- --grep "getPrice"
```

Expected: 1 failure.

- [ ] **Step 3: Implement both**

Add at the bottom of the contract, before the closing brace:

```solidity
    /// @notice Returns the active price. Sugar over `currentPrice`.
    function getPrice() external view returns (uint256) {
        return currentPrice;
    }

    /**
     * @notice Returns the pending proposal snapshot for UI consumption.
     * @return newPrice    The proposed price, or zero if none pending.
     * @return unlockTime  Unix seconds at which commit becomes possible.
     * @return canCommit   True iff a proposal exists and the timelock has
     *                     elapsed.
     */
    function pendingProposal()
        external
        view
        returns (uint256 newPrice, uint256 unlockTime, bool canCommit)
    {
        newPrice = pendingPrice;
        unlockTime = pendingUnlockTime;
        canCommit = unlockTime != 0 && block.timestamp >= unlockTime;
    }
```

- [ ] **Step 4: Run all PriceOracle tests**

```bash
npm run test -- --grep "PriceOracle"
```

Expected: all describe blocks passing (Construction 5, propose 5, cancel 3, commit 5, pendingProposal 3, getPrice 1 = 22 tests).

- [ ] **Step 5: Commit**

```bash
git add contracts/PriceOracle.sol test/PriceOracle.test.ts
git commit -m "$(cat <<'EOF'
feat(contracts): PriceOracle view helpers (getPrice, pendingProposal)

getPrice() is a sugar alias for currentPrice so consumers can use a
single read regardless of whether the source is admin-set or replaced
by a Pyth/Chainlink feed later. pendingProposal() returns a tuple
(newPrice, unlockTime, canCommit) for cheap UI consumption — the
canCommit flag is computed on-chain so the frontend does not need a
clock comparison.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Coverage check

**Files:** none modified

- [ ] **Step 1: Run the coverage tool**

```bash
npm run coverage -- --testfiles "test/PriceOracle.test.ts"
```

If that flag form is unsupported, run full coverage:

```bash
npm run coverage
```

Expected: report shows `contracts/PriceOracle.sol` with line coverage ≥ 90%, branch coverage ≥ 75% (typical for the project).

- [ ] **Step 2: If coverage falls short, add targeted tests**

For each uncovered line, add a test that exercises it inside the corresponding describe block in `test/PriceOracle.test.ts`. Re-run `npm run coverage`. Repeat until threshold is met. Commit the additional tests with a message like `test(contracts): raise PriceOracle coverage to ≥90%`.

- [ ] **Step 3: Confirm coverage and continue**

No commit needed if coverage was already ≥ 90% on first run.

---

## Task 7: Extend `scripts/deploy.ts` to deploy PriceOracle

**Files:**
- Modify: `scripts/deploy.ts`

- [ ] **Step 1: Read the existing deploy script for context**

Open `scripts/deploy.ts`. The current shape deploys LendingPool, MockUSDC, and OpenSwapPair in order, then writes the merged JSON. The new PriceOracle deploy must come fourth (after the pair, so we can read `getReserves` for the initial price).

- [ ] **Step 2: Replace the entire file with the extended version**

Write `scripts/deploy.ts`:

```ts
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys all four protocol contracts and writes their addresses to
 * `deployments/<network>.json`:
 *
 *   1. LendingPool       (Lend money market)
 *   2. MockUSDC          (open-faucet ERC-20 used by Swap)
 *   3. OpenSwapPair      (OPN <> mUSDC AMM)
 *   4. PriceOracle       (admin-set OPN/mUSDC price with 1h timelock)
 *
 * The deployment JSON preserves existing fields it does not overwrite, so
 * partial re-deploys are possible by commenting out a block below.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} OPN`);
  console.log(`Network:  ${network.name} (chainId ${network.config.chainId})`);

  // -------- 1. LendingPool --------
  const LP = await ethers.getContractFactory("LendingPool");
  const lendingPool = await LP.deploy();
  await lendingPool.waitForDeployment();
  const lendingPoolAddr = await lendingPool.getAddress();
  console.log(`LendingPool   deployed: ${lendingPoolAddr}`);

  // -------- 2. MockUSDC --------
  const USDC = await ethers.getContractFactory("MockUSDC");
  const mUSDC = await USDC.deploy();
  await mUSDC.waitForDeployment();
  const mUSDCAddr = await mUSDC.getAddress();
  console.log(`MockUSDC      deployed: ${mUSDCAddr}`);

  // -------- 3. OpenSwapPair --------
  const Pair = await ethers.getContractFactory("OpenSwapPair");
  const pair = await Pair.deploy(mUSDCAddr);
  await pair.waitForDeployment();
  const pairAddr = await pair.getAddress();
  console.log(`OpenSwapPair  deployed: ${pairAddr}`);

  // -------- 4. PriceOracle --------
  // Initial price = mUSDC per OPN, 1e18-scaled. Compute from the pool's
  // current spot ratio if it has been bootstrapped; otherwise fall back
  // to 100 mUSDC per OPN as a sentinel.
  //
  // Decimal conversion: reserveOPN is 18-decimal wei, reserveMUSDC is
  // 6-decimal wei. To land at 1e18-scaled mUSDC-per-OPN we multiply by
  // 1e30 before dividing — (reserveMUSDC * 1e30) / reserveOPN.
  const reserves = await pair.getReserves();
  const reserveOPN = reserves[0];
  const reserveMUSDC = reserves[1];
  const sentinel = ethers.parseEther("100");
  const initialPrice =
    reserveOPN > 0n && reserveMUSDC > 0n
      ? (reserveMUSDC * 10n ** 30n) / reserveOPN
      : sentinel;
  console.log(
    `Initial oracle price: ${ethers.formatEther(initialPrice)} mUSDC per OPN ` +
      `(${reserveOPN > 0n ? "from pool spot" : "sentinel — pool empty"})`,
  );
  const Oracle = await ethers.getContractFactory("PriceOracle");
  const oracle = await Oracle.deploy(initialPrice);
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();
  console.log(`PriceOracle   deployed: ${oracleAddr}`);

  // -------- Write merged deployment record --------
  const dir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}.json`);

  // Preserve any unrelated fields from a prior deployment record.
  const prev: Record<string, unknown> = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : {};

  const record = {
    ...prev,
    network: network.name,
    chainId: network.config.chainId,
    lendingPool: lendingPoolAddr,
    mUSDC: mUSDCAddr,
    openSwapPair: pairAddr,
    priceOracle: oracleAddr,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(file, JSON.stringify(record, null, 2));
  console.log(`\nWrote ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Smoke-test against a local Hardhat node**

In one terminal:

```bash
npx hardhat node
```

In another:

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

Expected output ends with `PriceOracle deployed: 0x...` and the JSON at `deployments/hardhat.json` contains a `priceOracle` field. The initial-price log line should read `Initial oracle price: 100.0 mUSDC per OPN (sentinel - pool empty)` since the pair has no liquidity yet.

Stop the Hardhat node with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy.ts deployments/hardhat.json
git commit -m "$(cat <<'EOF'
feat(scripts): deploy PriceOracle as the fourth contract

Extends deploy.ts to deploy PriceOracle with an initial price computed
from the OpenSwapPair spot ratio when reserves exist, falling back to
100 mUSDC per OPN otherwise. Decimal math is `(reserveMUSDC * 1e30) /
reserveOPN` because reserveOPN is 18-decimal wei and reserveMUSDC is
6-decimal wei but we want a 1e18-scaled mUSDC-per-OPN result. Records
the new address under `priceOracle` in the deployment JSON, preserving
existing fields.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Interaction scripts + npm aliases

**Files:**
- Create: `scripts/oracle-propose.ts`
- Create: `scripts/oracle-commit.ts`
- Create: `scripts/oracle-cancel.ts`
- Create: `scripts/oracle-show.ts`
- Modify: `package.json`

- [ ] **Step 1: Write `scripts/oracle-propose.ts`**

```ts
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadOracleAddr(): string {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run deploy first.`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!json.priceOracle) throw new Error("No priceOracle in deployment JSON.");
  return json.priceOracle as string;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    throw new Error(
      "Usage: hardhat run scripts/oracle-propose.ts --network <net> <mUSDCPerOPN>",
    );
  }
  const newPrice = ethers.parseEther(arg);
  const addr = loadOracleAddr();
  const oracle = await ethers.getContractAt("PriceOracle", addr);
  const tx = await oracle.proposeNewPrice(newPrice);
  console.log(`propose ${arg} mUSDC per OPN — tx ${tx.hash}`);
  const receipt = await tx.wait();
  const block = await ethers.provider.getBlock(receipt!.blockNumber);
  const unlockTime = Number(block!.timestamp) + 3600;
  console.log(`unlocks at unix ${unlockTime} (≈ ${new Date(unlockTime * 1000).toISOString()})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Write `scripts/oracle-commit.ts`**

```ts
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadOracleAddr(): string {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run deploy first.`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!json.priceOracle) throw new Error("No priceOracle in deployment JSON.");
  return json.priceOracle as string;
}

async function main() {
  const addr = loadOracleAddr();
  const oracle = await ethers.getContractAt("PriceOracle", addr);
  const oldPrice = await oracle.currentPrice();
  const pending = await oracle.pendingPrice();
  const tx = await oracle.commitNewPrice();
  console.log(`commit ${ethers.formatEther(oldPrice)} -> ${ethers.formatEther(pending)} — tx ${tx.hash}`);
  await tx.wait();
  console.log("confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Write `scripts/oracle-cancel.ts`**

```ts
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadOracleAddr(): string {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run deploy first.`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!json.priceOracle) throw new Error("No priceOracle in deployment JSON.");
  return json.priceOracle as string;
}

async function main() {
  const addr = loadOracleAddr();
  const oracle = await ethers.getContractAt("PriceOracle", addr);
  const pending = await oracle.pendingPrice();
  const tx = await oracle.cancelProposal();
  console.log(`cancel pending ${ethers.formatEther(pending)} — tx ${tx.hash}`);
  await tx.wait();
  console.log("confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: Write `scripts/oracle-show.ts`**

```ts
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadOracleAddr(): string {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run deploy first.`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!json.priceOracle) throw new Error("No priceOracle in deployment JSON.");
  return json.priceOracle as string;
}

async function main() {
  const addr = loadOracleAddr();
  const oracle = await ethers.getContractAt("PriceOracle", addr);
  const current = await oracle.currentPrice();
  const [pendingPrice, unlockTime, canCommit] = await oracle.pendingProposal();
  console.log(`PriceOracle: ${addr}`);
  console.log(`current:      ${ethers.formatEther(current)} mUSDC per OPN`);
  if (unlockTime === 0n) {
    console.log("pending:      none");
    return;
  }
  console.log(`pending:      ${ethers.formatEther(pendingPrice)} mUSDC per OPN`);
  console.log(`unlock at:    unix ${unlockTime} (${new Date(Number(unlockTime) * 1000).toISOString()})`);
  console.log(`canCommit:    ${canCommit}`);
  if (!canCommit) {
    const now = Math.floor(Date.now() / 1000);
    const secondsLeft = Number(unlockTime) - now;
    if (secondsLeft > 0) {
      const m = Math.floor(secondsLeft / 60);
      const s = secondsLeft % 60;
      console.log(`time left:    ${m}m ${s}s`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 5: Add npm script aliases to `package.json`**

In `package.json`, add the following four entries to the `"scripts"` object (place them after `"swap-musdc-for-opn"`):

```json
"oracle:propose": "hardhat run scripts/oracle-propose.ts --network iopnTestnet",
"oracle:commit":  "hardhat run scripts/oracle-commit.ts --network iopnTestnet",
"oracle:cancel":  "hardhat run scripts/oracle-cancel.ts --network iopnTestnet",
"oracle:show":    "hardhat run scripts/oracle-show.ts --network iopnTestnet"
```

- [ ] **Step 6: Smoke-test against the local Hardhat node**

In one terminal: `npx hardhat node`

In another, after running `npx hardhat run scripts/deploy.ts --network localhost`:

```bash
npx hardhat run scripts/oracle-show.ts --network localhost
```

Expected output includes `current: 100.0 mUSDC per OPN` and `pending: none`.

```bash
npx hardhat run scripts/oracle-propose.ts --network localhost -- 120
```

Expected: prints `propose 120 mUSDC per OPN — tx 0x...` and an unlock time.

```bash
npx hardhat run scripts/oracle-show.ts --network localhost
```

Expected: pending is now 120 with a future unlock time, `canCommit: false`.

Stop the Hardhat node.

- [ ] **Step 7: Commit**

```bash
git add scripts/oracle-propose.ts scripts/oracle-commit.ts scripts/oracle-cancel.ts scripts/oracle-show.ts package.json
git commit -m "$(cat <<'EOF'
feat(scripts): Hardhat scripts for PriceOracle (propose/commit/cancel/show)

Adds four CLI scripts plus npm aliases (oracle:propose, oracle:commit,
oracle:cancel, oracle:show). All four read the deployed address from
deployments/<network>.json. oracle-propose takes a decimal string
(mUSDC per OPN) and parses to 1e18 wei. oracle-show is read-only and
prints current price, pending state, unlock time, and remaining
seconds until commit becomes possible.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Frontend ABI + contract loader + env vars + sync script

**Files:**
- Create: `frontend/lib/abi/PriceOracle.json`
- Modify: `frontend/lib/contract.ts`
- Modify: `frontend/.env.example`
- Modify: `frontend/scripts/sync-address.mjs`

- [ ] **Step 1: Copy the freshly compiled ABI**

```bash
mkdir -p frontend/lib/abi
cp artifacts/contracts/PriceOracle.sol/PriceOracle.json frontend/lib/abi/PriceOracle.json
```

If `artifacts/` is missing, run `npm run compile` first.

- [ ] **Step 2: Extend `frontend/lib/contract.ts`**

Add to the top of the file alongside the other ABI imports:

```ts
import PriceOracleJson from './abi/PriceOracle.json';
```

Add to the exports near the other ABIs:

```ts
export const priceOracleAbi = PriceOracleJson.abi;
```

Add the address loader near the other `get*Address` functions. **The static `process.env.NEXT_PUBLIC_X` pattern is required per CLAUDE.md** — do not DRY this into a parameterized helper.

```ts
export function getPriceOracleAddress(chainId: number): Hex | null {
  if (chainId === 984) return check(process.env.NEXT_PUBLIC_PRICE_ORACLE_TESTNET);
  if (chainId === 31337) return check(process.env.NEXT_PUBLIC_PRICE_ORACLE_LOCAL);
  return null;
}
```

- [ ] **Step 3: Extend `frontend/.env.example`**

Append at the end of the file:

```
# PriceOracle (admin-set OPN/mUSDC, 1h timelock). One per chain.
# Populated by `scripts/deploy.ts`; copy from deployments/<network>.json.
NEXT_PUBLIC_PRICE_ORACLE_TESTNET=
NEXT_PUBLIC_PRICE_ORACLE_LOCAL=
```

- [ ] **Step 4: Extend `frontend/scripts/sync-address.mjs`**

Find the block of `setKey` calls (currently three: LendingPool, OpenSwapPair, MockUSDC). Add a fourth:

```js
setKey(`NEXT_PUBLIC_PRICE_ORACLE_${SUFFIX}`, d.priceOracle);
```

And update the closing log block to include the oracle:

```js
if (d.priceOracle) console.log(`  NEXT_PUBLIC_PRICE_ORACLE_${SUFFIX}=${d.priceOracle}`);
```

- [ ] **Step 5: Verify typecheck and sync**

From the repo root:

```bash
cd frontend && npm run typecheck
```

Expected: exit 0.

```bash
cd frontend && npm run sync:local 2>&1
```

Expected: prints `Wrote LOCAL addresses → .../.env.local` and lists the new `NEXT_PUBLIC_PRICE_ORACLE_LOCAL=0x...` line. (If `deployments/hardhat.json` doesn't have a `priceOracle` field yet, run `npx hardhat run scripts/deploy.ts --network localhost` first from a node terminal.)

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/abi/PriceOracle.json frontend/lib/contract.ts frontend/.env.example frontend/scripts/sync-address.mjs
git commit -m "$(cat <<'EOF'
feat(frontend): bundle PriceOracle ABI + address loader + env wiring

Adds the PriceOracle ABI to lib/abi (bundled per project convention),
exposes priceOracleAbi and getPriceOracleAddress from lib/contract.ts
following the static-process.env literal-access pattern required by
Next.js inlining (per CLAUDE.md). Extends .env.example and the
sync-address script to handle the new NEXT_PUBLIC_PRICE_ORACLE_*
keys. No UI changes yet.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Build `OraclePriceBadge` component

**Files:**
- Create: `frontend/components/OraclePriceBadge.tsx`

- [ ] **Step 1: Create the component**

Write `frontend/components/OraclePriceBadge.tsx`:

```tsx
'use client';

import { useChainId, useReadContract } from 'wagmi';
import { Activity } from 'lucide-react';
import { getPriceOracleAddress, priceOracleAbi } from '@/lib/contract';
import { formatMUSDC } from '@/lib/format';

/**
 * One-row badge that displays the admin-set oracle's current OPN
 * price (in mUSDC). When a proposal is pending, appends a status
 * message indicating whether the commit window has opened.
 *
 * Used inside PoolStats. Silently degrades to "unavailable" if the
 * oracle is not deployed on this chain or the reads fail.
 */
export function OraclePriceBadge() {
  const chainId = useChainId();
  const oracle = getPriceOracleAddress(chainId);

  const { data: currentRaw, isError: priceError } = useReadContract({
    address: oracle ?? undefined,
    abi: priceOracleAbi,
    functionName: 'getPrice',
    query: { enabled: Boolean(oracle), refetchInterval: 30_000, staleTime: 15_000 },
  });

  const { data: pendingRaw } = useReadContract({
    address: oracle ?? undefined,
    abi: priceOracleAbi,
    functionName: 'pendingProposal',
    query: { enabled: Boolean(oracle), refetchInterval: 30_000, staleTime: 15_000 },
  });

  if (!oracle || priceError || currentRaw === undefined) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Activity className="h-3.5 w-3.5" aria-hidden />
        <span>OPN price (oracle): unavailable</span>
      </div>
    );
  }

  // currentPrice is 1e18-scaled mUSDC per OPN. Re-use formatMUSDC by
  // treating the value as if it were 18-decimal wei of mUSDC — it
  // collapses to a human-readable number with two decimal places.
  const current = currentRaw as bigint;
  const priceLabel = formatMUSDC(current / 10n ** 12n);

  const pending = pendingRaw as readonly [bigint, bigint, boolean] | undefined;
  const hasPending = pending !== undefined && pending[1] > 0n;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-900">
        <Activity className="h-3.5 w-3.5" aria-hidden />
        OPN price (oracle): {priceLabel} mUSDC
      </span>
      {hasPending && (
        <span className="text-zinc-600">
          {pending![2]
            ? 'pending update ready to commit'
            : `next update unlocks in ${minutesLeft(pending![1])}m`}
        </span>
      )}
    </div>
  );
}

function minutesLeft(unlockTime: bigint): number {
  const nowSec = Math.floor(Date.now() / 1000);
  const diff = Number(unlockTime) - nowSec;
  return diff > 0 ? Math.ceil(diff / 60) : 0;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: exit 0. The `Activity` icon import from lucide-react matches the project's Lucide-only convention.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/OraclePriceBadge.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): OraclePriceBadge component

Renders one row showing the admin-set oracle's current OPN price
(in mUSDC) plus pending-proposal status when one exists ("next
update unlocks in Xm" before unlock, "ready to commit" after). The
1e18-scaled price is divided by 1e12 so formatMUSDC (which expects
6-decimal mUSDC wei) renders the human-readable mUSDC amount with
two decimal places.

Silently falls back to "unavailable" on chains without a deployed
oracle or when the read fails so it never breaks the parent PoolStats
row.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Embed `OraclePriceBadge` in `PoolStats`

**Files:**
- Modify: `frontend/components/PoolStats.tsx`

- [ ] **Step 1: Read the existing PoolStats to find the insertion point**

```bash
cat frontend/components/PoolStats.tsx
```

Identify the JSX block that wraps the stats rows (typically a `<div className="...space-y-...">` or a grid). The new badge should sit as the last child of that wrapper, after the existing rows.

- [ ] **Step 2: Add the import**

At the top of `frontend/components/PoolStats.tsx`, add:

```tsx
import { OraclePriceBadge } from '@/components/OraclePriceBadge';
```

- [ ] **Step 3: Insert the badge as the final row of the stats card**

In the JSX, after the last existing stat row (just before the closing tag of the wrapper), add:

```tsx
      <div className="border-t border-zinc-200 pt-3">
        <OraclePriceBadge />
      </div>
```

Adjust class names if the existing card uses a different border or spacing convention. Match the surrounding style.

- [ ] **Step 4: Verify typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: exit 0.

- [ ] **Step 5: Manual UI check (deferred to controller post-merge)**

Subagents cannot drive a browser. The controller will run `npm run dev` after this lands and verify on the Lending Dashboard:

- Badge appears as the bottom row of the PoolStats card
- Current price renders with two decimal places (e.g. `"OPN price (oracle): 100.00 mUSDC"`)
- After running `npm run oracle:propose -- 110` against the local node, the badge appends `"next update unlocks in 60m"` (or close)
- After advancing time and committing, the badge shows the new price and no pending status

- [ ] **Step 6: Commit**

```bash
git add frontend/components/PoolStats.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): mount OraclePriceBadge in the Lending Dashboard

Embeds the new badge as the bottom row of PoolStats, separated by a
top border to match the surrounding card spacing. Completes the
PriceOracle v1 UI surface defined in the spec.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: README addendum + ROADMAP drop

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Add README section**

Open `README.md`. Find the existing `### Strategy: Leveraged LP, Close/Rebalance, and Positions` section under the Frontend block. Add the following new subsection immediately after it (before the Vercel section):

```markdown
### Price oracle (testnet stopgap)

`contracts/PriceOracle.sol` is a single-price admin-set oracle for the
OPN/mUSDC pair with a 1-hour propose-then-commit timelock. The current
price surfaces as the bottom row of the Lending Dashboard's PoolStats
card. v1 has no contract consumers; multi-asset lending will integrate
it later when Pyth or another external feed is unavailable on IOPN.

Owner-only CLI flow:

```bash
npm run oracle:show
npm run oracle:propose -- 105        # propose 105 mUSDC per OPN
# ... wait at least one hour ...
npm run oracle:commit
# or, to back out before commit:
npm run oracle:cancel
```
```

(Per CLAUDE.md, this content stays free of em-dashes.)

- [ ] **Step 2: Drop the Price oracle bullet from ROADMAP**

Open `ROADMAP.md`. In the Q4 2026 section, delete the bullet starting with `**Price oracle**`. The remaining Q4 bullets (Permit2, Leverage-long looper) and the *Solo and part-time* caveat stay. Update the caveat if it references the price oracle.

After editing, the Q4 section should still have at least one bullet and a coherent caveat. If the caveat text reads awkwardly without the oracle reference, edit it to make sense for the remaining items.

- [ ] **Step 3: Commit**

```bash
git add README.md ROADMAP.md
git commit -m "$(cat <<'EOF'
docs: add PriceOracle subsection to README, drop bullet from ROADMAP

README's frontend block now describes the testnet-stopgap oracle and
the four owner-only npm commands (oracle:show/propose/commit/cancel).
ROADMAP drops the Price oracle Q4 bullet per the no-Shipped-section
rule. Permit2 and Looper remain in Q4.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Push + open PR

**Files:** none

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/price-oracle
```

Expected: branch created on origin, tracking set.

- [ ] **Step 2: Open the PR against develop**

```bash
gh pr create --base develop --head feat/price-oracle --title "feat: PriceOracle v1 (admin-set + 1h timelock)" --body "$(cat <<'EOF'
## Summary
- New `contracts/PriceOracle.sol` (OZ v5 Ownable, 1-hour propose-then-commit timelock). Holds OPN/mUSDC price as 1e18-scaled mUSDC per OPN. Five external functions, three events, four custom errors. ≥90% line coverage.
- Deploy script extends to deploy PriceOracle as the fourth contract; initial price computed from OpenSwapPair spot ratio via `(reserveMUSDC * 1e30) / reserveOPN`, falling back to 100 mUSDC per OPN when reserves are zero.
- Four Hardhat scripts plus npm aliases: `oracle:show`, `oracle:propose`, `oracle:commit`, `oracle:cancel`.
- Frontend: bundled ABI, `getPriceOracleAddress` (static-env-var pattern), new env vars wired into the sync script, new `OraclePriceBadge` component embedded at the bottom of the Lending Dashboard's PoolStats card.
- README + ROADMAP updates per the shipped-items rule.

## Test plan
- [ ] `npm run test -- --grep "PriceOracle"` passes (22 tests across 6 describes)
- [ ] `npm run coverage` shows `PriceOracle.sol` at ≥90% line coverage
- [ ] `npx hardhat run scripts/deploy.ts --network localhost` deploys all four contracts and writes `priceOracle` into `deployments/hardhat.json`
- [ ] `npm run oracle:show`, `oracle:propose`, `oracle:cancel`, `oracle:commit` all behave per the README snippet
- [ ] `cd frontend && npm run typecheck` passes
- [ ] Dev server: Lending Dashboard PoolStats shows the oracle badge with current price; after `oracle:propose`, badge appends `"next update unlocks in Xm"`; after time advance + commit, badge shows new price and no pending status

Spec: `docs/superpowers/specs/2026-06-01-price-oracle-design.md`
Plan: `docs/superpowers/plans/2026-06-01-price-oracle.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

---

## Spec coverage check

| Spec requirement | Covered by |
|---|---|
| `contracts/PriceOracle.sol` with `Ownable`, three state words, `TIMELOCK_DELAY = 1 hours` | Tasks 1, 2 |
| Constructor validates `initialPrice > 0` | Task 1 |
| `getPrice() returns (uint256)` | Task 5 |
| `pendingProposal()` view returning `(uint256, uint256, bool)` | Task 5 |
| `proposeNewPrice` with onlyOwner + duplicate-pending revert + InvalidPrice revert | Task 2 |
| `cancelProposal` with NoProposalPending guard | Task 3 |
| `commitNewPrice` with TimelockNotElapsed guard | Task 4 |
| Events `PriceProposed`, `PriceCommitted`, `PriceProposalCanceled` | Tasks 2, 3, 4 |
| Tests for all behaviors + multi-cycle integration | Tasks 1, 2, 3, 4, 5 |
| ≥90% line coverage | Task 6 |
| Deploy script extends to 4 contracts, computes initial price from pool spot with the 1e30 decimal multiplier | Task 7 |
| Four Hardhat scripts (propose/commit/cancel/show) + four npm aliases | Task 8 |
| Bundled ABI in `frontend/lib/abi/PriceOracle.json` | Task 9 |
| `getPriceOracleAddress` with static env-var pattern | Task 9 |
| Two new env vars + sync-address update | Task 9 |
| `OraclePriceBadge` component with current price, pending status, error fallback | Task 10 |
| Embedded in PoolStats | Task 11 |
| README subsection describing the oracle and CLI | Task 12 |
| ROADMAP drops the Price oracle bullet | Task 12 |
| Custom errors instead of require-strings (codebase-matching deviation from spec) | All contract tasks (1–5) |
