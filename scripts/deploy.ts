import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} OPN`);
  console.log(`Network:  ${network.name} (chainId ${network.config.chainId})`);

  const Factory = await ethers.getContractFactory("LendingPool");
  const pool = await Factory.deploy();
  await pool.waitForDeployment();
  const address = await pool.getAddress();

  console.log(`LendingPool deployed: ${address}`);

  const dir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        network: network.name,
        chainId: network.config.chainId,
        lendingPool: address,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
