const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Contracts to verify
const CONTRACTS_TO_VERIFY = [
  {
    name: "ProjectReimbursementOptimized",
    address: "0x2E363b97d9da9cA243BcC782d7DdffC18E6F54cC",
    contract: "contracts/ProjectReimbursementOptimized.sol:ProjectReimbursementOptimized",
    constructorArguments: []
  },
  {
    name: "OMTHBToken Implementation",
    address: "0xC051053E9C6Cb7BccEc4F22F801B5106EA476D6d",
    contract: "contracts/upgradeable/OMTHBToken.sol:OMTHBToken",
    constructorArguments: []
  },
  {
    name: "OMTHBToken Proxy",
    address: "0x05db2AE2eAb7A47395DB8cDbf5f3E84A78989091",
    contract: undefined, // Proxy contracts are verified differently
    constructorArguments: undefined,
    isProxy: true
  }
];

// Helper function to delay execution
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Verify a single contract
async function verifyContract(contractInfo) {
  try {
    console.log(`\n🔍 Verifying ${contractInfo.name} at ${contractInfo.address}...`);
    
    if (contractInfo.isProxy) {
      console.log("   ℹ️  This is a proxy contract - verification may need to be done manually on OMScan");
      console.log("   📝 The implementation contract should be verified separately");
      return { success: true, message: "Proxy - manual verification needed" };
    }
    
    const verifyArgs = {
      address: contractInfo.address,
      constructorArguments: contractInfo.constructorArguments
    };
    
    if (contractInfo.contract) {
      verifyArgs.contract = contractInfo.contract;
    }
    
    await hre.run("verify:verify", verifyArgs);
    
    console.log(`✅ ${contractInfo.name} verified successfully!`);
    return { success: true, message: "Verified successfully" };
  } catch (error) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log(`✅ ${contractInfo.name} already verified`);
      return { success: true, message: "Already verified" };
    }
    console.error(`❌ ${contractInfo.name} verification failed: ${error.message}`);
    return { success: false, message: error.message };
  }
}

// Generate manual verification instructions
function generateManualInstructions(contractInfo) {
  const instructions = `
=== Manual Verification Instructions for ${contractInfo.name} ===

1. Go to: https://omscan.omplatform.com/verifyContract

2. Enter the following information:
   - Contract Address: ${contractInfo.address}
   - Compiler Type: Solidity (Single file)
   - Compiler Version: v0.8.20+commit.a1b79de6
   - Open Source License Type: MIT

3. Optimization:
   - Optimization: Yes
   - Runs: 1
   - EVM Version: paris

4. For source code:
   - You'll need to flatten the contract first
   - Run: npx hardhat flatten ${contractInfo.contract?.split(':')[0] || 'contracts/...'} > flattened.sol
   - Copy the flattened code and paste it

5. Constructor Arguments:
   ${contractInfo.constructorArguments?.length > 0 ? 
     'Encode the constructor arguments using: ' + JSON.stringify(contractInfo.constructorArguments) :
     'No constructor arguments needed'}

6. Click "Verify and Publish"

===============================================
`;
  return instructions;
}

async function main() {
  console.log("🚀 Starting manual contract verification process...");
  console.log("=" * 60);
  
  const results = [];
  
  for (const contract of CONTRACTS_TO_VERIFY) {
    const result = await verifyContract(contract);
    results.push({ ...contract, ...result });
    
    if (!result.success && !contract.isProxy) {
      console.log(generateManualInstructions(contract));
    }
    
    await delay(5000); // Wait between verifications
  }
  
  console.log("\n" + "=" * 60);
  console.log("📊 VERIFICATION SUMMARY");
  console.log("=" * 60);
  
  results.forEach(result => {
    const status = result.success ? "✅" : "❌";
    console.log(`${status} ${result.name}: ${result.message}`);
  });
  
  console.log("\n📝 Manual Verification Links:");
  CONTRACTS_TO_VERIFY.forEach(contract => {
    console.log(`   ${contract.name}: https://omscan.omplatform.com/address/${contract.address}#code`);
  });
  
  console.log("\n💡 Tips for manual verification:");
  console.log("   1. Make sure to select the exact compiler version: v0.8.20");
  console.log("   2. Enable optimization with runs = 1");
  console.log("   3. Use MIT license");
  console.log("   4. For library contracts, you may need to link libraries manually");
  
  // Create flattened files for manual verification
  console.log("\n📄 Creating flattened contract files...");
  
  try {
    // Flatten ProjectReimbursementOptimized
    console.log("   Flattening ProjectReimbursementOptimized...");
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    await execPromise('npx hardhat flatten contracts/ProjectReimbursementOptimized.sol > manual-verification/ProjectReimbursementOptimized-flattened.sol');
    console.log("   ✅ Created: manual-verification/ProjectReimbursementOptimized-flattened.sol");
    
    // Flatten OMTHBToken
    await execPromise('npx hardhat flatten contracts/upgradeable/OMTHBToken.sol > manual-verification/OMTHBToken-flattened.sol');
    console.log("   ✅ Created: manual-verification/OMTHBToken-flattened.sol");
    
  } catch (error) {
    console.log("   ⚠️  Could not create flattened files automatically");
    console.log("   Run these commands manually:");
    console.log("   - npx hardhat flatten contracts/ProjectReimbursementOptimized.sol > ProjectReimbursementOptimized-flattened.sol");
    console.log("   - npx hardhat flatten contracts/upgradeable/OMTHBToken.sol > OMTHBToken-flattened.sol");
  }
  
  console.log("\n" + "=" * 60);
}

// Execute verification
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });