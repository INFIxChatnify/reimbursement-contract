const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.test" });

/**
 * Full loop gasless test on OMChain
 * Deploy -> Configure -> Test -> Verify
 */

// Test addresses from .env.test
const TEST_ADDRESSES = {
  admin: process.env.ADMIN_ADDRESS,
  secretary: {
    address: process.env.SECRETARY_ADDRESS,
    privateKey: process.env.SECRETARY_PRIVATE_KEY
  },
  committee: {
    address: process.env.COMMITTEE_ADDRESS,
    privateKey: process.env.COMMITTEE_PRIVATE_KEY
  },
  finance: {
    address: process.env.FINANCE_ADDRESS,
    privateKey: process.env.FINANCE_PRIVATE_KEY
  },
  director: {
    address: process.env.DIRECTOR_ADDRESS,
    privateKey: process.env.DIRECTOR_PRIVATE_KEY
  },
  relayer: {
    address: process.env.RELAYER_ADDRESS,
    privateKey: process.env.RELAYER_PRIVATE_KEY
  },
  recipients: [
    process.env.RECIPIENT1_ADDRESS,
    process.env.RECIPIENT2_ADDRESS,
    process.env.RECIPIENT3_ADDRESS
  ]
};

// Domain for EIP-712
const DOMAIN = {
  name: "MetaTxForwarderV2",
  version: "2",
  chainId: 1246
};

// Type definition for EIP-712
const FORWARD_REQUEST_TYPE = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "chainId", type: "uint256" },
    { name: "data", type: "bytes" }
  ]
};

