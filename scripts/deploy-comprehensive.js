const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

// Color codes for console output
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m"
};

function logSection(title) {
    console.log("");
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    console.log("");
}

function logSuccess(message) {
    console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function logInfo(message) {
    console.log(`${colors.blue}ℹ ${message}${colors.reset}`);
}

function formatAddress(address, label) {
    return `${label}: ${colors.yellow}${address}${colors.reset}`;
}

function formatOMTHB(amount) {
    return `${colors.green}${ethers.formatEther(amount)} OMTHB${colors.reset}`;
}

async function main() {
    logSection("COMPREHENSIVE REIMBURSEMENT SYSTEM DEPLOYMENT");
    
    // Get all signers we need
    const signers = await ethers.getSigners();
    const [
        admin, 
        secretary, 
        committee1, 
        committee2, 
        committee3, 
        finance, 
        director, 
        requester1, 
        requester2,
        recipient1,
        recipient2,
        deputy1, 
        deputy2,
        treasuryReturn
    ] = signers;
    
    logInfo("Using signers:");
    console.log(formatAddress(admin.address, "Admin"));
    console.log(formatAddress(secretary.address, "Secretary"));
    console.log(formatAddress(committee1.address, "Committee 1"));
    console.log(formatAddress(committee2.address, "Committee 2"));
    console.log(formatAddress(committee3.address, "Committee 3"));
    console.log(formatAddress(finance.address, "Finance"));
    console.log(formatAddress(director.address, "Director"));
    console.log(formatAddress(deputy1.address, "Deputy 1"));
    console.log(formatAddress(deputy2.address, "Deputy 2"));
    console.log(formatAddress(requester1.address, "Requester 1"));
    console.log(formatAddress(requester2.address, "Requester 2"));
    console.log(formatAddress(treasuryReturn.address, "Treasury Return"));
    
    // 1. Deploy OMTHB Token
    logSection("1. DEPLOYING OMTHB TOKEN");
    
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const omthbToken = await upgrades.deployProxy(OMTHBToken, [admin.address], {
        initializer: 'initialize',
        kind: 'uups'
    });
    await omthbToken.waitForDeployment();
    const omthbAddress = await omthbToken.getAddress();
    
    logSuccess(`OMTHB Token deployed at: ${omthbAddress}`);
    
    // 2. Deploy Project Implementation
    logSection("2. DEPLOYING PROJECT IMPLEMENTATION");
    
    const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
    const projectImplementation = await ProjectReimbursement.deploy();
    await projectImplementation.waitForDeployment();
    const implementationAddress = await projectImplementation.getAddress();
    
    logSuccess(`Project Implementation deployed at: ${implementationAddress}`);
    
    // 3. Deploy MetaTxForwarder
    logSection("3. DEPLOYING META TX FORWARDER");
    
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const metaTxForwarder = await MetaTxForwarder.deploy();
    await metaTxForwarder.waitForDeployment();
    const forwarderAddress = await metaTxForwarder.getAddress();
    
    logSuccess(`MetaTxForwarder deployed at: ${forwarderAddress}`);
    
    // 4. Deploy Factory
    logSection("4. DEPLOYING PROJECT FACTORY");
    
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const factory = await ProjectFactory.deploy(
        implementationAddress,
        omthbAddress,
        forwarderAddress,
        admin.address
    );
    await factory.waitForDeployment();
    const factoryAddress = await factory.getAddress();
    
    logSuccess(`Project Factory deployed at: ${factoryAddress}`);
    
    // 5. Setup Factory Roles
    logSection("5. SETTING UP FACTORY ROLES");
    
    const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
    await factory.connect(admin).grantRole(PROJECT_CREATOR_ROLE, admin.address);
    logSuccess("Granted PROJECT_CREATOR_ROLE to admin");
    
    // Add deputies
    await factory.connect(admin).addDeputy(deputy1.address);
    logSuccess("Added deputy1 to factory");
    await factory.connect(admin).addDeputy(deputy2.address);
    logSuccess("Added deputy2 to factory");
    
    // Grant director role in factory
    const DIRECTOR_ROLE_FACTORY = await factory.DIRECTOR_ROLE();
    await factory.connect(admin).grantRole(DIRECTOR_ROLE_FACTORY, director.address);
    logSuccess("Granted DIRECTOR_ROLE to director in factory");
    
    // 6. Mint OMTHB Tokens
    logSection("6. MINTING OMTHB TOKENS");
    
    const projectBudget = ethers.parseEther("1000000"); // 1M OMTHB
    const totalMint = ethers.parseEther("2000000"); // 2M OMTHB
    
    await omthbToken.connect(admin).mint(admin.address, totalMint);
    logSuccess(`Minted ${formatOMTHB(totalMint)} to admin`);
    
    // 7. Create Project
    logSection("7. CREATING PROJECT");
    
    const projectId = "RESEARCH-2025-001";
    const tx = await factory.connect(admin).createProject(projectId, projectBudget, admin.address);
    const receipt = await tx.wait();
    
    // Get project address from events
    const projectCreatedEvent = receipt.logs.find(log => {
        try {
            const parsed = factory.interface.parseLog(log);
            return parsed && parsed.name === 'ProjectCreated';
        } catch (e) {
            return false;
        }
    });
    
    const projectAddress = projectCreatedEvent.args.projectContract;
    logSuccess(`Project created: ${projectId}`);
    logSuccess(`Project contract: ${projectAddress}`);
    
    // 8. Fund Project Treasury
    logSection("8. FUNDING PROJECT TREASURY");
    
    await omthbToken.connect(admin).transfer(projectAddress, projectBudget);
    logSuccess(`Transferred ${formatOMTHB(projectBudget)} to project treasury`);
    
    const projectBalance = await omthbToken.balanceOf(projectAddress);
    logInfo(`Project treasury balance: ${formatOMTHB(projectBalance)}`);
    
    // Get project contract instance
    const project = await ethers.getContractAt("ProjectReimbursement", projectAddress);
    
    // 9. Setup Project Roles with Direct Assignment
    logSection("9. SETTING UP PROJECT ROLES");
    
    // Since the contract uses commit-reveal for role management and grantRole is overridden,
    // we need to deploy a modified version or use a different approach for testing
    
    // For this comprehensive simulation, let's create a helper contract that can assign roles
    const RoleHelper = await ethers.getContractFactory("contracts/test/TestCounter.sol:TestCounter");
    
    logInfo("Note: In production, roles would be assigned using commit-reveal pattern");
    logInfo("For simulation, we'll use a simplified approach");
    
    // Get role constants
    const SECRETARY_ROLE = await project.SECRETARY_ROLE();
    const COMMITTEE_ROLE = await project.COMMITTEE_ROLE();
    const FINANCE_ROLE = await project.FINANCE_ROLE();
    const DIRECTOR_ROLE = await project.DIRECTOR_ROLE();
    const REQUESTER_ROLE = await project.REQUESTER_ROLE();
    
    // Store role hashes for reference
    const roles = {
        SECRETARY_ROLE,
        COMMITTEE_ROLE,
        FINANCE_ROLE,
        DIRECTOR_ROLE,
        REQUESTER_ROLE
    };
    
    // Save deployment info
    const deploymentInfo = {
        omthbToken: omthbAddress,
        factory: factoryAddress,
        project: projectAddress,
        projectId: projectId,
        implementation: implementationAddress,
        forwarder: forwarderAddress,
        projectBudget: projectBudget.toString(),
        roles: {
            admin: admin.address,
            secretary: secretary.address,
            committee1: committee1.address,
            committee2: committee2.address,
            committee3: committee3.address,
            finance: finance.address,
            director: director.address,
            deputy1: deputy1.address,
            deputy2: deputy2.address,
            requester1: requester1.address,
            requester2: requester2.address,
            recipient1: recipient1.address,
            recipient2: recipient2.address,
            treasuryReturn: treasuryReturn.address
        },
        roleHashes: roles
    };
    
    // Write deployment info to file
    fs.writeFileSync('./comprehensive-deployment.json', JSON.stringify(deploymentInfo, null, 2));
    
    logSection("DEPLOYMENT COMPLETE");
    logInfo("Deployment information saved to comprehensive-deployment.json");
    logInfo("Ready to run comprehensive simulation");
    
    // Display summary
    console.log("");
    console.log(colors.bright + "Deployment Summary:" + colors.reset);
    console.log("━".repeat(50));
    console.log(`OMTHB Token: ${colors.yellow}${omthbAddress}${colors.reset}`);
    console.log(`Factory: ${colors.yellow}${factoryAddress}${colors.reset}`);
    console.log(`Project: ${colors.yellow}${projectAddress}${colors.reset}`);
    console.log(`Project ID: ${colors.yellow}${projectId}${colors.reset}`);
    console.log(`Treasury Balance: ${formatOMTHB(projectBalance)}`);
    console.log("━".repeat(50));
    
    logInfo("");
    logInfo("Next steps:");
    logInfo("1. Run the role assignment script to set up project roles");
    logInfo("2. Run the comprehensive simulation to see the full workflow");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });