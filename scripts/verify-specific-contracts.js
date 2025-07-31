const { run } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Deployment addresses from the specific deployment
const CONTRACTS = {
  ProjectFactory: {
    address: "0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1",
    constructorArgs: [
      "0x1100ED4175BB828958396a708278D46146e1748b", // ProjectReimbursement implementation
      "0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161", // OMTHB Token
      "0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347", // MetaTxForwarder
      "0xeB42B3bF49091377627610A691EA1Eaf32bc6254"  // Admin address
    ],
    contract: "contracts/ProjectFactory.sol:ProjectFactory"
  },
  ProjectReimbursementMultiRecipient: {
    address: "0x1100ED4175BB828958396a708278D46146e1748b",
    constructorArgs: [], // Implementation contract has no constructor args
    contract: "contracts/ProjectReimbursement.sol:ProjectReimbursement"
  }
};

async function verifyContract(name, config) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Verifying ${name}...`);
  console.log(`Address: ${config.address}`);
  console.log(`${"=".repeat(60)}`);
  
  try {
    // First attempt: Standard verification
    console.log("\nAttempt 1: Standard verification...");
    await run("verify:verify", {
      address: config.address,
      constructorArguments: config.constructorArgs,
      contract: config.contract
    });
    
    console.log(`✅ ${name} verified successfully!`);
    return { success: true, method: "standard" };
  } catch (error) {
    console.log(`❌ Standard verification failed: ${error.message}`);
    
    if (error.message.includes("Already Verified")) {
      console.log(`✅ ${name} is already verified!`);
      return { success: true, method: "already_verified" };
    }
    
    // Second attempt: With explicit contract path
    try {
      console.log("\nAttempt 2: Verification with explicit contract path...");
      await run("verify:verify", {
        address: config.address,
        constructorArguments: config.constructorArgs,
        contract: config.contract,
        libraries: {} // Empty libraries object
      });
      
      console.log(`✅ ${name} verified with explicit path!`);
      return { success: true, method: "explicit_path" };
    } catch (error2) {
      console.log(`❌ Explicit path verification failed: ${error2.message}`);
      
      // Third attempt: Manual verification data preparation
      console.log("\nAttempt 3: Preparing manual verification data...");
      const verificationData = await prepareManualVerificationData(name, config);
      return { success: false, method: "manual", data: verificationData };
    }
  }
}

async function prepareManualVerificationData(name, config) {
  console.log("\nPreparing data for manual verification...");
  
  // Get contract artifact
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    ...config.contract.split(":")[0].split("/"),
    `${config.contract.split(":")[1]}.json`
  );
  
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  
  // Encode constructor arguments
  const ethers = require("ethers");
  let encodedArgs = "";
  
  if (config.constructorArgs.length > 0) {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const constructorAbi = artifact.abi.find(item => item.type === "constructor");
    
    if (constructorAbi) {
      const types = constructorAbi.inputs.map(input => input.type);
      encodedArgs = abiCoder.encode(types, config.constructorArgs).slice(2); // Remove 0x prefix
    }
  }
  
  const verificationData = {
    contractAddress: config.address,
    contractName: config.contract.split(":")[1],
    compilerVersion: "v0.8.20+commit.a1b79de6",
    optimization: true,
    runs: 200,
    evmVersion: "paris",
    sourceCode: await getSourceCode(config.contract.split(":")[0]),
    constructorArguments: encodedArgs,
    libraries: {}
  };
  
  // Save verification data
  const outputDir = path.join(__dirname, "..", "verification-data");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  
  const outputFile = path.join(outputDir, `${name}-verification.json`);
  fs.writeFileSync(outputFile, JSON.stringify(verificationData, null, 2));
  
  console.log(`\n📁 Verification data saved to: ${outputFile}`);
  
  return verificationData;
}

async function getSourceCode(contractPath) {
  const fullPath = path.join(__dirname, "..", contractPath);
  return fs.readFileSync(fullPath, "utf8");
}

async function main() {
  console.log("Starting contract verification process...");
  console.log("Target network: OM Platform (chainId: 1246)");
  
  const results = {};
  
  for (const [name, config] of Object.entries(CONTRACTS)) {
    results[name] = await verifyContract(name, config);
    
    // Add delay between verifications to avoid rate limiting
    if (Object.keys(CONTRACTS).indexOf(name) < Object.keys(CONTRACTS).length - 1) {
      console.log("\nWaiting 5 seconds before next verification...");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("VERIFICATION SUMMARY");
  console.log("=".repeat(60));
  
  for (const [name, result] of Object.entries(results)) {
    const status = result.success ? "✅ SUCCESS" : "❌ FAILED";
    console.log(`${name}: ${status} (${result.method})`);
    
    if (!result.success && result.data) {
      console.log(`  → Manual verification data saved`);
      console.log(`  → Visit: https://omscan.omplatform.com/verifyContract`);
    }
  }
  
  // Print manual verification instructions if needed
  const failedContracts = Object.entries(results).filter(([_, r]) => !r.success);
  if (failedContracts.length > 0) {
    console.log("\n" + "=".repeat(60));
    console.log("MANUAL VERIFICATION INSTRUCTIONS");
    console.log("=".repeat(60));
    console.log("\nFor contracts that failed automatic verification:");
    console.log("1. Visit https://omscan.omplatform.com/verifyContract");
    console.log("2. Use the data from verification-data/ directory");
    console.log("3. Select 'Solidity (Single file)' verification method");
    console.log("4. Enter the following details:");
    
    for (const [name, result] of failedContracts) {
      if (result.data) {
        console.log(`\n${name}:`);
        console.log(`  - Contract Address: ${result.data.contractAddress}`);
        console.log(`  - Compiler: ${result.data.compilerVersion}`);
        console.log(`  - Optimization: Yes (200 runs)`);
        console.log(`  - Constructor Arguments: ${result.data.constructorArguments || "None"}`);
      }
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("Contract Explorer Links:");
  console.log("=".repeat(60));
  for (const [name, config] of Object.entries(CONTRACTS)) {
    console.log(`${name}: https://omscan.omplatform.com/address/${config.address}`);
  }
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });