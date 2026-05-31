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
});
