const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Generate test wallets for OMChain deployment and testing
 * This script creates new wallets for all roles needed in the test
 */

async function main() {
  console.log("🔑 Generating test wallets for OMChain deployment...");
  console.log("=".repeat(60));

  // Generate wallets
  const wallets = {
    deployer: ethers.Wallet.createRandom(),
    admin: ethers.Wallet.createRandom(),
    secretary: ethers.Wallet.createRandom(),
    committee: ethers.Wallet.createRandom(),
    finance: ethers.Wallet.createRandom(),
    director: ethers.Wallet.createRandom(),
    recipient1: ethers.Wallet.createRandom(),
    recipient2: ethers.Wallet.createRandom(),
    recipient3: ethers.Wallet.createRandom(),
    relayer: ethers.Wallet.createRandom()
  };

  // Create .env.test content
  let envContent = `# ⚠️  TEST WALLETS - DO NOT USE IN PRODUCTION ⚠️
# Generated on: ${new Date().toISOString()}
# Network: OMChain (chainId: 1246)

# Main deployer wallet (NEEDS TO BE FUNDED WITH ~10 OM)
DEPLOYER_PRIVATE_KEY=${wallets.deployer.privateKey.slice(2)}
DEPLOYER_ADDRESS=${wallets.deployer.address}

# Admin wallet for managing roles
ADMIN_PRIVATE_KEY=${wallets.admin.privateKey.slice(2)}
ADMIN_ADDRESS=${wallets.admin.address}

# Approval role wallets (No OM needed - will use gasless transactions)
SECRETARY_PRIVATE_KEY=${wallets.secretary.privateKey.slice(2)}
SECRETARY_ADDRESS=${wallets.secretary.address}

COMMITTEE_PRIVATE_KEY=${wallets.committee.privateKey.slice(2)}
COMMITTEE_ADDRESS=${wallets.committee.address}

FINANCE_PRIVATE_KEY=${wallets.finance.privateKey.slice(2)}
FINANCE_ADDRESS=${wallets.finance.address}

DIRECTOR_PRIVATE_KEY=${wallets.director.privateKey.slice(2)}
DIRECTOR_ADDRESS=${wallets.director.address}

# Test recipient wallets (No OM needed)
RECIPIENT1_PRIVATE_KEY=${wallets.recipient1.privateKey.slice(2)}
RECIPIENT1_ADDRESS=${wallets.recipient1.address}

RECIPIENT2_PRIVATE_KEY=${wallets.recipient2.privateKey.slice(2)}
RECIPIENT2_ADDRESS=${wallets.recipient2.address}

RECIPIENT3_PRIVATE_KEY=${wallets.recipient3.privateKey.slice(2)}
RECIPIENT3_ADDRESS=${wallets.recipient3.address}

# Relayer wallet for meta transactions (Will get refunds from GasTank)
RELAYER_PRIVATE_KEY=${wallets.relayer.privateKey.slice(2)}
RELAYER_ADDRESS=${wallets.relayer.address}

# OMChain Configuration
OMCHAIN_RPC_URL=https://rpc.omplatform.com
OMCHAIN_CHAIN_ID=1246
OMCHAIN_EXPLORER=https://omscan.omplatform.com

# Gas Tank initial funding (in OM)
GAS_TANK_INITIAL_FUNDING=1

# OMTHB Token test amounts
PROJECT_BUDGET=100000
REIMBURSEMENT_PER_RECIPIENT=1000
`;

  // Save to .env.test
  const envPath = path.join(__dirname, "..", ".env.test");
  fs.writeFileSync(envPath, envContent);
  console.log("\n✅ Test wallets generated and saved to .env.test");

  // Display wallet summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 WALLET SUMMARY");
  console.log("=".repeat(60));
  
  console.log("\n🚀 DEPLOYER (NEEDS ~10 OM):");
  console.log(`   Address: ${wallets.deployer.address}`);
  console.log(`   ⚠️  Fund this wallet with OM tokens before deployment!`);
  
  console.log("\n👤 Role Wallets (No OM needed - Gasless):");
  console.log(`   Admin:     ${wallets.admin.address}`);
  console.log(`   Secretary: ${wallets.secretary.address}`);
  console.log(`   Committee: ${wallets.committee.address}`);
  console.log(`   Finance:   ${wallets.finance.address}`);
  console.log(`   Director:  ${wallets.director.address}`);
  
  console.log("\n💰 Recipients (No OM needed):");
  console.log(`   Recipient 1: ${wallets.recipient1.address}`);
  console.log(`   Recipient 2: ${wallets.recipient2.address}`);
  console.log(`   Recipient 3: ${wallets.recipient3.address}`);
  
  console.log("\n🔄 Relayer (Gets refunds from GasTank):");
  console.log(`   Address: ${wallets.relayer.address}`);

  console.log("\n" + "=".repeat(60));
  console.log("📝 NEXT STEPS:");
  console.log("=".repeat(60));
  console.log("\n1. Fund the DEPLOYER wallet with ~10 OM tokens");
  console.log("   You can get OM from: https://faucet.omplatform.com");
  console.log(`   Send to: ${wallets.deployer.address}`);
  console.log("\n2. Run deployment script:");
  console.log("   npm run deploy:omchain");
  console.log("\n3. Run test script:");
  console.log("   npm run test:gasless");
  
  console.log("\n⚠️  SECURITY REMINDER:");
  console.log("   - These are TEST wallets only");
  console.log("   - Delete .env.test after testing");
  console.log("   - Never commit .env.test to git");
  console.log("\n" + "=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
