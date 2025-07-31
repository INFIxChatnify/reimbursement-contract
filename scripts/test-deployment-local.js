const { ethers, upgrades } = require("hardhat");

const ADMIN_ADDRESS = "0xeB42B3bF49091377627610A691EA1Eaf32bc6254";

async function main() {
  console.log("Testing deployment on local network...");
  console.log("Admin Address:", ADMIN_ADDRESS);
  console.log("-".repeat(50));

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  try {
    // Test deployment flow
    console.log("\n1. Testing OMTHBToken deployment...");
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const omthbToken = await upgrades.deployProxy(
      OMTHBToken,
      [deployer.address], // Use deployer for testing
      { 
        initializer: "initialize",
        kind: "uups"
      }
    );
    await omthbToken.waitForDeployment();
    console.log("✅ OMTHBToken deployed successfully");

    console.log("\n2. Testing MetaTxForwarder deployment...");
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const metaTxForwarder = await MetaTxForwarder.deploy(deployer.address);
    await metaTxForwarder.waitForDeployment();
    console.log("✅ MetaTxForwarder deployed successfully");

    console.log("\n3. Testing AuditAnchor deployment...");
    const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
    const auditAnchor = await AuditAnchor.deploy();
    await auditAnchor.waitForDeployment();
    console.log("✅ AuditAnchor deployed successfully");

    console.log("\n4. Testing ProjectReimbursement deployment...");
    const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
    const projectReimbursementImpl = await ProjectReimbursement.deploy();
    await projectReimbursementImpl.waitForDeployment();
    console.log("✅ ProjectReimbursement deployed successfully");

    console.log("\n5. Testing ProjectFactory deployment...");
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const projectFactory = await ProjectFactory.deploy(
      await projectReimbursementImpl.getAddress(),
      await omthbToken.getAddress(),
      await metaTxForwarder.getAddress(),
      await auditAnchor.getAddress()
    );
    await projectFactory.waitForDeployment();
    console.log("✅ ProjectFactory deployed successfully");

    console.log("\n" + "=".repeat(50));
    console.log("LOCAL DEPLOYMENT TEST SUCCESSFUL!");
    console.log("=".repeat(50));
    console.log("\nAll contracts deployed and initialized correctly.");
    console.log("Ready for mainnet deployment once account is funded.");

  } catch (error) {
    console.error("\n❌ Deployment test failed:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });