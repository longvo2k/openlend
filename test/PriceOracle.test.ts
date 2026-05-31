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
