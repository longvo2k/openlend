import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadAddress(): string {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run deploy first.`);
  return JSON.parse(fs.readFileSync(file, "utf8")).lendingPool;
}

async function main() {
  const target = process.argv[2];
  const repayArg = process.argv[3];
  if (!target || !repayArg) {
    throw new Error(
      "Usage: hardhat run scripts/liquidate.ts --network <net> <userAddress> <repayOPN>",
    );
  }
  const repay = ethers.parseEther(repayArg);
  const address = loadAddress();
  const pool = await ethers.getContractAt("LendingPool", address);
  const tx = await pool.liquidate(target, { value: repay });
  console.log(`liquidate ${target} for ${repayArg} OPN — tx ${tx.hash}`);
  await tx.wait();
  console.log("confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
