const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.test" });

// Load deployment info
const deploymentPath = path.join(__dirname, "..", "deployments", "omchain-gasless-approval.json");
const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

async function main() {
  console.log("🔍 Debugging gasless setup...");
  console.log("=".repeat(60));
  
  const [deployer] = await ethers.getSigners();
  
  // Get contracts
  const project = await ethers.getContractAt("GaslessProjectReimbursement", deployment.contracts.gaslessProject);
  const forwarder = await ethers.getContractAt("MetaTxForwarderV2", deployment.contracts.metaTxForwarder);
  const gasTank = await ethers.getContractAt("GasTank", deployment.contracts.gasTank);
  
  console.log("\n1️⃣ Checking trusted forwarder setup...");
  try {
    // Try to check if isTrustedForwarder exists
    const isTrusted = await project.isTrustedForwarder(deployment.contracts.metaTxForwarder);
    console.log(`   Is MetaTxForwarder trusted: ${isTrusted}`);
  } catch (error) {
    console.log(`   ❌ Could not check trusted forwarder: ${error.message}`);
  }
  
  console.log("\n2️⃣ Checking whitelist status...");
  const isWhitelisted = await forwarder.whitelistedTargets(deployment.contracts.gaslessProject);
  console.log(`   Project whitelisted: ${isWhitelisted}`);
  
  console.log("\n3️⃣ Checking GasTank setup...");
  const gasTankAddress = await forwarder.gasTank();
  console.log(`   Forwarder's GasTank: ${gasTankAddress}`);
  console.log(`   Expected GasTank: ${deployment.contracts.gasTank}`);
  console.log(`   ✅ Match: ${gasTankAddress === deployment.contracts.gasTank}`);
  
  console.log("\n4️⃣ Checking relayer role in GasTank...");
  const RELAYER_ROLE = await gasTank.RELAYER_ROLE();
  const relayerAddress = process.env.RELAYER_ADDRESS;
  const hasRelayerRole = await gasTank.hasRole(RELAYER_ROLE, relayerAddress);
  console.log(`   Relayer has RELAYER_ROLE: ${hasRelayerRole}`);
  
  console.log("\n5️⃣ Checking rate limits...");
  const maxTxPerWindow = await forwarder.maxTxPerWindow();
  console.log(`   Max transactions per window: ${maxTxPerWindow}`);
  
  console.log("\n6️⃣ Testing simple meta transaction...");
  try {
    // Test with a simple view function first
    const projectIdData = project.interface.encodeFunctionData("projectId");
    const testNonce = await forwarder.getNonce(deployer.address);
    
    console.log(`   Testing with nonce: ${testNonce}`);
    console.log(`   Function: projectId() (view function)`);
    
    // Create a simple forward request
    const testRequest = {
      from: deployer.address,
      to: deployment.contracts.gaslessProject,
      value: 0,
      gas: 100000,
      nonce: testNonce,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      chainId: 1246,
      data: projectIdData
    };
    
    // Create domain
    const domain = {
      name: "MetaTxForwarderV2",
      version: "2",
      chainId: 1246,
      verifyingContract: deployment.contracts.metaTxForwarder
    };
    
    // Type definition
    const types = {
      ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "chainId", type: "uint256" },
        { name: "data", type: "bytes" }
      ]
    };
    
    // Sign
    const signature = await deployer.signTypedData(domain, types, testRequest);
    
    // Verify signature
    const isValid = await forwarder.verify(testRequest, signature);
    console.log(`   Signature valid: ${isValid}`);
    
    // Try to estimate gas
    console.log("\n7️⃣ Estimating gas for meta transaction...");
    const estimatedGas = await forwarder.estimateGas(testRequest);
    console.log(`   Estimated gas: ${estimatedGas}`);
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }
  
  console.log("\n8️⃣ Checking secretary role...");
  const secretaryAddress = process.env.SECRETARY_ADDRESS;
  const SECRETARY_ROLE = await project.SECRETARY_ROLE();
  const hasSecretaryRole = await project.hasRole(SECRETARY_ROLE, secretaryAddress);
  console.log(`   Secretary has SECRETARY_ROLE: ${hasSecretaryRole}`);
  
  console.log("\n" + "=".repeat(60));
  console.log("📋 Debug Summary:");
  console.log("   - Project whitelisted: " + (isWhitelisted ? "✅" : "❌"));
  console.log("   - GasTank connected: " + (gasTankAddress === deployment.contracts.gasTank ? "✅" : "❌"));
  console.log("   - Relayer has role: " + (hasRelayerRole ? "✅" : "❌"));
  console.log("   - Secretary has role: " + (hasSecretaryRole ? "✅" : "❌"));
}

main().catch(console.error);
