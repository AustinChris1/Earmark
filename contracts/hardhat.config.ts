import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    celo: {
      url: process.env.CELO_RPC_URL ?? "https://forno.celo.org",
      chainId: 42220,
      accounts: process.env.AGENT_PRIVATE_KEY ? [process.env.AGENT_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: { celo: process.env.CELOSCAN_API_KEY ?? "" },
    customChains: [
      {
        network: "celo",
        chainId: 42220,
        urls: { apiURL: "https://api.celoscan.io/api", browserURL: "https://celoscan.io" },
      },
    ],
  },
};

export default config;
