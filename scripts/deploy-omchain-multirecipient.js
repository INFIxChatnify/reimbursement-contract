const hre = require("hardhat");
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Deployment configuration
const DEPLOYMENT_CONFIG = {
  chainId: 1246,
  chainName: "OM Chain",
  initialGasTankFunding: ethers.parseEther("10"), // 10 OM for gas tank
  defaultRoles: {
    minter: true,
    pauser: true,
    blacklister: true,
    upgrader: true
  }
};

// Helper function to save deployment addresses
function saveDeploymentAddresses(network, addresses) {
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }
  
  const filename = path.join(deploymentsDir, `${network}-deployment.json`);
  const timestamp = new Date().toISOString();
  
  const deployment = {
    network,
    chainId: DEPLOYMENT_CONFIG.chainId,
    timestamp,
    addresses,
    contractVersions: {
      omthbToken: "1.0.0",
      gasTank: "1.0.0",
      metaTxForwarder: "1.0.0",
      projectFactory: "1.0.0",
      projectReimbursement: "1.0.0"
    }
  };
  
  fs.writeFileSync(filename, JSON.stringify(deployment, null, 2));
  console.log(`\nDeployment addresses saved to: ${filename}`);
  
  return deployment;
}

// Helper function to verify deployment
async function verifyDeployment(addresses) {
  console.log("\n📋 Verifying deployment...");
  
  try {
    // Verify OMTHB Token
    const omthbToken = await ethers.getContractAt("OMTHBToken", addresses.omthbToken);
    const tokenName = await omthbToken.name();
    const tokenSymbol = await omthbToken.symbol();
    console.log(`✅ OMTHB Token: ${tokenName} (${tokenSymbol})`);
    
    // Verify Gas Tank
    const gasTank = await ethers.getContractAt("GasTank", addresses.gasTank);
    const gasTankBalance = await ethers.provider.getBalance(addresses.gasTank);
    console.log(`✅ Gas Tank Balance: ${ethers.formatEther(gasTankBalance)} OM`);
    
    // Verify MetaTxForwarder
    const metaTxForwarder = await ethers.getContractAt("MetaTxForwarder", addresses.metaTxForwarder);
    const forwarderOwner = await metaTxForwarder.owner();
    console.log(`✅ MetaTxForwarder Owner: ${forwarderOwner}`);
    
    // Verify ProjectFactory
    const projectFactory = await ethers.getContractAt("ProjectFactory", addresses.projectFactory);
    const implementation = await projectFactory.projectImplementation();
    console.log(`✅ ProjectFactory Implementation: ${implementation}`);
    
    return true;
  } catch (error) {
    console.error("❌ Verification failed:", error.message);
    return false;
  }
}

