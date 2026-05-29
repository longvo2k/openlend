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
  if (!arg) throw new Error("Usage: hardhat run scripts/repay.ts --network <net> <amountOPN>");
  const amount = ethers.parseEther(arg);
  const address = loadAddress();
  const pool = await ethers.getContractAt("LendingPool", address);
  const tx = await pool.repay({ value: amount });
  console.log(`repay ${arg} OPN — tx ${tx.hash}`);
  await tx.wait();
  console.log("confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
