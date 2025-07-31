const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("======================================================================");
    console.log("PREPARING MANUAL VERIFICATION DATA FOR OMSCAN");
    console.log("======================================================================");
    console.log("");

    // Contracts that need verification
    const contractsToVerify = [
        {
            name: "ProjectFactory",
            address: "0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1",
            constructorArgs: [
                "0x1100ED4175BB828958396a708278D46146e1748b", // implementation
                "0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161", // token
                "0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347", // forwarder
                "0x42a7ca42C90448A7f70970C14c34D9cd4D3309A6"  // admin
            ]
        },
        {
            name: "ProjectReimbursementMultiRecipient",
            address: "0x1100ED4175BB828958396a708278D46146e1748b",
            constructorArgs: [] // Implementation has no constructor args
        }
    ];

    // Create output directory
    const outputDir = path.join(__dirname, "../manual-verification-data");
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const contract of contractsToVerify) {
        console.log(`\n----------------------------------------------------------------------`);
        console.log(`Preparing ${contract.name}`);
        console.log(`Address: ${contract.address}`);
        console.log(`----------------------------------------------------------------------`);

        try {
            // Prepare constructor arguments
            const encodedArgs = contract.constructorArgs.length > 0 
                ? hre.ethers.AbiCoder.defaultAbiCoder().encode(
                    contract.name === "ProjectFactory" 
                        ? ["address", "address", "address", "address"]
                        : [],
                    contract.constructorArgs
                ).slice(2) // Remove 0x prefix
                : "";

            // Create verification data
            const verificationData = {
                contractName: contract.name,
                contractAddress: contract.address,
                compilerVersion: "v0.8.20+commit.a1b79de6",
                optimization: true,
                optimizationRuns: 200,
                evmVersion: "paris",
                viaIR: true,
                constructorArguments: encodedArgs,
                sourceCode: `// Will be flattened in the next step`,
                verificationUrl: `https://omscan.omplatform.com/address/${contract.address}#code`
            };

            // Save verification data
            const outputFile = path.join(outputDir, `${contract.name}-verification.json`);
            fs.writeFileSync(outputFile, JSON.stringify(verificationData, null, 2));
            console.log(`✓ Saved verification data to: ${outputFile}`);

            // Generate manual verification instructions
            const instructions = `
MANUAL VERIFICATION INSTRUCTIONS FOR ${contract.name}
=====================================

1. Go to: https://omscan.omplatform.com/address/${contract.address}#code

2. Click "Verify and Publish" button

3. Enter the following information:

   Contract Address: ${contract.address}
   
   Compiler Type: Solidity (Single file)
   
   Compiler Version: v0.8.20+commit.a1b79de6
   
   Open Source License Type: MIT

4. Compiler Configuration:
   - Optimization: Yes
   - Runs: 200
   - EVM Version: paris
   - Enable "Via IR": Yes

5. Constructor Arguments (ABI-encoded):
   ${encodedArgs || "(No constructor arguments)"}

6. Source Code:
   - Use the flattened source code from: ${contract.name}-flattened.sol

7. Click "Verify and Publish"

ALTERNATIVE METHOD - Using Hardhat:
==================================
npx hardhat verify --network omchain \\
  --contract contracts/${contract.name}.sol:${contract.name} \\
  ${contract.address} \\
  ${contract.constructorArgs.join(" ")}
`;

            const instructionsFile = path.join(outputDir, `${contract.name}-instructions.txt`);
            fs.writeFileSync(instructionsFile, instructions);
            console.log(`✓ Saved instructions to: ${instructionsFile}`);

            // Try to flatten the contract
            console.log(`\nFlattening ${contract.name} source code...`);
            try {
                await hre.run("flatten", {
                    files: [`contracts/${contract.name}.sol`],
                    output: path.join(outputDir, `${contract.name}-flattened.sol`)
                });
                console.log(`✓ Flattened source saved`);
            } catch (flattenError) {
                console.log(`⚠️  Could not flatten automatically: ${flattenError.message}`);
                console.log(`   Please flatten manually using: npx hardhat flatten contracts/${contract.name}.sol`);
            }

        } catch (error) {
            console.error(`❌ Error preparing ${contract.name}:`, error.message);
        }
    }

    console.log("\n======================================================================");
    console.log("VERIFICATION PREPARATION COMPLETE");
    console.log("======================================================================");
    console.log("\nNext steps:");
    console.log("1. Check the 'manual-verification-data' folder for all files");
    console.log("2. Follow the instructions in each *-instructions.txt file");
    console.log("3. Use the flattened source code when verifying on OMScan");
    console.log("\nDirect links for verification:");
    contractsToVerify.forEach(contract => {
        console.log(`\n${contract.name}:`);
        console.log(`https://omscan.omplatform.com/address/${contract.address}#code`);
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });