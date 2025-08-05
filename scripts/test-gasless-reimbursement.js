const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.test" });

/**
 * Test gasless multi-recipient reimbursement flow on OMChain
 * This script demonstrates the full workflow without users needing OM for gas
 */

// Load deployment info
function loadDeploymentInfo() {
  const latestPath = path.join(__dirname, "..", "deployments", "omchain-test-latest.json");
  if (!fs.existsSync(latestPath)) {
    throw new Error("No deployment found! Run deploy-and-setup-omchain.js first.");
  }
  return JSON.parse(fs.readFileSync(latestPath, "utf8"));
}

// Helper to create meta-transaction
async function createMetaTx(signer, forwarder, targetContract, functionData) {
  const nonce = await forwarder.getNonce(signer.address);
  const domain = {
    name: "MetaTxForwarderV2",
    version: "1",
    chainId: 1246,
    verifyingContract: await forwarder.getAddress()
  };
  
  const types = {
    ForwardRequest: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "gas", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "data", type: "bytes" }
    ]
  };
  
  const request = {
    from: signer.address,
    to: await targetContract.getAddress(),
    value: 0,
    gas: 2000000,
    nonce: nonce,
    data: functionData
  };
  
  const signature = await signer.signTypedData(domain, types, request);
  return { request, signature };
}

