const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🚀 Deploying Complete Gasless Transaction System\n");
    
    // Get deployer
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");
    
    // Contract addresses storage
    const deployments = {};
    
    try {
        // 1. Deploy OMTHB Token
        console.log("1️⃣  Deploying OMTHB Token...");
        const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
        const omthbToken = await upgrades.deployProxy(OMTHBToken, [deployer.address], {
            initializer: "initialize",
            kind: "uups"
        });
        await omthbToken.waitForDeployment();
        deployments.OMTHBToken = await omthbToken.getAddress();
        console.log("   ✅ OMTHB Token deployed at:", deployments.OMTHBToken);
        
        // 2. Deploy MetaTxForwarder
        console.log("\n2️⃣  Deploying MetaTxForwarder...");
        const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
        const metaTxForwarder = await MetaTxForwarder.deploy();
        await metaTxForwarder.waitForDeployment();
        deployments.MetaTxForwarder = await metaTxForwarder.getAddress();
        console.log("   ✅ MetaTxForwarder deployed at:", deployments.MetaTxForwarder);
        
        // 3. Deploy GasTank
        console.log("\n3️⃣  Deploying GasTank...");
        const GasTank = await ethers.getContractFactory("GasTank");
        const gasTank = await GasTank.deploy(deployer.address, deployer.address);
        await gasTank.waitForDeployment();
        deployments.GasTank = await gasTank.getAddress();
        console.log("   ✅ GasTank deployed at:", deployments.GasTank);
        
        // 4. Deploy TimelockController
        console.log("\n4️⃣  Deploying TimelockController...");
        const minDelay = 86400; // 1 day
        const proposers = [deployer.address];
        const executors = [deployer.address];
        const admin = deployer.address;
        
        const TimelockController = await ethers.getContractFactory("TimelockController");
        const timelockController = await TimelockController.deploy(
            minDelay,
            proposers,
            executors,
            admin
        );
        await timelockController.waitForDeployment();
        deployments.TimelockController = await timelockController.getAddress();
        console.log("   ✅ TimelockController deployed at:", deployments.TimelockController);
        
        // 5. Deploy AuditAnchor
        console.log("\n5️⃣  Deploying AuditAnchor...");
        const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
        const auditAnchor = await AuditAnchor.deploy();
        await auditAnchor.waitForDeployment();
        deployments.AuditAnchor = await auditAnchor.getAddress();
        console.log("   ✅ AuditAnchor deployed at:", deployments.AuditAnchor);
        
        // 6. Deploy ProjectReimbursement Implementation
        console.log("\n6️⃣  Deploying ProjectReimbursement Implementation...");
        const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
        const projectImpl = await ProjectReimbursement.deploy();
        await projectImpl.waitForDeployment();
        deployments.ProjectReimbursementImpl = await projectImpl.getAddress();
        console.log("   ✅ ProjectReimbursement implementation at:", deployments.ProjectReimbursementImpl);
        
        // 7. Deploy ProjectFactory
        console.log("\n7️⃣  Deploying ProjectFactory...");
        const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
        const projectFactory = await ProjectFactory.deploy(
            deployments.ProjectReimbursementImpl,
            deployments.OMTHBToken,
            deployments.MetaTxForwarder,
            deployer.address
        );
        await projectFactory.waitForDeployment();
        deployments.ProjectFactory = await projectFactory.getAddress();
        console.log("   ✅ ProjectFactory deployed at:", deployments.ProjectFactory);
        
        // Configuration Phase
        console.log("\n⚙️  Configuring contracts...\n");
        
        // Configure MetaTxForwarder
        console.log("   🔧 Configuring MetaTxForwarder...");
        await metaTxForwarder.setTargetWhitelist(deployments.ProjectFactory, true);
        await metaTxForwarder.setTargetWhitelist(deployments.OMTHBToken, true);
        console.log("   ✅ Whitelisted ProjectFactory and OMTHBToken");
        
        // Configure GasTank
        console.log("\n   🔧 Configuring GasTank...");
        // In production, set different relayer address
        await gasTank.grantRole(await gasTank.RELAYER_ROLE(), deployer.address);
        console.log("   ✅ Granted RELAYER_ROLE to deployer");
        
        // Fund GasTank
        const gasTankFunding = ethers.parseEther("1.0");
        await deployer.sendTransaction({
            to: deployments.GasTank,
            value: gasTankFunding
        });
        console.log(`   ✅ Funded GasTank with ${ethers.formatEther(gasTankFunding)} ETH`);
        
        // Configure ProjectFactory
        console.log("\n   🔧 Configuring ProjectFactory...");
        await projectFactory.grantRole(await projectFactory.PROJECT_CREATOR_ROLE(), deployer.address);
        console.log("   ✅ Granted PROJECT_CREATOR_ROLE to deployer");
        
        // Mint initial OMTHB supply
        console.log("\n   🔧 Minting initial OMTHB supply...");
        const initialSupply = ethers.parseEther("100000000"); // 100M OMTHB
        await omthbToken.mint(deployer.address, initialSupply);
        console.log(`   ✅ Minted ${ethers.formatEther(initialSupply)} OMTHB to deployer`);
        
        // Save deployment addresses
        const deploymentsPath = path.join(__dirname, "../deployments");
        if (!fs.existsSync(deploymentsPath)) {
            fs.mkdirSync(deploymentsPath);
        }
        
        const network = await ethers.provider.getNetwork();
        const filename = path.join(deploymentsPath, `${network.chainId}-gasless-deployments.json`);
        
        const deploymentData = {
            network: {
                name: network.name,
                chainId: network.chainId.toString()
            },
            deployedAt: new Date().toISOString(),
            deployer: deployer.address,
            contracts: deployments,
            configuration: {
                gasTankFunding: ethers.formatEther(gasTankFunding),
                initialOMTHBSupply: ethers.formatEther(initialSupply),
                timelockDelay: minDelay
            }
        };
        
        fs.writeFileSync(filename, JSON.stringify(deploymentData, null, 2));
        console.log(`\n📁 Deployment data saved to: ${filename}`);
        
        // Display summary
        console.log("\n" + "=".repeat(60));
        console.log("✨ DEPLOYMENT COMPLETE ✨");
        console.log("=".repeat(60));
        console.log("\nContract Addresses:");
        Object.entries(deployments).forEach(([name, address]) => {
            console.log(`  ${name}: ${address}`);
        });
        console.log("\nNext Steps:");
        console.log("1. Add deputies to ProjectFactory");
        console.log("2. Configure role assignments for projects");
        console.log("3. Set up relayer infrastructure");
        console.log("4. Deploy monitoring and analytics");
        console.log("=".repeat(60));
        
    } catch (error) {
        console.error("\n❌ Deployment failed:", error);
        throw error;
    }
}

// Execute deployment
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });