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
});
