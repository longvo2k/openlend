import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadAddrs(): { mUSDC: string; openSwapPair: string } {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run deploy first.`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  const opnArg = process.argv[2];
  const minMUSDCArg = process.argv[3];
  if (!opnArg || !minMUSDCArg) {
    throw new Error(
      "Usage: hardhat run scripts/swap-opn-for-musdc.ts --network <net> <opnAmount> <minMUSDCOut>",
    );
  }
  const opn = ethers.parseEther(opnArg);
  const minOut = ethers.parseUnits(minMUSDCArg, 6);
  const { openSwapPair } = loadAddrs();
  const pair = await ethers.getContractAt("OpenSwapPair", openSwapPair);
  const tx = await pair.swapOPNForMUSDC(minOut, { value: opn });
  console.log(`swap ${opnArg} OPN → ≥${minMUSDCArg} mUSDC — tx ${tx.hash}`);
  await tx.wait();
  console.log("confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
