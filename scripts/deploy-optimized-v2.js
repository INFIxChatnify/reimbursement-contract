const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying optimized contracts to OMChain...\n");

  const [deployer] = await ethers.getSigners();
  const balance = await deployer.provider.getBalance(deployer.address);
  
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "OM\n");

  // Use the previously deployed OMTHB token
  const omthbAddress = "0x2AEa4cd271eabAfea140fF8fDEaC012a7A2f4CF4";
  console.log("Using OMTHB Token at:", omthbAddress);

  try {
    // Deploy libraries first
    console.log("\n1️⃣ Deploying ReimbursementLib...");
    const ReimbursementLib = await ethers.getContractFactory("ReimbursementLib");
    const reimbursementLib = await ReimbursementLib.deploy();
    await reimbursementLib.waitForDeployment();
    const reimbursementLibAddress = await reimbursementLib.getAddress();
    console.log("✅ ReimbursementLib deployed to:", reimbursementLibAddress);

    console.log("\n2️⃣ Deploying RoleManagementLib...");
    const RoleManagementLib = await ethers.getContractFactory("RoleManagementLib");
    const roleManagementLib = await RoleManagementLib.deploy();
    await roleManagementLib.waitForDeployment();
    const roleManagementLibAddress = await roleManagementLib.getAddress();
    console.log("✅ RoleManagementLib deployed to:", roleManagementLibAddress);

    // Deploy implementation contract
    console.log("\n3️⃣ Deploying ProjectReimbursementOptimized...");
    const ProjectReimbursementOptimized = await ethers.getContractFactory("contracts/optimized/ProjectReimbursementOptimized.sol:ProjectReimbursementOptimized");
    const implementation = await ProjectReimbursementOptimized.deploy();
    await implementation.waitForDeployment();
    const implementationAddress = await implementation.getAddress();
    console.log("✅ ProjectReimbursementOptimized deployed to:", implementationAddress);

    // Deploy factories
    console.log("\n4️⃣ Deploying ProjectFactoryOptimized...");
    const ProjectFactoryOptimized = await ethers.getContractFactory("contracts/optimized/ProjectFactoryOptimized.sol:ProjectFactoryOptimized");
    const projectFactory = await ProjectFactoryOptimized.deploy(
      implementationAddress,
      omthbAddress,
      deployer.address
    );
    await projectFactory.waitForDeployment();
    const projectFactoryAddress = await projectFactory.getAddress();
    console.log("✅ ProjectFactoryOptimized deployed to:", projectFactoryAddress);

    console.log("\n5️⃣ Deploying BeaconProjectFactoryOptimized...");
    const BeaconProjectFactoryOptimized = await ethers.getContractFactory("contracts/optimized/BeaconProjectFactoryOptimized.sol:BeaconProjectFactoryOptimized");
    const beaconFactory = await BeaconProjectFactoryOptimized.deploy(
      implementationAddress,
      omthbAddress,
      deployer.address
    );
    await beaconFactory.waitForDeployment();
    const beaconFactoryAddress = await beaconFactory.getAddress();
    console.log("✅ BeaconProjectFactoryOptimized deployed to:", beaconFactoryAddress);

    // Grant roles
    console.log("\n6️⃣ Setting up roles...");
    const CREATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROJECT_CREATOR_ROLE"));
    
    await projectFactory.grantRole(CREATOR_ROLE, deployer.address);
    console.log("✅ Granted PROJECT_CREATOR_ROLE to deployer on ProjectFactoryOptimized");
    
    await beaconFactory.grantRole(CREATOR_ROLE, deployer.address);
    console.log("✅ Granted PROJECT_CREATOR_ROLE to deployer on BeaconProjectFactoryOptimized");

    // Save deployment addresses
    const deployment = {
      network: hre.network.name,
      chainId: hre.network.config.chainId,
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts: {
        OMTHBToken: omthbAddress,
        ReimbursementLib: reimbursementLibAddress,
        RoleManagementLib: roleManagementLibAddress,
        ProjectReimbursementOptimized: implementationAddress,
        ProjectFactoryOptimized: projectFactoryAddress,
        BeaconProjectFactoryOptimized: beaconFactoryAddress
      }
    };

    console.log("\n📋 Deployment Summary:");
    console.log("────────────────────────────────────────");
    console.log(JSON.stringify(deployment, null, 2));

    // Write to file
    const fs = require("fs");
    const path = require("path");
    const deploymentsDir = path.join(__dirname, "../deployments");
    
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir);
    }
    
    const filename = `optimized-${hre.network.name}-${Date.now()}.json`;
    fs.writeFileSync(
      path.join(deploymentsDir, filename),
      JSON.stringify(deployment, null, 2)
    );

    console.log("\n✅ Deployment completed successfully!");
    console.log(`📄 Deployment details saved to: deployments/${filename}`);
    
  } catch (error) {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });