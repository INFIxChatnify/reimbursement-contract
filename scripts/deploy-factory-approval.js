const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.test" });

/**
 * Deploy approval system using Factory pattern on OMChain
 */

// Load existing contracts
const EXISTING_CONTRACTS = {
  mockOMTHB: "0xbfC8F1E1f450a95AAC41e76015aD90E95A0D6162",
  gasTank: "0x5eE4DFE9b20e692FF7c76E77dCd982dd4667D78a", 
  metaTxForwarder: "0x47cf8b462979bFBC6F3717db1F6E5aa65984d88F"
};

// Test addresses from .env.test
const TEST_ADDRESSES = {
  admin: process.env.ADMIN_ADDRESS,
  secretary: process.env.SECRETARY_ADDRESS,
  committee: process.env.COMMITTEE_ADDRESS,
  finance: process.env.FINANCE_ADDRESS,
  director: process.env.DIRECTOR_ADDRESS,
  recipients: [
    process.env.RECIPIENT1_ADDRESS,
    process.env.RECIPIENT2_ADDRESS,
    process.env.RECIPIENT3_ADDRESS
  ]
};

async function main() {
  console.log("🚀 Deploying factory-based approval system on OMChain...");
  console.log("=".repeat(60));
  
  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log(`\n💰 Deployer: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`   Balance: ${ethers.formatEther(balance)} OM`);
  
  console.log("\n📦 Using existing contracts:");
  console.log(`   MockOMTHB: ${EXISTING_CONTRACTS.mockOMTHB}`);
  console.log(`   GasTank: ${EXISTING_CONTRACTS.gasTank}`);
  console.log(`   MetaTxForwarder: ${EXISTING_CONTRACTS.metaTxForwarder}`);
  
  const contracts = { ...EXISTING_CONTRACTS };
  let createProjectTxHash = "";
  
  try {
    console.log("\n" + "=".repeat(60));
    console.log("📦 DEPLOYING FACTORY SYSTEM");
    console.log("=".repeat(60));
    
    // 1. Deploy SimpleProjectReimbursement Implementation
    console.log("\n1️⃣ Deploying SimpleProjectReimbursement Implementation...");
    const SimpleProject = await ethers.getContractFactory("SimpleProjectReimbursement");
    const implementation = await SimpleProject.deploy();
    await implementation.waitForDeployment();
    const implementationAddress = await implementation.getAddress();
    contracts.projectImplementation = implementationAddress;
    console.log(`   ✅ Implementation deployed: ${implementationAddress}`);
    
    // Wait for confirmations
    console.log("   ⏳ Waiting for block confirmations...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 2. Deploy SimpleProjectFactory
    console.log("\n2️⃣ Deploying SimpleProjectFactory...");
    const Factory = await ethers.getContractFactory("SimpleProjectFactory");
    const factory = await Factory.deploy(
      implementationAddress,
      EXISTING_CONTRACTS.mockOMTHB,
      EXISTING_CONTRACTS.metaTxForwarder
    );
    await factory.waitForDeployment();
    const factoryAddress = await factory.getAddress();
    contracts.projectFactory = factoryAddress;
    console.log(`   ✅ Factory deployed: ${factoryAddress}`);
    
    // Wait for confirmations
    console.log("   ⏳ Waiting for block confirmations...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log("\n" + "=".repeat(60));
    console.log("🏗️  CREATING PROJECT THROUGH FACTORY");
    console.log("=".repeat(60));
    
    // 3. Create project through factory
    console.log("\n3️⃣ Creating project through factory...");
    const projectId = "OMCHAIN-FACTORY-001";
    const projectBudget = ethers.parseEther("50000"); // 50,000 OMTHB
    
    console.log(`   Project ID: ${projectId}`);
    console.log(`   Budget: ${ethers.formatEther(projectBudget)} OMTHB`);
    console.log(`   Admin: ${deployer.address}`);
    
    // Create project transaction
    const createTx = await factory.createProject(
      projectId,
      projectBudget,
      deployer.address
    );
    const receipt = await createTx.wait();
    createProjectTxHash = receipt.hash;
    
    console.log(`   ✅ Project created! Tx Hash: ${createProjectTxHash}`);
    
    // Get project address from event
    const projectCreatedEvent = receipt.logs.find(
      log => log.topics[0] === ethers.id("ProjectCreated(string,address,address,uint256)")
    );
    const projectAddress = ethers.getAddress("0x" + projectCreatedEvent.topics[2].slice(26));
    contracts.testProject = projectAddress;
    console.log(`   ✅ Project address: ${projectAddress}`);
    
    // Verify project was created correctly
    const projectFromFactory = await factory.getProject(projectId);
    console.log(`   ✅ Verified project in factory: ${projectFromFactory}`);
    
    console.log("\n" + "=".repeat(60));
    console.log("⚙️  CONFIGURING PROJECT");
    console.log("=".repeat(60));
    
    // 4. Setup project roles
    console.log("\n4️⃣ Setting up project roles...");
    const project = await ethers.getContractAt("SimpleProjectReimbursement", projectAddress, deployer);
    
    const SECRETARY_ROLE = await project.SECRETARY_ROLE();
    const COMMITTEE_ROLE = await project.COMMITTEE_ROLE();
    const FINANCE_ROLE = await project.FINANCE_ROLE();
    const DIRECTOR_ROLE = await project.DIRECTOR_ROLE();
    
    // Grant roles
    await project.grantRole(SECRETARY_ROLE, TEST_ADDRESSES.secretary);
    console.log(`   ✅ Secretary: ${TEST_ADDRESSES.secretary}`);
    
    await project.grantRole(COMMITTEE_ROLE, TEST_ADDRESSES.committee);
    console.log(`   ✅ Committee: ${TEST_ADDRESSES.committee}`);
    
    await project.grantRole(FINANCE_ROLE, TEST_ADDRESSES.finance);
    console.log(`   ✅ Finance: ${TEST_ADDRESSES.finance}`);
    
    await project.grantRole(DIRECTOR_ROLE, TEST_ADDRESSES.director);
    console.log(`   ✅ Director: ${TEST_ADDRESSES.director}`);
    
    // 5. Fund project with OMTHB
    console.log("\n5️⃣ Funding project with OMTHB...");
    const mockOMTHB = await ethers.getContractAt("MockOMTHB", EXISTING_CONTRACTS.mockOMTHB, deployer);
    await mockOMTHB.mint(projectAddress, projectBudget);
    const projectBalance = await mockOMTHB.balanceOf(projectAddress);
    console.log(`   ✅ Project balance: ${ethers.formatEther(projectBalance)} OMTHB`);
    
    // Save deployment info
    const deploymentInfo = {
      network: "omchain",
      chainId: 1246,
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts,
      factory: {
        address: factoryAddress,
        implementation: implementationAddress,
        projectCount: 1,
        createProjectTxHash: createProjectTxHash
      },
      testProject: {
        address: projectAddress,
        id: projectId,
        budget: ethers.formatEther(projectBudget),
        createdThroughFactory: true,
        roles: {
          secretary: TEST_ADDRESSES.secretary,
          committee: TEST_ADDRESSES.committee,
          finance: TEST_ADDRESSES.finance,
          director: TEST_ADDRESSES.director
        },
        recipients: TEST_ADDRESSES.recipients
      }
    };
    
    const deploymentDir = path.join(__dirname, "..", "deployments");
    const filename = path.join(deploymentDir, "omchain-factory-approval.json");
    fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    
    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ FACTORY-BASED APPROVAL SYSTEM DEPLOYED!");
    console.log("=".repeat(60));
    
    console.log("\n🏭 Factory Summary:");
    console.log(`   Factory: ${factoryAddress}`);
    console.log(`   Implementation: ${implementationAddress}`);
    console.log(`   Create Project Tx: ${createProjectTxHash}`);
    
    console.log("\n📊 Project Summary:");
    console.log(`   Project: ${projectAddress}`);
    console.log(`   Project ID: ${projectId}`);
    console.log(`   Budget: ${ethers.formatEther(projectBudget)} OMTHB`);
    console.log(`   Created through Factory: ✅`);
    
    console.log("\n👥 Roles configured:");
    console.log(`   Secretary: ${TEST_ADDRESSES.secretary}`);
    console.log(`   Committee: ${TEST_ADDRESSES.committee}`);
    console.log(`   Finance: ${TEST_ADDRESSES.finance}`);
    console.log(`   Director: ${TEST_ADDRESSES.director}`);
    
    console.log("\n📍 View on OMScan:");
    console.log(`   Factory: https://omscan.omplatform.com/address/${factoryAddress}`);
    console.log(`   Project: https://omscan.omplatform.com/address/${projectAddress}`);
    console.log(`   Create Tx: https://omscan.omplatform.com/tx/${createProjectTxHash}`);
    
    console.log("\n💡 Next step: Run test-approval-flow.js with the new project address");
    
  } catch (error) {
    console.error("\n❌ Deployment failed:", error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
