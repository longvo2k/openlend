import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys all three protocol contracts and writes their addresses to
 * `deployments/<network>.json`:
 *
 *   1. LendingPool       (Lend money market)
 *   2. MockUSDC          (open-faucet ERC-20 used by Swap)
 *   3. OpenSwapPair      (OPN <> mUSDC AMM — Swap)
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