async function main() {
  console.log("🧪 Full Loop Gasless Test on OMChain");
  console.log("=".repeat(60));
  
  const [deployer] = await ethers.getSigners();
  const relayerWallet = new ethers.Wallet(TEST_ADDRESSES.relayer.privateKey, ethers.provider);
  
  const contracts = {};
  const results = {
    deployment: { success: false },
    configuration: { success: false },
    gaslessApproval: { success: false },
    distribution: { success: false }
  };
  
  try {
    // ================== PHASE 1: DEPLOYMENT ==================
    console.log("\n📦 PHASE 1: DEPLOYMENT");
    console.log("=".repeat(60));
    
    // Use existing infrastructure
    console.log("\n1️⃣ Using existing infrastructure...");
    contracts.mockOMTHB = "0xbfC8F1E1f450a95AAC41e76015aD90E95A0D6162";
    contracts.gasTank = "0x5eE4DFE9b20e692FF7c76E77dCd982dd4667D78a";
    contracts.metaTxForwarder = "0x68c02b6259d6B4c33E3254F9BED07ac2e62b5cc7";
    
    console.log(`   MockOMTHB: ${contracts.mockOMTHB}`);
    console.log(`   GasTank: ${contracts.gasTank}`);
    console.log(`   MetaTxForwarder: ${contracts.metaTxForwarder}`);
    
    // Deploy new gasless project
    console.log("\n2️⃣ Deploying GaslessProjectReimbursement...");
    const GaslessProject = await ethers.getContractFactory("GaslessProjectReimbursement");
    const project = await GaslessProject.deploy(contracts.metaTxForwarder);
    await project.waitForDeployment();
    contracts.gaslessProject = await project.getAddress();
    console.log(`   ✅ Deployed: ${contracts.gaslessProject}`);
    
    results.deployment.success = true;
    results.deployment.projectAddress = contracts.gaslessProject;
    
    // ================== PHASE 2: CONFIGURATION ==================
    console.log("\n⚙️  PHASE 2: CONFIGURATION");
    console.log("=".repeat(60));
    
    // Initialize project
    console.log("\n1️⃣ Initializing project...");
    const projectId = `GASLESS-FULL-TEST-${Date.now()}`;
    const projectBudget = ethers.parseEther("100000");
    
    await project.initialize(projectId, projectBudget, contracts.mockOMTHB, deployer.address);
    console.log(`   ✅ Project initialized: ${projectId}`);
    
    // Setup roles
    console.log("\n2️⃣ Setting up roles...");
    const roles = {
      SECRETARY_ROLE: await project.SECRETARY_ROLE(),
      COMMITTEE_ROLE: await project.COMMITTEE_ROLE(),
      FINANCE_ROLE: await project.FINANCE_ROLE(),
      DIRECTOR_ROLE: await project.DIRECTOR_ROLE()
    };
    
    await project.grantRole(roles.SECRETARY_ROLE, TEST_ADDRESSES.secretary.address);
    await project.grantRole(roles.COMMITTEE_ROLE, TEST_ADDRESSES.committee.address);
    await project.grantRole(roles.FINANCE_ROLE, TEST_ADDRESSES.finance.address);
    await project.grantRole(roles.DIRECTOR_ROLE, TEST_ADDRESSES.director.address);
    console.log("   ✅ All roles granted");
    
    // Fund project
    console.log("\n3️⃣ Funding project with OMTHB...");
    const mockOMTHB = await ethers.getContractAt("MockOMTHB", contracts.mockOMTHB);
    const mintTx = await mockOMTHB.mint(contracts.gaslessProject, projectBudget);
    await mintTx.wait();
    const projectBalance = await mockOMTHB.balanceOf(contracts.gaslessProject);
    console.log(`   ✅ Project funded: ${ethers.formatEther(projectBalance)} OMTHB`);
    
    // Configure MetaTxForwarder
    console.log("\n4️⃣ Configuring MetaTxForwarder...");
    const forwarder = await ethers.getContractAt("MetaTxForwarderV2", contracts.metaTxForwarder);
    DOMAIN.verifyingContract = contracts.metaTxForwarder;
    
    const isWhitelisted = await forwarder.whitelistedTargets(contracts.gaslessProject);
    if (!isWhitelisted) {
      await forwarder.setTargetWhitelist(contracts.gaslessProject, true);
      console.log("   ✅ Project whitelisted");
    } else {
      console.log("   ✅ Project already whitelisted");
    }
    
    results.configuration.success = true;
    results.configuration.projectId = projectId;
    
    // ================== PHASE 3: GASLESS APPROVAL FLOW ==================
    console.log("\n🚀 PHASE 3: GASLESS APPROVAL FLOW");
    console.log("=".repeat(60));
    
    // Check initial balances
    console.log("\n💰 Initial gas balances:");
    const initialBalances = {};
    for (const [role, data] of Object.entries({
      Secretary: TEST_ADDRESSES.secretary,
      Committee: TEST_ADDRESSES.committee,
      Finance: TEST_ADDRESSES.finance,
      Director: TEST_ADDRESSES.director,
      Relayer: TEST_ADDRESSES.relayer
    })) {
      const balance = await ethers.provider.getBalance(data.address);
      initialBalances[role] = balance;
      console.log(`   ${role}: ${ethers.formatEther(balance)} OM`);
    }
    
    // Create request
    console.log("\n1️⃣ Creating multi-recipient request (GASLESS)...");
    const amounts = [
      ethers.parseEther("1000"),
      ethers.parseEther("1500"),
      ethers.parseEther("2000")
    ];
    
    const createData = project.interface.encodeFunctionData("createRequestMultiple", [
      TEST_ADDRESSES.recipients,
      amounts,
      "Full loop gasless test",
      "receipt-full-test"
    ]);
    
    const secretaryNonce = await forwarder.getNonce(TEST_ADDRESSES.secretary.address);
    const createRequest = {
      from: TEST_ADDRESSES.secretary.address,
      to: contracts.gaslessProject,
      value: 0,
      gas: 400000,
      nonce: secretaryNonce,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      chainId: 1246,
      data: createData
    };
    
    const secretaryWallet = new ethers.Wallet(TEST_ADDRESSES.secretary.privateKey);
    const createSignature = await secretaryWallet.signTypedData(DOMAIN, FORWARD_REQUEST_TYPE, createRequest);
    
    console.log("   📝 Secretary signed request");
    const createTx = await forwarder.connect(relayerWallet).execute(createRequest, createSignature);
    await createTx.wait();
    console.log("   ✅ Request created via meta-transaction");
    
    const requestId = 0;
    const request = await project.getRequest(requestId);
    console.log(`   📋 Request total: ${ethers.formatEther(request.totalAmount)} OMTHB`);
    
    // Approval flow
    const approvalSteps = [
      { step: 2, role: "Secretary", user: TEST_ADDRESSES.secretary, function: "approveBySecretary" },
      { step: 3, role: "Committee", user: TEST_ADDRESSES.committee, function: "approveByCommittee" },
      { step: 4, role: "Finance", user: TEST_ADDRESSES.finance, function: "approveByFinance" },
      { step: 5, role: "Director", user: TEST_ADDRESSES.director, function: "approveByDirector" }
    ];
    
    for (const approval of approvalSteps) {
      console.log(`\n${approval.step}️⃣ ${approval.role} approval (GASLESS)...`);
      
      const approvalData = project.interface.encodeFunctionData(approval.function, [requestId]);
      const userNonce = await forwarder.getNonce(approval.user.address);
      
      const approvalRequest = {
        from: approval.user.address,
        to: contracts.gaslessProject,
        value: 0,
        gas: 200000,
        nonce: userNonce,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        chainId: 1246,
        data: approvalData
      };
      
      const userWallet = new ethers.Wallet(approval.user.privateKey);
      const approvalSignature = await userWallet.signTypedData(DOMAIN, FORWARD_REQUEST_TYPE, approvalRequest);
      
      console.log(`   📝 ${approval.role} signed`);
      const approvalTx = await forwarder.connect(relayerWallet).execute(approvalRequest, approvalSignature);
      await approvalTx.wait();
      console.log(`   ✅ Approved via meta-transaction`);
    }
    
    results.gaslessApproval.success = true;
    results.gaslessApproval.requestId = requestId;
    
    // ================== PHASE 4: DISTRIBUTION ==================
    console.log("\n💸 PHASE 4: DISTRIBUTION");
    console.log("=".repeat(60));
    
    console.log("\n1️⃣ Distributing tokens...");
    const distributeTx = await project.connect(deployer).distribute(requestId);
    const distributeReceipt = await distributeTx.wait();
    console.log(`   ✅ Distributed! Tx: ${distributeReceipt.hash}`);
    
    // Verify distribution
    console.log("\n2️⃣ Verifying distribution...");
    let totalDistributed = 0n;
    for (let i = 0; i < TEST_ADDRESSES.recipients.length; i++) {
      const balance = await mockOMTHB.balanceOf(TEST_ADDRESSES.recipients[i]);
      console.log(`   Recipient ${i + 1}: ${ethers.formatEther(balance)} OMTHB`);
      totalDistributed += balance;
    }
    console.log(`   Total distributed: ${ethers.formatEther(totalDistributed)} OMTHB`);
    
    results.distribution.success = true;
    results.distribution.txHash = distributeReceipt.hash;
    results.distribution.totalAmount = ethers.formatEther(totalDistributed);
    
    // ================== FINAL VERIFICATION ==================
    console.log("\n✅ FINAL VERIFICATION");
    console.log("=".repeat(60));
    
    // Check final balances
    console.log("\n💰 Final gas balances (should be unchanged for users):");
    let gaslessSuccess = true;
    for (const [role, data] of Object.entries({
      Secretary: TEST_ADDRESSES.secretary,
      Committee: TEST_ADDRESSES.committee,
      Finance: TEST_ADDRESSES.finance,
      Director: TEST_ADDRESSES.director
    })) {
      const finalBalance = await ethers.provider.getBalance(data.address);
      const unchanged = finalBalance === initialBalances[role];
      console.log(`   ${role}: ${ethers.formatEther(finalBalance)} OM ${unchanged ? "✅ (unchanged)" : "❌ (changed)"}`);
      if (!unchanged) gaslessSuccess = false;
    }
    
    const relayerFinalBalance = await ethers.provider.getBalance(TEST_ADDRESSES.relayer.address);
    const relayerSpent = initialBalances.Relayer - relayerFinalBalance;
    console.log(`\n   Relayer: ${ethers.formatEther(relayerFinalBalance)} OM`);
    console.log(`   Relayer spent: ${ethers.formatEther(relayerSpent)} OM for all transactions`);
    
    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("🎯 FULL LOOP TEST SUMMARY");
    console.log("=".repeat(60));
    
    console.log("\n📊 Test Results:");
    console.log(`   1. Deployment: ${results.deployment.success ? "✅" : "❌"}`);
    console.log(`   2. Configuration: ${results.configuration.success ? "✅" : "❌"}`);
    console.log(`   3. Gasless Approval: ${results.gaslessApproval.success ? "✅" : "❌"}`);
    console.log(`   4. Distribution: ${results.distribution.success ? "✅" : "❌"}`);
    console.log(`   5. Users didn't spend gas: ${gaslessSuccess ? "✅" : "❌"}`);
    
    const allSuccess = results.deployment.success && 
                      results.configuration.success && 
                      results.gaslessApproval.success && 
                      results.distribution.success && 
                      gaslessSuccess;
    
    console.log(`\n🏆 Overall Result: ${allSuccess ? "✅ ALL TESTS PASSED!" : "❌ SOME TESTS FAILED"}`);
    
    // Save test results
    const testResults = {
      timestamp: new Date().toISOString(),
      network: "omchain",
      chainId: 1246,
      contracts,
      results,
      gaslessVerified: gaslessSuccess,
      projectId: results.configuration.projectId,
      distributionTx: results.distribution.txHash
    };
    
    const resultsPath = path.join(__dirname, "..", "deployments", "gasless-full-test-results.json");
    fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2));
    console.log(`\n📝 Test results saved to: ${resultsPath}`);
    
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error);
    throw error;
  }
}

main()
  .then(() => {
    console.log("\n✅ Full loop gasless test completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Full loop gasless test failed!");
    console.error(error);
    process.exit(1);
  });
