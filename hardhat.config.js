require("@nomicfoundation/hardhat-chai-matchers");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

// Configure upgrades
const { HardhatUserConfig } = require("hardhat/config");
const config = HardhatUserConfig;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          },
          viaIR: true,
          evmVersion: "paris"
        }
      },
      {
        version: "0.8.22",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          },
          viaIR: true,
          evmVersion: "paris"
        }
      }
    ]
  },
  networks: {
    hardhat: {
      chainId: 1337,
      accounts: {
        count: 30, // We need at least 25 accounts for comprehensive QA tests
        accountsBalance: "10000000000000000000000" // 10,000 ETH per account
      },
      allowUnlimitedContractSize: true // Allow large contracts for testing
    },
    omchain: {
      url: "https://rpc.omplatform.com",
      chainId: 1246,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: "auto",
      gas: "auto"
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    }
  },
  etherscan: {
    apiKey: {
      omchain: process.env.OMCHAIN_API_KEY || "NOT_NEEDED"
    },
    customChains: [
      {
        network: "omchain",
        chainId: 1246,
        urls: {
          apiURL: "https://omscan.omplatform.com/api",
          browserURL: "https://omscan.omplatform.com"
        }
      }
    ]
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
