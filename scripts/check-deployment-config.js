const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("🔍 Checking deployment configuration...\n");

  // Check network
  const network = hre.network.name;
  console.log("Network:", network);
  console.log("Chain ID:", hre.network.config.chainId);

  // Check if private key is configured
  if (!process.env.PRIVATE_KEY) {
    console.error("\n❌ ERROR: PRIVATE_KEY not found in environment variables!");
    console.log("\nPlease follow these steps:");
    console.log("1. Create a .env file in the project root");
    console.log("2. Add your private key (without 0x prefix):");
    console.log("   PRIVATE_KEY=your_private_key_here");
    console.log("\nExample .env file:");
    console.log("PRIVATE_KEY=abc123def456...");
    console.log("OMCHAIN_API_KEY=your_api_key_here (optional)");
    return;
  }

  // Check if we can get a signer
  try {
    const signers = await ethers.getSigners();
    if (signers.length === 0) {
      console.error("❌ No signers available. Check your configuration.");
      return;
    }

    const deployer = signers[0];
    console.log("\n✅ Deployment account:", deployer.address);
    
    // Check balance
    const balance = await deployer.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "OM");
    
    if (balance === 0n) {
      console.warn("\n⚠️  WARNING: Account has 0 balance. You need OM tokens for gas fees!");
    }

    console.log("\n✅ Configuration looks good! Ready to deploy.");
    
  } catch (error) {
    console.error("\n❌ Error getting signer:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });