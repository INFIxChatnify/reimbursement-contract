const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.test" });

/**
 * Deploy and setup all contracts on OMChain
 * Including GasTank for gasless transactions
 */

// Load test addresses from .env.test
const TEST_ADDRESSES = {
  deployer: process.env.DEPLOYER_ADDRESS,
  admin: process.env.ADMIN_ADDRESS,
  secretary: process.env.SECRETARY_ADDRESS,
  committee: process.env.COMMITTEE_ADDRESS,
  finance: process.env.FINANCE_ADDRESS,
  director: process.env.DIRECTOR_ADDRESS,
  relayer: process.env.RELAYER_ADDRESS,
  recipients: [
    process.env.RECIPIENT1_ADDRESS,
    process.env.RECIPIENT2_ADDRESS,
    process.env.RECIPIENT3_ADDRESS
  ]
};

const GAS_TANK_FUNDING = ethers.parseEther(process.env.GAS_TANK_INITIAL_FUNDING || "1");
const PROJECT_BUDGET = ethers.parseEther(process.env.PROJECT_BUDGET || "100000");

// Helper function to save deployment info
function saveDeploymentInfo(data) {
  const deploymentDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir);
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(deploymentDir, `omchain-test-${timestamp}.json`);
  
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`\n📁 Deployment info saved to: ${filename}`);
  
  // Also save as latest
  const latestPath = path.join(deploymentDir, "omchain-test-latest.json");
  fs.writeFileSync(latestPath, JSON.stringify(data, null, 2));
  
  return filename;
}

