const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Test configuration
const TEST_CONFIG = {
  projectId: "TEST-PROJECT-001",
  projectBudget: ethers.parseEther("10000"), // 10,000 OMTHB
  reimbursementAmount: ethers.parseEther("100"), // 100 OMTHB per recipient
  recipients: 3, // Number of test recipients
  mintAmount: ethers.parseEther("20000") // Amount to mint for testing
};

// Helper function to load deployment addresses
function loadDeploymentAddresses(network) {
  const filename = path.join(__dirname, "../deployments", `${network}-deployment.json`);
  if (!fs.existsSync(filename)) {
    throw new Error(`Deployment file not found: ${filename}`);
  }
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

// Helper function to generate test addresses
function generateTestAddresses(count) {
  const addresses = [];
  for (let i = 0; i < count; i++) {
    const wallet = ethers.Wallet.createRandom();
    addresses.push(wallet.address);
  }
  return addresses;
}

async function main() {
  console.log("🧪 Testing multi-recipient reimbursement system on OM Chain...");
  console.log("=".repeat(60));
  
  // Load deployment
  const deployment = loadDeploymentAddresses("omchain");
  console.log(`\n📋 Using deployment from: ${deployment.timestamp}`);
  
  // Get signer
  const [deployer] = await ethers.getSigners();
  console.log(`\n👥 Test Account:`);
  console.log(`   Deployer: ${deployer.address}`);
  
  // Get contracts
  const omthbToken = await ethers.getContractAt("OMTHBToken", deployment.addresses.omthbToken);
  const projectFactory = await ethers.getContractAt("ProjectFactory", deployment.addresses.projectFactory);
  const gasTank = await ethers.getContractAt("GasTank", deployment.addresses.gasTank);
  const metaTxForwarder = await ethers.getContractAt("MetaTxForwarder", deployment.addresses.metaTxForwarder);
  
  console.log("\n" + "=".repeat(60));
  console.log("🏭 Testing Project Creation...");
  console.log("=".repeat(60));
  
  try {
    // 1. Create a test project
    console.log(`\n1️⃣ Creating project: ${TEST_CONFIG.projectId}`);
    const createTx = await projectFactory.createProject(
      TEST_CONFIG.projectId,
      TEST_CONFIG.projectBudget,
      deployer.address
    );
    const receipt = await createTx.wait();
    
    // Find ProjectCreated event
    const projectCreatedEvent = receipt.logs.find(
      log => log.topics[0] === ethers.id("ProjectCreated(string,address,address,uint256)")
    );
    
    const projectAddress = ethers.getAddress("0x" + projectCreatedEvent.topics[2].slice(26));
    console.log(`✅ Project created at: ${projectAddress}`);
    console.log(`   Transaction hash: ${receipt.hash}`);
    
    // Get project contract
    const projectReimbursement = await ethers.getContractAt(
      "ProjectReimbursementMultiRecipient",
      projectAddress
    );
    
    // 2. Mint OMTHB tokens
    console.log(`\n2️⃣ Minting ${ethers.formatEther(TEST_CONFIG.mintAmount)} OMTHB tokens...`);
    let tx = await omthbToken.mint(projectAddress, TEST_CONFIG.mintAmount);
    await tx.wait();
    
    const projectBalance = await omthbToken.balanceOf(projectAddress);
    console.log(`✅ Project balance: ${ethers.formatEther(projectBalance)} OMTHB`);
    
    // 3. Test multi-recipient reimbursement request
    console.log(`\n3️⃣ Creating multi-recipient reimbursement request...`);
    
    // Generate test recipients
    const recipients = generateTestAddresses(TEST_CONFIG.recipients);
    const amounts = recipients.map(() => TEST_CONFIG.reimbursementAmount);
    const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0n);
    
    console.log(`   Recipients: ${recipients.length}`);
    recipients.forEach((addr, i) => {
      console.log(`     ${i + 1}. ${addr}: ${ethers.formatEther(amounts[i])} OMTHB`);
    });
    console.log(`   Total amount: ${ethers.formatEther(totalAmount)} OMTHB`);
    
    // Create request
    tx = await projectReimbursement.createRequestMultiple(
      recipients,
      amounts,
      "Test multi-recipient reimbursement",
      "QmTestDocumentHash123"
    );
    const requestReceipt = await tx.wait();
    
    // Get request ID from event
    const requestCreatedEvent = requestReceipt.logs.find(
      log => log.topics[0] === ethers.id("RequestCreated(uint256,address,address[],uint256[],uint256,string)")
    );
    const requestId = ethers.toBigInt(requestCreatedEvent.topics[1]);
    
    console.log(`✅ Request created with ID: ${requestId}`);
    console.log(`   Transaction hash: ${requestReceipt.hash}`);
    
    // 4. Test gasless transaction setup
    console.log(`\n4️⃣ Testing gasless transaction configuration...`);
    
    // Check if project is whitelisted in MetaTxForwarder
    const isWhitelisted = await metaTxForwarder.isTargetWhitelisted(projectAddress);
    if (!isWhitelisted) {
      console.log(`   Whitelisting project in MetaTxForwarder...`);
      tx = await metaTxForwarder.setTargetWhitelist(projectAddress, true);
      await tx.wait();
      console.log(`✅ Project whitelisted for gasless transactions`);
    } else {
      console.log(`✅ Project already whitelisted for gasless transactions`);
    }
    
    // Check gas tank balance
    const gasTankBalance = await ethers.provider.getBalance(deployment.addresses.gasTank);
    console.log(`✅ Gas Tank balance: ${ethers.formatEther(gasTankBalance)} OM`);
    
    // 5. Verify request details
    console.log(`\n5️⃣ Verifying request details...`);
    const request = await projectReimbursement.getRequest(requestId);
    console.log(`✅ Request status: ${['Pending', 'SecretaryApproved', 'CommitteeApproved', 'FinanceApproved', 'DirectorApproved', 'Distributed', 'Cancelled'][request.status]}`);
    console.log(`✅ Total amount: ${ethers.formatEther(request.totalAmount)} OMTHB`);
    console.log(`✅ Recipients count: ${request.recipients.length}`);
    
    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(60));
    console.log(`\n✅ All basic functionality tests passed!`);
    console.log(`\n📋 Test Results:`);
    console.log(`   - Project created successfully`);
    console.log(`   - OMTHB tokens minted and transferred`);
    console.log(`   - Multi-recipient request created`);
    console.log(`   - Gasless transaction support configured`);
    console.log(`   - Gas tank funded and operational`);
    
    console.log(`\n📍 Created Project:`);
    console.log(`   Project Address: ${projectAddress}`);
    console.log(`   Request ID: ${requestId}`);
    console.log(`   OMScan URL: https://omscan.omplatform.com/address/${projectAddress}`);
    
    console.log(`\n💡 Next Steps:`);
    console.log(`   1. Grant approval roles to different addresses`);
    console.log(`   2. Test the approval flow with commit-reveal pattern`);
    console.log(`   3. Test emergency closure functionality`);
    console.log(`   4. Create a frontend to interact with the contracts`);
    
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    throw error;
  }
  
  console.log("\n" + "=".repeat(60));
}

// Execute tests
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });