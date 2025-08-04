const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

// OMScan API endpoint
const OMSCAN_API_URL = "https://omscan.omplatform.com/api";

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyContract(contractAddress, contractName, constructorArgs = [], libraries = {}) {
  try {
    console.log(`\nVerifying ${contractName} at ${contractAddress}...`);
    
    // Get contract source code
    const contractPath = path.join(__dirname, "..", "contracts");
    let sourcePath;
    
    // Find the contract file
    if (contractName.includes("OMTHB")) {
      sourcePath = path.join(contractPath, "upgradeable", "OMTHBToken.sol");
    } else if (contractName === "MetaTxForwarder") {
      sourcePath = path.join(contractPath, "MetaTxForwarder.sol");
    } else if (contractName === "ProjectReimbursement") {
      sourcePath = path.join(contractPath, "ProjectReimbursement.sol");
    } else if (contractName === "ProjectFactory") {
      sourcePath = path.join(contractPath, "ProjectFactory.sol");
    } else if (contractName === "AuditAnchor") {
      sourcePath = path.join(contractPath, "AuditAnchor.sol");
    } else {
      console.log(`Unknown contract: ${contractName}`);
      return;
    }
    
    const sourceCode = fs.readFileSync(sourcePath, "utf8");
    
    // Prepare form data for Blockscout API
    const form = new FormData();
    form.append("addressHash", contractAddress);
    form.append("name", contractName);
    form.append("compilerVersion", "v0.8.20+commit.a1b79de6");
    form.append("optimization", "true");
    form.append("optimizationRuns", "200");
    form.append("evmVersion", "paris");
    form.append("contractSourceCode", sourceCode);
    
    // Add constructor arguments if any
    if (constructorArgs.length > 0) {
      const abiCoder = new ethers.AbiCoder();
      const encodedArgs = abiCoder.encode(
        constructorArgs.map(arg => arg.type),
        constructorArgs.map(arg => arg.value)
      ).slice(2); // Remove 0x prefix
      form.append("constructorArguments", encodedArgs);
    }
    
    // Add libraries if any
    if (Object.keys(libraries).length > 0) {
      form.append("libraries", JSON.stringify(libraries));
    }
    
    // Submit verification
    const response = await axios.post(
      `${OMSCAN_API_URL}/v1/verified_smart_contracts`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          "Accept": "application/json"
        }
      }
    );
    
    if (response.data.message === "OK") {
      console.log(`✅ ${contractName} verified successfully!`);
    } else {
      console.log(`❌ ${contractName} verification failed:`, response.data);
    }
    
  } catch (error) {
    console.error(`Error verifying ${contractName}:`, error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
  }
}

async function main() {
  console.log("Starting contract verification on OMScan...");
  
  // Load deployment data
  const deploymentPath = path.join(__dirname, "..", "deployments", "omchain-latest.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  
  // Verify each contract
  console.log("\n1. Verifying OMTHB Token Implementation...");
  await verifyContract(
    deployment.state.contracts.OMTHBToken.implementation,
    "OMTHBToken",
    []
  );
  await delay(5000);
  
  console.log("\n2. Verifying MetaTxForwarder...");
  await verifyContract(
    deployment.state.contracts.MetaTxForwarder,
    "MetaTxForwarder",
    []
  );
  await delay(5000);
  
  console.log("\n3. Verifying ProjectReimbursement Implementation...");
  await verifyContract(
    deployment.state.contracts.ProjectReimbursementImplementation,
    "ProjectReimbursement",
    []
  );
  await delay(5000);
  
  console.log("\n4. Verifying ProjectFactory...");
  // ProjectFactory constructor arguments
  const projectFactoryArgs = [
    { type: "address", value: deployment.state.contracts.OMTHBToken.proxy }, // OMTHB token
    { type: "address", value: deployment.state.contracts.ProjectReimbursementImplementation }, // implementation
    { type: "address", value: deployment.state.contracts.MetaTxForwarder }, // forwarder
    { type: "address", value: "0xeB42B3bF49091377627610A691EA1Eaf32bc6254" } // owner
  ];
  
  await verifyContract(
    deployment.state.contracts.ProjectFactory,
    "ProjectFactory",
    projectFactoryArgs
  );
  await delay(5000);
  
  console.log("\n5. Verifying AuditAnchor...");
  // AuditAnchor constructor arguments
  const auditAnchorArgs = [
    { type: "address", value: deployment.state.contracts.ProjectFactory }, // projectFactory
    { type: "address", value: "0xeB42B3bF49091377627610A691EA1Eaf32bc6254" } // owner
  ];
  
  await verifyContract(
    deployment.state.contracts.AuditAnchor,
    "AuditAnchor",
    auditAnchorArgs
  );
  
  console.log("\n✅ Verification process completed!");
  console.log("\nYou can check the verification status at:");
  console.log(`- OMTHB Implementation: https://omscan.omplatform.com/address/${deployment.state.contracts.OMTHBToken.implementation}`);
  console.log(`- OMTHB Proxy: https://omscan.omplatform.com/address/${deployment.state.contracts.OMTHBToken.proxy}`);
  console.log(`- MetaTxForwarder: https://omscan.omplatform.com/address/${deployment.state.contracts.MetaTxForwarder}`);
  console.log(`- ProjectReimbursement: https://omscan.omplatform.com/address/${deployment.state.contracts.ProjectReimbursementImplementation}`);
  console.log(`- ProjectFactory: https://omscan.omplatform.com/address/${deployment.state.contracts.ProjectFactory}`);
  console.log(`- AuditAnchor: https://omscan.omplatform.com/address/${deployment.state.contracts.AuditAnchor}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });