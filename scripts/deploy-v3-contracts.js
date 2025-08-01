const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting V3 Contracts Deployment...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "OM\n");

  // Deployment configuration
  const deployments = {};
  
  try {
    // 1. Deploy OMTHBTokenV3 (if not already deployed)
    console.log("1️⃣ Deploying OMTHBTokenV3...");
    const OMTHBTokenV3 = await ethers.getContractFactory("OMTHBTokenV3");
    
    // Deploy as upgradeable proxy
    const omthbProxy = await upgrades.deployProxy(
      OMTHBTokenV3,
      [
        deployer.address, // defaultAdmin
        deployer.address, // pauser
        deployer.address, // blacklister
        deployer.address, // upgrader
        "Thai Baht Omchain", // name
        "OMTHB", // symbol
        18 // decimals
      ],
      { 
        initializer: "initialize",
        kind: 'uups'
      }
    );
    await omthbProxy.waitForDeployment();
    const omthbAddress = await omthbProxy.getAddress();
    
    // Initialize V3 features
    const initV3Tx = await omthbProxy.initializeV3(
      172800, // 2 days timelock
      ethers.parseEther("10000000"), // 10M global daily limit
      ethers.parseEther("1000000") // 1M suspicious threshold
    );
    await initV3Tx.wait();
    
    console.log("✅ OMTHBTokenV3 deployed to:", omthbAddress);
    deployments.OMTHBTokenV3 = {
      address: omthbAddress,
      implementation: await upgrades.erc1967.getImplementationAddress(omthbAddress)
    };

    // 2. Deploy ProjectReimbursementV3
    console.log("\n2️⃣ Deploying ProjectReimbursementV3...");
    
    const ProjectReimbursementV3 = await ethers.getContractFactory("ProjectReimbursementV3");
    const reimbursementV3 = await ProjectReimbursementV3.deploy();
    await reimbursementV3.waitForDeployment();
    const reimbursementV3Address = await reimbursementV3.getAddress();
    
    console.log("✅ ProjectReimbursementV3 deployed to:", reimbursementV3Address);
    deployments.ProjectReimbursementV3 = {
      address: reimbursementV3Address
    };

    // 3. Deploy MetaTxForwarderV3 first (needed by factories)
    console.log("\n3️⃣ Deploying MetaTxForwarderV3...");
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarderV2");
    const forwarderV3 = await MetaTxForwarder.deploy();
    await forwarderV3.waitForDeployment();
    const forwarderV3Address = await forwarderV3.getAddress();
    
    console.log("✅ MetaTxForwarderV3 deployed to:", forwarderV3Address);
    deployments.MetaTxForwarderV3 = {
      address: forwarderV3Address
    };

    // 4. Deploy ProjectFactoryV3
    console.log("\n4️⃣ Deploying ProjectFactoryV3...");
    const ProjectFactoryV3 = await ethers.getContractFactory("ProjectFactoryV3");
    
    // Deploy with all required parameters
    const projectFactoryV3 = await ProjectFactoryV3.deploy(
      reimbursementV3Address,     // _projectImplementation
      omthbAddress,               // _omthbToken
      forwarderV3Address,         // _metaTxForwarder
      deployer.address            // _admin
    );
    await projectFactoryV3.waitForDeployment();
    const factoryV3Address = await projectFactoryV3.getAddress();
    
    console.log("✅ ProjectFactoryV3 deployed to:", factoryV3Address);
    deployments.ProjectFactoryV3 = {
      address: factoryV3Address
    };

    // 5. Deploy BeaconProjectFactoryV3
    console.log("\n5️⃣ Deploying BeaconProjectFactoryV3...");
    
    // Deploy beacon
    const beacon = await upgrades.deployBeacon(ProjectReimbursementV3);
    await beacon.waitForDeployment();
    const beaconAddress = await beacon.getAddress();
    
    const BeaconProjectFactoryV3 = await ethers.getContractFactory("BeaconProjectFactoryV3");
    const beaconFactoryV3 = await BeaconProjectFactoryV3.deploy(
      beaconAddress,              // _projectImplementation (beacon address)
      omthbAddress,               // _omthbToken
      forwarderV3Address,         // _metaTxForwarder
      deployer.address            // _admin
    );
    await beaconFactoryV3.waitForDeployment();
    const beaconFactoryV3Address = await beaconFactoryV3.getAddress();
    
    console.log("✅ BeaconProjectFactoryV3 deployed to:", beaconFactoryV3Address);
    console.log("   Beacon address:", beaconAddress);
    deployments.BeaconProjectFactoryV3 = {
      address: beaconFactoryV3Address,
      beacon: beaconAddress
    };


    // Save deployment addresses
    const deploymentsPath = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentsPath)) {
      fs.mkdirSync(deploymentsPath);
    }
    
    const network = hre.network.name;
    const deploymentFile = path.join(deploymentsPath, `${network}-v3-deployments.json`);
    
    fs.writeFileSync(
      deploymentFile,
      JSON.stringify({
        network: network,
        chainId: hre.network.config.chainId,
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
        contracts: deployments
      }, null, 2)
    );
    
    console.log("\n✅ All V3 contracts deployed successfully!");
    console.log(`📁 Deployment info saved to: ${deploymentFile}`);
    
    // Display summary
    console.log("\n📋 Deployment Summary:");
    console.log("====================");
    for (const [name, info] of Object.entries(deployments)) {
      console.log(`${name}: ${info.address}`);
      if (info.implementation) {
        console.log(`  └─ Implementation: ${info.implementation}`);
      }
      if (info.beacon) {
        console.log(`  └─ Beacon: ${info.beacon}`);
      }
    }
    
  } catch (error) {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });