const { run } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting contract verification on OMScan...");
  
  // Load latest deployment info
  const deploymentPath = path.join(__dirname, "..", "deployments", "omchain-latest.json");
  
  if (!fs.existsSync(deploymentPath)) {
    console.error("No deployment info found. Please run deployment first.");
    process.exit(1);
  }
  
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const contracts = deploymentInfo.contracts;
  const adminAddress = deploymentInfo.adminAddress;
  
  console.log("Loaded deployment info from:", deploymentPath);
  console.log("-".repeat(50));

  const verificationTasks = [
    {
      name: "OMTHBToken Implementation",
      address: contracts.OMTHBToken.implementation,
      constructorArguments: []
    },
    {
      name: "MetaTxForwarder",
      address: contracts.MetaTxForwarder,
      constructorArguments: [adminAddress]
    },
    {
      name: "AuditAnchor",
      address: contracts.AuditAnchor,
      constructorArguments: []
    },
    {
      name: "ProjectReimbursement Implementation",
      address: contracts.ProjectReimbursementImplementation,
      constructorArguments: []
    },
    {
      name: "ProjectFactory",
      address: contracts.ProjectFactory,
      constructorArguments: [
        contracts.ProjectReimbursementImplementation,
        contracts.OMTHBToken.proxy,
        contracts.MetaTxForwarder,
        contracts.AuditAnchor
      ]
    }
  ];

  for (const task of verificationTasks) {
    console.log(`\nVerifying ${task.name} at ${task.address}...`);
    
    try {
      await run("verify:verify", {
        address: task.address,
        constructorArguments: task.constructorArguments,
        network: "omchain"
      });
      
      console.log(`✅ ${task.name} verified successfully!`);
      console.log(`View on OMScan: https://omscan.omplatform.com/address/${task.address}`);
    } catch (error) {
      if (error.message.includes("Already Verified")) {
        console.log(`✅ ${task.name} is already verified!`);
        console.log(`View on OMScan: https://omscan.omplatform.com/address/${task.address}`);
      } else {
        console.error(`❌ Failed to verify ${task.name}:`, error.message);
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("VERIFICATION SUMMARY");
  console.log("=".repeat(50));
  console.log("\nContract Links:");
  console.log(`- OMTHBToken Proxy: https://omscan.omplatform.com/address/${contracts.OMTHBToken.proxy}`);
  console.log(`- OMTHBToken Implementation: https://omscan.omplatform.com/address/${contracts.OMTHBToken.implementation}`);
  console.log(`- MetaTxForwarder: https://omscan.omplatform.com/address/${contracts.MetaTxForwarder}`);
  console.log(`- AuditAnchor: https://omscan.omplatform.com/address/${contracts.AuditAnchor}`);
  console.log(`- ProjectReimbursement Implementation: https://omscan.omplatform.com/address/${contracts.ProjectReimbursementImplementation}`);
  console.log(`- ProjectFactory: https://omscan.omplatform.com/address/${contracts.ProjectFactory}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });