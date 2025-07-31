const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

// Contract configurations
const CONTRACTS = {
  ProjectFactory: {
    address: "0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1",
    sourceFile: "contracts/ProjectFactory.sol",
    contractName: "ProjectFactory",
    constructorArgs: [
      "0x1100ED4175BB828958396a708278D46146e1748b", // implementation
      "0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161", // token
      "0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347", // forwarder
      "0xeB42B3bF49091377627610A691EA1Eaf32bc6254"  // admin
    ],
    libraries: {
      "contracts/libraries/SecurityLib.sol:SecurityLib": null // Will be resolved
    }
  },
  ProjectReimbursement: {
    address: "0x1100ED4175BB828958396a708278D46146e1748b",
    sourceFile: "contracts/ProjectReimbursement.sol",
    contractName: "ProjectReimbursement",
    constructorArgs: [],
    libraries: {}
  }
};

async function getDeployedBytecode(address) {
  const provider = new ethers.JsonRpcProvider("https://rpc.omplatform.com");
  return await provider.getCode(address);
}

async function getLibraryAddresses() {
  // Check if SecurityLib is deployed
  const deploymentFiles = fs.readdirSync(path.join(__dirname, "..", "deployments"))
    .filter(f => f.includes("omchain") && f.endsWith(".json"));
  
  let securityLibAddress = null;
  
  for (const file of deploymentFiles) {
    const content = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", file), "utf8"));
    if (content.SecurityLib) {
      securityLibAddress = content.SecurityLib;
      break;
    }
  }
  
  return { SecurityLib: securityLibAddress };
}

async function encodeConstructorArgs(contract) {
  if (contract.constructorArgs.length === 0) return "";
  
  // Get the contract factory to access ABI
  const ContractFactory = await ethers.getContractFactory(contract.contractName);
  const constructorFragment = ContractFactory.interface.deploy;
  
  // Encode arguments
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    constructorFragment.inputs.map(input => input.type),
    contract.constructorArgs
  );
  
  return encoded.slice(2); // Remove 0x prefix
}

async function flattenContract(sourceFile) {
  console.log(`Flattening ${sourceFile}...`);
  
  try {
    const { execSync } = require("child_process");
    const flattened = execSync(
      `npx hardhat flatten ${sourceFile}`,
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
    );
    
    // Remove duplicate SPDX license identifiers and pragma statements
    const lines = flattened.split('\n');
    const seen = new Set();
    const filtered = lines.filter(line => {
      if (line.includes('SPDX-License-Identifier') || line.includes('pragma solidity')) {
        if (seen.has(line.trim())) return false;
        seen.add(line.trim());
      }
      return true;
    });
    
    return filtered.join('\n');
  } catch (error) {
    console.error(`Failed to flatten contract: ${error.message}`);
    return null;
  }
}

