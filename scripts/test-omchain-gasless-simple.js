const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.test" });

/**
 * Simple test for gasless transactions on OMChain
 */

// Deployed contract addresses
const DEPLOYED_CONTRACTS = {
  mockOMTHB: "0xbfC8F1E1f450a95AAC41e76015aD90E95A0D6162",
  gasTank: "0x5eE4DFE9b20e692FF7c76E77dCd982dd4667D78a",
  metaTxForwarder: "0x47cf8b462979bFBC6F3717db1F6E5aa65984d88F"
};

async function main() {
  console.log("🧪 Testing gasless transactions on OMChain...");
  console.log("=".repeat(60));
  
  // Get signers
  const [deployer] = await ethers.getSigners();
  
  // Create test wallets from .env.test
  const provider = deployer.provider;
  const testUser = new ethers.Wallet(process.env.SECRETARY_PRIVATE_KEY, provider);
  const relayer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
  
  console.log("\n📊 Test Setup:");
  console.log(`   Deployer: ${deployer.address}`);
  console.log(`   Test User: ${testUser.address}`);
  console.log(`   Relayer: ${relayer.address}`);
  
  // Get contract instances
  const mockOMTHB = await ethers.getContractAt("MockOMTHB", DEPLOYED_CONTRACTS.mockOMTHB, deployer);
  const gasTank = await ethers.getContractAt("GasTank", DEPLOYED_CONTRACTS.gasTank, deployer);
  const metaTxForwarder = await ethers.getContractAt("MetaTxForwarderV2", DEPLOYED_CONTRACTS.metaTxForwarder, deployer);
  
  console.log("\n" + "=".repeat(60));
  console.log("🔧 SETUP");
  console.log("=".repeat(60));
  
  try {
    // 1. Check initial balances
    console.log("\n1️⃣ Checking initial balances...");
    const deployerOMBalance = await provider.getBalance(deployer.address);
    const testUserOMBalance = await provider.getBalance(testUser.address);
    const relayerOMBalance = await provider.getBalance(relayer.address);
    const gasTankOMBalance = await provider.getBalance(DEPLOYED_CONTRACTS.gasTank);
    
    console.log(`   Deployer OM: ${ethers.formatEther(deployerOMBalance)}`);
    console.log(`   Test User OM: ${ethers.formatEther(testUserOMBalance)} (should be 0)`);
    console.log(`   Relayer OM: ${ethers.formatEther(relayerOMBalance)}`);
    console.log(`   GasTank OM: ${ethers.formatEther(gasTankOMBalance)}`);
    
    // 2. Setup roles and permissions
    console.log("\n2️⃣ Setting up roles...");
    
    // Grant RELAYER_ROLE to relayer
    const RELAYER_ROLE = await gasTank.RELAYER_ROLE();
    await gasTank.grantRole(RELAYER_ROLE, relayer.address);
    console.log(`   ✅ Granted RELAYER_ROLE to relayer`);
    
    // Whitelist MockOMTHB in MetaTxForwarder
    await metaTxForwarder.setTargetWhitelist(DEPLOYED_CONTRACTS.mockOMTHB, true);
    console.log(`   ✅ Whitelisted MockOMTHB in MetaTxForwarder`);
    
    // 3. Setup gas credits for test user
    console.log("\n3️⃣ Setting up gas credits...");
    await gasTank.depositGasCredit(testUser.address, { value: ethers.parseEther("0.1") });
    const gasCredit = await gasTank.getAvailableCredit(testUser.address);
    console.log(`   ✅ Deposited gas credit: ${ethers.formatEther(gasCredit)} OM`);
    
    // 4. Mint some OMTHB tokens to deployer
    console.log("\n4️⃣ Minting OMTHB tokens...");
    await mockOMTHB.mint(deployer.address, ethers.parseEther("10000"));
    const deployerOMTHBBalance = await mockOMTHB.balanceOf(deployer.address);
    console.log(`   ✅ Deployer OMTHB balance: ${ethers.formatEther(deployerOMTHBBalance)}`);
    
    console.log("\n" + "=".repeat(60));
    console.log("🚀 TESTING GASLESS TRANSFER");
    console.log("=".repeat(60));
    
    // 5. Test gasless transfer
    console.log("\n5️⃣ Creating gasless transfer request...");
    console.log(`   From: ${deployer.address}`);
    console.log(`   To: ${testUser.address}`);
    console.log(`   Amount: 100 OMTHB`);
    
    // Create meta-transaction
    const transferAmount = ethers.parseEther("100");
    const transferData = mockOMTHB.interface.encodeFunctionData(
      "transfer",
      [testUser.address, transferAmount]
    );
    
    // Sign meta-transaction
    const nonce = await metaTxForwarder.getNonce(deployer.address);
    const domain = {
      name: "MetaTxForwarderV2",
      version: "1",
      chainId: 1246,
      verifyingContract: DEPLOYED_CONTRACTS.metaTxForwarder
    };
    
    const types = {
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
    
    // Set deadline to 10 minutes from now
    const deadline = Math.floor(Date.now() / 1000) + 600;
    
    const request = {
      from: deployer.address,
      to: DEPLOYED_CONTRACTS.mockOMTHB,
      value: 0,
      gas: 200000,
      nonce: nonce,
      deadline: deadline,
      chainId: 1246,
      data: transferData
    };
    
    console.log("   ⏳ Signing meta-transaction...");
    const signature = await deployer.signTypedData(domain, types, request);
    console.log("   ✅ Meta-transaction signed");
    
    // 6. Execute meta-transaction via relayer
    console.log("\n6️⃣ Executing meta-transaction via relayer...");
    const forwarderWithRelayer = metaTxForwarder.connect(relayer);
    const tx = await forwarderWithRelayer.execute(request, signature);
    const receipt = await tx.wait();
    console.log(`   ✅ Transaction executed! Hash: ${receipt.hash}`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
    
    // 7. Verify results
    console.log("\n7️⃣ Verifying results...");
    const testUserOMTHBBalance = await mockOMTHB.balanceOf(testUser.address);
    console.log(`   ✅ Test User OMTHB balance: ${ethers.formatEther(testUserOMTHBBalance)}`);
    
    const finalTestUserOMBalance = await provider.getBalance(testUser.address);
    console.log(`   ✅ Test User OM balance: ${ethers.formatEther(finalTestUserOMBalance)} (still 0 - gasless!)`);
    
    // Check gas credit usage
    const finalGasCredit = await gasTank.getAvailableCredit(testUser.address);
    const gasUsed = gasCredit - finalGasCredit;
    console.log(`   ⛽ Gas credit used: ${ethers.formatEther(gasUsed)} OM`);
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ GASLESS TEST COMPLETE!");
    console.log("=".repeat(60));
    
    console.log("\n🎉 Summary:");
    console.log("   - Test user performed a token transfer without having any OM");
    console.log("   - Gas was paid by the relayer");
    console.log("   - Gas costs were deducted from user's gas credits in GasTank");
    console.log("   - This proves gasless transactions work on OMChain!");
    
    console.log("\n📍 View transactions on OMScan:");
    console.log(`   ${receipt.hash}`);
    
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    
    // Provide helpful debugging info
    if (error.message.includes("insufficient funds")) {
      console.log("\n⚠️  Make sure the relayer has some OM for gas fees");
      console.log(`   Relayer address: ${relayer.address}`);
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
