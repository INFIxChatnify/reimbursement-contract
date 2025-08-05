const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.test" });

/**
 * Simple deployment script for OMChain with extended timeouts
 */

async function main() {
  console.log("🚀 Starting simple OMChain deployment...");
  console.log("=".repeat(60));
  
  // Get deployer signer  
  const [deployer] = await ethers.getSigners();
  
  // Check deployer balance
  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`\n💰 Deployer Balance: ${ethers.formatEther(deployerBalance)} OM`);
  console.log(`   Address: ${deployer.address}`);
  
  console.log("\n" + "=".repeat(60));
  console.log("📦 DEPLOYING CONTRACTS (Simple Mode)");
  console.log("=".repeat(60));
  
  const contracts = {};
  
  try {
    // 1. Deploy MockOMTHB (Simple ERC20 for testing)
    console.log("\n1️⃣ Deploying MockOMTHB (Simple ERC20)...");
    const MockOMTHB = await ethers.getContractFactory("MockOMTHB");
    const omthbToken = await MockOMTHB.deploy();
    console.log("   ⏳ Waiting for deployment (this may take a while on OMChain)...");
    
    // Wait with custom timeout
    const deployedToken = await omthbToken.waitForDeployment();
    contracts.omthbToken = await deployedToken.getAddress();
    console.log(`   ✅ MockOMTHB deployed to: ${contracts.omthbToken}`);
    
    // Wait for some confirmations
    console.log("   ⏳ Waiting for block confirmations...");
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    
    // 2. Deploy GasTank
    console.log("\n2️⃣ Deploying GasTank...");
    const GasTank = await ethers.getContractFactory("GasTank");
    const gasTank = await GasTank.deploy(
      deployer.address,
      deployer.address // emergency withdrawal address
    );
    console.log("   ⏳ Waiting for deployment...");
    
    const deployedGasTank = await gasTank.waitForDeployment();
    contracts.gasTank = await deployedGasTank.getAddress();
    console.log(`   ✅ GasTank deployed to: ${contracts.gasTank}`);
    
    // Fund GasTank
    console.log(`   💸 Funding GasTank with 1 OM...`);
    const fundTx = await deployer.sendTransaction({
      to: contracts.gasTank,
      value: ethers.parseEther("1")
    });
    await fundTx.wait();
    console.log(`   ✅ GasTank funded`);
    
    // Wait for confirmations
    console.log("   ⏳ Waiting for block confirmations...");
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 3. Deploy MetaTxForwarder
    console.log("\n3️⃣ Deploying MetaTxForwarderV2...");
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarderV2");
    const metaTxForwarder = await MetaTxForwarder.deploy(deployer.address);
    console.log("   ⏳ Waiting for deployment...");
    
    const deployedForwarder = await metaTxForwarder.waitForDeployment();
    contracts.metaTxForwarder = await deployedForwarder.getAddress();
    console.log(`   ✅ MetaTxForwarder deployed to: ${contracts.metaTxForwarder}`);
    
    // Save deployment info
    const deploymentInfo = {
      network: "omchain",
      chainId: 1246,
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts,
      status: "partial",
      notes: "Simple deployment for testing OMChain connectivity"
    };
    
    const deploymentDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir);
    }
    
    const filename = path.join(deploymentDir, "omchain-simple-test.json");
    fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    
    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ SIMPLE DEPLOYMENT COMPLETE!");
    console.log("=".repeat(60));
    
    console.log("\n📊 Summary:");
    console.log(`   Network: OMChain (1246)`);
    console.log(`   Deployer: ${deployer.address}`);
    console.log(`   MockOMTHB: ${contracts.omthbToken}`);
    console.log(`   GasTank: ${contracts.gasTank}`);
    console.log(`   MetaTxForwarder: ${contracts.metaTxForwarder}`);
    
    console.log("\n📝 View on OMScan:");
    console.log(`   https://omscan.omplatform.com/address/${contracts.omthbToken}`);
    console.log(`   https://omscan.omplatform.com/address/${contracts.gasTank}`);
    console.log(`   https://omscan.omplatform.com/address/${contracts.metaTxForwarder}`);
    
    console.log("\n💡 Note: This is a simplified deployment to test OMChain connectivity.");
    console.log("   For full deployment with upgradeable contracts, network latency issues need to be resolved.");
    
  } catch (error) {
    console.error("\n❌ Deployment failed:", error.message);
    
    // Check if it's a timeout error
    if (error.message.includes("Timed out")) {
      console.log("\n⚠️  This appears to be a timeout issue with OMChain.");
      console.log("   The transaction may still be pending. You can check:");
      console.log("   https://omscan.omplatform.com/address/" + deployer.address);
    }
    
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
