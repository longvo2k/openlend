import { expect } from "chai";
import { ethers } from "hardhat";
import { MockUSDC } from "../typechain-types";

describe("MockUSDC", () => {
  async function deploy() {
    const [deployer, alice, bob] = await ethers.getSigners();
    const F = await ethers.getContractFactory("MockUSDC");
    const usdc = (await F.deploy()) as unknown as MockUSDC;
    await usdc.waitForDeployment();
    return { usdc, deployer, alice, bob };
  }

  it("has 6 decimals", async () => {
    const { usdc } = await deploy();
    expect(await usdc.decimals()).to.equal(6);
  });

  it("has name and symbol", async () => {
    const { usdc } = await deploy();
    expect(await usdc.name()).to.equal("Mock USDC");
    expect(await usdc.symbol()).to.equal("mUSDC");
  });

  it("reverts on zero mint", async () => {
    const { usdc, alice } = await deploy();
    await expect(usdc.connect(alice).mint(0n)).to.be.revertedWithCustomError(
      usdc,
      "ZeroAmount",
    );
  });

  it("mints up to MAX_MINT_PER_CALL", async () => {
    const { usdc, alice } = await deploy();
    const cap = await usdc.MAX_MINT_PER_CALL();
    await usdc.connect(alice).mint(cap);
    expect(await usdc.balanceOf(alice.address)).to.equal(cap);
  });

  it("reverts above MAX_MINT_PER_CALL", async () => {
    const { usdc, alice } = await deploy();
    const cap = await usdc.MAX_MINT_PER_CALL();
    await expect(usdc.connect(alice).mint(cap + 1n)).to.be.revertedWithCustomError(
      usdc,
      "MintExceedsCap",
    );
  });

  it("supports standard ERC20 transfer", async () => {
    const { usdc, alice, bob } = await deploy();
    await usdc.connect(alice).mint(1000n * 10n ** 6n);
    await usdc.connect(alice).transfer(bob.address, 250n * 10n ** 6n);
    expect(await usdc.balanceOf(bob.address)).to.equal(250n * 10n ** 6n);
    expect(await usdc.balanceOf(alice.address)).to.equal(750n * 10n ** 6n);
  });

  it("supports approve + transferFrom", async () => {
    const { usdc, alice, bob } = await deploy();
    await usdc.connect(alice).mint(500n * 10n ** 6n);
    await usdc.connect(alice).approve(bob.address, 200n * 10n ** 6n);
    await usdc.connect(bob).transferFrom(alice.address, bob.address, 200n * 10n ** 6n);
    expect(await usdc.balanceOf(bob.address)).to.equal(200n * 10n ** 6n);
    expect(await usdc.allowance(alice.address, bob.address)).to.equal(0n);
  });
});
