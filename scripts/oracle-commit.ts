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
  const oldPrice = await oracle.currentPrice();
  const pending = await oracle.pendingPrice();
  const tx = await oracle.commitNewPrice();
  console.log(`commit ${ethers.formatEther(oldPrice)} -> ${ethers.formatEther(pending)} — tx ${tx.hash}`);
  await tx.wait();
  console.log("confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
