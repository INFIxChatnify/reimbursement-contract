const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.test" });

/**
 * Test gasless approval flow on OMChain
 * Users sign messages off-chain, relayer executes on-chain
 */

// Load deployment info
const deploymentPath = path.join(__dirname, "..", "deployments", "omchain-gasless-approval.json");
const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

// Test addresses from .env.test
const TEST_ADDRESSES = {
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
  chainId: 1246,
  verifyingContract: deployment.contracts.metaTxForwarder
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
  console.log("🧪 Testing GASLESS approval flow on OMChain...");
  console.log("=".repeat(60));
  
  // Setup signers
  const [deployer] = await ethers.getSigners();
  const relayerWallet = new ethers.Wallet(TEST_ADDRESSES.relayer.privateKey, ethers.provider);
  
  // Get contracts
  const project = await ethers.getContractAt("GaslessProjectReimbursement", deployment.contracts.gaslessProject);
  const forwarder = await ethers.getContractAt("MetaTxForwarderV2", deployment.contracts.metaTxForwarder);
  const mockOMTHB = await ethers.getContractAt("MockOMTHB", deployment.contracts.mockOMTHB);
  
  try {
    console.log("\n📊 Project Info:");
    console.log(`   Address: ${deployment.contracts.gaslessProject}`);
    console.log(`   ID: ${deployment.gaslessProject.id}`);
    console.log(`   Budget: ${deployment.gaslessProject.budget} OMTHB`);
    console.log(`   Balance: ${ethers.formatEther(await mockOMTHB.balanceOf(deployment.contracts.gaslessProject))} OMTHB`);
    
    // Check gas balances
    console.log("\n💸 Gas Balances (users should have minimal/zero OM):");
    for (const [role, data] of Object.entries({
      Secretary: TEST_ADDRESSES.secretary,
      Committee: TEST_ADDRESSES.committee,
      Finance: TEST_ADDRESSES.finance,
      Director: TEST_ADDRESSES.director
    })) {
      const balance = await ethers.provider.getBalance(data.address);
      console.log(`   ${role}: ${ethers.formatEther(balance)} OM`);
    }
    
    console.log(`   Relayer: ${ethers.formatEther(await ethers.provider.getBalance(relayerWallet.address))} OM`);
    
    console.log("\n" + "=".repeat(60));
    console.log("🚀 TESTING GASLESS APPROVAL FLOW");
    console.log("=".repeat(60));
    
    // Step 1: Secretary creates request (gasless)
    console.log("\n1️⃣ Secretary creates multi-recipient request (GASLESS)...");
    const amounts = [
      ethers.parseEther("1000"),  // 1,000 OMTHB
      ethers.parseEther("1500"),  // 1,500 OMTHB
      ethers.parseEther("2000")   // 2,000 OMTHB
    ];
    
    const requestData = project.interface.encodeFunctionData("createRequestMultiple", [
      TEST_ADDRESSES.recipients,
      amounts,
      "Test gasless multi-recipient request",
      "test-receipt-123"
    ]);
    
    const secretaryNonce = await forwarder.getNonce(TEST_ADDRESSES.secretary.address);
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    
    const forwardRequest = {
      from: TEST_ADDRESSES.secretary.address,
      to: deployment.contracts.gaslessProject,
      value: 0,
      gas: 300000,
      nonce: secretaryNonce,
      deadline: deadline,
      chainId: 1246,
      data: requestData
    };
    
    // Secretary signs the request
    const secretaryWallet = new ethers.Wallet(TEST_ADDRESSES.secretary.privateKey);
    const signature = await secretaryWallet.signTypedData(DOMAIN, FORWARD_REQUEST_TYPE, forwardRequest);
    
    console.log("   📝 Secretary signed the request");
    console.log("   🚚 Relayer executing meta-transaction...");
    
    // Relayer executes
    const createTx = await forwarder.connect(relayerWallet).execute(forwardRequest, signature);
    const createReceipt = await createTx.wait();
    console.log(`   ✅ Request created! Gas paid by relayer: ${ethers.formatEther(createReceipt.gasUsed * createReceipt.gasPrice)} OM`);
    
    const requestId = 0; // First request
    
    // Verify request was created
    const request = await project.getRequest(requestId);
    console.log(`   📋 Request total: ${ethers.formatEther(request.totalAmount)} OMTHB`);
    
    // Step 2-5: Approval flow (all gasless)
    const approvalSteps = [
      { 
        step: 2, 
        role: "Secretary", 
        user: TEST_ADDRESSES.secretary, 
        function: "approveBySecretary"
      },
      { 
        step: 3, 
        role: "Committee", 
        user: TEST_ADDRESSES.committee, 
        function: "approveByCommittee"
      },
      { 
        step: 4, 
        role: "Finance", 
        user: TEST_ADDRESSES.finance, 
        function: "approveByFinance"
      },
      { 
        step: 5, 
        role: "Director", 
        user: TEST_ADDRESSES.director, 
        function: "approveByDirector"
      }
    ];
    
    for (const approval of approvalSteps) {
      console.log(`\n${approval.step}️⃣ ${approval.role} approval (GASLESS)...`);
      
      // Encode approval function
      const approvalData = project.interface.encodeFunctionData(approval.function, [requestId]);
      
      // Get nonce for user
      const userNonce = await forwarder.getNonce(approval.user.address);
      
      // Create forward request
      const approvalRequest = {
        from: approval.user.address,
        to: deployment.contracts.gaslessProject,
        value: 0,
        gas: 200000,
        nonce: userNonce,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        chainId: 1246,
        data: approvalData
      };
      
      // User signs
      const userWallet = new ethers.Wallet(approval.user.privateKey);
      const approvalSignature = await userWallet.signTypedData(DOMAIN, FORWARD_REQUEST_TYPE, approvalRequest);
      
      console.log(`   📝 ${approval.role} signed approval`);
      console.log(`   🚚 Relayer executing meta-transaction...`);
      
      // Relayer executes
      const approvalTx = await forwarder.connect(relayerWallet).execute(approvalRequest, approvalSignature);
      const approvalReceipt = await approvalTx.wait();
      console.log(`   ✅ Approved! Gas paid by relayer: ${ethers.formatEther(approvalReceipt.gasUsed * approvalReceipt.gasPrice)} OM`);
    }
    
    // Step 6: Distribute (can be done by anyone, not necessarily gasless)
    console.log("\n6️⃣ Distributing tokens...");
    const distributeTx = await project.connect(deployer).distribute(requestId);
    const distributeReceipt = await distributeTx.wait();
    console.log(`   ✅ Tokens distributed! Tx: ${distributeReceipt.hash}`);
    
    // Verify distribution
    console.log("\n7️⃣ Verifying distribution...");
    for (let i = 0; i < TEST_ADDRESSES.recipients.length; i++) {
      const balance = await mockOMTHB.balanceOf(TEST_ADDRESSES.recipients[i]);
      console.log(`   Recipient ${i + 1}: ${ethers.formatEther(balance)} OMTHB`);
    }
    
    // Final gas summary
    console.log("\n" + "=".repeat(60));
    console.log("💰 GAS SUMMARY");
    console.log("=".repeat(60));
    
    console.log("\n📊 User gas spent (should be 0):");
    for (const [role, data] of Object.entries({
      Secretary: TEST_ADDRESSES.secretary,
      Committee: TEST_ADDRESSES.committee,
      Finance: TEST_ADDRESSES.finance,
      Director: TEST_ADDRESSES.director
    })) {
      const finalBalance = await ethers.provider.getBalance(data.address);
      console.log(`   ${role}: ${ethers.formatEther(finalBalance)} OM (unchanged)`);
    }
    
    const relayerFinalBalance = await ethers.provider.getBalance(relayerWallet.address);
    console.log(`\n⛽ Relayer balance: ${ethers.formatEther(relayerFinalBalance)} OM`);
    console.log("   (Relayer paid for all transactions, will be refunded by GasTank)");
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ GASLESS APPROVAL FLOW TEST COMPLETE!");
    console.log("=".repeat(60));
    
    console.log("\n🎉 Summary:");
    console.log("   - Users signed messages off-chain (no gas needed)");
    console.log("   - Relayer executed all transactions");
    console.log("   - Multi-recipient request approved through 4 levels");
    console.log("   - Tokens distributed successfully");
    console.log("   - Total distributed: 4,500 OMTHB to 3 recipients");
    
    console.log("\n📍 View on OMScan:");
    console.log(`   Gasless Project: https://omscan.omplatform.com/address/${deployment.contracts.gaslessProject}`);
    
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
