const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Load deployment data
function loadDeploymentAddresses() {
  const filename = path.join(__dirname, "../deployments/omchain-deployment.json");
  if (!fs.existsSync(filename)) {
    throw new Error(`Deployment file not found: ${filename}`);
  }
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

// Contracts to verify
const CONTRACTS_TO_VERIFY = [
  {
    name: "Gas Tank",
    address: "0xA01b775F6ebA700e29bD1579abE4f1DC53bA6f8d",
    contract: "contracts/GasTank.sol:GasTank",
    // GasTank constructor: admin, emergencyWithdrawAddress
    constructorArguments: [
      "0x42a7ca42C90448A7f70970C14c34D9cd4D3309A6", // deployer as initial admin
      "0x42a7ca42C90448A7f70970C14c34D9cd4D3309A6"  // deployer as emergency withdraw
    ]
  },
  {
    name: "MetaTxForwarder",
    address: "0x36e030Be3955aCF97AA725bE99A0D7Fc64238292",
    contract: "contracts/MetaTxForwarder.sol:MetaTxForwarder",
    constructorArguments: [] // No constructor arguments
  },
  {
    name: "ProjectFactory",
    address: "0x6495152B17f9d7418e64ef1277935EE70d73Aeed",
    contract: "contracts/ProjectFactory.sol:ProjectFactory",
    constructorArguments: [
      "0x2E363b97d9da9cA243BcC782d7DdffC18E6F54cC", // projectImplementation
      "0x05db2AE2eAb7A47395DB8cDbf5f3E84A78989091", // omthbToken
      "0x36e030Be3955aCF97AA725bE99A0D7Fc64238292", // metaTxForwarder
      "0x42a7ca42C90448A7f70970C14c34D9cd4D3309A6"  // admin
    ]
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
    console.log(`   Constructor args: ${JSON.stringify(contractInfo.constructorArguments)}`);
    
    const verifyArgs = {
      address: contractInfo.address,
      constructorArguments: contractInfo.constructorArguments,
      contract: contractInfo.contract
    };
    
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

async function main() {
  console.log("🚀 Starting verification of remaining contracts...");
  console.log("=" * 60);
  
  // Load deployment to confirm addresses
  const deployment = loadDeploymentAddresses();
  console.log(`\n📋 Using deployment from: ${deployment.timestamp}`);
  
  const results = [];
  
  for (const contract of CONTRACTS_TO_VERIFY) {
    const result = await verifyContract(contract);
    results.push({ ...contract, ...result });
    await delay(5000); // Wait between verifications
  }
  
  console.log("\n" + "=" * 60);
  console.log("📊 VERIFICATION SUMMARY");
  console.log("=" * 60);
  
  results.forEach(result => {
    const status = result.success ? "✅" : "❌";
    console.log(`${status} ${result.name}: ${result.message}`);
  });
  
  console.log("\n📝 Verification Links:");
  CONTRACTS_TO_VERIFY.forEach(contract => {
    console.log(`   ${contract.name}: https://omscan.omplatform.com/address/${contract.address}#code`);
  });
  
  // Create constructor argument encoding files
  console.log("\n📄 Creating constructor argument files for manual verification...");
  
  const manualVerifyDir = path.join(__dirname, "../manual-verification");
  if (!fs.existsSync(manualVerifyDir)) {
    fs.mkdirSync(manualVerifyDir, { recursive: true });
  }
  
  for (const contract of CONTRACTS_TO_VERIFY) {
    if (contract.constructorArguments.length > 0) {
      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        contract.name === "Gas Tank" ? ["address", "address"] :
        contract.name === "ProjectFactory" ? ["address", "address", "address", "address"] :
        [],
        contract.constructorArguments
      );
      
      const filename = path.join(manualVerifyDir, `${contract.name.replace(/\s+/g, '-')}-constructor-args.txt`);
      fs.writeFileSync(filename, encoded.slice(2)); // Remove '0x' prefix
      console.log(`   ✅ Created: ${filename}`);
    }
  }
  
  console.log("\n💡 Manual Verification Instructions:");
  console.log("   1. Go to https://omscan.omplatform.com/verifyContract");
  console.log("   2. Enter contract address");
  console.log("   3. Select compiler v0.8.20+commit.a1b79de6");
  console.log("   4. Enable optimization with runs = 1");
  console.log("   5. Use constructor argument files from manual-verification/ folder");
  
  console.log("\n" + "=" * 60);
}

// Execute verification
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });