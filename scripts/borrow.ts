import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadAddress(): string {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run deploy first.`);
  return JSON.parse(fs.readFileSync(file, "utf8")).lendingPool;
}

async function main() {
  const collateralArg = process.argv[2];
  const borrowArg = process.argv[3];
  if (!collateralArg || !borrowArg) {
    throw new Error(
      "Usage: hardhat run scripts/borrow.ts --network <net> <collateralOPN> <borrowOPN>",
    );
  }
  const collateral = ethers.parseEther(collateralArg);
  const borrowAmt = ethers.parseEther(borrowArg);
  const address = loadAddress();
  const pool = await ethers.getContractAt("LendingPool", address);

  const tx1 = await pool.depositCollateral({ value: collateral });
  console.log(`depositCollateral ${collateralArg} — tx ${tx1.hash}`);
  await tx1.wait();

  const tx2 = await pool.borrow(borrowAmt);
  console.log(`borrow ${borrowArg} — tx ${tx2.hash}`);
  await tx2.wait();
  console.log("confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
