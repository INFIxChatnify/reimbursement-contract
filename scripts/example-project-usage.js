const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Example configuration
const EXAMPLE_CONFIG = {
  projectId: "REIMB-2024-001",
  projectBudget: ethers.parseEther("50000"), // 50,000 OMTHB
  reimbursements: [
    {
      description: "Office supplies for Q1 2024",
      documentHash: "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
      recipients: [
        { address: "0x1234567890123456789012345678901234567890", amount: ethers.parseEther("500") },
        { address: "0x2345678901234567890123456789012345678901", amount: ethers.parseEther("750") },
        { address: "0x3456789012345678901234567890123456789012", amount: ethers.parseEther("250") }
      ]
    }
  ]
};

// Load deployment addresses
function loadDeploymentAddresses(network) {
  const filename = path.join(__dirname, "../deployments", `${network}-deployment.json`);
  if (!fs.existsSync(filename)) {
    throw new Error(`Deployment file not found: ${filename}`);
  }
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

async function main() {
  console.log("📚 Example: Multi-Recipient Reimbursement Project Usage");
  console.log("=" * 60);
  
  // Load deployment
  const deployment = loadDeploymentAddresses("omchain");
  
  // Get signer
  const [admin] = await ethers.getSigners();
  console.log(`\n👤 Admin: ${admin.address}`);
  
  // Get contracts
  const projectFactory = await ethers.getContractAt("ProjectFactory", deployment.addresses.projectFactory);
  const omthbToken = await ethers.getContractAt("OMTHBToken", deployment.addresses.omthbToken);
  
  console.log("\n" + "=" * 60);
  console.log("1️⃣ Creating a New Project");
  console.log("=" * 60);
  
  console.log(`\nProject Details:`);
  console.log(`  ID: ${EXAMPLE_CONFIG.projectId}`);
  console.log(`  Budget: ${ethers.formatEther(EXAMPLE_CONFIG.projectBudget)} OMTHB`);
  console.log(`  Admin: ${admin.address}`);
  
  // Create project
  console.log(`\nCreating project...`);
  const createTx = await projectFactory.createProject(
    EXAMPLE_CONFIG.projectId,
    EXAMPLE_CONFIG.projectBudget,
    admin.address
  );
  const receipt = await createTx.wait();
  
  // Extract project address from event
  const projectCreatedEvent = receipt.logs.find(
    log => log.topics[0] === ethers.id("ProjectCreated(string,address,address,uint256)")
  );
  const projectAddress = ethers.getAddress("0x" + projectCreatedEvent.topics[2].slice(26));
  
  console.log(`✅ Project created at: ${projectAddress}`);
  console.log(`   View on OMScan: https://omscan.omplatform.com/address/${projectAddress}`);
  
  // Get project contract
  const project = await ethers.getContractAt("ProjectReimbursementMultiRecipient", projectAddress);
  
  console.log("\n" + "=" * 60);
  console.log("2️⃣ Funding the Project");
  console.log("=" * 60);
  
  // Mint tokens to project (in production, tokens would be transferred)
  console.log(`\nMinting ${ethers.formatEther(EXAMPLE_CONFIG.projectBudget)} OMTHB to project...`);
  const mintTx = await omthbToken.mint(projectAddress, EXAMPLE_CONFIG.projectBudget);
  await mintTx.wait();
  
  const projectBalance = await omthbToken.balanceOf(projectAddress);
  console.log(`✅ Project funded with ${ethers.formatEther(projectBalance)} OMTHB`);
  
  console.log("\n" + "=" * 60);
  console.log("3️⃣ Setting Up Roles");
  console.log("=" * 60);
  
  // Example role setup (in production, use different addresses)
  const roles = [
    { name: "REQUESTER", role: await project.REQUESTER_ROLE() },
    { name: "SECRETARY", role: await project.SECRETARY_ROLE() },
    { name: "COMMITTEE", role: await project.COMMITTEE_ROLE() },
    { name: "FINANCE", role: await project.FINANCE_ROLE() },
    { name: "DIRECTOR", role: await project.DIRECTOR_ROLE() }
  ];
  
  console.log(`\nGranting roles to admin for demonstration...`);
  for (const { name, role } of roles) {
    const tx = await project.grantRoleDirect(role, admin.address);
    await tx.wait();
    console.log(`✅ Granted ${name}_ROLE`);
  }
  
  console.log("\n" + "=" * 60);
  console.log("4️⃣ Creating a Multi-Recipient Reimbursement Request");
  console.log("=" * 60);
  
  const reimbursement = EXAMPLE_CONFIG.reimbursements[0];
  const recipients = reimbursement.recipients.map(r => r.address);
  const amounts = reimbursement.recipients.map(r => r.amount);
  const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0n);
  
  console.log(`\nReimbursement Details:`);
  console.log(`  Description: ${reimbursement.description}`);
  console.log(`  Recipients: ${recipients.length}`);
  console.log(`  Total Amount: ${ethers.formatEther(totalAmount)} OMTHB`);
  console.log(`\nRecipients:`);
  reimbursement.recipients.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.address.slice(0, 10)}... : ${ethers.formatEther(r.amount)} OMTHB`);
  });
  
  console.log(`\nCreating reimbursement request...`);
  const requestTx = await project.createRequestMultiple(
    recipients,
    amounts,
    reimbursement.description,
    reimbursement.documentHash
  );
  const requestReceipt = await requestTx.wait();
  
  // Get request ID
  const requestCreatedEvent = requestReceipt.logs.find(
    log => log.topics[0] === ethers.id("RequestCreated(uint256,address,address[],uint256[],uint256,string)")
  );
  const requestId = ethers.toBigInt(requestCreatedEvent.topics[1]);
  
  console.log(`✅ Request created with ID: ${requestId}`);
  
  console.log("\n" + "=" * 60);
  console.log("5️⃣ Approval Workflow (Commit-Reveal Pattern)");
  console.log("=" * 60);
  
  console.log(`\nThe approval workflow requires:`);
  console.log(`  1. Secretary approval`);
  console.log(`  2. Committee approval (Level 1)`);
  console.log(`  3. Finance approval`);
  console.log(`  4. Committee additional approvals (3 different members)`);
  console.log(`  5. Director approval (auto-distributes funds)`);
  
  console.log(`\nEach approval uses a commit-reveal pattern:`);
  console.log(`  - Step 1: Commit the approval hash`);
  console.log(`  - Step 2: Wait 30 minutes (reveal window)`);
  console.log(`  - Step 3: Reveal the approval with nonce`);
  
  // Example commit
  const nonce = ethers.randomBytes(32);
  const commitment = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "uint256", "bytes32"],
      [admin.address, requestId, 1246, nonce] // 1246 is OM Chain ID
    )
  );
  
  console.log(`\nExample commitment: ${commitment}`);
  console.log(`Example nonce: ${ethers.hexlify(nonce)}`);
  
  console.log("\n" + "=" * 60);
  console.log("6️⃣ Monitoring and Management");
  console.log("=" * 60);
  
  // Get project stats
  const budget = await project.projectBudget();
  const distributed = await project.totalDistributed();
  const remaining = budget - distributed;
  
  console.log(`\nProject Statistics:`);
  console.log(`  Budget: ${ethers.formatEther(budget)} OMTHB`);
  console.log(`  Distributed: ${ethers.formatEther(distributed)} OMTHB`);
  console.log(`  Remaining: ${ethers.formatEther(remaining)} OMTHB`);
  
  // Get active requests
  const activeRequests = await project.getActiveRequests();
  console.log(`  Active Requests: ${activeRequests.length}`);
  
  console.log("\n" + "=" * 60);
  console.log("7️⃣ Gasless Transactions");
  console.log("=" * 60);
  
  console.log(`\nTo enable gasless transactions:`);
  console.log(`  1. Whitelist project in MetaTxForwarder`);
  console.log(`  2. Fund user's gas credit in Gas Tank`);
  console.log(`  3. Use meta-transaction signing in frontend`);
  
  console.log(`\nExample meta-transaction structure:`);
  console.log(`  {`);
  console.log(`    from: userAddress,`);
  console.log(`    to: projectAddress,`);
  console.log(`    value: 0,`);
  console.log(`    gas: 200000,`);
  console.log(`    nonce: await forwarder.getNonce(userAddress),`);
  console.log(`    deadline: Math.floor(Date.now() / 1000) + 3600,`);
  console.log(`    chainId: 1246,`);
  console.log(`    data: encodedFunctionCall`);
  console.log(`  }`);
  
  console.log("\n" + "=" * 60);
  console.log("📋 Summary");
  console.log("=" * 60);
  
  console.log(`\n✅ Project created and configured successfully!`);
  console.log(`\n📊 Key Information:`);
  console.log(`   Project ID: ${EXAMPLE_CONFIG.projectId}`);
  console.log(`   Project Address: ${projectAddress}`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Total Recipients: ${recipients.length}`);
  console.log(`   Total Amount: ${ethers.formatEther(totalAmount)} OMTHB`);
  
  console.log(`\n🔗 OMScan Links:`);
  console.log(`   Project: https://omscan.omplatform.com/address/${projectAddress}`);
  console.log(`   Factory: https://omscan.omplatform.com/address/${deployment.addresses.projectFactory}`);
  console.log(`   OMTHB Token: https://omscan.omplatform.com/address/${deployment.addresses.omthbToken}`);
  
  console.log(`\n💡 Next Steps:`);
  console.log(`   1. Complete the approval workflow`);
  console.log(`   2. Monitor fund distribution`);
  console.log(`   3. Create additional reimbursement requests`);
  console.log(`   4. Set up proper role assignments for production`);
  
  console.log("\n" + "=" * 60);
}

// Execute example
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });