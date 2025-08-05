const { ethers } = require("hardhat");

/**
 * Simple test to verify contracts are working on OMChain
 */

const DEPLOYED_CONTRACTS = {
  mockOMTHB: "0xbfC8F1E1f450a95AAC41e76015aD90E95A0D6162",
  gasTank: "0x5eE4DFE9b20e692FF7c76E77dCd982dd4667D78a",
  metaTxForwarder: "0x47cf8b462979bFBC6F3717db1F6E5aa65984d88F"
};

async function main() {
  console.log("🧪 Testing simple transfer on OMChain...");
  console.log("=".repeat(60));
  
  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log(`\n📊 Deployer: ${deployer.address}`);
  
  // Get MockOMTHB contract
  const mockOMTHB = await ethers.getContractAt("MockOMTHB", DEPLOYED_CONTRACTS.mockOMTHB, deployer);
  
  try {
    // 1. Check current balance
    console.log("\n1️⃣ Checking OMTHB balance...");
    const balance = await mockOMTHB.balanceOf(deployer.address);
    console.log(`   Balance: ${ethers.formatEther(balance)} OMTHB`);
    
    // 2. Check total supply
    const totalSupply = await mockOMTHB.totalSupply();
    console.log(`   Total Supply: ${ethers.formatEther(totalSupply)} OMTHB`);
    
    // 3. Test transfer
    console.log("\n2️⃣ Testing transfer...");
    const recipient = "0x8f20a41832e93d81d4443612Df582f0F1007a87f"; // Secretary address
    const amount = ethers.parseEther("100");
    
    console.log(`   Transferring ${ethers.formatEther(amount)} OMTHB to ${recipient}`);
    const tx = await mockOMTHB.transfer(recipient, amount);
    const receipt = await tx.wait();
    console.log(`   ✅ Transfer successful! Hash: ${receipt.hash}`);
    
    // 4. Check balances after transfer
    console.log("\n3️⃣ Checking balances after transfer...");
    const deployerBalance = await mockOMTHB.balanceOf(deployer.address);
    const recipientBalance = await mockOMTHB.balanceOf(recipient);
    console.log(`   Deployer: ${ethers.formatEther(deployerBalance)} OMTHB`);
    console.log(`   Recipient: ${ethers.formatEther(recipientBalance)} OMTHB`);
    
    // 5. Check GasTank
    console.log("\n4️⃣ Checking GasTank...");
    const gasTank = await ethers.getContractAt("GasTank", DEPLOYED_CONTRACTS.gasTank, deployer);
    const gasTankBalance = await ethers.provider.getBalance(DEPLOYED_CONTRACTS.gasTank);
    console.log(`   GasTank balance: ${ethers.formatEther(gasTankBalance)} OM`);
    
    // Check if relayer has role
    const RELAYER_ROLE = await gasTank.RELAYER_ROLE();
    const relayerAddress = "0x5D34C7771879e19F83Ecaf9296B872214E5Fc776";
    const hasRole = await gasTank.hasRole(RELAYER_ROLE, relayerAddress);
    console.log(`   Relayer has RELAYER_ROLE: ${hasRole}`);
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ SIMPLE TEST COMPLETE!");
    console.log("=".repeat(60));
    
    console.log("\n📍 View on OMScan:");
    console.log(`   MockOMTHB: https://omscan.omplatform.com/address/${DEPLOYED_CONTRACTS.mockOMTHB}`);
    console.log(`   Transaction: https://omscan.omplatform.com/tx/${receipt.hash}`);
    
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
