const { run } = require("hardhat");

async function main() {
  console.log("🔍 Starting contract verification on OMScan...\n");

  const contracts = [
    {
      name: "OMTHBToken",
      address: "0x2AEa4cd271eabAfea140fF8fDEaC012a7A2f4CF4",
      constructorArguments: []
    },
    {
      name: "MinimalForwarder", 
      address: "0x12004Caa99D80512f61e9d4ACB61C024370C0eFF",
      constructorArguments: []
    }
  ];

  for (const contract of contracts) {
    console.log(`Verifying ${contract.name} at ${contract.address}...`);
    
    try {
      await run("verify:verify", {
        address: contract.address,
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