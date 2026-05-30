import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadAddrs(): { mUSDC: string; openSwapPair: string } {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run deploy first.`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  const mUSDCArg = process.argv[2];
  const minOPNArg = process.argv[3];
  if (!mUSDCArg || !minOPNArg) {
    throw new Error(
      "Usage: hardhat run scripts/swap-musdc-for-opn.ts --network <net> <mUSDCAmount> <minOPNOut>",
    );
  }
  const mUSDCAmt = ethers.parseUnits(mUSDCArg, 6);
  const minOut = ethers.parseEther(minOPNArg);
  const { mUSDC, openSwapPair } = loadAddrs();
  const token = await ethers.getContractAt("MockUSDC", mUSDC);
  const pair = await ethers.getContractAt("OpenSwapPair", openSwapPair);

  const tx1 = await token.approve(openSwapPair, mUSDCAmt);
  console.log(`approve mUSDC — tx ${tx1.hash}`);
  await tx1.wait();

  const tx2 = await pair.swapMUSDCForOPN(mUSDCAmt, minOut);
  console.log(`swap ${mUSDCArg} mUSDC → ≥${minOPNArg} OPN — tx ${tx2.hash}`);
  await tx2.wait();
  console.log("confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
