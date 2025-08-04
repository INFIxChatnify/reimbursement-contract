const { run } = require("hardhat");

async function main() {
  console.log("🔍 Starting optimized contracts verification on OMScan...\n");

  const contracts = [
    {
      name: "ReimbursementLib",
      address: "0xC9DD8222Dc11A1929BbD3b0c738D36dd8bfea3a8",
      contract: "contracts/libraries/ReimbursementLib.sol:ReimbursementLib",
      constructorArguments: []
    },
    {
      name: "RoleManagementLib",
      address: "0x5397BF13B4B28f312376F22d0B7640D0cD004Ef0",
      contract: "contracts/libraries/RoleManagementLib.sol:RoleManagementLib",
      constructorArguments: []
    },
    {
      name: "ProjectReimbursementOptimized",
      address: "0x84D14Ea341c637F586E9c16D060D463A1Ca61815",
      contract: "contracts/optimized/ProjectReimbursementOptimized.sol:ProjectReimbursementOptimized",
      constructorArguments: []
    },
    {
      name: "ProjectFactoryOptimized",
      address: "0xc495b4B30ed3D32FF45D5f8dA10885850C2d39dF",
      contract: "contracts/optimized/ProjectFactoryOptimized.sol:ProjectFactoryOptimized",
      constructorArguments: [
        "0x84D14Ea341c637F586E9c16D060D463A1Ca61815", // implementation
        "0x2AEa4cd271eabAfea140fF8fDEaC012a7A2f4CF4", // OMTHB token
        "0x4e2bAD765362a397366d4630A02B5bed7692BE3a"  // admin
      ]
    },
    {
      name: "BeaconProjectFactoryOptimized",
      address: "0xab2f7988B2f6e89558b22E1AD2aFE4F4A310631a",
      contract: "contracts/optimized/BeaconProjectFactoryOptimized.sol:BeaconProjectFactoryOptimized",
      constructorArguments: [
        "0x84D14Ea341c637F586E9c16D060D463A1Ca61815", // implementation
        "0x2AEa4cd271eabAfea140fF8fDEaC012a7A2f4CF4", // OMTHB token
        "0x4e2bAD765362a397366d4630A02B5bed7692BE3a"  // admin
      ]
    }
  ];

  for (const contract of contracts) {
    console.log(`Verifying ${contract.name} at ${contract.address}...`);
    
    try {
      await run("verify:verify", {
        address: contract.address,
        contract: contract.contract,
        constructorArguments: contract.constructorArguments,
      });
      
      console.log(`✅ ${contract.name} verified successfully!\n`);
    } catch (error) {
      if (error.message.includes("already verified")) {
        console.log(`✅ ${contract.name} is already verified!\n`);
      } else {
        console.error(`❌ Error verifying ${contract.name}:`, error.message, "\n");
      }
    }
  }

  console.log("\n📝 Verification Summary:");
  console.log("────────────────────────────────────────");
  for (const contract of contracts) {
    console.log(`${contract.name}: https://omscan.omplatform.com/address/${contract.address}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });