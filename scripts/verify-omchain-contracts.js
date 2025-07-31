const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Helper function to load deployment addresses
function loadDeploymentAddresses(network) {
  const filename = path.join(__dirname, "../deployments", `${network}-deployment.json`);
  if (!fs.existsSync(filename)) {
    throw new Error(`Deployment file not found: ${filename}`);
  }
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

// Helper function to delay execution
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Verify a single contract
async function verifyContract(address, constructorArguments = [], contract = undefined) {
  try {
    console.log(`\n🔍 Verifying contract at ${address}...`);
    
    const verifyArgs = {
      address,
      constructorArguments
    };
    
    if (contract) {
      verifyArgs.contract = contract;
    }
    
    await hre.run("verify:verify", verifyArgs);
    
    console.log(`✅ Contract verified successfully!`);
    return true;
  } catch (error) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log(`✅ Contract already verified`);
      return true;
    }
    console.error(`❌ Verification failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log("🚀 Starting contract verification on OMScan...");
  console.log("=" * 60);
  
  // Load deployment addresses
  const deployment = loadDeploymentAddresses("omchain");
  console.log(`\n📋 Loaded deployment from: ${deployment.timestamp}`);
  console.log(`⛓️  Chain ID: ${deployment.chainId}`);
  
  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log(`👤 Verifying with account: ${deployer.address}`);
  
  const results = {
    verified: [],
    failed: []
  };
  
  console.log("\n" + "=" * 60);
  console.log("📝 Verifying contracts...");
  console.log("=" * 60);
  
  // 1. Verify OMTHB Token Implementation
  console.log("\n1️⃣ OMTHB Token Implementation");
  const omthbImplementationVerified = await verifyContract(
    deployment.addresses.omthbTokenImplementation,
    [], // UUPS implementation has no constructor args
    "contracts/upgradeable/OMTHBToken.sol:OMTHBToken"
  );
  
  if (omthbImplementationVerified) {
    results.verified.push("OMTHB Token Implementation");
  } else {
    results.failed.push("OMTHB Token Implementation");
  }
  
  await delay(3000); // Wait between verifications to avoid rate limiting
  
  // 2. Verify Gas Tank
  console.log("\n2️⃣ Gas Tank");
  const gasTankVerified = await verifyContract(
    deployment.addresses.gasTank,
    [deployer.address, deployer.address], // admin, emergencyWithdrawAddress
    "contracts/GasTank.sol:GasTank"
  );
  
  if (gasTankVerified) {
    results.verified.push("Gas Tank");
  } else {
    results.failed.push("Gas Tank");
  }
  
  await delay(3000);
  
  // 3. Verify MetaTxForwarder
  console.log("\n3️⃣ MetaTxForwarder");
  const metaTxForwarderVerified = await verifyContract(
    deployment.addresses.metaTxForwarder,
    [], // No constructor arguments
    "contracts/MetaTxForwarder.sol:MetaTxForwarder"
  );
  
  if (metaTxForwarderVerified) {
    results.verified.push("MetaTxForwarder");
  } else {
    results.failed.push("MetaTxForwarder");
  }
  
  await delay(3000);
  
  // 4. Verify ProjectReimbursement Implementation
  console.log("\n4️⃣ ProjectReimbursement Implementation");
  const projectImplVerified = await verifyContract(
    deployment.addresses.projectReimbursementImplementation,
    [], // No constructor arguments for implementation
    "contracts/ProjectReimbursementOptimized.sol:ProjectReimbursementOptimized"
  );
  
  if (projectImplVerified) {
    results.verified.push("ProjectReimbursement Implementation");
  } else {
    results.failed.push("ProjectReimbursement Implementation");
  }
  
  await delay(3000);
  
  // 5. Verify ProjectFactory
  console.log("\n5️⃣ ProjectFactory");
  const projectFactoryVerified = await verifyContract(
    deployment.addresses.projectFactory,
    [
      deployment.addresses.projectReimbursementImplementation,
      deployment.addresses.omthbToken,
      deployment.addresses.metaTxForwarder,
      deployer.address
    ],
    "contracts/ProjectFactory.sol:ProjectFactory"
  );
  
  if (projectFactoryVerified) {
    results.verified.push("ProjectFactory");
  } else {
    results.failed.push("ProjectFactory");
  }
  
  // Print summary
  console.log("\n" + "=" * 60);
  console.log("📊 VERIFICATION SUMMARY");
  console.log("=" * 60);
  
  if (results.verified.length > 0) {
    console.log(`\n✅ Successfully verified (${results.verified.length}):`);
    results.verified.forEach(contract => {
      console.log(`   - ${contract}`);
    });
  }
  
  if (results.failed.length > 0) {
    console.log(`\n❌ Failed to verify (${results.failed.length}):`);
    results.failed.forEach(contract => {
      console.log(`   - ${contract}`);
    });
  }
  
  console.log(`\n📍 View verified contracts on OMScan:`);
  console.log(`   https://omscan.omplatform.com/address/${deployment.addresses.omthbToken}`);
  console.log(`   https://omscan.omplatform.com/address/${deployment.addresses.gasTank}`);
  console.log(`   https://omscan.omplatform.com/address/${deployment.addresses.metaTxForwarder}`);
  console.log(`   https://omscan.omplatform.com/address/${deployment.addresses.projectFactory}`);
  console.log(`   https://omscan.omplatform.com/address/${deployment.addresses.projectReimbursementImplementation}`);
  
  if (results.failed.length > 0) {
    console.log(`\n💡 Troubleshooting tips:`);
    console.log(`   1. Ensure OMCHAIN_API_KEY is set in .env (if required)`);
    console.log(`   2. Check that the contracts were compiled with the same settings`);
    console.log(`   3. Try running: npx hardhat clean && npx hardhat compile`);
    console.log(`   4. Verify constructor arguments match deployment`);
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