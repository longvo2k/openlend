import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const IOPN_RPC_URL = process.env.IOPN_RPC_URL ?? "https://testnet-rpc.iopn.tech";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      allowBlocksWithSameTimestamp: true,
    },
    iopnTestnet: {
      url: IOPN_RPC_URL,
      chainId: 984,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasPrice: 7_000_000_000,
    },
  },
};

export default config;