async function main() {
  console.log("🚀 Starting OMChain deployment with GasTank...");
  console.log("=".repeat(60));
  
  // Check if .env.test exists
  if (!fs.existsSync(path.join(__dirname, "..", ".env.test"))) {
    console.error("❌ .env.test not found! Run 'node scripts/generate-test-wallets.js' first.");
    process.exit(1);
  }
  
  // Get deployer signer
  const provider = new ethers.JsonRpcProvider(process.env.OMCHAIN_RPC_URL);
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  // Check deployer balance
  const deployerBalance = await provider.getBalance(deployer.address);
  console.log(`\n💰 Deployer Balance: ${ethers.formatEther(deployerBalance)} OM`);
  console.log(`   Address: ${deployer.address}`);
  
  if (deployerBalance < ethers.parseEther("5")) {
    console.error("\n❌ Insufficient balance! Need at least 5 OM for deployment.");
    console.error(`   Please fund: ${deployer.address}`);
    process.exit(1);
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("📦 DEPLOYING CONTRACTS");
  console.log("=".repeat(60));
  
  const contracts = {};
  
  try {
    // 1. Deploy OMTHBToken (Upgradeable)
    console.log("\n1️⃣ Deploying OMTHBToken (Upgradeable)...");
    const OMTHBToken = await ethers.getContractFactory("OMTHBTokenV3", deployer);
    const omthbToken = await upgrades.deployProxy(
      OMTHBToken,
      [TEST_ADDRESSES.admin],
      { 
        initializer: "initialize",
        kind: "uups",
        timeout: 60000, // 60 seconds timeout
        pollingInterval: 5000 // poll every 5 seconds
      }
    );
    await omthbToken.waitForDeployment();
    contracts.omthbToken = await omthbToken.getAddress();
    contracts.omthbTokenImpl = await upgrades.erc1967.getImplementationAddress(contracts.omthbToken);
    console.log(`   ✅ Proxy: ${contracts.omthbToken}`);
    console.log(`   ✅ Implementation: ${contracts.omthbTokenImpl}`);
    
    // 2. Deploy GasTank
    console.log("\n2️⃣ Deploying GasTank...");
    const GasTank = await ethers.getContractFactory("GasTank", deployer);
    const gasTank = await GasTank.deploy(
      TEST_ADDRESSES.admin,
      TEST_ADDRESSES.admin // emergency withdrawal address
    );
    await gasTank.waitForDeployment();
    contracts.gasTank = await gasTank.getAddress();
    console.log(`   ✅ GasTank: ${contracts.gasTank}`);
    
    // Fund GasTank
    console.log(`   💸 Funding GasTank with ${ethers.formatEther(GAS_TANK_FUNDING)} OM...`);
    const fundTx = await deployer.sendTransaction({
      to: contracts.gasTank,
      value: GAS_TANK_FUNDING
    });
    await fundTx.wait();
    console.log(`   ✅ GasTank funded`);
    
    // 3. Deploy MetaTxForwarder
    console.log("\n3️⃣ Deploying MetaTxForwarder...");
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarderV2", deployer);
    const metaTxForwarder = await MetaTxForwarder.deploy(TEST_ADDRESSES.admin);
    await metaTxForwarder.waitForDeployment();
    contracts.metaTxForwarder = await metaTxForwarder.getAddress();
    console.log(`   ✅ MetaTxForwarder: ${contracts.metaTxForwarder}`);
    
    // 4. Deploy AuditAnchor
    console.log("\n4️⃣ Deploying AuditAnchor...");
    const AuditAnchor = await ethers.getContractFactory("AuditAnchor", deployer);
    const auditAnchor = await AuditAnchor.deploy();
    await auditAnchor.waitForDeployment();
    contracts.auditAnchor = await auditAnchor.getAddress();
    console.log(`   ✅ AuditAnchor: ${contracts.auditAnchor}`);
    
    // 5. Deploy ProjectReimbursement Implementation
    console.log("\n5️⃣ Deploying ProjectReimbursementOptimized Implementation...");
    const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursementOptimized", deployer);
    const projectImpl = await ProjectReimbursement.deploy();
    await projectImpl.waitForDeployment();
    contracts.projectReimbursementImpl = await projectImpl.getAddress();
    console.log(`   ✅ Implementation: ${contracts.projectReimbursementImpl}`);
    
    // 6. Deploy ProjectFactory
    console.log("\n6️⃣ Deploying ProjectFactory...");
    const ProjectFactory = await ethers.getContractFactory("ProjectFactoryV3", deployer);
    const projectFactory = await ProjectFactory.deploy(
      contracts.projectReimbursementImpl,
      contracts.omthbToken,
      contracts.metaTxForwarder,
      contracts.auditAnchor
    );
    await projectFactory.waitForDeployment();
    contracts.projectFactory = await projectFactory.getAddress();
    console.log(`   ✅ ProjectFactory: ${contracts.projectFactory}`);
    
    console.log("\n" + "=".repeat(60));
    console.log("⚙️  CONFIGURING CONTRACTS");
    console.log("=".repeat(60));
    
    // Get contract instances
    const omthb = await ethers.getContractAt("OMTHBTokenV3", contracts.omthbToken, deployer);
    const tank = await ethers.getContractAt("GasTank", contracts.gasTank, deployer);
    const forwarder = await ethers.getContractAt("MetaTxForwarderV2", contracts.metaTxForwarder, deployer);
    const factory = await ethers.getContractAt("ProjectFactoryV3", contracts.projectFactory, deployer);
    const anchor = await ethers.getContractAt("AuditAnchor", contracts.auditAnchor, deployer);
    
    // Configure roles
    console.log("\n🔐 Setting up roles...");
    
    // OMTHB Token roles
    const MINTER_ROLE = await omthb.MINTER_ROLE();
    const FACTORY_ROLE = await omthb.FACTORY_ROLE();
    await omthb.grantRole(MINTER_ROLE, TEST_ADDRESSES.admin);
    await omthb.grantRole(FACTORY_ROLE, contracts.projectFactory);
    console.log("   ✅ OMTHB roles configured");
    
    // GasTank roles
    const RELAYER_ROLE = await tank.RELAYER_ROLE();
    const OPERATOR_ROLE = await tank.OPERATOR_ROLE();
    await tank.grantRole(RELAYER_ROLE, TEST_ADDRESSES.relayer);
    await tank.grantRole(OPERATOR_ROLE, TEST_ADDRESSES.admin);
    console.log("   ✅ GasTank roles configured");
    
    // MetaTxForwarder configuration
    await forwarder.setTargetWhitelist(contracts.projectReimbursementImpl, true);
    console.log("   ✅ MetaTxForwarder whitelist configured");
    
    // ProjectFactory roles
    const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
    const FACTORY_ADMIN_ROLE = await factory.FACTORY_ADMIN_ROLE();
    await factory.grantRole(PROJECT_CREATOR_ROLE, TEST_ADDRESSES.admin);
    await factory.grantRole(FACTORY_ADMIN_ROLE, TEST_ADDRESSES.admin);
    console.log("   ✅ ProjectFactory roles configured");
    
    // AuditAnchor roles
    const AUDITOR_ROLE = await anchor.AUDITOR_ROLE();
    await anchor.grantRole(AUDITOR_ROLE, TEST_ADDRESSES.admin);
    console.log("   ✅ AuditAnchor roles configured");
    
    console.log("\n" + "=".repeat(60));
    console.log("🏗️  CREATING TEST PROJECT");
    console.log("=".repeat(60));
    
    // Create a test project
    console.log("\n📋 Creating test project...");
    const adminSigner = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
    const factoryWithAdmin = factory.connect(adminSigner);
    
    const createTx = await factoryWithAdmin.createProject(
      "TEST-PROJECT-001",
      PROJECT_BUDGET,
      TEST_ADDRESSES.admin
    );
    const receipt = await createTx.wait();
    
    // Get project address from event
    const projectCreatedEvent = receipt.logs.find(
      log => log.topics[0] === ethers.id("ProjectCreated(string,address,address,uint256)")
    );
    const projectAddress = ethers.getAddress("0x" + projectCreatedEvent.topics[2].slice(26));
    contracts.testProject = projectAddress;
    console.log(`   ✅ Project created: ${projectAddress}`);
    
    // Whitelist project in MetaTxForwarder
    await forwarder.setTargetWhitelist(projectAddress, true);
    console.log("   ✅ Project whitelisted for gasless transactions");
    
    // Setup project roles
    const project = await ethers.getContractAt("ProjectReimbursementOptimized", projectAddress, adminSigner);
    const SECRETARY_ROLE = await project.SECRETARY_ROLE();
    const COMMITTEE_ROLE = await project.COMMITTEE_ROLE();
    const FINANCE_ROLE = await project.FINANCE_ROLE();
    const DIRECTOR_ROLE = await project.DIRECTOR_ROLE();
    
    await project.grantRole(SECRETARY_ROLE, TEST_ADDRESSES.secretary);
    await project.grantRole(COMMITTEE_ROLE, TEST_ADDRESSES.committee);
    await project.grantRole(FINANCE_ROLE, TEST_ADDRESSES.finance);
    await project.grantRole(DIRECTOR_ROLE, TEST_ADDRESSES.director);
    console.log("   ✅ Project roles configured");
    
    // Mint OMTHB tokens to project
    console.log(`\n💰 Minting ${ethers.formatEther(PROJECT_BUDGET)} OMTHB to project...`);
    const omthbWithAdmin = omthb.connect(adminSigner);
    await omthbWithAdmin.mint(projectAddress, PROJECT_BUDGET);
    const projectBalance = await omthb.balanceOf(projectAddress);
    console.log(`   ✅ Project balance: ${ethers.formatEther(projectBalance)} OMTHB`);
    
    // Setup gas credits for project
    console.log("\n⛽ Setting up gas credits...");
    const tankWithAdmin = tank.connect(adminSigner);
    await tankWithAdmin.depositGasCredit(projectAddress, { value: ethers.parseEther("0.5") });
    await tankWithAdmin.updateGasCredit(
      projectAddress,
      ethers.parseEther("0.1"), // max per tx
      ethers.parseEther("2")    // daily limit
    );
    console.log("   ✅ Gas credits configured for project");
    
    // Save deployment info
    const deploymentInfo = {
      network: "omchain",
      chainId: 1246,
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts,
      testAddresses: TEST_ADDRESSES,
      configuration: {
        gasTankFunding: ethers.formatEther(GAS_TANK_FUNDING),
        projectBudget: ethers.formatEther(PROJECT_BUDGET),
        gasCredits: {
          deposited: "0.5",
          maxPerTx: "0.1",
          dailyLimit: "2"
        }
      }
    };
    
    const savedFile = saveDeploymentInfo(deploymentInfo);
    
    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ DEPLOYMENT COMPLETE!");
    console.log("=".repeat(60));
    
    console.log("\n📊 Summary:");
    console.log(`   Network: OMChain (${deploymentInfo.chainId})`);
    console.log(`   Deployer: ${deployer.address}`);
    console.log(`   Test Project: ${contracts.testProject}`);
    console.log(`   GasTank Balance: ${ethers.formatEther(GAS_TANK_FUNDING)} OM`);
    console.log(`   Project OMTHB Balance: ${ethers.formatEther(PROJECT_BUDGET)}`);
    
    console.log("\n📝 Next Steps:");
    console.log("   1. Run test script: node scripts/test-gasless-reimbursement.js");
    console.log("   2. Monitor on OMScan: https://omscan.omplatform.com");
    console.log(`   3. Check deployment info: ${savedFile}`);
    
  } catch (error) {
    console.error("\n❌ Deployment failed:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
