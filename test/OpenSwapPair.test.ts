import { expect } from "chai";
import { ethers } from "hardhat";
import { MockUSDC, OpenSwapPair } from "../typechain-types";

describe("OpenSwapPair", () => {
  async function deploy() {
    const [deployer, alice, bob, attacker] = await ethers.getSigners();

    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = (await USDC.deploy()) as unknown as MockUSDC;
    await usdc.waitForDeployment();

    const Pair = await ethers.getContractFactory("OpenSwapPair");
    const pair = (await Pair.deploy(await usdc.getAddress())) as unknown as OpenSwapPair;
    await pair.waitForDeployment();

    return { pair, usdc, deployer, alice, bob, attacker };
  }

  describe("Deployment", () => {
    it("stores immutable mUSDC address", async () => {
      const { pair, usdc } = await deploy();
      expect(await pair.mUSDC()).to.equal(await usdc.getAddress());
    });

    it("starts with zero reserves and LP supply", async () => {
      const { pair } = await deploy();
      const [r0, r1, ts] = await pair.getReserves();
      expect(r0).to.equal(0n);
      expect(r1).to.equal(0n);
      expect(ts).to.equal(0n);
      expect(await pair.totalSupply()).to.equal(0n);
    });

    it("LP token name and symbol", async () => {
      const { pair } = await deploy();
      expect(await pair.name()).to.equal("OpenSwap LP");
      expect(await pair.symbol()).to.equal("OSP-LP");
      expect(await pair.decimals()).to.equal(18);
    });

    it("exposes correct constants", async () => {
      const { pair } = await deploy();
      expect(await pair.MINIMUM_LIQUIDITY()).to.equal(1000n);
      expect(await pair.FEE_NUM()).to.equal(997n);
      expect(await pair.FEE_DEN()).to.equal(1000n);
    });
  });

  describe("addLiquidity", () => {
    async function fund(usdc: MockUSDC, who: any, amount: bigint) {
      await usdc.connect(who).mint(amount);
    }
    async function approve(usdc: MockUSDC, who: any, spender: string, amount: bigint) {
      await usdc.connect(who).approve(spender, amount);
    }

    it("reverts on zero OPN", async () => {
      const { pair, usdc, alice } = await deploy();
      await fund(usdc, alice, 1_000n * 10n ** 6n);
      await approve(usdc, alice, await pair.getAddress(), 1_000n * 10n ** 6n);
      await expect(
        pair.connect(alice).addLiquidity(1_000n * 10n ** 6n, { value: 0n }),
      ).to.be.revertedWithCustomError(pair, "ZeroAmount");
    });

    it("reverts on zero mUSDC", async () => {
      const { pair, alice } = await deploy();
      await expect(
        pair.connect(alice).addLiquidity(0n, { value: ethers.parseEther("1") }),
      ).to.be.revertedWithCustomError(pair, "ZeroAmount");
    });

    it("first add: mints sqrt(opnIn * mUSDCIn) - MINIMUM_LIQUIDITY to provider", async () => {
      const { pair, usdc, alice } = await deploy();
      const opnIn = ethers.parseEther("10"); // 10e18
      const mUSDCIn = 1_000n * 10n ** 6n; // 1e9
      const expectedSqrt = 100_000_000_000_000n; // sqrt(10e18 * 1e9) = sqrt(1e28) = 1e14
      const minted = expectedSqrt - 1000n;

      await fund(usdc, alice, mUSDCIn);
      await approve(usdc, alice, await pair.getAddress(), mUSDCIn);

      await expect(pair.connect(alice).addLiquidity(mUSDCIn, { value: opnIn }))
        .to.emit(pair, "Mint")
        .withArgs(alice.address, opnIn, mUSDCIn, minted);

      expect(await pair.balanceOf(alice.address)).to.equal(minted);
      expect(await pair.totalSupply()).to.equal(expectedSqrt);
      expect(await pair.balanceOf("0x000000000000000000000000000000000000dEaD")).to.equal(1000n);
      const [r0, r1] = await pair.getReserves();
      expect(r0).to.equal(opnIn);
      expect(r1).to.equal(mUSDCIn);
    });

    it("subsequent add at current ratio: pro-rata LP", async () => {
      const { pair, usdc, alice, bob } = await deploy();
      const opn0 = ethers.parseEther("10");
      const mUSDC0 = 1_000n * 10n ** 6n;
      await fund(usdc, alice, mUSDC0);
      await approve(usdc, alice, await pair.getAddress(), mUSDC0);
      await pair.connect(alice).addLiquidity(mUSDC0, { value: opn0 });

      const totalBefore = await pair.totalSupply();
      const opn1 = ethers.parseEther("5");
      const mUSDC1 = 500n * 10n ** 6n;
      await fund(usdc, bob, mUSDC1);
      await approve(usdc, bob, await pair.getAddress(), mUSDC1);
      await pair.connect(bob).addLiquidity(mUSDC1, { value: opn1 });

      expect(await pair.balanceOf(bob.address)).to.equal(totalBefore / 2n);
    });

    it("subsequent add off-ratio: caller receives min of two ratios", async () => {
      const { pair, usdc, alice, bob } = await deploy();
      const opn0 = ethers.parseEther("10");
      const mUSDC0 = 1_000n * 10n ** 6n;
      await fund(usdc, alice, mUSDC0);
      await approve(usdc, alice, await pair.getAddress(), mUSDC0);
      await pair.connect(alice).addLiquidity(mUSDC0, { value: opn0 });

      const supply = await pair.totalSupply();
      const opn1 = ethers.parseEther("10");
      const mUSDC1 = 500n * 10n ** 6n;
      await fund(usdc, bob, mUSDC1);
      await approve(usdc, bob, await pair.getAddress(), mUSDC1);
      await pair.connect(bob).addLiquidity(mUSDC1, { value: opn1 });

      const expected = (mUSDC1 * supply) / mUSDC0;
      expect(await pair.balanceOf(bob.address)).to.equal(expected);
    });

    it("reverts when first add would mint zero LP (cap by MINIMUM_LIQUIDITY)", async () => {
      const { pair, usdc, alice } = await deploy();
      const opnIn = 100n;
      const mUSDCIn = 100n;
      await fund(usdc, alice, mUSDCIn);
      await approve(usdc, alice, await pair.getAddress(), mUSDCIn);
      await expect(
        pair.connect(alice).addLiquidity(mUSDCIn, { value: opnIn }),
      ).to.be.revertedWithCustomError(pair, "InsufficientLPMinted");
    });
  });

  describe("removeLiquidity", () => {
    async function seedPool(pair: OpenSwapPair, usdc: MockUSDC, alice: any) {
      const opnIn = ethers.parseEther("10");
      const mUSDCIn = 1_000n * 10n ** 6n;
      await usdc.connect(alice).mint(mUSDCIn);
      await usdc.connect(alice).approve(await pair.getAddress(), mUSDCIn);
      await pair.connect(alice).addLiquidity(mUSDCIn, { value: opnIn });
      return { opnIn, mUSDCIn };
    }

    it("reverts on zero", async () => {
      const { pair, usdc, alice } = await deploy();
      await seedPool(pair, usdc, alice);
      await expect(pair.connect(alice).removeLiquidity(0n)).to.be.revertedWithCustomError(
        pair,
        "ZeroAmount",
      );
    });

    it("burns LP and returns proportional OPN + mUSDC", async () => {
      const { pair, usdc, alice } = await deploy();
      const { opnIn, mUSDCIn } = await seedPool(pair, usdc, alice);

      const lp = await pair.balanceOf(alice.address);
      const supply = await pair.totalSupply();
      const expectedOPN = (lp * opnIn) / supply;
      const expectedMUSDC = (lp * mUSDCIn) / supply;

      const balBefore = await ethers.provider.getBalance(alice.address);
      const usdcBefore = await usdc.balanceOf(alice.address);
      const tx = await pair.connect(alice).removeLiquidity(lp);
      const rc = await tx.wait();
      const gas = rc!.gasUsed * rc!.gasPrice;
      const balAfter = await ethers.provider.getBalance(alice.address);
      const usdcAfter = await usdc.balanceOf(alice.address);

      expect(balAfter - balBefore + gas).to.equal(expectedOPN);
      expect(usdcAfter - usdcBefore).to.equal(expectedMUSDC);
      expect(await pair.balanceOf(alice.address)).to.equal(0n);
    });

    it("emits Burn event", async () => {
      const { pair, usdc, alice } = await deploy();
      const { opnIn, mUSDCIn } = await seedPool(pair, usdc, alice);
      const lp = await pair.balanceOf(alice.address);
      const supply = await pair.totalSupply();
      const expectedOPN = (lp * opnIn) / supply;
      const expectedMUSDC = (lp * mUSDCIn) / supply;
      await expect(pair.connect(alice).removeLiquidity(lp))
        .to.emit(pair, "Burn")
        .withArgs(alice.address, expectedOPN, expectedMUSDC, lp);
    });

    it("reverts if pool has no liquidity (supply == 0)", async () => {
      const { pair, alice } = await deploy();
      await expect(pair.connect(alice).removeLiquidity(1n)).to.be.revertedWithCustomError(
        pair,
        "InsufficientLiquidity",
      );
    });
  });

  describe("swapOPNForMUSDC", () => {
    async function seeded() {
      const ctx = await deploy();
      const opnIn = ethers.parseEther("10");
      const mUSDCIn = 1_000n * 10n ** 6n;
      await ctx.usdc.connect(ctx.alice).mint(mUSDCIn);
      await ctx.usdc.connect(ctx.alice).approve(await ctx.pair.getAddress(), mUSDCIn);
      await ctx.pair.connect(ctx.alice).addLiquidity(mUSDCIn, { value: opnIn });
      return ctx;
    }

    it("reverts on zero msg.value", async () => {
      const { pair, bob } = await seeded();
      await expect(
        pair.connect(bob).swapOPNForMUSDC(0n, { value: 0n }),
      ).to.be.revertedWithCustomError(pair, "ZeroAmount");
    });

    it("returns mUSDC out per UniV2 formula", async () => {
      const { pair, usdc, bob } = await seeded();
      const [r0, r1] = await pair.getReserves();
      const amountIn = ethers.parseEther("1");
      const inWithFee = (amountIn * 997n) / 1000n;
      const expectedOut =
        (inWithFee * r1) / (r0 + inWithFee);

      const before = await usdc.balanceOf(bob.address);
      await pair.connect(bob).swapOPNForMUSDC(expectedOut, { value: amountIn });
      const after = await usdc.balanceOf(bob.address);
      expect(after - before).to.equal(expectedOut);
    });

    it("reverts if minOut not met (slippage)", async () => {
      const { pair, bob } = await seeded();
      const amountIn = ethers.parseEther("1");
      const unreasonableMin = 1_000_000_000_000n;
      await expect(
        pair.connect(bob).swapOPNForMUSDC(unreasonableMin, { value: amountIn }),
      ).to.be.revertedWithCustomError(pair, "InsufficientOutput");
    });

    it("k strictly grows after swap (fee accrues)", async () => {
      const { pair, bob } = await seeded();
      const [r0Before, r1Before] = await pair.getReserves();
      const kBefore = BigInt(r0Before) * BigInt(r1Before);

      await pair.connect(bob).swapOPNForMUSDC(0n, { value: ethers.parseEther("1") });

      const [r0After, r1After] = await pair.getReserves();
      const kAfter = BigInt(r0After) * BigInt(r1After);
      expect(kAfter).to.be.gt(kBefore);
    });

    it("reverts on empty reserves", async () => {
      const { pair, bob } = await deploy();
      await expect(
        pair.connect(bob).swapOPNForMUSDC(0n, { value: ethers.parseEther("1") }),
      ).to.be.revertedWithCustomError(pair, "InsufficientLiquidity");
    });

    it("emits Swap event", async () => {
      const { pair, bob } = await seeded();
      const [r0, r1] = await pair.getReserves();
      const amountIn = ethers.parseEther("1");
      const inWithFee = (amountIn * 997n) / 1000n;
      const expectedOut = (inWithFee * r1) / (r0 + inWithFee);
      await expect(pair.connect(bob).swapOPNForMUSDC(0n, { value: amountIn }))
        .to.emit(pair, "Swap")
        .withArgs(bob.address, true, amountIn, expectedOut);
    });
  });

  describe("swapMUSDCForOPN", () => {
    async function seeded() {
      const ctx = await deploy();
      const opnIn = ethers.parseEther("10");
      const mUSDCIn = 1_000n * 10n ** 6n;
      await ctx.usdc.connect(ctx.alice).mint(mUSDCIn);
      await ctx.usdc.connect(ctx.alice).approve(await ctx.pair.getAddress(), mUSDCIn);
      await ctx.pair.connect(ctx.alice).addLiquidity(mUSDCIn, { value: opnIn });
      return ctx;
    }

    it("reverts on zero amount", async () => {
      const { pair, bob } = await seeded();
      await expect(pair.connect(bob).swapMUSDCForOPN(0n, 0n)).to.be.revertedWithCustomError(
        pair,
        "ZeroAmount",
      );
    });

    it("returns OPN out per UniV2 formula", async () => {
      const { pair, usdc, bob } = await seeded();
      const [r0, r1] = await pair.getReserves();
      const amountIn = 100n * 10n ** 6n;
      const inWithFee = (amountIn * 997n) / 1000n;
      const expectedOut = (inWithFee * BigInt(r0)) / (BigInt(r1) + inWithFee);

      await usdc.connect(bob).mint(amountIn);
      await usdc.connect(bob).approve(await pair.getAddress(), amountIn);

      const balBefore = await ethers.provider.getBalance(bob.address);
      const tx = await pair.connect(bob).swapMUSDCForOPN(amountIn, expectedOut);
      const rc = await tx.wait();
      const gas = rc!.gasUsed * rc!.gasPrice;
      const balAfter = await ethers.provider.getBalance(bob.address);
      expect(balAfter - balBefore + gas).to.equal(expectedOut);
    });

    it("reverts if minOut not met", async () => {
      const { pair, usdc, bob } = await seeded();
      const amountIn = 100n * 10n ** 6n;
      await usdc.connect(bob).mint(amountIn);
      await usdc.connect(bob).approve(await pair.getAddress(), amountIn);
      await expect(
        pair.connect(bob).swapMUSDCForOPN(amountIn, ethers.parseEther("1000")),
      ).to.be.revertedWithCustomError(pair, "InsufficientOutput");
    });

    it("k strictly grows", async () => {
      const { pair, usdc, bob } = await seeded();
      const amountIn = 100n * 10n ** 6n;
      await usdc.connect(bob).mint(amountIn);
      await usdc.connect(bob).approve(await pair.getAddress(), amountIn);
      const [r0B, r1B] = await pair.getReserves();
      const kBefore = BigInt(r0B) * BigInt(r1B);
      await pair.connect(bob).swapMUSDCForOPN(amountIn, 0n);
      const [r0A, r1A] = await pair.getReserves();
      expect(BigInt(r0A) * BigInt(r1A)).to.be.gt(kBefore);
    });

    it("reverts on empty reserves", async () => {
      const { pair, usdc, bob } = await deploy();
      await usdc.connect(bob).mint(100n * 10n ** 6n);
      await usdc.connect(bob).approve(await pair.getAddress(), 100n * 10n ** 6n);
      await expect(
        pair.connect(bob).swapMUSDCForOPN(100n * 10n ** 6n, 0n),
      ).to.be.revertedWithCustomError(pair, "InsufficientLiquidity");
    });

    it("emits Swap event", async () => {
      const { pair, usdc, bob } = await seeded();
      const [r0, r1] = await pair.getReserves();
      const amountIn = 100n * 10n ** 6n;
      const inWithFee = (amountIn * 997n) / 1000n;
      const expectedOut = (inWithFee * BigInt(r0)) / (BigInt(r1) + inWithFee);
      await usdc.connect(bob).mint(amountIn);
      await usdc.connect(bob).approve(await pair.getAddress(), amountIn);
      await expect(pair.connect(bob).swapMUSDCForOPN(amountIn, 0n))
        .to.emit(pair, "Swap")
        .withArgs(bob.address, false, amountIn, expectedOut);
    });
  });

  describe("quote views", () => {
    async function seeded() {
      const ctx = await deploy();
      const opnIn = ethers.parseEther("10");
      const mUSDCIn = 1_000n * 10n ** 6n;
      await ctx.usdc.connect(ctx.alice).mint(mUSDCIn);
      await ctx.usdc.connect(ctx.alice).approve(await ctx.pair.getAddress(), mUSDCIn);
      await ctx.pair.connect(ctx.alice).addLiquidity(mUSDCIn, { value: opnIn });
      return ctx;
    }

    it("quoteSwap(opnIsInput=true) matches actual OPN→mUSDC swap", async () => {
      const { pair, bob } = await seeded();
      const amountIn = ethers.parseEther("1");
      const quoted = await pair.quoteSwap(amountIn, true);

      const usdcBefore = await (await ethers.getContractAt(
        "MockUSDC",
        await pair.mUSDC(),
      )).balanceOf(bob.address);
      await pair.connect(bob).swapOPNForMUSDC(0n, { value: amountIn });
      const usdcAfter = await (await ethers.getContractAt(
        "MockUSDC",
        await pair.mUSDC(),
      )).balanceOf(bob.address);
      expect(usdcAfter - usdcBefore).to.equal(quoted);
    });

    it("quoteSwap(opnIsInput=false) matches actual mUSDC→OPN swap", async () => {
      const { pair, usdc, bob } = await seeded();
      const amountIn = 100n * 10n ** 6n;
      const quoted = await pair.quoteSwap(amountIn, false);

      await usdc.connect(bob).mint(amountIn);
      await usdc.connect(bob).approve(await pair.getAddress(), amountIn);
      const balBefore = await ethers.provider.getBalance(bob.address);
      const tx = await pair.connect(bob).swapMUSDCForOPN(amountIn, 0n);
      const rc = await tx.wait();
      const gas = rc!.gasUsed * rc!.gasPrice;
      const balAfter = await ethers.provider.getBalance(bob.address);
      expect(balAfter - balBefore + gas).to.equal(quoted);
    });

    it("quoteSwap reverts on empty reserves", async () => {
      const { pair } = await deploy();
      await expect(pair.quoteSwap(ethers.parseEther("1"), true)).to.be.revertedWithCustomError(
        pair,
        "InsufficientLiquidity",
      );
    });

    it("quoteAddLiquidity on empty pool returns sqrt - MIN_LIQ", async () => {
      const { pair } = await deploy();
      const opnIn = ethers.parseEther("10");
      const mUSDCIn = 1_000n * 10n ** 6n;
      const [lpToMint, opnUsed, mUSDCUsed] = await pair.quoteAddLiquidity(opnIn, mUSDCIn);
      expect(lpToMint).to.equal(100_000_000_000_000n - 1000n);
      expect(opnUsed).to.equal(opnIn);
      expect(mUSDCUsed).to.equal(mUSDCIn);
    });

    it("quoteAddLiquidity on seeded pool matches actual mint", async () => {
      const { pair, usdc, bob } = await seeded();
      const opnIn = ethers.parseEther("5");
      const mUSDCIn = 500n * 10n ** 6n;
      const [quotedLP, , ] = await pair.quoteAddLiquidity(opnIn, mUSDCIn);

      await usdc.connect(bob).mint(mUSDCIn);
      await usdc.connect(bob).approve(await pair.getAddress(), mUSDCIn);
      await pair.connect(bob).addLiquidity(mUSDCIn, { value: opnIn });
      expect(await pair.balanceOf(bob.address)).to.equal(quotedLP);
    });
  });

  describe("Reentrancy", () => {
    it("blocks reentry into swapMUSDCForOPN", async () => {
      const ctx = await deploy();
      // Seed pool
      const opnIn = ethers.parseEther("10");
      const mUSDCIn = 1_000n * 10n ** 6n;
      await ctx.usdc.connect(ctx.alice).mint(mUSDCIn);
      await ctx.usdc.connect(ctx.alice).approve(await ctx.pair.getAddress(), mUSDCIn);
      await ctx.pair.connect(ctx.alice).addLiquidity(mUSDCIn, { value: opnIn });

      const Attacker = await ethers.getContractFactory("MaliciousSwapAttacker");
      const attacker = await Attacker.deploy(await ctx.pair.getAddress());
      await attacker.waitForDeployment();

      // Fund attacker with mUSDC.
      const attackIn = 10n * 10n ** 6n;
      await ctx.usdc.connect(ctx.alice).mint(attackIn);
      await ctx.usdc.connect(ctx.alice).transfer(await attacker.getAddress(), attackIn);

      // Approve via impersonation (MaliciousSwapAttacker has no approve fn).
      await ethers.provider.send("hardhat_impersonateAccount", [await attacker.getAddress()]);
      const attackerSigner = await ethers.getSigner(await attacker.getAddress());
      // Fund signer for gas:
      await ctx.deployer.sendTransaction({
        to: await attacker.getAddress(),
        value: ethers.parseEther("1"),
      });
      await ctx.usdc.connect(attackerSigner).approve(await ctx.pair.getAddress(), attackIn);
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [
        await attacker.getAddress(),
      ]);

      await expect(attacker.attack(attackIn)).to.be.reverted;
    });
  });
});
