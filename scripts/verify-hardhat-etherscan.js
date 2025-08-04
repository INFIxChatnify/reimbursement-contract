const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting contract verification using Hardhat-Etherscan plugin...");
  
  // Load deployment data
  const deploymentPath = path.join(__dirname, "..", "deployments", "omchain-latest.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  
  try {
    // 1. Verify OMTHB Token Implementation
    console.log("\n1. Verifying OMTHB Token Implementation...");
    await hre.run("verify:verify", {
      address: deployment.state.contracts.OMTHBToken.implementation,
      constructorArguments: [],
      contract: "contracts/upgradeable/OMTHBToken.sol:OMTHBToken"
    });
  } catch (error) {
    console.log("OMTHB Token verification error:", error.message);
  }
  
  await delay(5000);
  
  try {
    // 2. Verify MetaTxForwarder
    console.log("\n2. Verifying MetaTxForwarder...");
    await hre.run("verify:verify", {
      address: deployment.state.contracts.MetaTxForwarder,
      constructorArguments: [],
      contract: "contracts/MetaTxForwarder.sol:MetaTxForwarder"
    });
  } catch (error) {
    console.log("MetaTxForwarder verification error:", error.message);
  }
  
  await delay(5000);
  
  try {
    // 3. Verify ProjectReimbursement Implementation
    console.log("\n3. Verifying ProjectReimbursement Implementation...");
    await hre.run("verify:verify", {
      address: deployment.state.contracts.ProjectReimbursementImplementation,
      constructorArguments: [],
      contract: "contracts/ProjectReimbursement.sol:ProjectReimbursement"
    });
  } catch (error) {
    console.log("ProjectReimbursement verification error:", error.message);
  }
  
  await delay(5000);
  
  try {
    // 4. Verify ProjectFactory
    console.log("\n4. Verifying ProjectFactory...");
    await hre.run("verify:verify", {
      address: deployment.state.contracts.ProjectFactory,
      constructorArguments: [
        deployment.state.contracts.OMTHBToken.proxy, // OMTHB token
        deployment.state.contracts.ProjectReimbursementImplementation, // implementation
        deployment.state.contracts.MetaTxForwarder, // forwarder
        "0xeB42B3bF49091377627610A691EA1Eaf32bc6254" // owner
      ],
      contract: "contracts/ProjectFactory.sol:ProjectFactory"
    });
  } catch (error) {
    console.log("ProjectFactory verification error:", error.message);
  }
  
  await delay(5000);
  
  try {
    // 5. Verify AuditAnchor
    console.log("\n5. Verifying AuditAnchor...");
    await hre.run("verify:verify", {
      address: deployment.state.contracts.AuditAnchor,
      constructorArguments: [
        deployment.state.contracts.ProjectFactory, // projectFactory
        "0xeB42B3bF49091377627610A691EA1Eaf32bc6254" // owner
      ],
      contract: "contracts/AuditAnchor.sol:AuditAnchor"
    });
  } catch (error) {
    console.log("AuditAnchor verification error:", error.message);
  }
  
  console.log("\n✅ Verification process completed!");
  console.log("\nContract addresses:");
  console.log(`- OMTHB Token Proxy: ${deployment.state.contracts.OMTHBToken.proxy}`);
  console.log(`- OMTHB Token Implementation: ${deployment.state.contracts.OMTHBToken.implementation}`);
  console.log(`- MetaTxForwarder: ${deployment.state.contracts.MetaTxForwarder}`);
  console.log(`- ProjectReimbursement Implementation: ${deployment.state.contracts.ProjectReimbursementImplementation}`);
  console.log(`- ProjectFactory: ${deployment.state.contracts.ProjectFactory}`);
  console.log(`- AuditAnchor: ${deployment.state.contracts.AuditAnchor}`);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });