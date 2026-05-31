import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Idempotent deploy of the three protocol contracts. Writes addresses to
 * `deployments/<network>.json`:
 *
 *   1. LendingPool       (Lend money market)
 *   2. MockUSDC          (open-faucet ERC-20 used by Swap)
 *   3. OpenSwapPair      (OPN <> mUSDC AMM)
 *
 * Each block is a no-op when the JSON already records a non-empty address
 * for that contract. Re-running the script never burns gas redeploying an
 * existing contract, never wipes onchain state, and never invalidates
 * Vercel env vars.
 *
 * To force a fresh deploy of a specific contract: open
 * `deployments/<network>.json` and delete (or blank out) that contract's
 * field, then re-run. The next run will deploy fresh and update the JSON
 * with the new address.
 *
 * To wipe everything and start over: delete the JSON file entirely.
 */

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

function existingAddr(prev: Record<string, unknown>, key: string): string | null {
  const v = prev[key];
  return typeof v === "string" && ADDR_RE.test(v) ? v : null;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} OPN`);
  console.log(`Network:  ${network.name} (chainId ${network.config.chainId})`);

  const dir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}.json`);
  const prev: Record<string, unknown> = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : {};

  let anyDeployed = false;

  // -------- 1. LendingPool --------
  let lendingPoolAddr = existingAddr(prev, "lendingPool");
  if (lendingPoolAddr) {
    console.log(`LendingPool   reused:   ${lendingPoolAddr}`);
  } else {
    const LP = await ethers.getContractFactory("LendingPool");
    const c = await LP.deploy();
    await c.waitForDeployment();
    lendingPoolAddr = await c.getAddress();
    anyDeployed = true;
    console.log(`LendingPool   deployed: ${lendingPoolAddr}`);
  }

  // -------- 2. MockUSDC --------
  let mUSDCAddr = existingAddr(prev, "mUSDC");
  if (mUSDCAddr) {
    console.log(`MockUSDC      reused:   ${mUSDCAddr}`);
  } else {
    const USDC = await ethers.getContractFactory("MockUSDC");
    const c = await USDC.deploy();
    await c.waitForDeployment();
    mUSDCAddr = await c.getAddress();
    anyDeployed = true;
    console.log(`MockUSDC      deployed: ${mUSDCAddr}`);
  }

  // -------- 3. OpenSwapPair --------
  let pairAddr = existingAddr(prev, "openSwapPair");
  if (pairAddr) {
    console.log(`OpenSwapPair  reused:   ${pairAddr}`);
  } else {
    const Pair = await ethers.getContractFactory("OpenSwapPair");
    const c = await Pair.deploy(mUSDCAddr);
    await c.waitForDeployment();
    pairAddr = await c.getAddress();
    anyDeployed = true;
    console.log(`OpenSwapPair  deployed: ${pairAddr}`);
  }

  if (!anyDeployed) {
    console.log(
      `\nAll three contracts already present in ${path.basename(file)}. ` +
        "No transactions sent, no JSON update.",
    );
    return;
  }

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
