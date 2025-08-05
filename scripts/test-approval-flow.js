const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.test" });

/**
 * Test approval flow on OMChain
 */

async function main() {
  console.log("🧪 Testing approval flow on OMChain...");
  console.log("=".repeat(60));
  
  // Load deployment info
  const deploymentPath = path.join(__dirname, "..", "deployments", "omchain-simple-approval.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Deployment not found! Run deploy-simple-approval.js first.");
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  
  // Get signers
  const [deployer] = await ethers.getSigners();
  const provider = deployer.provider;
  
  // Create signers for each role
  const secretary = new ethers.Wallet(process.env.SECRETARY_PRIVATE_KEY, provider);
  const committee = new ethers.Wallet(process.env.COMMITTEE_PRIVATE_KEY, provider);
  const finance = new ethers.Wallet(process.env.FINANCE_PRIVATE_KEY, provider);
  const director = new ethers.Wallet(process.env.DIRECTOR_PRIVATE_KEY, provider);
  
  console.log("\n👥 Test Participants:");
  console.log(`   Deployer:  ${deployer.address}`);
  console.log(`   Secretary: ${secretary.address}`);
  console.log(`   Committee: ${committee.address}`);
  console.log(`   Finance:   ${finance.address}`);
  console.log(`   Director:  ${director.address}`);
  
  // Get contract instances
  const project = await ethers.getContractAt("SimpleProjectReimbursement", deployment.contracts.testProject, deployer);
  const mockOMTHB = await ethers.getContractAt("MockOMTHB", deployment.contracts.mockOMTHB, deployer);
  
  try {
    console.log("\n" + "=".repeat(60));
    console.log("📊 INITIAL STATE");
    console.log("=".repeat(60));
    
    // Check project info
    console.log("\n1️⃣ Checking project info...");
    const projectId = await project.projectId();
    const projectBudget = await project.projectBudget();
    const projectBalance = await mockOMTHB.balanceOf(deployment.contracts.testProject);
    
    console.log(`   Project ID: ${projectId}`);
    console.log(`   Budget: ${ethers.formatEther(projectBudget)} OMTHB`);
    console.log(`   Current Balance: ${ethers.formatEther(projectBalance)} OMTHB`);
    
    // Fix: Mint tokens if balance is 0
    if (projectBalance === 0n) {
      console.log("\n⚠️  Project has no balance, minting OMTHB...");
      const mintTx = await mockOMTHB.mint(deployment.contracts.testProject, projectBudget);
      await mintTx.wait();
      const newBalance = await mockOMTHB.balanceOf(deployment.contracts.testProject);
      console.log(`   ✅ Minted ${ethers.formatEther(newBalance)} OMTHB to project`);
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("🚀 TESTING APPROVAL FLOW");
    console.log("=".repeat(60));
    
    // Create request
    console.log("\n2️⃣ Creating multi-recipient request...");
    const recipients = deployment.testProject.recipients;
    const amounts = [
      ethers.parseEther("1000"), // 1000 OMTHB
      ethers.parseEther("1500"), // 1500 OMTHB
      ethers.parseEther("2000")  // 2000 OMTHB
    ];
    const totalAmount = amounts.reduce((sum, amt) => sum + amt, 0n);
    
    console.log(`   Recipients: ${recipients.length}`);
    recipients.forEach((addr, i) => {
      console.log(`     ${i + 1}. ${addr}: ${ethers.formatEther(amounts[i])} OMTHB`);
    });
    console.log(`   Total: ${ethers.formatEther(totalAmount)} OMTHB`);
    
    const projectWithSecretary = project.connect(secretary);
    const createTx = await projectWithSecretary.createRequestMultiple(
      recipients,
      amounts,
      "Test reimbursement for OMChain demo",
      "QmTestDocument123"
    );
    const createReceipt = await createTx.wait();
    
    // Get request ID from event
    const requestCreatedEvent = createReceipt.logs.find(
      log => log.topics[0] === ethers.id("RequestCreated(uint256,address)")
    );
    const requestId = ethers.toBigInt(requestCreatedEvent.topics[1]);
    console.log(`   ✅ Request created with ID: ${requestId}`);
    
    // Secretary approval
    console.log("\n3️⃣ Secretary approval...");
    const secretaryApproveTx = await projectWithSecretary.approveBySecretary(requestId);
    await secretaryApproveTx.wait();
    console.log(`   ✅ Approved by Secretary: ${secretary.address}`);
    
    // Committee approval
    console.log("\n4️⃣ Committee approval...");
    const projectWithCommittee = project.connect(committee);
    const committeeApproveTx = await projectWithCommittee.approveByCommittee(requestId);
    await committeeApproveTx.wait();
    console.log(`   ✅ Approved by Committee: ${committee.address}`);
    
    // Finance approval
    console.log("\n5️⃣ Finance approval...");
    const projectWithFinance = project.connect(finance);
    const financeApproveTx = await projectWithFinance.approveByFinance(requestId);
    await financeApproveTx.wait();
    console.log(`   ✅ Approved by Finance: ${finance.address}`);
    
    // Director approval
    console.log("\n6️⃣ Director approval...");
    const projectWithDirector = project.connect(director);
    const directorApproveTx = await projectWithDirector.approveByDirector(requestId);
    await directorApproveTx.wait();
    console.log(`   ✅ Approved by Director: ${director.address}`);
    
    // Check request status
    console.log("\n7️⃣ Checking request status...");
    const request = await project.getRequest(requestId);
    const statusNames = ['Pending', 'SecretaryApproved', 'CommitteeApproved', 'FinanceApproved', 'DirectorApproved', 'Distributed', 'Cancelled'];
    console.log(`   Status: ${statusNames[request.status]} (${request.status})`);
    
    // Distribute tokens
    console.log("\n8️⃣ Distributing tokens...");
    const distributeTx = await project.distribute(requestId);
    const distributeReceipt = await distributeTx.wait();
    console.log(`   ✅ Tokens distributed! Tx: ${distributeReceipt.hash}`);
    
    // Verify distribution
    console.log("\n9️⃣ Verifying distribution...");
    for (let i = 0; i < recipients.length; i++) {
      const balance = await mockOMTHB.balanceOf(recipients[i]);
      console.log(`   Recipient ${i + 1}: ${ethers.formatEther(balance)} OMTHB`);
    }
    
    // Check final project balance
    const finalProjectBalance = await mockOMTHB.balanceOf(deployment.contracts.testProject);
    const totalDistributed = await project.totalDistributed();
    console.log(`\n   Project balance: ${ethers.formatEther(finalProjectBalance)} OMTHB`);
    console.log(`   Total distributed: ${ethers.formatEther(totalDistributed)} OMTHB`);
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ APPROVAL FLOW TEST COMPLETE!");
    console.log("=".repeat(60));
    
    console.log("\n🎉 Summary:");
    console.log("   - Multi-recipient request created successfully");
    console.log("   - All 4 approval levels completed");
    console.log("   - Tokens distributed to 3 recipients");
    console.log("   - Total distributed: " + ethers.formatEther(totalAmount) + " OMTHB");
    
    console.log("\n📍 View on OMScan:");
    console.log(`   Project: https://omscan.omplatform.com/address/${deployment.contracts.testProject}`);
    console.log(`   Distribution tx: https://omscan.omplatform.com/tx/${distributeReceipt.hash}`);
    
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    
    // Provide helpful debugging
    if (error.message.includes("Invalid status")) {
      console.log("\n⚠️  Check the current request status and approval order");
    }
    
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
