const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("Checking OM Platform account balance...");
  console.log("-".repeat(50));

  const [deployer] = await ethers.getSigners();
  const deployerAddress = deployer.address;
  
  console.log("Deployer Address:", deployerAddress);
  
  const balance = await ethers.provider.getBalance(deployerAddress);
  const balanceInOM = ethers.formatEther(balance);
  
  console.log("Current Balance:", balanceInOM, "OM");
  console.log("-".repeat(50));
  
  // Estimate required balance
  const estimatedGasForDeployment = 10000000n; // 10M gas units
  const gasPrice = await ethers.provider.getFeeData();
  const currentGasPrice = gasPrice.gasPrice || ethers.parseUnits("20", "gwei");
  
  const estimatedCost = estimatedGasForDeployment * currentGasPrice;
  const estimatedCostInOM = ethers.formatEther(estimatedCost);
  
  console.log("Current Gas Price:", ethers.formatUnits(currentGasPrice, "gwei"), "gwei");
  console.log("Estimated Deployment Cost:", estimatedCostInOM, "OM");
  console.log("Recommended Balance:", ethers.formatEther(estimatedCost * 2n), "OM (2x for safety)");
  
  if (balance < estimatedCost) {
    console.log("\n⚠️  WARNING: Insufficient balance for deployment!");
    console.log("Please fund the deployer address with at least", estimatedCostInOM, "OM");
  } else {
    console.log("\n✅ Balance is sufficient for deployment");
  }
  
  console.log("\n" + "=".repeat(50));
  console.log("NEXT STEPS:");
  console.log("=".repeat(50));
  console.log("1. Fund the deployer address with OM tokens:");
  console.log("   Address:", deployerAddress);
  console.log("   Recommended amount:", ethers.formatEther(estimatedCost * 2n), "OM");
  console.log("\n2. Run deployment:");
  console.log("   npx hardhat run scripts/deploy-to-omchain.js --network omchain");
  console.log("\n3. Verify contracts:");
  console.log("   npx hardhat run scripts/verify-contracts.js --network omchain");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });