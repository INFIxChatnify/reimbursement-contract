const { run } = require("hardhat");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Configuration for retry mechanism
const RETRY_CONFIG = {
  maxAttempts: 5,
  initialDelay: 10000, // 10 seconds
  maxDelay: 60000,     // 60 seconds
  backoffMultiplier: 2
};

// Contract details
const CONTRACTS_TO_VERIFY = [
  {
    name: "ProjectFactory",
    address: "0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1",
    constructorArgs: [
      "0x1100ED4175BB828958396a708278D46146e1748b", // implementation
      "0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161", // token
      "0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347", // forwarder
      "0xeB42B3bF49091377627610A691EA1Eaf32bc6254"  // admin
    ]
  },
  {
    name: "ProjectReimbursementMultiRecipient",
    address: "0x1100ED4175BB828958396a708278D46146e1748b",
    constructorArgs: []
  }
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyWithRetry(contract, attempt = 1) {
  console.log(`\nAttempt ${attempt}/${RETRY_CONFIG.maxAttempts} for ${contract.name}...`);
  
  try {
    await run("verify:verify", {
      address: contract.address,
      constructorArguments: contract.constructorArgs
    });
    
    console.log(`✅ ${contract.name} verified successfully!`);
    return { success: true, attempts: attempt };
  } catch (error) {
    console.log(`❌ Attempt ${attempt} failed: ${error.message}`);
    
    if (error.message.includes("Already Verified")) {
      console.log(`✅ ${contract.name} is already verified!`);
      return { success: true, attempts: attempt, alreadyVerified: true };
    }
    
    if (attempt >= RETRY_CONFIG.maxAttempts) {
      console.log(`❌ Max attempts reached for ${contract.name}`);
      return { success: false, attempts: attempt, error: error.message };
    }
    
    // Calculate delay with exponential backoff
    const delay = Math.min(
      RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1),
      RETRY_CONFIG.maxDelay
    );
    
    console.log(`⏳ Waiting ${delay / 1000} seconds before retry...`);
    await sleep(delay);
    
    return verifyWithRetry(contract, attempt + 1);
  }
}

async function checkVerificationStatus(address) {
  try {
    const response = await axios.get(`https://omscan.omplatform.com/api`, {
      params: {
        module: 'contract',
        action: 'getabi',
        address: address
      },
      timeout: 10000
    });
    
    if (response.data && response.data.status === '1') {
      return true; // Contract is verified
    }
    return false;
  } catch (error) {
    console.log(`⚠️  Could not check verification status: ${error.message}`);
    return null;
  }
}

async function generateFallbackScript(contract, error) {
  const scriptContent = `#!/bin/bash
# Fallback verification script for ${contract.name}
# Generated due to: ${error}

echo "Manual verification script for ${contract.name}"
echo "Contract Address: ${contract.address}"
echo ""

# Using cast from Foundry to verify
cast verify-contract \\
  ${contract.address} \\
  contracts/${contract.name}.sol:${contract.name} \\
  --chain 1246 \\
  --etherscan-api-key \${OMCHAIN_API_KEY} \\
  --compiler-version v0.8.20+commit.a1b79de6 \\
  --num-of-optimizations 200 \\
  ${contract.constructorArgs.length > 0 ? `--constructor-args ${contract.constructorArgs.map(arg => `"${arg}"`).join(' ')} \\` : '\\'}
  --watch

# Alternative: Using hardhat with custom parameters
npx hardhat verify \\
  --network omchain \\
  ${contract.address} \\
  ${contract.constructorArgs.join(' ')}
`;

  const outputPath = path.join(__dirname, "..", "verification-fallback", `verify-${contract.name.toLowerCase()}.sh`);
  const dir = path.dirname(outputPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, scriptContent);
  fs.chmodSync(outputPath, '755');
  
  return outputPath;
}

async function main() {
  console.log("=".repeat(70));
  console.log("CONTRACT VERIFICATION WITH RETRY MECHANISM");
  console.log("=".repeat(70));
  console.log(`Network: OM Platform (Chain ID: 1246)`);
  console.log(`Max attempts per contract: ${RETRY_CONFIG.maxAttempts}`);
  console.log(`Retry delay: ${RETRY_CONFIG.initialDelay / 1000}s - ${RETRY_CONFIG.maxDelay / 1000}s (exponential backoff)`);
  
  const results = [];
  
  for (const contract of CONTRACTS_TO_VERIFY) {
    console.log("\n" + "-".repeat(70));
    console.log(`Verifying ${contract.name}`);
    console.log(`Address: ${contract.address}`);
    console.log("-".repeat(70));
    
    // Check current verification status
    console.log("Checking current verification status...");
    const isVerified = await checkVerificationStatus(contract.address);
    
    if (isVerified === true) {
      console.log(`✅ ${contract.name} is already verified!`);
      results.push({
        ...contract,
        result: { success: true, alreadyVerified: true, attempts: 0 }
      });
      continue;
    }
    
    // Attempt verification with retry
    const result = await verifyWithRetry(contract);
    results.push({ ...contract, result });
    
    // Generate fallback script if verification failed
    if (!result.success) {
      const scriptPath = await generateFallbackScript(contract, result.error);
      console.log(`\n📝 Fallback script generated: ${scriptPath}`);
    }
    
    // Add delay between contracts
    if (CONTRACTS_TO_VERIFY.indexOf(contract) < CONTRACTS_TO_VERIFY.length - 1) {
      console.log("\n⏳ Waiting 5 seconds before next contract...");
      await sleep(5000);
    }
  }
  
  // Generate summary report
  console.log("\n" + "=".repeat(70));
  console.log("VERIFICATION SUMMARY");
  console.log("=".repeat(70));
  
  const report = {
    timestamp: new Date().toISOString(),
    network: "omchain",
    results: results.map(r => ({
      name: r.name,
      address: r.address,
      success: r.result.success,
      attempts: r.result.attempts,
      alreadyVerified: r.result.alreadyVerified || false,
      error: r.result.error
    }))
  };
  
  // Save report
  const reportPath = path.join(__dirname, "..", "verification-reports", `report-${Date.now()}.json`);
  const reportDir = path.dirname(reportPath);
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Print summary
  let successCount = 0;
  let failureCount = 0;
  
  for (const r of results) {
    const status = r.result.success ? "✅ SUCCESS" : "❌ FAILED";
    const details = r.result.alreadyVerified ? "(Already Verified)" : `(${r.result.attempts} attempts)`;
    console.log(`${r.name}: ${status} ${details}`);
    
    if (r.result.success) successCount++;
    else failureCount++;
  }
  
  console.log("\n" + "-".repeat(70));
  console.log(`Total: ${successCount} succeeded, ${failureCount} failed`);
  console.log(`Report saved to: ${reportPath}`);
  
  if (failureCount > 0) {
    console.log("\n⚠️  Some contracts failed verification.");
    console.log("Check the verification-fallback/ directory for manual verification scripts.");
  }
  
  // Exit with appropriate code
  process.exit(failureCount > 0 ? 1 : 0);
}

// Run with error handling
main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});