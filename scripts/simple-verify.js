const hre = require("hardhat");

async function main() {
  console.log("Simple Contract Verification for OM Platform\n");
  
  // Contract 1: ProjectFactory
  console.log("1. Verifying ProjectFactory...");
  try {
    await hre.run("verify:verify", {
      address: "0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1",
      constructorArguments: [
        "0x1100ED4175BB828958396a708278D46146e1748b",
        "0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161",
        "0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347",
        "0xeB42B3bF49091377627610A691EA1Eaf32bc6254"
      ]
    });
    console.log("✅ ProjectFactory verified!");
  } catch (error) {
    console.log("❌ ProjectFactory verification failed:", error.message);
    
    // Print manual command
    console.log("\nTry manual command:");
    console.log(`npx hardhat verify --network omchain 0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1 "0x1100ED4175BB828958396a708278D46146e1748b" "0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161" "0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347" "0xeB42B3bF49091377627610A691EA1Eaf32bc6254"`);
  }
  
  console.log("\n" + "-".repeat(50) + "\n");
  
  // Contract 2: ProjectReimbursement
  console.log("2. Verifying ProjectReimbursement...");
  try {
    await hre.run("verify:verify", {
      address: "0x1100ED4175BB828958396a708278D46146e1748b",
      constructorArguments: []
    });
    console.log("✅ ProjectReimbursement verified!");
  } catch (error) {
    console.log("❌ ProjectReimbursement verification failed:", error.message);
    
    // Print manual command
    console.log("\nTry manual command:");
    console.log(`npx hardhat verify --network omchain 0x1100ED4175BB828958396a708278D46146e1748b`);
  }
  
  console.log("\n" + "=".repeat(50));
  console.log("Verification Links:");
  console.log("=".repeat(50));
  console.log("ProjectFactory: https://omscan.omplatform.com/address/0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1#code");
  console.log("ProjectReimbursement: https://omscan.omplatform.com/address/0x1100ED4175BB828958396a708278D46146e1748b#code");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });