const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.test" });

/**
 * Deploy simplified approval system on OMChain
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
  console.log("🚀 Deploying simplified approval system on OMChain...");
  console.log("=".repeat(60));
  
  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log(`\n💰 Deployer: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`   Balance: ${ethers.formatEther(balance)} OM`);
  
  console.log("\n📦 Using existing contracts:");
  console.log(`   MockOMTHB: ${EXISTING_CONTRACTS.mockOMTHB}`);
  
  const contracts = { ...EXISTING_CONTRACTS };
  
  try {
    console.log("\n" + "=".repeat(60));
    console.log("📦 DEPLOYING SIMPLE PROJECT");
    console.log("=".repeat(60));
    
    // Deploy SimpleProjectReimbursement
    console.log("\n1️⃣ Deploying SimpleProjectReimbursement...");
    const SimpleProject = await ethers.getContractFactory("SimpleProjectReimbursement");
    const project = await SimpleProject.deploy();
    await project.waitForDeployment();
    const projectAddress = await project.getAddress();
    contracts.testProject = projectAddress;
    console.log(`   ✅ Project deployed: ${projectAddress}`);
    
    // Wait for confirmations
    console.log("   ⏳ Waiting for block confirmations...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log("\n" + "=".repeat(60));
    console.log("⚙️  CONFIGURING PROJECT");
    console.log("=".repeat(60));
    
    // Initialize project
    console.log("\n2️⃣ Initializing project...");
    const projectId = "OMCHAIN-TEST-001";
    const projectBudget = ethers.parseEther("50000"); // 50,000 OMTHB
    
    const initTx = await project.initialize(
      projectId,
      projectBudget,
      EXISTING_CONTRACTS.mockOMTHB,
      deployer.address
    );
    await initTx.wait();
    console.log("   ✅ Project initialized");
    
    // Setup roles
    console.log("\n3️⃣ Setting up roles...");
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
    
    // Fund project with OMTHB
    console.log("\n4️⃣ Funding project with OMTHB...");
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
      testProject: {
        address: projectAddress,
        id: projectId,
        budget: ethers.formatEther(projectBudget),
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
    const filename = path.join(deploymentDir, "omchain-simple-approval.json");
    fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    
    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ APPROVAL SYSTEM DEPLOYED!");
    console.log("=".repeat(60));
    
    console.log("\n📊 Summary:");
    console.log(`   Project: ${projectAddress}`);
    console.log(`   Project ID: ${projectId}`);
    console.log(`   Budget: ${ethers.formatEther(projectBudget)} OMTHB`);
    console.log(`   OMTHB Token: ${EXISTING_CONTRACTS.mockOMTHB}`);
    
    console.log("\n👥 Roles configured:");
    console.log(`   Secretary: ${TEST_ADDRESSES.secretary}`);
    console.log(`   Committee: ${TEST_ADDRESSES.committee}`);
    console.log(`   Finance: ${TEST_ADDRESSES.finance}`);
    console.log(`   Director: ${TEST_ADDRESSES.director}`);
    
    console.log("\n💰 Recipients:");
    TEST_ADDRESSES.recipients.forEach((recipient, i) => {
      console.log(`   ${i + 1}. ${recipient}`);
    });
    
    console.log("\n📍 View on OMScan:");
    console.log(`   Project: https://omscan.omplatform.com/address/${projectAddress}`);
    
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