async function generateVerificationPackage(name, contract) {
  console.log(`\nGenerating verification package for ${name}...`);
  
  const outputDir = path.join(__dirname, "..", "manual-verification", name);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 1. Get deployed bytecode
  console.log("Fetching deployed bytecode...");
  const deployedBytecode = await getDeployedBytecode(contract.address);
  
  // 2. Encode constructor arguments
  console.log("Encoding constructor arguments...");
  const encodedArgs = await encodeConstructorArgs(contract);
  
  // 3. Flatten source code
  console.log("Flattening source code...");
  const flattenedSource = await flattenContract(contract.sourceFile);
  
  // 4. Get library addresses if needed
  let libraryAddresses = {};
  if (Object.keys(contract.libraries).length > 0) {
    console.log("Resolving library addresses...");
    const libs = await getLibraryAddresses();
    for (const [libName, _] of Object.entries(contract.libraries)) {
      const libKey = libName.split(":")[1];
      if (libs[libKey]) {
        libraryAddresses[libName] = libs[libKey];
      }
    }
  }
  
  // 5. Create verification data
  const verificationData = {
    contractName: name,
    contractAddress: contract.address,
    sourceFile: contract.sourceFile,
    compiler: {
      version: "v0.8.20+commit.a1b79de6",
      optimization: true,
      runs: 200,
      evmVersion: "paris",
      viaIR: true
    },
    constructorArguments: encodedArgs,
    libraries: libraryAddresses,
    deployedBytecodeLength: deployedBytecode.length,
    verificationUrl: `https://omscan.omplatform.com/address/${contract.address}#code`
  };
  
  // 6. Save files
  console.log("Saving verification files...");
  
  // Save verification data
  fs.writeFileSync(
    path.join(outputDir, "verification-data.json"),
    JSON.stringify(verificationData, null, 2)
  );
  
  // Save flattened source
  if (flattenedSource) {
    fs.writeFileSync(
      path.join(outputDir, `${name}-flattened.sol`),
      flattenedSource
    );
  }
  
  // Save original source
  const originalSource = fs.readFileSync(
    path.join(__dirname, "..", contract.sourceFile),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outputDir, `${name}-original.sol`),
    originalSource
  );
  
  // Save constructor args file
  if (encodedArgs) {
    fs.writeFileSync(
      path.join(outputDir, "constructor-args.txt"),
      encodedArgs
    );
  }
  
  // Generate verification instructions
  const instructions = `# Manual Verification Instructions for ${name}

## Contract Details
- **Address**: ${contract.address}
- **Network**: OM Platform (Chain ID: 1246)
- **Compiler Version**: v0.8.20+commit.a1b79de6
- **Optimization**: Enabled (200 runs)
- **EVM Version**: paris
- **Via IR**: Enabled

## Constructor Arguments
${contract.constructorArgs.length > 0 ? contract.constructorArgs.map((arg, i) => `- Arg ${i}: ${arg}`).join('\n') : 'No constructor arguments'}

${encodedArgs ? `\nEncoded: 0x${encodedArgs}` : ''}

## Libraries Used
${Object.keys(libraryAddresses).length > 0 
  ? Object.entries(libraryAddresses).map(([lib, addr]) => `- ${lib}: ${addr || 'Not found'}`).join('\n')
  : 'No external libraries'}

## Verification Steps

### Option 1: Web Interface
1. Go to https://omscan.omplatform.com/verifyContract
2. Enter contract address: ${contract.address}
3. Select "Solidity (Single file)" verification method
4. Upload the flattened source file: ${name}-flattened.sol
5. Select compiler version: v0.8.20+commit.a1b79de6
6. Enable optimization with 200 runs
7. Set EVM version to "paris"
8. Enable "Via IR" option
${encodedArgs ? `9. Enter constructor arguments: 0x${encodedArgs}` : ''}
${Object.keys(libraryAddresses).length > 0 ? '10. Add library addresses as shown above' : ''}

### Option 2: Command Line (using Foundry)
\`\`\`bash
cast verify-contract \\
  ${contract.address} \\
  ${contract.contractName} \\
  --chain 1246 \\
  --rpc-url https://rpc.omplatform.com \\
  --etherscan-api-url https://omscan.omplatform.com/api \\
  --compiler-version "v0.8.20+commit.a1b79de6" \\
  --num-of-optimizations 200 \\
  --evm-version paris \\
  ${contract.constructorArgs.length > 0 ? `--constructor-args ${contract.constructorArgs.map(arg => `"${arg}"`).join(' ')} \\` : '\\'}
  --watch
\`\`\`

### Option 3: Using Hardhat
\`\`\`bash
npx hardhat verify \\
  --network omchain \\
  --contract ${contract.sourceFile}:${contract.contractName} \\
  ${contract.address} \\
  ${contract.constructorArgs.join(' ')}
\`\`\`

## Troubleshooting

### Common Issues:
1. **Bytecode mismatch**: Ensure all compiler settings match exactly
2. **Library not linked**: Deploy and link SecurityLib if needed
3. **Wrong constructor args**: Double-check the encoded arguments
4. **API timeout**: Try again later or use manual web interface

### Verification Links:
- Contract: https://omscan.omplatform.com/address/${contract.address}
- Verification: https://omscan.omplatform.com/verifyContract

## Files in this package:
- \`verification-data.json\`: All verification parameters
- \`${name}-flattened.sol\`: Flattened source code
- \`${name}-original.sol\`: Original source code
- \`constructor-args.txt\`: Encoded constructor arguments (if any)
- \`README.md\`: This file
`;

  fs.writeFileSync(
    path.join(outputDir, "README.md"),
    instructions
  );
  
  console.log(`✅ Verification package created: ${outputDir}`);
  
  return verificationData;
}

async function main() {
  console.log("=".repeat(70));
  console.log("MANUAL VERIFICATION PACKAGE GENERATOR");
  console.log("=".repeat(70));
  
  const results = {};
  
  for (const [name, contract] of Object.entries(CONTRACTS)) {
    try {
      results[name] = await generateVerificationPackage(name, contract);
    } catch (error) {
      console.error(`❌ Failed to generate package for ${name}:`, error.message);
      results[name] = { error: error.message };
    }
  }
  
  // Generate master README
  const masterReadme = `# OM Platform Contract Verification

This directory contains verification packages for contracts deployed on OM Platform.

## Contracts to Verify

1. **ProjectFactory**
   - Address: 0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1
   - Status: Pending verification
   - Package: ./ProjectFactory/

2. **ProjectReimbursement**
   - Address: 0x1100ED4175BB828958396a708278D46146e1748b
   - Status: Pending verification
   - Package: ./ProjectReimbursement/

## Quick Verification

Run the following commands to attempt verification:

\`\`\`bash
# ProjectFactory
cd ProjectFactory && npx hardhat verify --network omchain --contract contracts/ProjectFactory.sol:ProjectFactory 0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1 0x1100ED4175BB828958396a708278D46146e1748b 0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161 0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347 0xeB42B3bF49091377627610A691EA1Eaf32bc6254

# ProjectReimbursement
cd ProjectReimbursement && npx hardhat verify --network omchain --contract contracts/ProjectReimbursement.sol:ProjectReimbursement 0x1100ED4175BB828958396a708278D46146e1748b
\`\`\`

## Manual Verification

If automatic verification fails, use the web interface:
https://omscan.omplatform.com/verifyContract

Follow the instructions in each contract's README.md file.

Generated on: ${new Date().toISOString()}
`;

  fs.writeFileSync(
    path.join(__dirname, "..", "manual-verification", "README.md"),
    masterReadme
  );
  
  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log("\nGenerated verification packages:");
  
  for (const [name, result] of Object.entries(results)) {
    if (result.error) {
      console.log(`❌ ${name}: Failed - ${result.error}`);
    } else {
      console.log(`✅ ${name}: Success`);
      console.log(`   Address: ${result.contractAddress}`);
      console.log(`   Package: ./manual-verification/${name}/`);
    }
  }
  
  console.log("\n📁 All packages saved to: ./manual-verification/");
  console.log("📋 Follow the README.md in each package for verification instructions");
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });