const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🔧 Fixing MetaTxForwarder deployment...");
  console.log("=".repeat(60));
  
  const [deployer] = await ethers.getSigners();
  const gasTankAddress = "0x5eE4DFE9b20e692FF7c76E77dCd982dd4667D78a";
  
  console.log(`\n💰 Deployer: ${deployer.address}`);
  console.log(`   GasTank: ${gasTankAddress}`);
  
  try {
    // Deploy new MetaTxForwarder with correct GasTank
    console.log("\n🚀 Deploying new MetaTxForwarderV2 with correct GasTank...");
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarderV2");
    const metaTxForwarder = await MetaTxForwarder.deploy(gasTankAddress);
    await metaTxForwarder.waitForDeployment();
    
    const forwarderAddress = await metaTxForwarder.getAddress();
    console.log(`   ✅ New MetaTxForwarder deployed: ${forwarderAddress}`);
    
    // Verify GasTank is set correctly
    const gasTankInForwarder = await metaTxForwarder.gasTank();
    console.log(`   ✅ GasTank in forwarder: ${gasTankInForwarder}`);
    console.log(`   ✅ Match: ${gasTankInForwarder === gasTankAddress}`);
    
    // Update deployment files
    console.log("\n📝 Updating deployment files...");
    
    // Update gasless deployment
    const gaslessPath = path.join(__dirname, "..", "deployments", "omchain-gasless-approval.json");
    const gaslessDeployment = JSON.parse(fs.readFileSync(gaslessPath, "utf8"));
    gaslessDeployment.contracts.metaTxForwarder = forwarderAddress;
    gaslessDeployment.fixedForwarder = {
      address: forwarderAddress,
      gasTank: gasTankAddress,
      fixedAt: new Date().toISOString()
    };
    fs.writeFileSync(gaslessPath, JSON.stringify(gaslessDeployment, null, 2));
    console.log("   ✅ Updated omchain-gasless-approval.json");
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ MetaTxForwarder fixed!");
    console.log("=".repeat(60));
    
    console.log("\n📊 Summary:");
    console.log(`   Old MetaTxForwarder: 0x47cf8b462979bFBC6F3717db1F6E5aa65984d88F`);
    console.log(`   New MetaTxForwarder: ${forwarderAddress}`);
    console.log(`   GasTank: ${gasTankAddress}`);
    
    console.log("\n💡 Next steps:");
    console.log("   1. Re-deploy gasless project with new forwarder");
    console.log("   2. Or update existing project to trust new forwarder");
    
  } catch (error) {
    console.error("\n❌ Fix failed:", error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
