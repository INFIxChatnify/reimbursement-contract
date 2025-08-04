const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Production admin address
const PRODUCTION_ADMIN = "0xeB42B3bF49091377627610A691EA1Eaf32bc6254";

// Helper function to load deployment addresses
function loadDeploymentAddresses(network) {
  const filename = path.join(__dirname, "../deployments", `${network}-deployment.json`);
  if (!fs.existsSync(filename)) {
    throw new Error(`Deployment file not found: ${filename}`);
  }
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

async function main() {
  console.log("🔐 Starting ownership transfer to production admin...");
  console.log("=" * 60);
  
  // Load deployment addresses
  const deployment = loadDeploymentAddresses("omchain");
  console.log(`\n📋 Loaded deployment from: ${deployment.timestamp}`);
  console.log(`⛓️  Chain ID: ${deployment.chainId}`);
  
  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log(`\n👤 Current owner: ${deployer.address}`);
  console.log(`🎯 New owner: ${PRODUCTION_ADMIN}`);
  
  const transferResults = {
    success: [],
    failed: []
  };
  
  console.log("\n" + "=" * 60);
  console.log("📝 Transferring ownership and roles...");
  console.log("=" * 60);
  
  try {
    // 1. Transfer OMTHB Token roles
    console.log("\n1️⃣ OMTHB Token - Transferring admin roles...");
    const omthbToken = await ethers.getContractAt("OMTHBToken", deployment.addresses.omthbToken);
    
    // Get role constants
    const DEFAULT_ADMIN_ROLE = await omthbToken.DEFAULT_ADMIN_ROLE();
    const MINTER_ROLE = await omthbToken.MINTER_ROLE();
    const PAUSER_ROLE = await omthbToken.PAUSER_ROLE();
    const BLACKLISTER_ROLE = await omthbToken.BLACKLISTER_ROLE();
    const UPGRADER_ROLE = await omthbToken.UPGRADER_ROLE();
    
    // Grant all roles to production admin
    console.log("   Granting MINTER_ROLE...");
    let tx = await omthbToken.grantRole(MINTER_ROLE, PRODUCTION_ADMIN);
    await tx.wait();
    console.log("   ✅ MINTER_ROLE granted");
    
    console.log("   Granting PAUSER_ROLE...");
    tx = await omthbToken.grantRole(PAUSER_ROLE, PRODUCTION_ADMIN);
    await tx.wait();
    console.log("   ✅ PAUSER_ROLE granted");
    
    console.log("   Granting BLACKLISTER_ROLE...");
    tx = await omthbToken.grantRole(BLACKLISTER_ROLE, PRODUCTION_ADMIN);
    await tx.wait();
    console.log("   ✅ BLACKLISTER_ROLE granted");
    
    console.log("   Granting UPGRADER_ROLE...");
    tx = await omthbToken.grantRole(UPGRADER_ROLE, PRODUCTION_ADMIN);
    await tx.wait();
    console.log("   ✅ UPGRADER_ROLE granted");
    
    console.log("   Granting DEFAULT_ADMIN_ROLE...");
    tx = await omthbToken.grantRole(DEFAULT_ADMIN_ROLE, PRODUCTION_ADMIN);
    await tx.wait();
    console.log("   ✅ DEFAULT_ADMIN_ROLE granted");
    
    // Renounce deployer's roles
    console.log("   Renouncing deployer roles...");
    tx = await omthbToken.renounceRole(MINTER_ROLE, deployer.address);
    await tx.wait();
    tx = await omthbToken.renounceRole(PAUSER_ROLE, deployer.address);
    await tx.wait();
    tx = await omthbToken.renounceRole(BLACKLISTER_ROLE, deployer.address);
    await tx.wait();
    tx = await omthbToken.renounceRole(UPGRADER_ROLE, deployer.address);
    await tx.wait();
    tx = await omthbToken.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
    await tx.wait();
    console.log("   ✅ All deployer roles renounced");
    
    transferResults.success.push("OMTHB Token");
    
    // 2. Transfer Gas Tank ownership
    console.log("\n2️⃣ Gas Tank - Transferring admin role...");
    const gasTank = await ethers.getContractAt("GasTank", deployment.addresses.gasTank);
    
    const GAS_TANK_ADMIN_ROLE = await gasTank.DEFAULT_ADMIN_ROLE();
    
    console.log("   Granting admin role...");
    tx = await gasTank.grantRole(GAS_TANK_ADMIN_ROLE, PRODUCTION_ADMIN);
    await tx.wait();
    console.log("   ✅ Admin role granted");
    
    console.log("   Renouncing deployer admin role...");
    tx = await gasTank.renounceRole(GAS_TANK_ADMIN_ROLE, deployer.address);
    await tx.wait();
    console.log("   ✅ Deployer admin role renounced");
    
    transferResults.success.push("Gas Tank");
    
    // 3. Transfer MetaTxForwarder ownership
    console.log("\n3️⃣ MetaTxForwarder - Transferring ownership...");
    const metaTxForwarder = await ethers.getContractAt("MetaTxForwarder", deployment.addresses.metaTxForwarder);
    
    console.log("   Transferring ownership...");
    tx = await metaTxForwarder.transferOwnership(PRODUCTION_ADMIN);
    await tx.wait();
    console.log("   ✅ Ownership transferred");
    
    transferResults.success.push("MetaTxForwarder");
    
    // 4. Transfer ProjectFactory admin roles
    console.log("\n4️⃣ ProjectFactory - Transferring admin roles...");
    const projectFactory = await ethers.getContractAt("ProjectFactory", deployment.addresses.projectFactory);
    
    const FACTORY_ADMIN_ROLE = await projectFactory.DEFAULT_ADMIN_ROLE();
    const PROJECT_CREATOR_ROLE = await projectFactory.PROJECT_CREATOR_ROLE();
    
    console.log("   Granting admin role...");
    tx = await projectFactory.grantRole(FACTORY_ADMIN_ROLE, PRODUCTION_ADMIN);
    await tx.wait();
    console.log("   ✅ Admin role granted");
    
    // Note: PROJECT_CREATOR_ROLE should be granted by production admin to authorized users
    console.log("   ℹ️  PROJECT_CREATOR_ROLE should be granted by production admin");
    
    console.log("   Renouncing deployer admin role...");
    tx = await projectFactory.renounceRole(FACTORY_ADMIN_ROLE, deployer.address);
    await tx.wait();
    console.log("   ✅ Deployer admin role renounced");
    
    transferResults.success.push("ProjectFactory");
    
  } catch (error) {
    console.error("\n❌ Transfer failed:", error);
    transferResults.failed.push(error.message);
  }
  
  // Print summary
  console.log("\n" + "=" * 60);
  console.log("📊 OWNERSHIP TRANSFER SUMMARY");
  console.log("=" * 60);
  
  if (transferResults.success.length > 0) {
    console.log("\n✅ Successfully transferred:");
    transferResults.success.forEach(contract => {
      console.log(`   - ${contract}`);
    });
  }
  
  if (transferResults.failed.length > 0) {
    console.log("\n❌ Failed transfers:");
    transferResults.failed.forEach(error => {
      console.log(`   - ${error}`);
    });
  }
  
  console.log(`\n🎉 Ownership transfer completed!`);
  console.log(`👤 New admin: ${PRODUCTION_ADMIN}`);
  console.log("\n⚠️  Important: The production admin should now:");
  console.log("   1. Verify all role assignments");
  console.log("   2. Grant PROJECT_CREATOR_ROLE to authorized users");
  console.log("   3. Configure any additional roles as needed");
  console.log("   4. Update emergency withdrawal address in Gas Tank if needed");
  
  console.log("\n" + "=" * 60);
}

// Execute transfer
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });