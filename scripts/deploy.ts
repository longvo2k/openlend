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
      `(${reserveOPN > 0n ? "from pool spot" : "sentinel - pool empty"})`,
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
