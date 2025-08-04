const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Configuration
const ADMIN_WALLET = "0xeB42B3bF49091377627610A691EA1Eaf32bc6254";
const DEPLOYMENT_CONFIG = {
  // Optimized gas limits for each contract type
  gasLimits: {
    proxy: 3000000,        // 3M for proxy deployment
    standard: 2000000,     // 2M for standard contracts
    implementation: 4000000, // 4M for implementation contracts
    transaction: 100000    // 100K for simple transactions
  },
  gasPrice: ethers.parseUnits("10", "gwei") // 10 Gwei
};

// Contract deployment order
const DEPLOYMENT_ORDER = [
  "OMTHBToken",
  "MetaTxForwarder", 
  "AuditAnchor",
  "ProjectReimbursement",
  "ProjectFactory"
];

async function main() {
  console.log("==========================================");
  console.log("OM Platform Smart Contract Deployment");
  console.log("==========================================");
  console.log(`Network: OM Platform Mainnet (Chain ID: 1246)`);
  console.log(`Admin Wallet: ${ADMIN_WALLET}`);
  console.log("==========================================\n");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  
  // Check deployer balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "OM\n");

  if (balance < ethers.parseEther("1")) {
    throw new Error("Insufficient balance for deployment. Need at least 1 OM token.");
  }

  // Deployment results storage
  const deploymentResults = {
    network: "omchain",
    chainId: 1246,
    deployer: deployer.address,
    adminWallet: ADMIN_WALLET,
    timestamp: new Date().toISOString(),
    contracts: {}
  };

  try {
    // 1. Deploy OMTHBToken (Upgradeable)
    console.log("1. Deploying OMTHBToken (Upgradeable)...");
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const omthbToken = await upgrades.deployProxy(
      OMTHBToken,
      [ADMIN_WALLET],
      { 
        initializer: "initialize",
        kind: "uups",
        gasLimit: DEPLOYMENT_CONFIG.gasLimits.proxy,
        gasPrice: DEPLOYMENT_CONFIG.gasPrice
      }
    );
    await omthbToken.waitForDeployment();
    const omthbTokenAddress = await omthbToken.getAddress();
    console.log("✅ OMTHBToken deployed to:", omthbTokenAddress);
    
    // Get implementation address
    const omthbImplementation = await upgrades.erc1967.getImplementationAddress(omthbTokenAddress);
    console.log("   Implementation:", omthbImplementation);
    
    deploymentResults.contracts.OMTHBToken = {
      proxy: omthbTokenAddress,
      implementation: omthbImplementation,
      type: "upgradeable"
    };

    // 2. Deploy MetaTxForwarder
    console.log("\n2. Deploying MetaTxForwarder...");
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const metaTxForwarder = await MetaTxForwarder.deploy({
      gasLimit: DEPLOYMENT_CONFIG.gasLimits.standard,
      gasPrice: DEPLOYMENT_CONFIG.gasPrice
    });
    await metaTxForwarder.waitForDeployment();
    const metaTxForwarderAddress = await metaTxForwarder.getAddress();
    console.log("✅ MetaTxForwarder deployed to:", metaTxForwarderAddress);
    
    deploymentResults.contracts.MetaTxForwarder = {
      address: metaTxForwarderAddress,
      type: "standard"
    };

    // 3. Deploy AuditAnchor
    console.log("\n3. Deploying AuditAnchor...");
    const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
    const auditAnchor = await AuditAnchor.deploy(ADMIN_WALLET, {
      gasLimit: DEPLOYMENT_CONFIG.gasLimits.standard,
      gasPrice: DEPLOYMENT_CONFIG.gasPrice
    });
    await auditAnchor.waitForDeployment();
    const auditAnchorAddress = await auditAnchor.getAddress();
    console.log("✅ AuditAnchor deployed to:", auditAnchorAddress);
    
    deploymentResults.contracts.AuditAnchor = {
      address: auditAnchorAddress,
      type: "standard"
    };

    // 4. Deploy ProjectReimbursement Implementation
    console.log("\n4. Deploying ProjectReimbursement Implementation...");
    const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
    const projectReimbursement = await ProjectReimbursement.deploy({
      gasLimit: DEPLOYMENT_CONFIG.gasLimits.implementation,
      gasPrice: DEPLOYMENT_CONFIG.gasPrice
    });
    await projectReimbursement.waitForDeployment();
    const projectReimbursementAddress = await projectReimbursement.getAddress();
    console.log("✅ ProjectReimbursement deployed to:", projectReimbursementAddress);
    
    deploymentResults.contracts.ProjectReimbursement = {
      address: projectReimbursementAddress,
      type: "implementation"
    };

    // 5. Deploy ProjectFactory
    console.log("\n5. Deploying ProjectFactory...");
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const projectFactory = await ProjectFactory.deploy(
      projectReimbursementAddress,
      omthbTokenAddress,
      metaTxForwarderAddress,
      ADMIN_WALLET,
      {
        gasLimit: DEPLOYMENT_CONFIG.gasLimits.standard,
        gasPrice: DEPLOYMENT_CONFIG.gasPrice
      }
    );
    await projectFactory.waitForDeployment();
    const projectFactoryAddress = await projectFactory.getAddress();
    console.log("✅ ProjectFactory deployed to:", projectFactoryAddress);
    
    deploymentResults.contracts.ProjectFactory = {
      address: projectFactoryAddress,
      type: "standard"
    };

    // 6. Configure Contracts
    console.log("\n==========================================");
    console.log("Configuring Contracts...");
    console.log("==========================================\n");

    // Transfer ownership of OMTHBToken to admin wallet
    console.log("Transferring OMTHBToken admin roles to:", ADMIN_WALLET);
    const omthbContract = await ethers.getContractAt("OMTHBToken", omthbTokenAddress);
    
    // Grant all roles to admin wallet
    const roles = [
      await omthbContract.DEFAULT_ADMIN_ROLE(),
      await omthbContract.MINTER_ROLE(),
      await omthbContract.PAUSER_ROLE(),
      await omthbContract.BLACKLISTER_ROLE(),
      await omthbContract.UPGRADER_ROLE()
    ];
    
    for (const role of roles) {
      if (deployer.address !== ADMIN_WALLET) {
        const hasRole = await omthbContract.hasRole(role, ADMIN_WALLET);
        if (!hasRole) {
          console.log(`  Granting role ${role} to admin...`);
          const tx = await omthbContract.grantRole(role, ADMIN_WALLET, {
            gasLimit: DEPLOYMENT_CONFIG.gasLimits.transaction,
            gasPrice: DEPLOYMENT_CONFIG.gasPrice
          });
          await tx.wait();
        }
      }
    }
    console.log("✅ OMTHBToken roles configured");

    // Transfer ownership of MetaTxForwarder
    console.log("\nTransferring MetaTxForwarder ownership to:", ADMIN_WALLET);
    const metaTxContract = await ethers.getContractAt("MetaTxForwarder", metaTxForwarderAddress);
    if (deployer.address !== ADMIN_WALLET) {
      const tx = await metaTxContract.transferOwnership(ADMIN_WALLET, {
        gasLimit: DEPLOYMENT_CONFIG.gasLimits.transaction,
        gasPrice: DEPLOYMENT_CONFIG.gasPrice
      });
      await tx.wait();
      console.log("✅ MetaTxForwarder ownership transferred");
    }

    // Authorize admin wallet on AuditAnchor
    console.log("\nAuthorizing admin on AuditAnchor...");
    const auditContract = await ethers.getContractAt("AuditAnchor", auditAnchorAddress);
    const authTx = await auditContract.authorizeAnchor(ADMIN_WALLET, true, {
      gasLimit: DEPLOYMENT_CONFIG.gasLimits.transaction,
      gasPrice: DEPLOYMENT_CONFIG.gasPrice
    });
    await authTx.wait();
    
    // Transfer ownership
    if (deployer.address !== ADMIN_WALLET) {
      const tx = await auditContract.transferOwnership(ADMIN_WALLET, {
        gasLimit: DEPLOYMENT_CONFIG.gasLimits.transaction,
        gasPrice: DEPLOYMENT_CONFIG.gasPrice
      });
      await tx.wait();
      console.log("✅ AuditAnchor configured");
    }

    // Grant roles on ProjectFactory
    console.log("\nConfiguring ProjectFactory roles...");
    const factoryContract = await ethers.getContractAt("ProjectFactory", projectFactoryAddress);
    if (deployer.address !== ADMIN_WALLET) {
      // Grant all necessary roles to admin
      const factoryRoles = [
        await factoryContract.DEFAULT_ADMIN_ROLE(),
        await factoryContract.PROJECT_CREATOR_ROLE(),
        await factoryContract.DIRECTOR_ROLE(),
        await factoryContract.PAUSER_ROLE()
      ];
      
      for (const role of factoryRoles) {
        const hasRole = await factoryContract.hasRole(role, ADMIN_WALLET);
        if (!hasRole) {
          console.log(`  Granting factory role ${role} to admin...`);
          const tx = await factoryContract.grantRole(role, ADMIN_WALLET, {
            gasLimit: DEPLOYMENT_CONFIG.gasLimits.transaction,
            gasPrice: DEPLOYMENT_CONFIG.gasPrice
          });
          await tx.wait();
        }
      }
    }
    console.log("✅ ProjectFactory roles configured");

    // Whitelist contracts in MetaTxForwarder
    console.log("\nWhitelisting contracts in MetaTxForwarder...");
    const contractsToWhitelist = [
      projectFactoryAddress,
      // Note: Individual project contracts will be whitelisted when created
    ];
    
    for (const contractAddr of contractsToWhitelist) {
      console.log(`  Whitelisting ${contractAddr}...`);
      const tx = await metaTxContract.setTargetWhitelist(contractAddr, true, {
        gasLimit: DEPLOYMENT_CONFIG.gasLimits.transaction,
        gasPrice: DEPLOYMENT_CONFIG.gasPrice
      });
      await tx.wait();
    }
    console.log("✅ Contract whitelisting complete");

    // Save deployment results
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir);
    }
    
    const filename = `om-platform-${Date.now()}.json`;
    const filepath = path.join(deploymentsDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(deploymentResults, null, 2));
    
    // Also save as latest
    const latestPath = path.join(deploymentsDir, "om-platform-latest.json");
    fs.writeFileSync(latestPath, JSON.stringify(deploymentResults, null, 2));

    console.log("\n==========================================");
    console.log("Deployment Summary");
    console.log("==========================================");
    console.log("OMTHBToken (Proxy):", omthbTokenAddress);
    console.log("OMTHBToken (Implementation):", omthbImplementation);
    console.log("MetaTxForwarder:", metaTxForwarderAddress);
    console.log("AuditAnchor:", auditAnchorAddress);
    console.log("ProjectReimbursement:", projectReimbursementAddress);
    console.log("ProjectFactory:", projectFactoryAddress);
    console.log("\nAdmin Wallet:", ADMIN_WALLET);
    console.log("\nDeployment data saved to:");
    console.log(" -", filepath);
    console.log(" -", latestPath);
    console.log("==========================================\n");

    console.log("✅ Deployment completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Run verification script: npx hardhat run scripts/verify-om-platform.js --network omchain");
    console.log("2. Mint initial OMTHB tokens to treasury addresses");
    console.log("3. Configure additional deputies in ProjectFactory");
    console.log("4. Create first projects using ProjectFactory");

  } catch (error) {
    console.error("\n❌ Deployment failed:", error);
    
    // Save partial results if any
    if (Object.keys(deploymentResults.contracts).length > 0) {
      const errorFilepath = path.join(__dirname, "..", "deployments", `om-platform-error-${Date.now()}.json`);
      deploymentResults.error = error.message;
      fs.writeFileSync(errorFilepath, JSON.stringify(deploymentResults, null, 2));
      console.log("\nPartial deployment data saved to:", errorFilepath);
    }
    
    process.exit(1);
  }
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });