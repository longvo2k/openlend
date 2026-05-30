import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadAddrs(): { mUSDC: string; openSwapPair: string } {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run deploy first.`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("Usage: hardhat run scripts/faucet.ts --network <net> <mUSDCAmount>");
  const amount = ethers.parseUnits(arg, 6);
  const { mUSDC } = loadAddrs();
  const token = await ethers.getContractAt("MockUSDC", mUSDC);
  const tx = await token.mint(amount);
  console.log(`mint ${arg} mUSDC — tx ${tx.hash}`);
  await tx.wait();
  console.log("confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
