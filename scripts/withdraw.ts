import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadAddress(): string {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run deploy first.`);
  return JSON.parse(fs.readFileSync(file, "utf8")).lendingPool;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("Usage: hardhat run scripts/withdraw.ts --network <net> <shares>");
  const shares = ethers.parseEther(arg);
  const address = loadAddress();
  const pool = await ethers.getContractAt("LendingPool", address);
  const tx = await pool.withdraw(shares);
  console.log(`withdraw ${arg} shares — tx ${tx.hash}`);
  await tx.wait();
  console.log("confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
