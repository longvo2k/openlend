import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadOracleAddr(): string {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run deploy first.`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!json.priceOracle) throw new Error("No priceOracle in deployment JSON.");
  return json.priceOracle as string;
}

async function main() {
  const addr = loadOracleAddr();
  const oracle = await ethers.getContractAt("PriceOracle", addr);
  const current = await oracle.currentPrice();
  const [pendingPrice, unlockTime, canCommit] = await oracle.pendingProposal();
  console.log(`PriceOracle: ${addr}`);
  console.log(`current:      ${ethers.formatEther(current)} mUSDC per OPN`);
  if (unlockTime === 0n) {
    console.log("pending:      none");
    return;
  }
  console.log(`pending:      ${ethers.formatEther(pendingPrice)} mUSDC per OPN`);
  console.log(`unlock at:    unix ${unlockTime} (${new Date(Number(unlockTime) * 1000).toISOString()})`);
  console.log(`canCommit:    ${canCommit}`);
  if (!canCommit) {
    const now = Math.floor(Date.now() / 1000);
    const secondsLeft = Number(unlockTime) - now;
    if (secondsLeft > 0) {
      const m = Math.floor(secondsLeft / 60);
      const s = secondsLeft % 60;
      console.log(`time left:    ${m}m ${s}s`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
