import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { LendingPool } from "../typechain-types";

describe("LendingPool", () => {
  async function deploy() {
    const [deployer, alice, bob, liquidator] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("LendingPool");
    const pool = (await Factory.deploy()) as unknown as LendingPool;
    await pool.waitForDeployment();
    return { pool, deployer, alice, bob, liquidator };
  }

  describe("Deployment", () => {
    it("sets borrowIndex to WAD and lastAccrual to deploy time", async () => {
      const { pool } = await deploy();
      expect(await pool.borrowIndex()).to.equal(ethers.parseEther("1"));
      expect(await pool.lastAccrual()).to.be.gt(0n);
    });

    it("starts with zero supply, borrow, shares", async () => {
      const { pool } = await deploy();
      expect(await pool.totalSupplied()).to.equal(0n);
      expect(await pool.totalBorrowed()).to.equal(0n);
      expect(await pool.totalShares()).to.equal(0n);
    });
  });

  describe("Interest accrual", () => {
    it("is a no-op when totalBorrowed is zero", async () => {
      const { pool } = await deploy();
      const before = await pool.borrowIndex();
      await time.increase(365 * 24 * 60 * 60);
      // call any state-mutating fn (supply) once we have it; for now, use a direct call:
      await pool.pokeAccrual();
      expect(await pool.borrowIndex()).to.equal(before);
    });

    it("grows borrowIndex by ~5% after one year with active debt", async () => {
      const { pool } = await deploy();
      // Manually seed state via test helper.
      await pool.testSeed(ethers.parseEther("100"), ethers.parseEther("50"));
      const before = await pool.borrowIndex();
      await time.increase(365 * 24 * 60 * 60);
      await pool.pokeAccrual();
      const after = await pool.borrowIndex();
      // 5% of WAD = 5e16; allow ±0.001% tolerance for second-of-block drift.
      const expected = before + (before * 500n) / 10000n;
      const diff = after > expected ? after - expected : expected - after;
      expect(diff).to.be.lt(before / 1_000_000n);
    });

    it("updates totalBorrowed and totalSupplied by the same interest amount", async () => {
      const { pool } = await deploy();
      await pool.testSeed(ethers.parseEther("100"), ethers.parseEther("50"));
      const supBefore = await pool.totalSupplied();
      const borBefore = await pool.totalBorrowed();
      await time.increase(365 * 24 * 60 * 60);
      await pool.pokeAccrual();
      const supAfter = await pool.totalSupplied();
      const borAfter = await pool.totalBorrowed();
      expect(supAfter - supBefore).to.equal(borAfter - borBefore);
    });
  });
});