async function main() {
  console.log("🧪 Testing gasless multi-recipient reimbursement on OMChain...");
  console.log("=".repeat(60));
  
  // Load deployment info
  const deployment = loadDeploymentInfo();
  console.log(`\n📋 Using deployment from: ${deployment.timestamp}`);
  
  // Setup provider and signers
  const provider = new ethers.JsonRpcProvider(process.env.OMCHAIN_RPC_URL);
  
  // Create signers for all roles
  const signers = {
    deployer: new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider),
    admin: new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider),
    secretary: new ethers.Wallet(process.env.SECRETARY_PRIVATE_KEY, provider),
    committee: new ethers.Wallet(process.env.COMMITTEE_PRIVATE_KEY, provider),
    finance: new ethers.Wallet(process.env.FINANCE_PRIVATE_KEY, provider),
    director: new ethers.Wallet(process.env.DIRECTOR_PRIVATE_KEY, provider),
    relayer: new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider)
  };
  
  // Get contract instances
  const contracts = {
    omthbToken: await ethers.getContractAt("OMTHBTokenV3", deployment.contracts.omthbToken, provider),
    gasTank: await ethers.getContractAt("GasTank", deployment.contracts.gasTank, provider),
    metaTxForwarder: await ethers.getContractAt("MetaTxForwarderV2", deployment.contracts.metaTxForwarder, provider),
    project: await ethers.getContractAt("ProjectReimbursementOptimized", deployment.contracts.testProject, provider)
  };
  
  console.log("\n" + "=".repeat(60));
  console.log("📊 INITIAL STATE");
  console.log("=".repeat(60));
  
  // Check initial balances
  console.log("\n💰 Initial Balances:");
  const projectBalance = await contracts.omthbToken.balanceOf(deployment.contracts.testProject);
  console.log(`   Project OMTHB: ${ethers.formatEther(projectBalance)}`);
  
  const gasTankBalance = await provider.getBalance(deployment.contracts.gasTank);
  console.log(`   GasTank OM: ${ethers.formatEther(gasTankBalance)}`);
  
  const gasCredit = await contracts.gasTank.getAvailableCredit(deployment.contracts.testProject);
  console.log(`   Project Gas Credit: ${ethers.formatEther(gasCredit)} OM`);
  
  // Check user balances (should be 0)
  console.log("\n👥 User OM Balances (should be 0):");
  for (const [role, signer] of Object.entries(signers)) {
    if (role !== 'deployer' && role !== 'admin' && role !== 'relayer') {
      const balance = await provider.getBalance(signer.address);
      console.log(`   ${role}: ${ethers.formatEther(balance)} OM`);
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("🚀 TESTING GASLESS FLOW");
  console.log("=".repeat(60));
  
  try {
    // Test parameters
    const recipients = deployment.testAddresses.recipients;
    const amounts = recipients.map(() => ethers.parseEther("1000")); // 1000 OMTHB each
    const totalAmount = amounts.reduce((sum, amt) => sum + amt, 0n);
    
    // 1. Create reimbursement request (gasless)
    console.log("\n1️⃣ Creating multi-recipient request (gasless)...");
    console.log(`   Recipients: ${recipients.length}`);
    console.log(`   Amount per recipient: 1000 OMTHB`);
    console.log(`   Total amount: ${ethers.formatEther(totalAmount)} OMTHB`);
    
    // Secretary creates request via meta-transaction
    const createRequestData = contracts.project.interface.encodeFunctionData(
      "createRequestMultiple",
      [recipients, amounts, "Gasless test reimbursement", "QmTestDoc123"]
    );
    
    const createMetaTx = await createMetaTx(
      signers.secretary,
      contracts.metaTxForwarder,
      contracts.project,
      createRequestData
    );
    
    // Relayer executes the meta-transaction
    const forwarderWithRelayer = contracts.metaTxForwarder.connect(signers.relayer);
    const createTx = await forwarderWithRelayer.execute(createMetaTx.request, createMetaTx.signature);
    const createReceipt = await createTx.wait();
    
    // Get request ID from event
    const requestCreatedEvent = createReceipt.logs.find(
      log => log.topics[0] === ethers.id("RequestCreated(uint256,address,address[],uint256[],uint256,string)")
    );
    const requestId = ethers.toBigInt(requestCreatedEvent.topics[1]);
    console.log(`   ✅ Request created with ID: ${requestId}`);
    console.log(`   Gas used by relayer: ${createReceipt.gasUsed.toString()}`);
    
    // 2. Approve by Secretary (gasless)
    console.log("\n2️⃣ Secretary approval (gasless)...");
    const secretaryApproveData = contracts.project.interface.encodeFunctionData(
      "approveBySecretary",
      [requestId]
    );
    
    const secretaryApproveTx = await createMetaTx(
      signers.secretary,
      contracts.metaTxForwarder,
      contracts.project,
      secretaryApproveData
    );
    
    const secretaryTx = await forwarderWithRelayer.execute(
      secretaryApproveTx.request,
      secretaryApproveTx.signature
    );
    await secretaryTx.wait();
    console.log("   ✅ Secretary approved");
    
    // 3. Approve by Committee (gasless with commit-reveal)
    console.log("\n3️⃣ Committee approval with commit-reveal (gasless)...");
    
    // Generate secret and commitment
    const secret = ethers.hexlify(ethers.randomBytes(32));
    const commitment = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bool", "bytes32"],
        [requestId, true, secret]
      )
    );
    
    // Commit phase
    const commitData = contracts.project.interface.encodeFunctionData(
      "commitApproval",
      [requestId, commitment, 1] // 1 = Committee level
    );
    
    const commitTx = await createMetaTx(
      signers.committee,
      contracts.metaTxForwarder,
      contracts.project,
      commitData
    );
    
    const commitExecTx = await forwarderWithRelayer.execute(commitTx.request, commitTx.signature);
    await commitExecTx.wait();
    console.log("   ✅ Committee commitment submitted");
    
    // Wait a bit for commit phase
    console.log("   ⏳ Waiting for reveal phase...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Reveal phase
    const revealData = contracts.project.interface.encodeFunctionData(
      "revealApproval",
      [requestId, true, secret, 1]
    );
    
    const revealTx = await createMetaTx(
      signers.committee,
      contracts.metaTxForwarder,
      contracts.project,
      revealData
    );
    
    const revealExecTx = await forwarderWithRelayer.execute(revealTx.request, revealTx.signature);
    await revealExecTx.wait();
    console.log("   ✅ Committee revealed approval");
    
    // 4. Approve by Finance (gasless)
    console.log("\n4️⃣ Finance approval (gasless)...");
    const financeApproveData = contracts.project.interface.encodeFunctionData(
      "approveByFinance",
      [requestId]
    );
    
    const financeApproveTx = await createMetaTx(
      signers.finance,
      contracts.metaTxForwarder,
      contracts.project,
      financeApproveData
    );
    
    const financeTx = await forwarderWithRelayer.execute(
      financeApproveTx.request,
      financeApproveTx.signature
    );
    await financeTx.wait();
    console.log("   ✅ Finance approved");
    
    // 5. Approve by Director (gasless)
    console.log("\n5️⃣ Director approval (gasless)...");
    const directorApproveData = contracts.project.interface.encodeFunctionData(
      "approveByDirector",
      [requestId]
    );
    
    const directorApproveTx = await createMetaTx(
      signers.director,
      contracts.metaTxForwarder,
      contracts.project,
      directorApproveData
    );
    
    const directorTx = await forwarderWithRelayer.execute(
      directorApproveTx.request,
      directorApproveTx.signature
    );
    await directorTx.wait();
    console.log("   ✅ Director approved");
    
    // 6. Distribute tokens (gasless)
    console.log("\n6️⃣ Distributing tokens (gasless)...");
    const distributeData = contracts.project.interface.encodeFunctionData(
      "distribute",
      [requestId]
    );
    
    const distributeTx = await createMetaTx(
      signers.admin,
      contracts.metaTxForwarder,
      contracts.project,
      distributeData
    );
    
    const distTx = await forwarderWithRelayer.execute(
      distributeTx.request,
      distributeTx.signature
    );
    const distReceipt = await distTx.wait();
    console.log("   ✅ Tokens distributed");
    console.log(`   Gas used: ${distReceipt.gasUsed.toString()}`);
    
    console.log("\n" + "=".repeat(60));
    console.log("📊 FINAL STATE");
    console.log("=".repeat(60));
    
    // Check final balances
    console.log("\n💰 Recipient OMTHB Balances:");
    for (let i = 0; i < recipients.length; i++) {
      const balance = await contracts.omthbToken.balanceOf(recipients[i]);
      console.log(`   Recipient ${i + 1}: ${ethers.formatEther(balance)} OMTHB`);
    }
    
    // Check gas usage
    console.log("\n⛽ Gas Usage Summary:");
    const finalGasCredit = await contracts.gasTank.getAvailableCredit(deployment.contracts.testProject);
    const gasUsed = gasCredit - finalGasCredit;
    console.log(`   Initial credit: ${ethers.formatEther(gasCredit)} OM`);
    console.log(`   Final credit: ${ethers.formatEther(finalGasCredit)} OM`);
    console.log(`   Total gas used: ${ethers.formatEther(gasUsed)} OM`);
    
    // Check relayer stats
    const relayerStats = await contracts.gasTank.relayerStats(signers.relayer.address);
    console.log("\n🔄 Relayer Statistics:");
    console.log(`   Total refunded: ${ethers.formatEther(relayerStats.totalRefunded)} OM`);
    console.log(`   Transaction count: ${relayerStats.transactionCount.toString()}`);
    
    // Verify request status
    const request = await contracts.project.getRequest(requestId);
    console.log("\n📋 Request Status:");
    console.log(`   Status: ${['Pending', 'SecretaryApproved', 'CommitteeApproved', 'FinanceApproved', 'DirectorApproved', 'Distributed', 'Cancelled'][request.status]}`);
    console.log(`   Total distributed: ${ethers.formatEther(request.totalAmount)} OMTHB`);
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ GASLESS TEST COMPLETE!");
    console.log("=".repeat(60));
    
    console.log("\n🎉 Summary:");
    console.log("   - All users performed transactions without OM");
    console.log("   - Multi-recipient reimbursement successful");
    console.log("   - Commit-reveal pattern worked correctly");
    console.log("   - Gas costs paid by GasTank");
    console.log("   - Recipients received their OMTHB tokens");
    
    console.log("\n📍 View on OMScan:");
    console.log(`   Project: https://omscan.omplatform.com/address/${deployment.contracts.testProject}`);
    console.log(`   GasTank: https://omscan.omplatform.com/address/${deployment.contracts.gasTank}`);
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
