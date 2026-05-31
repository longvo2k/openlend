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
  // process.argv[2] works when the script is invoked directly via ts-node.
  // Hardhat's run task forks a subprocess without forwarding positional args,
  // so the env var ORACLE_PRICE is accepted as a fallback for npm-alias usage.
  const arg = process.argv[2] ?? process.env.ORACLE_PRICE;
  if (!arg) {
    throw new Error(
      "Usage: hardhat run scripts/oracle-propose.ts --network <net> <mUSDCPerOPN>" +
      "\n       or: ORACLE_PRICE=120 npm run oracle:propose",
    );
  }
  const newPrice = ethers.parseEther(arg);
  const addr = loadOracleAddr();
  const oracle = await ethers.getContractAt("PriceOracle", addr);
  const tx = await oracle.proposeNewPrice(newPrice);
  console.log(`propose ${arg} mUSDC per OPN — tx ${tx.hash}`);
  const receipt = await tx.wait();
  const block = await ethers.provider.getBlock(receipt!.blockNumber);
  const unlockTime = Number(block!.timestamp) + 3600;
  console.log(`unlocks at unix ${unlockTime} (≈ ${new Date(unlockTime * 1000).toISOString()})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
