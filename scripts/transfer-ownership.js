const { ethers } = require("hardhat");

async function main() {
  console.log("🔐 Starting Ownership Transfer Process...\n");
  
  const [deployer] = await ethers.getSigners();
  const newOwner = "0xeB42B3bF49091377627610A691EA1Eaf32bc6254";
  
  console.log("Current owner (deployer):", deployer.address);
  console.log("New owner:", newOwner);
  console.log("────────────────────────────────────────\n");
  
  // Contract addresses from deployment
  const contracts = {
    OMTHBToken: "0x2AEa4cd271eabAfea140fF8fDEaC012a7A2f4CF4",
    ProjectFactoryOptimized: "0xc495b4B30ed3D32FF45D5f8dA10885850C2d39dF",
    BeaconProjectFactoryOptimized: "0xab2f7988B2f6e89558b22E1AD2aFE4F4A310631a"
  };
  
  const results = [];
  
  try {
    // 1. Transfer OMTHBToken ownership
    console.log("1️⃣ Transferring OMTHBToken ownership...");
    const omthbToken = await ethers.getContractAt("OMTHBToken", contracts.OMTHBToken);
    const DEFAULT_ADMIN_ROLE = await omthbToken.DEFAULT_ADMIN_ROLE();
    
    // Grant admin role to new owner
    const grantTx1 = await omthbToken.grantRole(DEFAULT_ADMIN_ROLE, newOwner);
    await grantTx1.wait();
    console.log("   ✅ Granted DEFAULT_ADMIN_ROLE to new owner");
    
    // Renounce admin role from deployer
    const renounceTx1 = await omthbToken.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
    await renounceTx1.wait();
    console.log("   ✅ Renounced DEFAULT_ADMIN_ROLE from deployer");
    results.push({ contract: "OMTHBToken", status: "✅ Success" });
    
    // 2. Transfer ProjectFactoryOptimized ownership
    console.log("\n2️⃣ Transferring ProjectFactoryOptimized ownership...");
    const projectFactory = await ethers.getContractAt(
      "contracts/optimized/ProjectFactoryOptimized.sol:ProjectFactoryOptimized", 
      contracts.ProjectFactoryOptimized
    );
    
    // Transfer DEFAULT_ADMIN_ROLE
    const grantTx2 = await projectFactory.grantRole(DEFAULT_ADMIN_ROLE, newOwner);
    await grantTx2.wait();
    console.log("   ✅ Granted DEFAULT_ADMIN_ROLE to new owner");
    
    const renounceTx2 = await projectFactory.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
    await renounceTx2.wait();
    console.log("   ✅ Renounced DEFAULT_ADMIN_ROLE from deployer");
    results.push({ contract: "ProjectFactoryOptimized", status: "✅ Success" });
    
    // 3. Transfer BeaconProjectFactoryOptimized ownership
    console.log("\n3️⃣ Transferring BeaconProjectFactoryOptimized ownership...");
    const beaconFactory = await ethers.getContractAt(
      "contracts/optimized/BeaconProjectFactoryOptimized.sol:BeaconProjectFactoryOptimized",
      contracts.BeaconProjectFactoryOptimized
    );
    
    // Transfer DEFAULT_ADMIN_ROLE
    const grantTx3 = await beaconFactory.grantRole(DEFAULT_ADMIN_ROLE, newOwner);
    await grantTx3.wait();
    console.log("   ✅ Granted DEFAULT_ADMIN_ROLE to new owner");
    
    const renounceTx3 = await beaconFactory.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
    await renounceTx3.wait();
    console.log("   ✅ Renounced DEFAULT_ADMIN_ROLE from deployer");
    results.push({ contract: "BeaconProjectFactoryOptimized", status: "✅ Success" });
    
    // Summary
    console.log("\n📋 Ownership Transfer Summary:");
    console.log("════════════════════════════════════════");
    results.forEach(result => {
      console.log(`${result.contract}: ${result.status}`);
    });
    
    console.log("\n✅ All ownership transfers completed successfully!");
    console.log(`\n🔑 New owner: ${newOwner}`);
    
    // Verify ownership
    console.log("\n🔍 Verifying ownership...");
    const hasAdminOMTHB = await omthbToken.hasRole(DEFAULT_ADMIN_ROLE, newOwner);
    const hasAdminPF = await projectFactory.hasRole(DEFAULT_ADMIN_ROLE, newOwner);
    const hasAdminBF = await beaconFactory.hasRole(DEFAULT_ADMIN_ROLE, newOwner);
    
    console.log(`OMTHBToken - New owner has admin: ${hasAdminOMTHB}`);
    console.log(`ProjectFactoryOptimized - New owner has admin: ${hasAdminPF}`);
    console.log(`BeaconProjectFactoryOptimized - New owner has admin: ${hasAdminBF}`);
    
    // Check deployer no longer has admin
    const deployerHasAdminOMTHB = await omthbToken.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    const deployerHasAdminPF = await projectFactory.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    const deployerHasAdminBF = await beaconFactory.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    
    console.log(`\nDeployer admin roles removed: ${!deployerHasAdminOMTHB && !deployerHasAdminPF && !deployerHasAdminBF}`);
    
  } catch (error) {
    console.error("\n❌ Error during ownership transfer:", error.message);
    console.log("\nPartial results:");
    results.forEach(result => {
      console.log(`${result.contract}: ${result.status}`);
    });
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });