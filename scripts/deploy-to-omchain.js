const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

const ADMIN_ADDRESS = "0xeB42B3bF49091377627610A691EA1Eaf32bc6254";

async function main() {
  console.log("Starting deployment to OM Platform...");
  console.log("Admin Address:", ADMIN_ADDRESS);
  console.log("-".repeat(50));

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  console.log("-".repeat(50));

  const deploymentInfo = {};

  try {
    // 1. Deploy OMTHBToken (Upgradeable)
    console.log("\n1. Deploying OMTHBToken (Upgradeable)...");
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const omthbToken = await upgrades.deployProxy(
      OMTHBToken,
      [ADMIN_ADDRESS],
      { 
        initializer: "initialize",
        kind: "uups"
      }
    );
    await omthbToken.waitForDeployment();
    const omthbAddress = await omthbToken.getAddress();
    console.log("OMTHBToken deployed to:", omthbAddress);
    
    // Get implementation address
    const omthbImplAddress = await upgrades.erc1967.getImplementationAddress(omthbAddress);
    console.log("OMTHBToken implementation:", omthbImplAddress);
    
    deploymentInfo.OMTHBToken = {
      proxy: omthbAddress,
      implementation: omthbImplAddress
    };

    // 2. Deploy MetaTxForwarder
    console.log("\n2. Deploying MetaTxForwarder...");
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const metaTxForwarder = await MetaTxForwarder.deploy(ADMIN_ADDRESS);
    await metaTxForwarder.waitForDeployment();
    const forwarderAddress = await metaTxForwarder.getAddress();
    console.log("MetaTxForwarder deployed to:", forwarderAddress);
    deploymentInfo.MetaTxForwarder = forwarderAddress;

    // 3. Deploy AuditAnchor
    console.log("\n3. Deploying AuditAnchor...");
    const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
    const auditAnchor = await AuditAnchor.deploy();
    await auditAnchor.waitForDeployment();
    const auditAnchorAddress = await auditAnchor.getAddress();
    console.log("AuditAnchor deployed to:", auditAnchorAddress);
    deploymentInfo.AuditAnchor = auditAnchorAddress;

    // 4. Deploy ProjectReimbursement Implementation
    console.log("\n4. Deploying ProjectReimbursement Implementation...");
    const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
    const projectReimbursementImpl = await ProjectReimbursement.deploy();
    await projectReimbursementImpl.waitForDeployment();
    const implAddress = await projectReimbursementImpl.getAddress();
    console.log("ProjectReimbursement Implementation deployed to:", implAddress);
    deploymentInfo.ProjectReimbursementImplementation = implAddress;

    // 5. Deploy ProjectFactory
    console.log("\n5. Deploying ProjectFactory...");
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const projectFactory = await ProjectFactory.deploy(
      implAddress,
      omthbAddress,
      forwarderAddress,
      auditAnchorAddress
    );
    await projectFactory.waitForDeployment();
    const factoryAddress = await projectFactory.getAddress();
    console.log("ProjectFactory deployed to:", factoryAddress);
    deploymentInfo.ProjectFactory = factoryAddress;

    console.log("\n" + "=".repeat(50));
    console.log("SETTING UP ADMIN ROLES...");
    console.log("=".repeat(50));

    // Setup roles for OMTHBToken
    console.log("\nSetting up OMTHBToken roles...");
    const MINTER_ROLE = await omthbToken.MINTER_ROLE();
    const PAUSER_ROLE = await omthbToken.PAUSER_ROLE();
    const UPGRADER_ROLE = await omthbToken.UPGRADER_ROLE();
    
    // Grant roles to admin
    await omthbToken.grantRole(MINTER_ROLE, ADMIN_ADDRESS);
    console.log("- Granted MINTER_ROLE to", ADMIN_ADDRESS);
    
    await omthbToken.grantRole(PAUSER_ROLE, ADMIN_ADDRESS);
    console.log("- Granted PAUSER_ROLE to", ADMIN_ADDRESS);
    
    await omthbToken.grantRole(UPGRADER_ROLE, ADMIN_ADDRESS);
    console.log("- Granted UPGRADER_ROLE to", ADMIN_ADDRESS);

    // Setup factory role for ProjectFactory on OMTHBToken
    console.log("\nGranting FACTORY_ROLE to ProjectFactory...");
    const FACTORY_ROLE = await omthbToken.FACTORY_ROLE();
    await omthbToken.grantRole(FACTORY_ROLE, factoryAddress);
    console.log("- Granted FACTORY_ROLE to ProjectFactory:", factoryAddress);

    // Setup roles for ProjectFactory
    console.log("\nSetting up ProjectFactory roles...");
    const FACTORY_ADMIN_ROLE = await projectFactory.FACTORY_ADMIN_ROLE();
    await projectFactory.grantRole(FACTORY_ADMIN_ROLE, ADMIN_ADDRESS);
    console.log("- Granted FACTORY_ADMIN_ROLE to", ADMIN_ADDRESS);

    // Setup roles for AuditAnchor
    console.log("\nSetting up AuditAnchor roles...");
    const AUDITOR_ROLE = await auditAnchor.AUDITOR_ROLE();
    await auditAnchor.grantRole(AUDITOR_ROLE, ADMIN_ADDRESS);
    console.log("- Granted AUDITOR_ROLE to", ADMIN_ADDRESS);

    // Save deployment info
    const deploymentPath = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentPath)) {
      fs.mkdirSync(deploymentPath);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(deploymentPath, `omchain-deployment-${timestamp}.json`);
    
    const fullDeploymentInfo = {
      network: "omchain",
      chainId: 1246,
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      adminAddress: ADMIN_ADDRESS,
      contracts: deploymentInfo
    };
    
    fs.writeFileSync(filename, JSON.stringify(fullDeploymentInfo, null, 2));
    console.log("\nDeployment info saved to:", filename);

    // Also save latest deployment
    const latestPath = path.join(deploymentPath, "omchain-latest.json");
    fs.writeFileSync(latestPath, JSON.stringify(fullDeploymentInfo, null, 2));

    console.log("\n" + "=".repeat(50));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(50));
    console.log("\nDeployed Contracts:");
    console.log("- OMTHBToken Proxy:", omthbAddress);
    console.log("- OMTHBToken Implementation:", omthbImplAddress);
    console.log("- MetaTxForwarder:", forwarderAddress);
    console.log("- AuditAnchor:", auditAnchorAddress);
    console.log("- ProjectReimbursement Implementation:", implAddress);
    console.log("- ProjectFactory:", factoryAddress);
    console.log("\nAdmin Address:", ADMIN_ADDRESS);
    console.log("\nAll admin roles have been granted to:", ADMIN_ADDRESS);

    console.log("\n" + "=".repeat(50));
    console.log("VERIFICATION COMMANDS");
    console.log("=".repeat(50));
    console.log("\nRun these commands to verify contracts on OMScan:");
    console.log(`\n# OMTHBToken Implementation`);
    console.log(`npx hardhat verify --network omchain ${omthbImplAddress}`);
    console.log(`\n# MetaTxForwarder`);
    console.log(`npx hardhat verify --network omchain ${forwarderAddress} "${ADMIN_ADDRESS}"`);
    console.log(`\n# AuditAnchor`);
    console.log(`npx hardhat verify --network omchain ${auditAnchorAddress}`);
    console.log(`\n# ProjectReimbursement Implementation`);
    console.log(`npx hardhat verify --network omchain ${implAddress}`);
    console.log(`\n# ProjectFactory`);
    console.log(`npx hardhat verify --network omchain ${factoryAddress} "${implAddress}" "${omthbAddress}" "${forwarderAddress}" "${auditAnchorAddress}"`);

  } catch (error) {
    console.error("\nDeployment failed:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });