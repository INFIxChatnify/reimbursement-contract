const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function findLibraryInBytecode(bytecode, libraryName) {
  // Library placeholders in bytecode are 40 characters (20 bytes) of the format:
  // __$<34 character hash>$__
  // The hash is keccak256 of the library path
  
  const regex = /__\$[a-fA-F0-9]{34}\$__/g;
  const placeholders = bytecode.match(regex);
  
  if (placeholders) {
    console.log(`Found ${placeholders.length} library placeholder(s) in bytecode`);
    return placeholders;
  }
  
  return [];
}

async function checkDeployedContracts() {
  console.log("=".repeat(70));
  console.log("CHECKING LIBRARY DEPLOYMENTS");
  console.log("=".repeat(70));
  
  const provider = new ethers.JsonRpcProvider("https://rpc.omplatform.com");
  
  // Contracts to check
  const contracts = {
    ProjectFactory: "0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1",
    ProjectReimbursement: "0x1100ED4175BB828958396a708278D46146e1748b"
  };
  
  // Check deployment files for library addresses
  console.log("\n1. Checking deployment files for library addresses...");
  
  const deploymentFiles = fs.readdirSync(path.join(__dirname, "..", "deployments"))
    .filter(f => f.includes("omchain") && f.endsWith(".json"));
  
  let libraryAddresses = {};
  
  for (const file of deploymentFiles) {
    const filePath = path.join(__dirname, "..", "deployments", file);
    try {
      const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
      
      // Look for library addresses
      const possibleLibraryKeys = ["SecurityLib", "securityLib", "libraries"];
      
      for (const key of possibleLibraryKeys) {
        if (content[key]) {
          console.log(`Found library reference in ${file}:`);
          console.log(`  ${key}: ${JSON.stringify(content[key])}`);
          
          if (typeof content[key] === "string") {
            libraryAddresses[key] = content[key];
          } else if (typeof content[key] === "object") {
            Object.assign(libraryAddresses, content[key]);
          }
        }
      }
    } catch (error) {
      console.log(`Error reading ${file}: ${error.message}`);
    }
  }
  
  if (Object.keys(libraryAddresses).length === 0) {
    console.log("No library addresses found in deployment files");
  } else {
    console.log("\nFound library addresses:");
    for (const [name, address] of Object.entries(libraryAddresses)) {
      console.log(`  ${name}: ${address}`);
    }
  }
  
  // Check bytecode for library placeholders
  console.log("\n2. Checking deployed bytecode for library placeholders...");
  
  for (const [name, address] of Object.entries(contracts)) {
    console.log(`\n${name} (${address}):`);
    
    try {
      const bytecode = await provider.getCode(address);
      console.log(`  Bytecode length: ${bytecode.length} characters`);
      
      const placeholders = await findLibraryInBytecode(bytecode, "SecurityLib");
      
      if (placeholders.length > 0) {
        console.log(`  ⚠️  Found unlinked library placeholders:`);
        placeholders.forEach(p => console.log(`    ${p}`));
        console.log(`  This contract requires library linking!`);
      } else {
        console.log(`  ✅ No unlinked library placeholders found`);
      }
    } catch (error) {
      console.log(`  Error checking bytecode: ${error.message}`);
    }
  }
  
  // Generate library hash for SecurityLib
  console.log("\n3. Calculating library placeholder hash...");
  
  const libraryPath = "contracts/libraries/SecurityLib.sol:SecurityLib";
  const hash = ethers.keccak256(ethers.toUtf8Bytes(libraryPath));
  const placeholder = `__$${hash.slice(2, 36)}$__`;
  
  console.log(`Library path: ${libraryPath}`);
  console.log(`Keccak256 hash: ${hash}`);
  console.log(`Placeholder: ${placeholder}`);
  
  // Check if SecurityLib might be inlined
  console.log("\n4. Checking if SecurityLib functions are inlined...");
  
  try {
    // Get the contract artifacts
    const projectFactoryArtifact = require("../artifacts/contracts/ProjectFactory.sol/ProjectFactory.json");
    
    // Check if library functions are in the ABI (would indicate inlining)
    const hasLibraryFunctions = projectFactoryArtifact.abi.some(item => 
      item.name && item.name.includes("validatePercentage")
    );
    
    if (!hasLibraryFunctions) {
      console.log("✅ SecurityLib appears to be properly used as a library (not inlined)");
    } else {
      console.log("⚠️  SecurityLib functions found in ABI - might be inlined");
    }
  } catch (error) {
    console.log(`Could not check artifacts: ${error.message}`);
  }
  
  // Generate recommendations
  console.log("\n" + "=".repeat(70));
  console.log("RECOMMENDATIONS");
  console.log("=".repeat(70));
  
  console.log("\nBased on the analysis:");
  
  if (Object.keys(libraryAddresses).length > 0) {
    console.log("\n1. Libraries found in deployment files:");
    for (const [name, address] of Object.entries(libraryAddresses)) {
      console.log(`   - Use ${name} at address: ${address}`);
    }
  } else {
    console.log("\n1. No deployed libraries found. SecurityLib might be:");
    console.log("   - Inlined by the compiler (if only using internal functions)");
    console.log("   - Not deployed yet (if using external functions)");
  }
  
  console.log("\n2. For verification:");
  console.log("   - If libraries are inlined: No library linking needed");
  console.log("   - If libraries are external: Must provide library addresses");
  
  console.log("\n3. To check if verification is needed:");
  console.log(`   - ProjectFactory: https://omscan.omplatform.com/address/${contracts.ProjectFactory}#code`);
  console.log(`   - ProjectReimbursement: https://omscan.omplatform.com/address/${contracts.ProjectReimbursement}#code`);
}

// Run the check
checkDeployedContracts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });