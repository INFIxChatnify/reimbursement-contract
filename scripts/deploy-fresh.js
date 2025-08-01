const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting Fresh Deployment...\n");
  
  const [deployer] = await ethers.getSigners();
  const balance = await deployer.provider.getBalance(deployer.address);
  
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "OM\n");
  
  const deployments = {};
  
  try {
    // 1. Deploy base OMTHBToken
    console.log("1️⃣ Deploying OMTHBToken...");
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const omthbProxy = await upgrades.deployProxy(
      OMTHBToken,
      [deployer.address], // defaultAdmin
      { 
        initializer: "initialize",
        kind: 'uups'
      }
    );
    await omthbProxy.waitForDeployment();
    const omthbAddress = await omthbProxy.getAddress();
    
    console.log("✅ OMTHBToken deployed to:", omthbAddress);
    deployments.OMTHBToken = {
      address: omthbAddress,
      implementation: await upgrades.erc1967.getImplementationAddress(omthbAddress)
    };

    // 2. Deploy ProjectReimbursement
    console.log("\n2️⃣ Deploying ProjectReimbursement...");
    const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
    const reimbursement = await ProjectReimbursement.deploy();
    await reimbursement.waitForDeployment();
    const reimbursementAddress = await reimbursement.getAddress();
    
    console.log("✅ ProjectReimbursement deployed to:", reimbursementAddress);
    deployments.ProjectReimbursement = {
      address: reimbursementAddress
    };

    // 3. Deploy MinimalForwarder
    console.log("\n3️⃣ Deploying MinimalForwarder...");
    const MinimalForwarder = await ethers.getContractFactory("MinimalForwarder");
    const forwarder = await MinimalForwarder.deploy();
    await forwarder.waitForDeployment();
    const forwarderAddress = await forwarder.getAddress();
    
    console.log("✅ MinimalForwarder deployed to:", forwarderAddress);
    deployments.MinimalForwarder = {
      address: forwarderAddress
    };

    // 4. Deploy BeaconProjectFactory
    console.log("\n4️⃣ Deploying BeaconProjectFactory...");
    const BeaconProjectFactory = await ethers.getContractFactory("BeaconProjectFactory");
    const beaconFactory = await upgrades.deployProxy(
      BeaconProjectFactory,
      [
        deployer.address, // admin
        omthbAddress,     // token
        forwarderAddress  // forwarder
      ],
      {
        initializer: "initialize",
        kind: 'uups'
      }
    );
    await beaconFactory.waitForDeployment();
    const beaconFactoryAddress = await beaconFactory.getAddress();
    
    console.log("✅ BeaconProjectFactory deployed to:", beaconFactoryAddress);
    deployments.BeaconProjectFactory = {
      address: beaconFactoryAddress,
      implementation: await upgrades.erc1967.getImplementationAddress(beaconFactoryAddress)
    };

    // 5. Deploy ProjectFactory
    console.log("\n5️⃣ Deploying ProjectFactory...");
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const projectFactory = await upgrades.deployProxy(
      ProjectFactory,
      [
        deployer.address, // admin
        omthbAddress,     // token
        forwarderAddress  // forwarder
      ],
      {
        initializer: "initialize",
        kind: 'uups'
      }
    );
    await projectFactory.waitForDeployment();
    const projectFactoryAddress = await projectFactory.getAddress();
    
    console.log("✅ ProjectFactory deployed to:", projectFactoryAddress);
    deployments.ProjectFactory = {
      address: projectFactoryAddress,
      implementation: await upgrades.erc1967.getImplementationAddress(projectFactoryAddress)
    };

    // Save deployment info
    const network = await ethers.provider.getNetwork();
    const deploymentFile = path.join(__dirname, `../deployments/deployment-${network.name}-${Date.now()}.json`);
    
    // Create deployments directory if it doesn't exist
    const deploymentsDir = path.join(__dirname, '../deployments');
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    fs.writeFileSync(
      deploymentFile,
      JSON.stringify({
        network: network.name,
        chainId: network.chainId,
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
        contracts: deployments
      }, null, 2)
    );
    
    console.log("\n✅ Deployment complete! Details saved to:", deploymentFile);
    console.log("\n📋 Contract Addresses:");
    console.log("────────────────────────────────────────");
    for (const [name, deployment] of Object.entries(deployments)) {
      console.log(`${name}: ${deployment.address}`);
      if (deployment.implementation) {
        console.log(`  └─ Implementation: ${deployment.implementation}`);
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