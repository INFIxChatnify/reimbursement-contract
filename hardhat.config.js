require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1
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
            runs: 1
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
        count: 20, // We need at least 19 accounts for the simulation
        accountsBalance: "10000000000000000000000" // 10,000 ETH per account
      }
    },
    omchain: {
      url: "https://rpc.omplatform.com",
      chainId: 1246,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
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