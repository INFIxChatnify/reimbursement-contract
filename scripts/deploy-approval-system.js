const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.test" });

/**
 * Deploy approval system (ProjectReimbursement + Factory) on OMChain
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
  console.log("🚀 Deploying approval system on OMChain...");
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
  
  try {
    console.log("\n" + "=".repeat(60));
    console.log("📦 DEPLOYING NEW CONTRACTS");
    console.log("=".repeat(60));
    
    // 1. Deploy AuditAnchor
    console.log("\n1️⃣ Deploying AuditAnchor...");
    const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
    const auditAnchor = await AuditAnchor.deploy();
    await auditAnchor.waitForDeployment();
    contracts.auditAnchor = await auditAnchor.getAddress();
    console.log(`   ✅ AuditAnchor: ${contracts.auditAnchor}`);
    
    // Wait for confirmations
    console.log("   ⏳ Waiting for block confirmations...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 2. Deploy SimpleProjectReimbursement (Implementation)
    console.log("\n2️⃣ Deploying SimpleProjectReimbursement...");
    const ProjectReimbursement = await ethers.getContractFactory("SimpleProjectReimbursement");
    const projectImpl = await ProjectReimbursement.deploy();
    await projectImpl.waitForDeployment();
    contracts.projectReimbursementImpl = await projectImpl.getAddress();
    console.log(`   ✅ Implementation: ${contracts.projectReimbursementImpl}`);
    
    // Wait for confirmations
    console.log("   ⏳ Waiting for block confirmations...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 3. Deploy ProjectFactoryV3
    console.log("\n3️⃣ Deploying ProjectFactoryV3...");
    const ProjectFactory = await ethers.getContractFactory("ProjectFactoryV3");
    const projectFactory = await ProjectFactory.deploy(
      contracts.projectReimbursementImpl,
      contracts.mockOMTHB,
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
    const mockOMTHB = await ethers.getContractAt("MockOMTHB", contracts.mockOMTHB, deployer);
    const factory = await ethers.getContractAt("ProjectFactoryV3", contracts.projectFactory, deployer);
    const anchor = await ethers.getContractAt("AuditAnchor", contracts.auditAnchor, deployer);
    
    // 4. Setup Factory roles
    console.log("\n4️⃣ Setting up factory roles...");
    const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
    const FACTORY_ADMIN_ROLE = await factory.FACTORY_ADMIN_ROLE();
    
    await factory.grantRole(PROJECT_CREATOR_ROLE, deployer.address);
    await factory.grantRole(FACTORY_ADMIN_ROLE, deployer.address);
    console.log("   ✅ Factory roles configured");
    
    // 5. Setup Audit Anchor roles
    const AUDITOR_ROLE = await anchor.AUDITOR_ROLE();
    await anchor.grantRole(AUDITOR_ROLE, deployer.address);
    console.log("   ✅ Audit anchor roles configured");
    
    console.log("\n" + "=".repeat(60));
    console.log("🏗️  CREATING TEST PROJECT");
    console.log("=".repeat(60));
    
    // 6. Create a test project
    console.log("\n6️⃣ Creating test project...");
    const projectId = "OMCHAIN-TEST-001";
    const projectBudget = ethers.parseEther("50000"); // 50,000 OMTHB
    
    const createTx = await factory.createProject(
      projectId,
      projectBudget,
      deployer.address
    );
    const receipt = await createTx.wait();
    console.log(`   ✅ Project created! Tx: ${receipt.hash}`);
    
    // Get project address from event
    const projectCreatedEvent = receipt.logs.find(
      log => log.topics[0] === ethers.id("ProjectCreated(string,address,address,uint256)")
    );
    const projectAddress = ethers.getAddress("0x" + projectCreatedEvent.topics[2].slice(26));
    contracts.testProject = projectAddress;
    console.log(`   ✅ Project address: ${projectAddress}`);
    
    // 7. Setup project roles
    console.log("\n7️⃣ Setting up project roles...");
    const project = await ethers.getContractAt("ProjectReimbursementV3", projectAddress, deployer);
    
    const SECRETARY_ROLE = await project.SECRETARY_ROLE();
    const COMMITTEE_ROLE = await project.COMMITTEE_ROLE();
    const FINANCE_ROLE = await project.FINANCE_ROLE();
    const DIRECTOR_ROLE = await project.DIRECTOR_ROLE();
    
    await project.grantRole(SECRETARY_ROLE, TEST_ADDRESSES.secretary);
    console.log(`   ✅ Secretary: ${TEST_ADDRESSES.secretary}`);
    
    await project.grantRole(COMMITTEE_ROLE, TEST_ADDRESSES.committee);
    console.log(`   ✅ Committee: ${TEST_ADDRESSES.committee}`);
    
    await project.grantRole(FINANCE_ROLE, TEST_ADDRESSES.finance);
    console.log(`   ✅ Finance: ${TEST_ADDRESSES.finance}`);
    
    await project.grantRole(DIRECTOR_ROLE, TEST_ADDRESSES.director);
    console.log(`   ✅ Director: ${TEST_ADDRESSES.director}`);
    
    // 8. Mint OMTHB tokens to project
    console.log("\n8️⃣ Funding project with OMTHB...");
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
      testProject: {
        address: projectAddress,
        id: projectId,
        budget: ethers.formatEther(projectBudget),
        roles: {
          secretary: TEST_ADDRESSES.secretary,
          committee: TEST_ADDRESSES.committee,
          finance: TEST_ADDRESSES.finance,
          director: TEST_ADDRESSES.director
        }
      }
    };
    
    const deploymentDir = path.join(__dirname, "..", "deployments");
    const filename = path.join(deploymentDir, "omchain-approval-system.json");
    fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    
    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ APPROVAL SYSTEM DEPLOYED!");
    console.log("=".repeat(60));
    
    console.log("\n📊 Summary:");
    console.log(`   AuditAnchor: ${contracts.auditAnchor}`);
    console.log(`   ProjectReimbursement Impl: ${contracts.projectReimbursementImpl}`);
    console.log(`   ProjectFactory: ${contracts.projectFactory}`);
    console.log(`   Test Project: ${projectAddress}`);
    console.log(`   Project Budget: ${ethers.formatEther(projectBudget)} OMTHB`);
    
    console.log("\n👥 Roles configured:");
    console.log(`   Secretary: ${TEST_ADDRESSES.secretary}`);
    console.log(`   Committee: ${TEST_ADDRESSES.committee}`);
    console.log(`   Finance: ${TEST_ADDRESSES.finance}`);
    console.log(`   Director: ${TEST_ADDRESSES.director}`);
    
    console.log("\n📍 View on OMScan:");
    console.log(`   Project: https://omscan.omplatform.com/address/${projectAddress}`);
    console.log(`   Factory: https://omscan.omplatform.com/address/${contracts.projectFactory}`);
    
    console.log("\n💡 Next step: Run test-approval-flow.js to test the approval system");
    
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
