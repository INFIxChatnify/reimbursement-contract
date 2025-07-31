const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Configuration options
const CONFIG = {
  // Initial OMTHB mint (set to 0 to skip)
  INITIAL_MINT_AMOUNT: ethers.parseEther("1000000"), // 1 million OMTHB
  TREASURY_ADDRESS: "", // Set treasury address to receive initial mint
  
  // Deputies to add (leave empty to skip)
  DEPUTIES: [
    // "0x...", // Deputy 1
    // "0x...", // Deputy 2
  ],
  
  // Example project configuration (set CREATE_EXAMPLE_PROJECT to true to create)
  CREATE_EXAMPLE_PROJECT: false,
  EXAMPLE_PROJECT: {
    ID: "PROJ-2025-001",
    BUDGET: ethers.parseEther("100000"), // 100k OMTHB
    ADMIN: "" // Project admin address
  }
};

async function main() {
  console.log("==========================================");
  console.log("OM Platform Post-Deployment Configuration");
  console.log("==========================================\n");

  // Load deployment data
  const deploymentPath = path.join(__dirname, "..", "deployments", "om-platform-latest.json");
  
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ No deployment data found!");
    console.error("Please run the deployment script first.");
    process.exit(1);
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const [signer] = await ethers.getSigners();
  
  console.log("Configuration will be executed by:", signer.address);
  console.log("Admin wallet:", deployment.adminWallet);
  
  // Check if signer is admin
  if (signer.address.toLowerCase() !== deployment.adminWallet.toLowerCase()) {
    console.error("❌ Signer is not the admin wallet!");
    console.error("Please use the admin wallet private key in .env file");
    process.exit(1);
  }

  try {
    // 1. Initial OMTHB Mint
    if (CONFIG.INITIAL_MINT_AMOUNT > 0 && CONFIG.TREASURY_ADDRESS) {
      console.log("\n1. Minting initial OMTHB tokens...");
      console.log("   Amount:", ethers.formatEther(CONFIG.INITIAL_MINT_AMOUNT), "OMTHB");
      console.log("   To:", CONFIG.TREASURY_ADDRESS);
      
      const omthb = await ethers.getContractAt("OMTHBToken", deployment.contracts.OMTHBToken.proxy);
      
      // Check if signer has MINTER_ROLE
      const MINTER_ROLE = await omthb.MINTER_ROLE();
      const hasMinterRole = await omthb.hasRole(MINTER_ROLE, signer.address);
      
      if (!hasMinterRole) {
        console.error("❌ Signer does not have MINTER_ROLE!");
        console.log("   Skipping mint...");
      } else {
        const tx = await omthb.mint(CONFIG.TREASURY_ADDRESS, CONFIG.INITIAL_MINT_AMOUNT);
        console.log("   Transaction:", tx.hash);
        await tx.wait();
        console.log("✅ Minting complete!");
        
        // Check new balance
        const balance = await omthb.balanceOf(CONFIG.TREASURY_ADDRESS);
        console.log("   Treasury balance:", ethers.formatEther(balance), "OMTHB");
      }
    } else {
      console.log("\n1. Skipping initial OMTHB mint (not configured)");
    }

    // 2. Configure Deputies
    if (CONFIG.DEPUTIES.length > 0) {
      console.log("\n2. Adding deputies to ProjectFactory...");
      
      const factory = await ethers.getContractAt("ProjectFactory", deployment.contracts.ProjectFactory.address);
      
      for (const deputy of CONFIG.DEPUTIES) {
        console.log(`   Adding deputy: ${deputy}`);
        
        // Check if already a deputy
        const isDeputy = await factory.isDeputy(deputy);
        if (isDeputy) {
          console.log("   ⚠️  Already a deputy, skipping...");
          continue;
        }
        
        const tx = await factory.addDeputy(deputy);
        console.log("   Transaction:", tx.hash);
        await tx.wait();
        console.log("   ✅ Deputy added!");
      }
      
      // List all deputies
      const allDeputies = await factory.getDeputies();
      console.log("\n   Current deputies:");
      allDeputies.forEach((deputy, index) => {
        console.log(`   ${index + 1}. ${deputy}`);
      });
    } else {
      console.log("\n2. Skipping deputy configuration (none specified)");
    }

    // 3. Whitelist contracts in MetaTxForwarder
    console.log("\n3. Whitelisting contracts in MetaTxForwarder...");
    
    const forwarder = await ethers.getContractAt("MetaTxForwarder", deployment.contracts.MetaTxForwarder.address);
    
    // Check if ProjectFactory is whitelisted
    const isFactoryWhitelisted = await forwarder.whitelistedTargets(deployment.contracts.ProjectFactory.address);
    if (!isFactoryWhitelisted) {
      console.log("   Whitelisting ProjectFactory...");
      const tx = await forwarder.setTargetWhitelist(deployment.contracts.ProjectFactory.address, true);
      await tx.wait();
      console.log("   ✅ ProjectFactory whitelisted!");
    } else {
      console.log("   ✅ ProjectFactory already whitelisted");
    }

    // 4. Create Example Project
    if (CONFIG.CREATE_EXAMPLE_PROJECT && CONFIG.EXAMPLE_PROJECT.ADMIN) {
      console.log("\n4. Creating example project...");
      console.log("   Project ID:", CONFIG.EXAMPLE_PROJECT.ID);
      console.log("   Budget:", ethers.formatEther(CONFIG.EXAMPLE_PROJECT.BUDGET), "OMTHB");
      console.log("   Admin:", CONFIG.EXAMPLE_PROJECT.ADMIN);
      
      const factory = await ethers.getContractAt("ProjectFactory", deployment.contracts.ProjectFactory.address);
      
      // Check if signer has PROJECT_CREATOR_ROLE
      const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
      const hasCreatorRole = await factory.hasRole(PROJECT_CREATOR_ROLE, signer.address);
      
      if (!hasCreatorRole) {
        console.log("   Granting PROJECT_CREATOR_ROLE to admin...");
        const grantTx = await factory.grantRole(PROJECT_CREATOR_ROLE, signer.address);
        await grantTx.wait();
      }
      
      // Create project
      const tx = await factory.createProject(
        CONFIG.EXAMPLE_PROJECT.ID,
        CONFIG.EXAMPLE_PROJECT.BUDGET,
        CONFIG.EXAMPLE_PROJECT.ADMIN
      );
      console.log("   Transaction:", tx.hash);
      const receipt = await tx.wait();
      
      // Get project address from events
      const event = receipt.logs.find(log => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed.name === "ProjectCreated";
        } catch {
          return false;
        }
      });
      
      if (event) {
        const parsed = factory.interface.parseLog(event);
        const projectAddress = parsed.args.projectContract;
        console.log("✅ Project created at:", projectAddress);
        
        // Whitelist the new project in MetaTxForwarder
        console.log("   Whitelisting project in MetaTxForwarder...");
        const whitelistTx = await forwarder.setTargetWhitelist(projectAddress, true);
        await whitelistTx.wait();
        console.log("   ✅ Project whitelisted!");
        
        // Save project info
        const projectInfo = {
          projectId: CONFIG.EXAMPLE_PROJECT.ID,
          address: projectAddress,
          budget: CONFIG.EXAMPLE_PROJECT.BUDGET.toString(),
          admin: CONFIG.EXAMPLE_PROJECT.ADMIN,
          createdAt: new Date().toISOString()
        };
        
        const projectsDir = path.join(__dirname, "..", "deployments", "projects");
        if (!fs.existsSync(projectsDir)) {
          fs.mkdirSync(projectsDir, { recursive: true });
        }
        
        const projectFile = path.join(projectsDir, `${CONFIG.EXAMPLE_PROJECT.ID}.json`);
        fs.writeFileSync(projectFile, JSON.stringify(projectInfo, null, 2));
        console.log("   Project info saved to:", projectFile);
      }
    } else {
      console.log("\n4. Skipping example project creation (not configured)");
    }

    // 5. Fund contracts if needed
    console.log("\n5. Checking contract funding...");
    
    const omthb = await ethers.getContractAt("OMTHBToken", deployment.contracts.OMTHBToken.proxy);
    
    // Check if any project needs funding
    const factory = await ethers.getContractAt("ProjectFactory", deployment.contracts.ProjectFactory.address);
    const projects = await factory.getAllProjects();
    
    if (projects.length > 0) {
      console.log(`   Found ${projects.length} project(s)`);
      
      for (const projectId of projects) {
        const projectInfo = await factory.projects(projectId);
        const projectBalance = await omthb.balanceOf(projectInfo.projectContract);
        
        console.log(`   Project ${projectId}:`);
        console.log(`     Address: ${projectInfo.projectContract}`);
        console.log(`     Balance: ${ethers.formatEther(projectBalance)} OMTHB`);
        
        if (projectBalance === 0n) {
          console.log("     ⚠️  Project has no OMTHB balance");
        }
      }
    } else {
      console.log("   No projects found");
    }

    console.log("\n==========================================");
    console.log("Configuration Summary");
    console.log("==========================================");
    console.log("✅ Post-deployment configuration complete!");
    console.log("\nNext steps:");
    console.log("1. Fund project contracts with OMTHB tokens");
    console.log("2. Grant roles to operational users");
    console.log("3. Configure rate limits and security parameters");
    console.log("4. Set up monitoring and alerts");

  } catch (error) {
    console.error("\n❌ Configuration failed:", error);
    process.exit(1);
  }
}

// Execute configuration
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });