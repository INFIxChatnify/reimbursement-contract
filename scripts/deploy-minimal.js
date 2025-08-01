const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting Minimal Deployment...\n");
  
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

    // 2. Deploy MinimalForwarder
    console.log("\n2️⃣ Deploying MinimalForwarder...");
    const MinimalForwarder = await ethers.getContractFactory("MinimalForwarder");
    const forwarder = await MinimalForwarder.deploy();
    await forwarder.waitForDeployment();
    const forwarderAddress = await forwarder.getAddress();
    
    console.log("✅ MinimalForwarder deployed to:", forwarderAddress);
    deployments.MinimalForwarder = {
      address: forwarderAddress
    };

    // 3. Deploy ProjectReimbursementOptimized (smaller version)
    console.log("\n3️⃣ Deploying ProjectReimbursementOptimized...");
    const ProjectReimbursementOptimized = await ethers.getContractFactory("ProjectReimbursementOptimized");
    const reimbursement = await ProjectReimbursementOptimized.deploy();
    await reimbursement.waitForDeployment();
    const reimbursementAddress = await reimbursement.getAddress();
    
    console.log("✅ ProjectReimbursementOptimized deployed to:", reimbursementAddress);
    deployments.ProjectReimbursementOptimized = {
      address: reimbursementAddress
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