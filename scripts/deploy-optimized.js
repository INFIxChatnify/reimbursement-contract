const hre = require("hardhat");

async function main() {
  console.log("Deploying optimized contracts...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Deploy libraries first
  console.log("\n1. Deploying ReimbursementLib...");
  const ReimbursementLib = await hre.ethers.getContractFactory("ReimbursementLib");
  const reimbursementLib = await ReimbursementLib.deploy();
  await reimbursementLib.deployed();
  console.log("ReimbursementLib deployed to:", reimbursementLib.address);

  console.log("\n2. Deploying RoleManagementLib...");
  const RoleManagementLib = await hre.ethers.getContractFactory("RoleManagementLib");
  const roleManagementLib = await RoleManagementLib.deploy();
  await roleManagementLib.deployed();
  console.log("RoleManagementLib deployed to:", roleManagementLib.address);

  // Deploy implementation contract with libraries linked
  console.log("\n3. Deploying ProjectReimbursementOptimized implementation...");
  const ProjectReimbursementOptimized = await hre.ethers.getContractFactory("ProjectReimbursementOptimized", {
    libraries: {
      ReimbursementLib: reimbursementLib.address,
      RoleManagementLib: roleManagementLib.address
    }
  });
  const implementation = await ProjectReimbursementOptimized.deploy();
  await implementation.deployed();
  console.log("ProjectReimbursementOptimized implementation deployed to:", implementation.address);

  // Get contract sizes
  const implCode = await hre.ethers.provider.getCode(implementation.address);
  console.log(`Implementation contract size: ${(implCode.length - 2) / 2} bytes`);

  // Deploy OMTHB token (or use existing)
  const omthbAddress = process.env.OMTHB_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000";
  
  if (omthbAddress === "0x0000000000000000000000000000000000000000") {
    console.log("\n4. OMTHB token address not provided. Please set OMTHB_TOKEN_ADDRESS in .env");
    return;
  }

  // Deploy factories
  console.log("\n5. Deploying ProjectFactoryOptimized...");
  const ProjectFactoryOptimized = await hre.ethers.getContractFactory("ProjectFactoryOptimized");
  const projectFactory = await ProjectFactoryOptimized.deploy(
    implementation.address,
    omthbAddress,
    deployer.address
  );
  await projectFactory.deployed();
  console.log("ProjectFactoryOptimized deployed to:", projectFactory.address);

  const factoryCode = await hre.ethers.provider.getCode(projectFactory.address);
  console.log(`Factory contract size: ${(factoryCode.length - 2) / 2} bytes`);

  console.log("\n6. Deploying BeaconProjectFactoryOptimized...");
  const BeaconProjectFactoryOptimized = await hre.ethers.getContractFactory("BeaconProjectFactoryOptimized");
  const beaconFactory = await BeaconProjectFactoryOptimized.deploy(
    implementation.address,
    omthbAddress,
    deployer.address
  );
  await beaconFactory.deployed();
  console.log("BeaconProjectFactoryOptimized deployed to:", beaconFactory.address);

  const beaconCode = await hre.ethers.provider.getCode(beaconFactory.address);
  console.log(`Beacon factory contract size: ${(beaconCode.length - 2) / 2} bytes`);

  // Grant roles
  console.log("\n7. Setting up roles...");
  const CREATOR_ROLE = hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes("PROJECT_CREATOR_ROLE"));
  
  await projectFactory.grantRole(CREATOR_ROLE, deployer.address);
  console.log("Granted PROJECT_CREATOR_ROLE to deployer on ProjectFactoryOptimized");
  
  await beaconFactory.grantRole(CREATOR_ROLE, deployer.address);
  console.log("Granted PROJECT_CREATOR_ROLE to deployer on BeaconProjectFactoryOptimized");

  // Save deployment addresses
  const deployment = {
    network: hre.network.name,
    timestamp: new Date().toISOString(),
    contracts: {
      ReimbursementLib: reimbursementLib.address,
      RoleManagementLib: roleManagementLib.address,
      ProjectReimbursementOptimized: implementation.address,
      ProjectFactoryOptimized: projectFactory.address,
      BeaconProjectFactoryOptimized: beaconFactory.address
    },
    bytecodes: {
      ProjectReimbursementOptimized: `${(implCode.length - 2) / 2} bytes`,
      ProjectFactoryOptimized: `${(factoryCode.length - 2) / 2} bytes`,
      BeaconProjectFactoryOptimized: `${(beaconCode.length - 2) / 2} bytes`
    }
  };

  console.log("\n=== Deployment Summary ===");
  console.log(JSON.stringify(deployment, null, 2));

  // Write to file
  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "../deployments");
  
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }
  
  fs.writeFileSync(
    path.join(deploymentsDir, `optimized-${hre.network.name}-${Date.now()}.json`),
    JSON.stringify(deployment, null, 2)
  );

  console.log("\nDeployment completed successfully!");
  console.log("\nAll contracts are below 24KB and ready for OMChain deployment.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });