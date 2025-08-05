const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.test" });

/**
 * Deploy gasless approval system on OMChain
 * Users don't need OM for gas!
 */

// Load existing contracts
const EXISTING_CONTRACTS = {
  mockOMTHB: "0xbfC8F1E1f450a95AAC41e76015aD90E95A0D6162",
  gasTank: "0x5eE4DFE9b20e692FF7c76E77dCd982dd4667D78a", 
  metaTxForwarder: "0x68c02b6259d6B4c33E3254F9BED07ac2e62b5cc7" // Fixed forwarder with correct GasTank
};

// Test addresses from .env.test
const TEST_ADDRESSES = {
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

async function main() {
  console.log("🚀 Deploying GASLESS approval system on OMChain...");
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
    console.log("📦 DEPLOYING GASLESS SYSTEM");
    console.log("=".repeat(60));
    
    // 1. Deploy GaslessProjectReimbursement
    console.log("\n1️⃣ Deploying GaslessProjectReimbursement...");
    const GaslessProject = await ethers.getContractFactory("GaslessProjectReimbursement");
    const project = await GaslessProject.deploy(EXISTING_CONTRACTS.metaTxForwarder);
    await project.waitForDeployment();
    const projectAddress = await project.getAddress();
    contracts.gaslessProject = projectAddress;
    console.log(`   ✅ Gasless Project deployed: ${projectAddress}`);
    console.log(`   ✅ Trusted Forwarder: ${EXISTING_CONTRACTS.metaTxForwarder}`);
    
    // Wait for confirmations
    console.log("   ⏳ Waiting for block confirmations...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log("\n" + "=".repeat(60));
    console.log("⚙️  CONFIGURING GASLESS PROJECT");
    console.log("=".repeat(60));
    
    // 2. Initialize project
    console.log("\n2️⃣ Initializing gasless project...");
    const projectId = "OMCHAIN-GASLESS-001";
    const projectBudget = ethers.parseEther("50000"); // 50,000 OMTHB
    
    const initTx = await project.initialize(
      projectId,
      projectBudget,
      EXISTING_CONTRACTS.mockOMTHB,
      deployer.address
    );
    await initTx.wait();
    console.log("   ✅ Project initialized");
    
    // 3. Setup roles
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
    
    // 4. Fund project with OMTHB
    console.log("\n4️⃣ Funding project with OMTHB...");
    const mockOMTHB = await ethers.getContractAt("MockOMTHB", EXISTING_CONTRACTS.mockOMTHB, deployer);
    await mockOMTHB.mint(projectAddress, projectBudget);
    const projectBalance = await mockOMTHB.balanceOf(projectAddress);
    console.log(`   ✅ Project balance: ${ethers.formatEther(projectBalance)} OMTHB`);
    
    // 5. Configure MetaTxForwarder
    console.log("\n5️⃣ Configuring MetaTxForwarder...");
    const forwarder = await ethers.getContractAt("MetaTxForwarderV2", EXISTING_CONTRACTS.metaTxForwarder, deployer);
    
    // Check if project is already whitelisted
    const isWhitelisted = await forwarder.whitelistedTargets(projectAddress);
    if (!isWhitelisted) {
      await forwarder.setTargetWhitelist(projectAddress, true);
      console.log(`   ✅ Whitelisted gasless project in MetaTxForwarder`);
    } else {
      console.log(`   ✅ Project already whitelisted`);
    }
    
    // 6. Check gas balances
    console.log("\n6️⃣ Checking gas setup...");
    console.log("   💸 User gas balances (should be 0 for gasless):");
    for (const [role, address] of Object.entries({
      Secretary: TEST_ADDRESSES.secretary,
      Committee: TEST_ADDRESSES.committee,
      Finance: TEST_ADDRESSES.finance,
      Director: TEST_ADDRESSES.director
    })) {
      const balance = await ethers.provider.getBalance(address);
      console.log(`     ${role}: ${ethers.formatEther(balance)} OM`);
    }
    
    const relayerBalance = await ethers.provider.getBalance(TEST_ADDRESSES.relayer);
    console.log(`   ⛽ Relayer balance: ${ethers.formatEther(relayerBalance)} OM`);
    
    const gasTankBalance = await ethers.provider.getBalance(EXISTING_CONTRACTS.gasTank);
    console.log(`   🏦 GasTank balance: ${ethers.formatEther(gasTankBalance)} OM`);
    
    // Save deployment info
    const deploymentInfo = {
      network: "omchain",
      chainId: 1246,
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts,
      gaslessProject: {
        address: projectAddress,
        id: projectId,
        budget: ethers.formatEther(projectBudget),
        trustedForwarder: EXISTING_CONTRACTS.metaTxForwarder,
        roles: {
          secretary: TEST_ADDRESSES.secretary,
          committee: TEST_ADDRESSES.committee,
          finance: TEST_ADDRESSES.finance,
          director: TEST_ADDRESSES.director
        },
        recipients: TEST_ADDRESSES.recipients,
        relayer: TEST_ADDRESSES.relayer
      }
    };
    
    const deploymentDir = path.join(__dirname, "..", "deployments");
    const filename = path.join(deploymentDir, "omchain-gasless-approval.json");
    fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    
    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ GASLESS APPROVAL SYSTEM DEPLOYED!");
    console.log("=".repeat(60));
    
    console.log("\n🎯 Gasless Features:");
    console.log("   ✅ Users don't need OM for gas");
    console.log("   ✅ Relayer pays gas upfront");
    console.log("   ✅ GasTank refunds relayer");
    console.log("   ✅ Meta transactions via ERC2771");
    
    console.log("\n📊 Project Summary:");
    console.log(`   Gasless Project: ${projectAddress}`);
    console.log(`   Project ID: ${projectId}`);
    console.log(`   Budget: ${ethers.formatEther(projectBudget)} OMTHB`);
    console.log(`   MetaTxForwarder: ${EXISTING_CONTRACTS.metaTxForwarder}`);
    
    console.log("\n👥 Roles (NO GAS NEEDED):");
    console.log(`   Secretary: ${TEST_ADDRESSES.secretary} (${ethers.formatEther(await ethers.provider.getBalance(TEST_ADDRESSES.secretary))} OM)`);
    console.log(`   Committee: ${TEST_ADDRESSES.committee} (${ethers.formatEther(await ethers.provider.getBalance(TEST_ADDRESSES.committee))} OM)`);
    console.log(`   Finance: ${TEST_ADDRESSES.finance} (${ethers.formatEther(await ethers.provider.getBalance(TEST_ADDRESSES.finance))} OM)`);
    console.log(`   Director: ${TEST_ADDRESSES.director} (${ethers.formatEther(await ethers.provider.getBalance(TEST_ADDRESSES.director))} OM)`);
    
    console.log("\n📍 View on OMScan:");
    console.log(`   Gasless Project: https://omscan.omplatform.com/address/${projectAddress}`);
    
    console.log("\n💡 Next step: Run test-gasless-approval-flow.js to test gasless transactions");
    
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
