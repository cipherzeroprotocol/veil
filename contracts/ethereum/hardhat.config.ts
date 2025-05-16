import { HardhatUserConfig } from "hardhat/config"; // Keep this import for reference if needed elsewhere
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy";
import * as dotenv from "dotenv";

dotenv.config();

// Load environment variables - these should be set in your .env file
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const INFURA_API_KEY = process.env.INFURA_API_KEY || "";
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY || "";

// Remove the explicit HardhatUserConfig type annotation here
const config = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    // Mainnet networks
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY],
    },
    optimism: {
      url: `https://optimism-mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY],
    },
    arbitrum: {
      url: `https://arbitrum-mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY],
    },
    base: {
      url: "https://mainnet.base.org",
      accounts: [PRIVATE_KEY],
    },
    
    // Testnet networks
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY],
    },
    "optimism-sepolia": {
      url: `https://optimism-sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY],
    },
    "arbitrum-sepolia": {
      url: `https://arbitrum-sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PRIVATE_KEY],
    },
    "base-sepolia": {
      url: "https://sepolia.base.org",
      accounts: [PRIVATE_KEY],
    },
    
    // Local development
    hardhat: {
      forking: {
        url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
        enabled: false,
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      sepolia: ETHERSCAN_API_KEY,
      optimisticEthereum: process.env.OPTIMISM_API_KEY || "",
      arbitrumOne: process.env.ARBITRUM_API_KEY || "",
      base: process.env.BASE_API_KEY || "",
      optimismSepolia: process.env.OPTIMISM_API_KEY || "", // Use the same key or a specific one
      arbitrumSepolia: process.env.ARBITRUM_API_KEY || "", // Use the same key or a specific one
      baseSepolia: process.env.BASE_API_KEY || "", // Use the same key or a specific one
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
         network: "optimism-sepolia",
         chainId: 11155420,
         urls: {
           apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
           browserURL: "https://sepolia-optimism.etherscan.io/"
         }
      },
      {
         network: "arbitrum-sepolia",
         chainId: 421614,
         urls: {
           apiURL: "https://api-sepolia.arbiscan.io/api",
           browserURL: "https://sepolia.arbiscan.io/"
         }
      }
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v6",
  },
  mocha: {
    timeout: 100000,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    coinmarketcap: COINMARKETCAP_API_KEY,
  },
  external: {
    contracts: [
      {
        artifacts: "node_modules/@nitro-validator/artifacts",
        deploy: "node_modules/@nitro-validator/deploy"
      },
    ],
  },
};

export default config;