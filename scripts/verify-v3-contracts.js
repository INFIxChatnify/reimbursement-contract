const { run } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🔍 Starting V3 Contracts Verification on OMScan...\n");

  const network = hre.network.name;
  if (network !== "omchain") {
    console.error("❌ Please run this script on omchain network");
    console.log("Run: npx hardhat run scripts/verify-v3-contracts.js --network omchain");
    process.exit(1);
  }

  // Load deployment info
  const deploymentFile = path.join(__dirname, `../deployments/${network}-v3-deployments.json`);
  if (!fs.existsSync(deploymentFile)) {
    console.error("❌ Deployment file not found. Please deploy contracts first.");
    process.exit(1);
  }

  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const contracts = deploymentInfo.contracts;

  console.log("📋 Contracts to verify:");
  console.log("======================");
  for (const [name, info] of Object.entries(contracts)) {
    console.log(`${name}: ${info.address}`);
  }
  console.log("\n");

  // Verification configurations
  const verificationConfigs = {
    OMTHBTokenV3: {
      contract: "contracts/upgradeable/OMTHBTokenV3.sol:OMTHBTokenV3",
      constructorArguments: []
    },
    ProjectReimbursementV3: {
      contract: "contracts/ProjectReimbursementV3.sol:ProjectReimbursementV3",
      constructorArguments: []
    },
    ProjectFactoryV3: {
      contract: "contracts/ProjectFactoryV3.sol:ProjectFactoryV3",
      constructorArguments: [
        contracts.ProjectReimbursementV3.address,  // _projectImplementation
        contracts.OMTHBTokenV3.address,           // _omthbToken
        contracts.MetaTxForwarderV3.address,      // _metaTxForwarder
        deploymentInfo.deployer                    // _admin
      ]
    },
    BeaconProjectFactoryV3: {
      contract: "contracts/BeaconProjectFactoryV3.sol:BeaconProjectFactoryV3",
      constructorArguments: [
        contracts.BeaconProjectFactoryV3.beacon,   // _projectImplementation (beacon)
        contracts.OMTHBTokenV3.address,           // _omthbToken
        contracts.MetaTxForwarderV3.address,      // _metaTxForwarder
        deploymentInfo.deployer                    // _admin
      ]
    },
    MetaTxForwarderV3: {
      contract: "contracts/MetaTxForwarderV2.sol:MetaTxForwarderV2",
      constructorArguments: []
    }
  };

  // Verify each contract
  for (const [name, info] of Object.entries(contracts)) {
    console.log(`\n🔍 Verifying ${name}...`);
    
    try {
      const config = verificationConfigs[name];
      if (!config) {
        console.log(`⚠️  No verification config for ${name}, skipping...`);
        continue;
      }

      await run("verify:verify", {
        address: info.address,
        contract: config.contract,
        constructorArguments: config.constructorArguments,
      });

      console.log(`✅ ${name} verified successfully!`);
      console.log(`   View on OMScan: https://omscan.omplatform.com/address/${info.address}`);

      // If it's a proxy, verify implementation too
      if (info.implementation) {
        console.log(`   Verifying implementation...`);
        await run("verify:verify", {
          address: info.implementation,
          contract: config.contract,
          constructorArguments: [],
        });
        console.log(`   ✅ Implementation verified!`);
        console.log(`   View on OMScan: https://omscan.omplatform.com/address/${info.implementation}`);
      }

    } catch (error) {
      if (error.message.includes("already verified")) {
        console.log(`✅ ${name} is already verified`);
      } else {
        console.error(`❌ Failed to verify ${name}:`, error.message);
      }
    }
  }

  console.log("\n✅ Verification process completed!");
  console.log("\n📋 Verified Contracts on OMScan:");
  console.log("================================");
  for (const [name, info] of Object.entries(contracts)) {
    console.log(`${name}:`);
    console.log(`  https://omscan.omplatform.com/address/${info.address}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });