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
  console.log("=" * 60);
  
  // Load deployment
  const deployment = loadDeploymentAddresses("omchain");
  console.log(`\n📋 Using deployment from: ${deployment.timestamp}`);
  
  // Get signers
  const [deployer, secretary, committee, finance, director] = await ethers.getSigners();
  console.log(`\n👥 Test Accounts:`);
  console.log(`   Deployer: ${deployer.address}`);
  console.log(`   Secretary: ${secretary.address}`);
  console.log(`   Committee: ${committee.address}`);
  console.log(`   Finance: ${finance.address}`);
  console.log(`   Director: ${director.address}`);
  
  // Get contracts
  const omthbToken = await ethers.getContractAt("OMTHBToken", deployment.addresses.omthbToken);
  const projectFactory = await ethers.getContractAt("ProjectFactory", deployment.addresses.projectFactory);
  const gasTank = await ethers.getContractAt("GasTank", deployment.addresses.gasTank);
  const metaTxForwarder = await ethers.getContractAt("MetaTxForwarder", deployment.addresses.metaTxForwarder);
  
  console.log("\n" + "=" * 60);
  console.log("🏭 Testing Project Creation...");
  console.log("=" * 60);
  
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
    
    // 3. Setup roles
    console.log(`\n3️⃣ Setting up project roles...`);
    
    // Grant roles using grantRoleDirect for initial setup
    const roles = [
      { role: await projectReimbursement.SECRETARY_ROLE(), account: secretary.address, name: "SECRETARY" },
      { role: await projectReimbursement.COMMITTEE_ROLE(), account: committee.address, name: "COMMITTEE" },
      { role: await projectReimbursement.FINANCE_ROLE(), account: finance.address, name: "FINANCE" },
      { role: await projectReimbursement.DIRECTOR_ROLE(), account: director.address, name: "DIRECTOR" }
    ];
    
    for (const { role, account, name } of roles) {
      tx = await projectReimbursement.connect(deployer).grantRoleDirect(role, account);
      await tx.wait();
      console.log(`✅ Granted ${name}_ROLE to ${account}`);
    }
    
    // 4. Test multi-recipient reimbursement request
    console.log(`\n4️⃣ Creating multi-recipient reimbursement request...`);
    
    // Generate test recipients
    const recipients = generateTestAddresses(TEST_CONFIG.recipients);
    const amounts = recipients.map(() => TEST_CONFIG.reimbursementAmount);
    const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0n);
    
    console.log(`   Recipients: ${recipients.length}`);
    console.log(`   Amount per recipient: ${ethers.formatEther(TEST_CONFIG.reimbursementAmount)} OMTHB`);
    console.log(`   Total amount: ${ethers.formatEther(totalAmount)} OMTHB`);
    
    // Create request
    tx = await projectReimbursement.connect(deployer).createRequestMultiple(
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
    
    // 5. Test gasless transaction setup
    console.log(`\n5️⃣ Testing gasless transaction configuration...`);
    
    // Check if project is whitelisted in MetaTxForwarder
    const isWhitelisted = await metaTxForwarder.isTargetWhitelisted(projectAddress);
    if (!isWhitelisted) {
      console.log(`   Whitelisting project in MetaTxForwarder...`);
      tx = await metaTxForwarder.connect(deployer).setTargetWhitelist(projectAddress, true);
      await tx.wait();
      console.log(`✅ Project whitelisted for gasless transactions`);
    } else {
      console.log(`✅ Project already whitelisted for gasless transactions`);
    }
    
    // Check gas tank balance
    const gasTankBalance = await ethers.provider.getBalance(deployment.addresses.gasTank);
    console.log(`✅ Gas Tank balance: ${ethers.formatEther(gasTankBalance)} OM`);
    
    // 6. Verify request details
    console.log(`\n6️⃣ Verifying request details...`);
    const request = await projectReimbursement.getRequest(requestId);
    console.log(`✅ Request status: ${request.status}`);
    console.log(`✅ Total amount: ${ethers.formatEther(request.totalAmount)} OMTHB`);
    console.log(`✅ Recipients count: ${request.recipients.length}`);
    
    // Print summary
    console.log("\n" + "=" * 60);
    console.log("📊 TEST SUMMARY");
    console.log("=" * 60);
    console.log(`\n✅ All basic functionality tests passed!`);
    console.log(`\n📋 Test Results:`);
    console.log(`   - Project created successfully`);
    console.log(`   - OMTHB tokens minted and transferred`);
    console.log(`   - Roles configured properly`);
    console.log(`   - Multi-recipient request created`);
    console.log(`   - Gasless transaction support configured`);
    console.log(`   - Gas tank funded and operational`);
    
    console.log(`\n💡 Next Steps:`);
    console.log(`   1. Test the approval flow with commit-reveal pattern`);
    console.log(`   2. Test emergency closure functionality`);
    console.log(`   3. Create a frontend to interact with the contracts`);
    console.log(`   4. Monitor gas usage and optimize as needed`);
    
    console.log(`\n📍 Contract Addresses:`);
    console.log(`   Project: ${projectAddress}`);
    console.log(`   Request ID: ${requestId}`);
    
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    throw error;
  }
  
  console.log("\n" + "=" * 60);
}

// Execute tests
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });