const { run } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Delay function to avoid rate limiting
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function verifyContract(address, constructorArguments = [], contractPath = "") {
  try {
    console.log(`\nVerifying contract at ${address}...`);
    
    const verificationParams = {
      address: address,
      constructorArguments: constructorArguments
    };
    
    if (contractPath) {
      verificationParams.contract = contractPath;
    }
    
    await run("verify:verify", verificationParams);
    
    console.log(`✅ Contract verified successfully!`);
    return true;
  } catch (error) {
    if (error.message.includes("already verified")) {
      console.log(`✅ Contract already verified`);
      return true;
    }
    console.error(`❌ Verification failed:`, error.message);
    return false;
  }
}

async function main() {
  console.log("==========================================");
  console.log("OM Platform Contract Verification");
  console.log("==========================================");
  console.log("Network: OM Platform Mainnet (Chain ID: 1246)");
  console.log("Explorer: https://omscan.omplatform.com");
  console.log("==========================================\n");

  // Load deployment data
  const deploymentPath = path.join(__dirname, "..", "deployments", "om-platform-latest.json");
  
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ Deployment data not found!");
    console.error("Please run the deployment script first: npx hardhat run scripts/deploy-om-platform.js --network omchain");
    process.exit(1);
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  
  console.log("Loaded deployment from:", deployment.timestamp);
  console.log("Deployer:", deployment.deployer);
  console.log("Admin:", deployment.adminWallet);
  console.log("\nStarting verification process...");

  const verificationResults = {
    timestamp: new Date().toISOString(),
    network: "omchain",
    chainId: 1246,
    results: {}
  };

  try {
    // 1. Verify OMTHBToken Implementation
    console.log("\n1. Verifying OMTHBToken Implementation...");
    if (deployment.contracts.OMTHBToken) {
      const implementationAddress = deployment.contracts.OMTHBToken.implementation;
      const success = await verifyContract(
        implementationAddress,
        [],
        "contracts/upgradeable/OMTHBToken.sol:OMTHBToken"
      );
      verificationResults.results.OMTHBToken_Implementation = {
        address: implementationAddress,
        verified: success
      };
      
      await delay(5000); // Wait 5 seconds between verifications
      
      // Note: Proxy verification is automatic on most explorers when implementation is verified
      console.log("\nNote: OMTHBToken proxy verification should be automatic once implementation is verified.");
      console.log("Proxy address:", deployment.contracts.OMTHBToken.proxy);
    }

    // 2. Verify MetaTxForwarder
    console.log("\n2. Verifying MetaTxForwarder...");
    if (deployment.contracts.MetaTxForwarder) {
      const success = await verifyContract(
        deployment.contracts.MetaTxForwarder.address,
        [], // No constructor arguments
        "contracts/MetaTxForwarder.sol:MetaTxForwarder"
      );
      verificationResults.results.MetaTxForwarder = {
        address: deployment.contracts.MetaTxForwarder.address,
        verified: success
      };
      
      await delay(5000);
    }

    // 3. Verify AuditAnchor
    console.log("\n3. Verifying AuditAnchor...");
    if (deployment.contracts.AuditAnchor) {
      const success = await verifyContract(
        deployment.contracts.AuditAnchor.address,
        [deployment.adminWallet], // Constructor takes admin address
        "contracts/AuditAnchor.sol:AuditAnchor"
      );
      verificationResults.results.AuditAnchor = {
        address: deployment.contracts.AuditAnchor.address,
        verified: success
      };
      
      await delay(5000);
    }

    // 4. Verify ProjectReimbursement Implementation
    console.log("\n4. Verifying ProjectReimbursement Implementation...");
    if (deployment.contracts.ProjectReimbursement) {
      const success = await verifyContract(
        deployment.contracts.ProjectReimbursement.address,
        [], // No constructor arguments
        "contracts/ProjectReimbursement.sol:ProjectReimbursement"
      );
      verificationResults.results.ProjectReimbursement = {
        address: deployment.contracts.ProjectReimbursement.address,
        verified: success
      };
      
      await delay(5000);
    }

    // 5. Verify ProjectFactory
    console.log("\n5. Verifying ProjectFactory...");
    if (deployment.contracts.ProjectFactory) {
      const constructorArgs = [
        deployment.contracts.ProjectReimbursement.address,
        deployment.contracts.OMTHBToken.proxy,
        deployment.contracts.MetaTxForwarder.address,
        deployment.adminWallet
      ];
      
      const success = await verifyContract(
        deployment.contracts.ProjectFactory.address,
        constructorArgs,
        "contracts/ProjectFactory.sol:ProjectFactory"
      );
      verificationResults.results.ProjectFactory = {
        address: deployment.contracts.ProjectFactory.address,
        verified: success,
        constructorArgs: constructorArgs
      };
    }

    // Save verification results
    const verificationsDir = path.join(__dirname, "..", "deployments", "verifications");
    if (!fs.existsSync(verificationsDir)) {
      fs.mkdirSync(verificationsDir, { recursive: true });
    }
    
    const filename = `om-platform-verification-${Date.now()}.json`;
    const filepath = path.join(verificationsDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(verificationResults, null, 2));
    
    // Also save as latest
    const latestPath = path.join(verificationsDir, "om-platform-verification-latest.json");
    fs.writeFileSync(latestPath, JSON.stringify(verificationResults, null, 2));

    console.log("\n==========================================");
    console.log("Verification Summary");
    console.log("==========================================");
    
    let allVerified = true;
    for (const [contract, result] of Object.entries(verificationResults.results)) {
      console.log(`${contract}: ${result.verified ? "✅ Verified" : "❌ Failed"}`);
      if (!result.verified) allVerified = false;
    }
    
    console.log("\nVerification results saved to:");
    console.log(" -", filepath);
    console.log(" -", latestPath);
    console.log("==========================================\n");

    if (allVerified) {
      console.log("✅ All contracts verified successfully!");
      console.log("\nView verified contracts on OMScan:");
      console.log(`- OMTHBToken: https://omscan.omplatform.com/address/${deployment.contracts.OMTHBToken.proxy}`);
      console.log(`- MetaTxForwarder: https://omscan.omplatform.com/address/${deployment.contracts.MetaTxForwarder.address}`);
      console.log(`- AuditAnchor: https://omscan.omplatform.com/address/${deployment.contracts.AuditAnchor.address}`);
      console.log(`- ProjectReimbursement: https://omscan.omplatform.com/address/${deployment.contracts.ProjectReimbursement.address}`);
      console.log(`- ProjectFactory: https://omscan.omplatform.com/address/${deployment.contracts.ProjectFactory.address}`);
    } else {
      console.log("⚠️  Some contracts failed verification. Please check the logs above.");
      console.log("\nTroubleshooting tips:");
      console.log("1. Ensure your OMCHAIN_API_KEY is set in .env file");
      console.log("2. Wait a few minutes after deployment before verifying");
      console.log("3. Check if contracts are already verified on OMScan");
      console.log("4. Try manual verification on https://omscan.omplatform.com/verifyContract");
    }

  } catch (error) {
    console.error("\n❌ Verification process failed:", error);
    
    // Save partial results if any
    if (Object.keys(verificationResults.results).length > 0) {
      const errorFilepath = path.join(__dirname, "..", "deployments", "verifications", `om-platform-verification-error-${Date.now()}.json`);
      verificationResults.error = error.message;
      fs.writeFileSync(errorFilepath, JSON.stringify(verificationResults, null, 2));
      console.log("\nPartial verification data saved to:", errorFilepath);
    }
    
    process.exit(1);
  }
}

// Alternative manual verification function
async function generateManualVerificationData() {
  console.log("\n==========================================");
  console.log("Manual Verification Data");
  console.log("==========================================");
  
  const deploymentPath = path.join(__dirname, "..", "deployments", "om-platform-latest.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  
  console.log("\nUse this data for manual verification on OMScan:\n");
  
  // Generate flattened source code commands
  console.log("1. Generate flattened source files:");
  console.log("   npx hardhat flatten contracts/upgradeable/OMTHBToken.sol > flattened/OMTHBToken.sol");
  console.log("   npx hardhat flatten contracts/MetaTxForwarder.sol > flattened/MetaTxForwarder.sol");
  console.log("   npx hardhat flatten contracts/AuditAnchor.sol > flattened/AuditAnchor.sol");
  console.log("   npx hardhat flatten contracts/ProjectReimbursement.sol > flattened/ProjectReimbursement.sol");
  console.log("   npx hardhat flatten contracts/ProjectFactory.sol > flattened/ProjectFactory.sol");
  
  console.log("\n2. Compiler settings:");
  console.log("   - Compiler version: 0.8.20");
  console.log("   - Optimization: Enabled");
  console.log("   - Runs: 200");
  console.log("   - EVM Version: paris");
  console.log("   - Via IR: true");
  
  console.log("\n3. Constructor arguments:");
  console.log("   - OMTHBToken: No constructor (upgradeable)");
  console.log("   - MetaTxForwarder: No constructor arguments");
  console.log("   - AuditAnchor: No constructor arguments");
  console.log("   - ProjectReimbursement: No constructor arguments");
  console.log("   - ProjectFactory:");
  console.log(`     * _projectImplementation: ${deployment.contracts.ProjectReimbursement.address}`);
  console.log(`     * _omthbToken: ${deployment.contracts.OMTHBToken.proxy}`);
  console.log(`     * _metaTxForwarder: ${deployment.contracts.MetaTxForwarder.address}`);
  console.log(`     * _admin: ${deployment.adminWallet}`);
  
  console.log("\n4. Contract addresses:");
  Object.entries(deployment.contracts).forEach(([name, contract]) => {
    if (contract.proxy) {
      console.log(`   - ${name} (Proxy): ${contract.proxy}`);
      console.log(`   - ${name} (Implementation): ${contract.implementation}`);
    } else {
      console.log(`   - ${name}: ${contract.address}`);
    }
  });
}

// Check if manual verification is requested
if (process.argv.includes("--manual")) {
  generateManualVerificationData();
} else {
  // Execute verification
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}