async function main() {
  console.log("🚀 Starting multi-recipient reimbursement system deployment to OM Chain...");
  console.log("=" * 60);
  
  // Get network info
  const network = await hre.network;
  const chainId = network.config.chainId;
  
  // Verify we're on OM Chain
  if (chainId !== DEPLOYMENT_CONFIG.chainId) {
    throw new Error(`Wrong network! Expected chainId ${DEPLOYMENT_CONFIG.chainId} (OM Chain), got ${chainId}`);
  }
  
  console.log(`\n📍 Network: ${DEPLOYMENT_CONFIG.chainName}`);
  console.log(`⛓️  Chain ID: ${chainId}`);
  console.log(`🔗 RPC URL: ${network.config.url}`);
  
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  
  console.log(`\n👤 Deployer: ${deployer.address}`);
  console.log(`💰 Balance: ${ethers.formatEther(deployerBalance)} OM`);
  
  // Check if deployer has enough balance
  const estimatedGasNeeded = ethers.parseEther("50"); // Rough estimate
  if (deployerBalance < estimatedGasNeeded) {
    console.warn(`\n⚠️  Warning: Deployer might not have enough OM for deployment`);
    console.warn(`   Current: ${ethers.formatEther(deployerBalance)} OM`);
    console.warn(`   Recommended: ${ethers.formatEther(estimatedGasNeeded)} OM`);
  }
  
  console.log("\n" + "=" * 60);
  console.log("📦 Starting contract deployments...");
  console.log("=" * 60);
  
  const addresses = {};
  
  try {
    // 1. Deploy OMTHB Token (Upgradeable)
    console.log("\n1️⃣ Deploying OMTHB Token (Upgradeable)...");
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const omthbToken = await upgrades.deployProxy(
      OMTHBToken,
      [deployer.address],
      { 
        initializer: "initialize",
        kind: "uups"
      }
    );
    await omthbToken.waitForDeployment();
    addresses.omthbToken = await omthbToken.getAddress();
    addresses.omthbTokenImplementation = await upgrades.erc1967.getImplementationAddress(addresses.omthbToken);
    console.log(`✅ OMTHB Token deployed to: ${addresses.omthbToken}`);
    console.log(`   Implementation: ${addresses.omthbTokenImplementation}`);
    
    // 2. Deploy Gas Tank
    console.log("\n2️⃣ Deploying Gas Tank...");
    const GasTank = await ethers.getContractFactory("GasTank");
    const gasTank = await GasTank.deploy(deployer.address, deployer.address);
    await gasTank.waitForDeployment();
    addresses.gasTank = await gasTank.getAddress();
    console.log(`✅ Gas Tank deployed to: ${addresses.gasTank}`);
    
    // Fund the gas tank
    if (DEPLOYMENT_CONFIG.initialGasTankFunding > 0) {
      console.log(`   Funding Gas Tank with ${ethers.formatEther(DEPLOYMENT_CONFIG.initialGasTankFunding)} OM...`);
      const fundTx = await deployer.sendTransaction({
        to: addresses.gasTank,
        value: DEPLOYMENT_CONFIG.initialGasTankFunding
      });
      await fundTx.wait();
      console.log(`   ✅ Gas Tank funded`);
    }
    
    // 3. Deploy MetaTxForwarder
    console.log("\n3️⃣ Deploying MetaTxForwarder...");
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const metaTxForwarder = await MetaTxForwarder.deploy();
    await metaTxForwarder.waitForDeployment();
    addresses.metaTxForwarder = await metaTxForwarder.getAddress();
    console.log(`✅ MetaTxForwarder deployed to: ${addresses.metaTxForwarder}`);
    
    // 4. Deploy ProjectReimbursement Implementation
    console.log("\n4️⃣ Deploying ProjectReimbursement Implementation...");
    const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursementOptimized");
    const projectImplementation = await ProjectReimbursement.deploy();
    await projectImplementation.waitForDeployment();
    addresses.projectReimbursementImplementation = await projectImplementation.getAddress();
    console.log(`✅ ProjectReimbursement Implementation deployed to: ${addresses.projectReimbursementImplementation}`);
    
    // 5. Deploy ProjectFactory
    console.log("\n5️⃣ Deploying ProjectFactory...");
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const projectFactory = await ProjectFactory.deploy(
      addresses.projectReimbursementImplementation,
      addresses.omthbToken,
      addresses.metaTxForwarder,
      deployer.address
    );
    await projectFactory.waitForDeployment();
    addresses.projectFactory = await projectFactory.getAddress();
    console.log(`✅ ProjectFactory deployed to: ${addresses.projectFactory}`);
    
    console.log("\n" + "=" * 60);
    console.log("🔧 Configuring contracts...");
    console.log("=" * 60);
    
    // Configure MetaTxForwarder
    console.log("\n📝 Whitelisting contracts in MetaTxForwarder...");
    const forwarder = await ethers.getContractAt("MetaTxForwarder", addresses.metaTxForwarder);
    
    // Whitelist the project implementation
    let tx = await forwarder.setTargetWhitelist(addresses.projectReimbursementImplementation, true);
    await tx.wait();
    console.log(`✅ Whitelisted ProjectReimbursement implementation`);
    
    // Configure Gas Tank
    console.log("\n📝 Configuring Gas Tank roles...");
    const tank = await ethers.getContractAt("GasTank", addresses.gasTank);
    
    // Grant relayer role to MetaTxForwarder
    const RELAYER_ROLE = await tank.RELAYER_ROLE();
    tx = await tank.grantRole(RELAYER_ROLE, addresses.metaTxForwarder);
    await tx.wait();
    console.log(`✅ Granted RELAYER_ROLE to MetaTxForwarder`);
    
    // Configure ProjectFactory
    console.log("\n📝 Configuring ProjectFactory roles...");
    const factory = await ethers.getContractAt("ProjectFactory", addresses.projectFactory);
    
    // Grant PROJECT_CREATOR_ROLE to deployer for testing
    const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
    tx = await factory.grantRole(PROJECT_CREATOR_ROLE, deployer.address);
    await tx.wait();
    console.log(`✅ Granted PROJECT_CREATOR_ROLE to deployer`);
    
    // Verify deployment
    console.log("\n" + "=" * 60);
    const verificationSuccess = await verifyDeployment(addresses);
    
    if (verificationSuccess) {
      console.log("\n✅ All contracts verified successfully!");
    }
    
    // Save deployment addresses
    const deployment = saveDeploymentAddresses("omchain", addresses);
    
    // Print summary
    console.log("\n" + "=" * 60);
    console.log("📊 DEPLOYMENT SUMMARY");
    console.log("=" * 60);
    console.log(`\n🎉 Multi-recipient reimbursement system deployed successfully!`);
    console.log(`\n📍 Network: ${DEPLOYMENT_CONFIG.chainName} (${chainId})`);
    console.log(`⏰ Timestamp: ${deployment.timestamp}`);
    console.log(`\n📋 Contract Addresses:`);
    console.log(`   OMTHB Token: ${addresses.omthbToken}`);
    console.log(`   Gas Tank: ${addresses.gasTank}`);
    console.log(`   MetaTxForwarder: ${addresses.metaTxForwarder}`);
    console.log(`   ProjectFactory: ${addresses.projectFactory}`);
    console.log(`   ProjectReimbursement Implementation: ${addresses.projectReimbursementImplementation}`);
    
    console.log(`\n💡 Next Steps:`);
    console.log(`   1. Verify contracts on OMScan using: npm run verify:omchain`);
    console.log(`   2. Configure additional roles and permissions as needed`);
    console.log(`   3. Create your first project using ProjectFactory`);
    console.log(`   4. Fund the Gas Tank with more OM for gasless transactions`);
    
    console.log("\n" + "=" * 60);
    
  } catch (error) {
    console.error("\n❌ Deployment failed:", error);
    throw error;
  }
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });