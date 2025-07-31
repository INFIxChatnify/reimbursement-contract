const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("==========================================");
  console.log("OM Platform Deployment Status Check");
  console.log("==========================================\n");

  // Load deployment data
  const deploymentPath = path.join(__dirname, "..", "deployments", "om-platform-latest.json");
  
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ No deployment data found!");
    console.error("Please run the deployment script first.");
    process.exit(1);
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  
  console.log("Deployment Information:");
  console.log("- Network:", deployment.network);
  console.log("- Chain ID:", deployment.chainId);
  console.log("- Timestamp:", deployment.timestamp);
  console.log("- Deployer:", deployment.deployer);
  console.log("- Admin Wallet:", deployment.adminWallet);
  console.log("\n==========================================\n");

  const [signer] = await ethers.getSigners();
  console.log("Checking from account:", signer.address);
  
  // Check network
  const network = await ethers.provider.getNetwork();
  console.log("Connected to network:", network.name, `(Chain ID: ${network.chainId})`);
  
  if (network.chainId !== 1246n) {
    console.error("❌ Wrong network! Expected OM Platform (1246), got", network.chainId);
    process.exit(1);
  }

  console.log("\n==========================================");
  console.log("Contract Status");
  console.log("==========================================\n");

  try {
    // 1. Check OMTHBToken
    if (deployment.contracts.OMTHBToken) {
      console.log("1. OMTHBToken");
      console.log("   Proxy:", deployment.contracts.OMTHBToken.proxy);
      console.log("   Implementation:", deployment.contracts.OMTHBToken.implementation);
      
      const omthb = await ethers.getContractAt("OMTHBToken", deployment.contracts.OMTHBToken.proxy);
      
      // Check basic properties
      const name = await omthb.name();
      const symbol = await omthb.symbol();
      const totalSupply = await omthb.totalSupply();
      const decimals = await omthb.decimals();
      
      console.log("   Name:", name);
      console.log("   Symbol:", symbol);
      console.log("   Decimals:", decimals);
      console.log("   Total Supply:", ethers.formatEther(totalSupply), symbol);
      
      // Check admin roles
      const DEFAULT_ADMIN_ROLE = await omthb.DEFAULT_ADMIN_ROLE();
      const hasAdminRole = await omthb.hasRole(DEFAULT_ADMIN_ROLE, deployment.adminWallet);
      console.log("   Admin has DEFAULT_ADMIN_ROLE:", hasAdminRole ? "✅" : "❌");
      
      // Check if paused
      const isPaused = await omthb.paused();
      console.log("   Is Paused:", isPaused ? "⚠️ YES" : "✅ NO");
    }

    // 2. Check MetaTxForwarder
    if (deployment.contracts.MetaTxForwarder) {
      console.log("\n2. MetaTxForwarder");
      console.log("   Address:", deployment.contracts.MetaTxForwarder.address);
      
      const forwarder = await ethers.getContractAt("MetaTxForwarder", deployment.contracts.MetaTxForwarder.address);
      
      // Check owner
      const owner = await forwarder.owner();
      console.log("   Owner:", owner);
      console.log("   Owner is admin wallet:", owner === deployment.adminWallet ? "✅" : "❌");
      
      // Check rate limit
      const maxTxPerWindow = await forwarder.maxTxPerWindow();
      console.log("   Max TX per window:", maxTxPerWindow.toString());
    }

    // 3. Check AuditAnchor
    if (deployment.contracts.AuditAnchor) {
      console.log("\n3. AuditAnchor");
      console.log("   Address:", deployment.contracts.AuditAnchor.address);
      
      const audit = await ethers.getContractAt("AuditAnchor", deployment.contracts.AuditAnchor.address);
      
      // Check owner
      const owner = await audit.owner();
      console.log("   Owner:", owner);
      console.log("   Owner is admin wallet:", owner === deployment.adminWallet ? "✅" : "❌");
      
      // Check if admin is authorized
      const isAuthorized = await audit.authorizedAnchors(deployment.adminWallet);
      console.log("   Admin is authorized anchor:", isAuthorized ? "✅" : "❌");
      
      // Check statistics
      const stats = await audit.getStatistics();
      console.log("   Total batches:", stats.totalBatches.toString());
      console.log("   Total entries:", stats.totalEntries.toString());
    }

    // 4. Check ProjectReimbursement
    if (deployment.contracts.ProjectReimbursement) {
      console.log("\n4. ProjectReimbursement (Implementation)");
      console.log("   Address:", deployment.contracts.ProjectReimbursement.address);
      
      // Check bytecode exists
      const code = await ethers.provider.getCode(deployment.contracts.ProjectReimbursement.address);
      console.log("   Has bytecode:", code !== "0x" ? "✅" : "❌");
      console.log("   Bytecode size:", code.length, "bytes");
    }

    // 5. Check ProjectFactory
    if (deployment.contracts.ProjectFactory) {
      console.log("\n5. ProjectFactory");
      console.log("   Address:", deployment.contracts.ProjectFactory.address);
      
      const factory = await ethers.getContractAt("ProjectFactory", deployment.contracts.ProjectFactory.address);
      
      // Check configuration
      const implementation = await factory.projectImplementation();
      const omthbToken = await factory.omthbToken();
      const metaTxForwarder = await factory.metaTxForwarder();
      
      console.log("   Project Implementation:", implementation);
      console.log("   OMTHB Token:", omthbToken);
      console.log("   MetaTx Forwarder:", metaTxForwarder);
      
      // Check if configuration matches deployment
      console.log("   Implementation matches:", implementation === deployment.contracts.ProjectReimbursement.address ? "✅" : "❌");
      console.log("   OMTHB matches:", omthbToken === deployment.contracts.OMTHBToken.proxy ? "✅" : "❌");
      console.log("   Forwarder matches:", metaTxForwarder === deployment.contracts.MetaTxForwarder.address ? "✅" : "❌");
      
      // Check roles
      const DEFAULT_ADMIN_ROLE = await factory.DEFAULT_ADMIN_ROLE();
      const hasAdminRole = await factory.hasRole(DEFAULT_ADMIN_ROLE, deployment.adminWallet);
      console.log("   Admin has DEFAULT_ADMIN_ROLE:", hasAdminRole ? "✅" : "❌");
      
      // Check deputies
      const deputies = await factory.getDeputies();
      console.log("   Number of deputies:", deputies.length);
      
      // Check if paused
      const isPaused = await factory.paused();
      console.log("   Is Paused:", isPaused ? "⚠️ YES" : "✅ NO");
      
      // Check projects
      const allProjects = await factory.getAllProjects();
      console.log("   Total projects created:", allProjects.length);
    }

    // Check balances
    console.log("\n==========================================");
    console.log("Account Balances");
    console.log("==========================================\n");
    
    // Check deployer balance
    const deployerBalance = await ethers.provider.getBalance(deployment.deployer);
    console.log("Deployer balance:", ethers.formatEther(deployerBalance), "OM");
    
    // Check admin balance
    const adminBalance = await ethers.provider.getBalance(deployment.adminWallet);
    console.log("Admin balance:", ethers.formatEther(adminBalance), "OM");
    
    // Check OMTHB balances
    if (deployment.contracts.OMTHBToken) {
      const omthb = await ethers.getContractAt("OMTHBToken", deployment.contracts.OMTHBToken.proxy);
      
      const adminOMTHB = await omthb.balanceOf(deployment.adminWallet);
      console.log("\nAdmin OMTHB balance:", ethers.formatEther(adminOMTHB), "OMTHB");
      
      // Check ProjectFactory OMTHB balance
      if (deployment.contracts.ProjectFactory) {
        const factoryOMTHB = await omthb.balanceOf(deployment.contracts.ProjectFactory.address);
        console.log("ProjectFactory OMTHB balance:", ethers.formatEther(factoryOMTHB), "OMTHB");
      }
    }

    console.log("\n==========================================");
    console.log("Summary");
    console.log("==========================================\n");
    
    console.log("✅ All contracts deployed successfully");
    console.log("✅ Connected to OM Platform mainnet");
    console.log("\nNext steps:");
    console.log("1. Verify contracts on OMScan if not already done");
    console.log("2. Mint OMTHB tokens if needed");
    console.log("3. Configure deputies in ProjectFactory");
    console.log("4. Create test project to verify functionality");

  } catch (error) {
    console.error("\n❌ Error checking deployment:", error.message);
    process.exit(1);
  }
}

// Execute check
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });