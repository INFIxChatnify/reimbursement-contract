const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");

// Color codes for console output
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m"
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

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

function logWarning(message) {
    console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

function logError(message) {
    console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function formatAddress(address, label) {
    return `${label}: ${colors.yellow}${address}${colors.reset}`;
}

function formatOMTHB(amount) {
    return `${colors.green}${ethers.formatEther(amount)} OMTHB${colors.reset}`;
}

async function main() {
    logSection("REIMBURSEMENT SYSTEM DEPLOYMENT & SIMULATION");
    
    // Get signers
    const signers = await ethers.getSigners();
    const [admin, secretary, committee1, committee2, committee3, finance, director, requester1, requester2, requester3, requester4, requester5, recipient1, recipient2, recipient3, recipient4, recipient5, deputy1, deputy2] = signers;
    
    logInfo("Retrieved signers:");
    console.log(formatAddress(admin.address, "Admin"));
    console.log(formatAddress(secretary.address, "Secretary"));
    console.log(formatAddress(committee1.address, "Committee 1"));
    console.log(formatAddress(committee2.address, "Committee 2"));
    console.log(formatAddress(committee3.address, "Committee 3"));
    console.log(formatAddress(finance.address, "Finance"));
    console.log(formatAddress(director.address, "Director"));
    console.log(formatAddress(deputy1.address, "Deputy 1"));
    console.log(formatAddress(deputy2.address, "Deputy 2"));
    console.log("");
    
    // 1. Deploy OMTHB Token
    logSection("1. DEPLOYING OMTHB TOKEN");
    
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const omthbToken = await upgrades.deployProxy(OMTHBToken, [admin.address], {
        initializer: 'initialize',
        kind: 'uups'
    });
    await omthbToken.waitForDeployment();
    const omthbAddress = await omthbToken.getAddress();
    
    logSuccess(`OMTHB Token deployed at: ${colors.yellow}${omthbAddress}${colors.reset}`);
    
    // 2. Deploy Project Implementation
    logSection("2. DEPLOYING PROJECT IMPLEMENTATION");
    
    const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
    const projectImplementation = await ProjectReimbursement.deploy();
    await projectImplementation.waitForDeployment();
    const implementationAddress = await projectImplementation.getAddress();
    
    logSuccess(`Project Implementation deployed at: ${colors.yellow}${implementationAddress}${colors.reset}`);
    
    // 3. Deploy MetaTxForwarder (simple version for simulation)
    logSection("3. DEPLOYING META TX FORWARDER");
    
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const metaTxForwarder = await MetaTxForwarder.deploy();
    await metaTxForwarder.waitForDeployment();
    const forwarderAddress = await metaTxForwarder.getAddress();
    
    logSuccess(`MetaTxForwarder deployed at: ${colors.yellow}${forwarderAddress}${colors.reset}`);
    
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
    
    logSuccess(`Project Factory deployed at: ${colors.yellow}${factoryAddress}${colors.reset}`);
    
    // 5. Setup Factory Roles
    logSection("5. SETTING UP FACTORY ROLES");
    
    // Grant project creator role to admin
    const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
    await factory.connect(admin).grantRole(PROJECT_CREATOR_ROLE, admin.address);
    logSuccess("Granted PROJECT_CREATOR_ROLE to admin");
    
    // Add deputies
    await factory.connect(admin).addDeputy(deputy1.address);
    logSuccess("Added deputy1");
    await factory.connect(admin).addDeputy(deputy2.address);
    logSuccess("Added deputy2");
    
    // Grant director role
    const DIRECTOR_ROLE_FACTORY = await factory.DIRECTOR_ROLE();
    await factory.connect(admin).grantRole(DIRECTOR_ROLE_FACTORY, director.address);
    logSuccess("Granted DIRECTOR_ROLE to director in factory");
    
    // 6. Mint OMTHB Tokens
    logSection("6. MINTING OMTHB TOKENS");
    
    const projectBudget = ethers.parseEther("1000000"); // 1M OMTHB
    const totalMint = ethers.parseEther("2000000"); // 2M OMTHB (extra for testing)
    
    await omthbToken.connect(admin).mint(admin.address, totalMint);
    logSuccess(`Minted ${formatOMTHB(totalMint)} to admin`);
    
    const adminBalance = await omthbToken.balanceOf(admin.address);
    logInfo(`Admin balance: ${formatOMTHB(adminBalance)}`);
    
    // 7. Create Project
    logSection("7. CREATING PROJECT FROM FACTORY");
    
    const projectId = "PROJ-2025-001";
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
    logSuccess(`Project created with ID: ${colors.yellow}${projectId}${colors.reset}`);
    logSuccess(`Project contract deployed at: ${colors.yellow}${projectAddress}${colors.reset}`);
    
    // 8. Fund Project Treasury
    logSection("8. FUNDING PROJECT TREASURY");
    
    await omthbToken.connect(admin).transfer(projectAddress, projectBudget);
    logSuccess(`Transferred ${formatOMTHB(projectBudget)} to project treasury`);
    
    const projectBalance = await omthbToken.balanceOf(projectAddress);
    logInfo(`Project treasury balance: ${formatOMTHB(projectBalance)}`);
    
    // Get project contract instance
    const project = await ethers.getContractAt("ProjectReimbursement", projectAddress);
    
    // 9. Setup Project Roles
    logSection("9. SETTING UP PROJECT ROLES");
    
    const SECRETARY_ROLE = await project.SECRETARY_ROLE();
    const COMMITTEE_ROLE = await project.COMMITTEE_ROLE();
    const FINANCE_ROLE = await project.FINANCE_ROLE();
    const DIRECTOR_ROLE = await project.DIRECTOR_ROLE();
    const REQUESTER_ROLE = await project.REQUESTER_ROLE();
    
    // Grant roles
    await project.connect(admin).grantRole(SECRETARY_ROLE, secretary.address);
    logSuccess("Granted SECRETARY_ROLE to secretary");
    
    await project.connect(admin).grantRole(COMMITTEE_ROLE, committee1.address);
    logSuccess("Granted COMMITTEE_ROLE to committee1");
    
    await project.connect(admin).grantRole(COMMITTEE_ROLE, committee2.address);
    logSuccess("Granted COMMITTEE_ROLE to committee2");
    
    await project.connect(admin).grantRole(COMMITTEE_ROLE, committee3.address);
    logSuccess("Granted COMMITTEE_ROLE to committee3");
    
    await project.connect(admin).grantRole(FINANCE_ROLE, finance.address);
    logSuccess("Granted FINANCE_ROLE to finance");
    
    await project.connect(admin).grantRole(DIRECTOR_ROLE, director.address);
    logSuccess("Granted DIRECTOR_ROLE to director");
    
    // Grant requester roles
    const requesters = [requester1, requester2, requester3, requester4, requester5];
    for (let i = 0; i < requesters.length; i++) {
        await project.connect(admin).grantRole(REQUESTER_ROLE, requesters[i].address);
        logSuccess(`Granted REQUESTER_ROLE to requester${i + 1}`);
    }
    
    // Save deployment info for simulation script
    const deploymentInfo = {
        omthbToken: omthbAddress,
        factory: factoryAddress,
        project: projectAddress,
        projectId: projectId,
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
            requesters: requesters.map(r => r.address),
            recipients: [recipient1.address, recipient2.address, recipient3.address, recipient4.address, recipient5.address]
        }
    };
    
    // Write deployment info to file
    const fs = require('fs');
    fs.writeFileSync('./deployment-info.json', JSON.stringify(deploymentInfo, null, 2));
    
    logSection("DEPLOYMENT COMPLETE");
    logInfo("Deployment information saved to deployment-info.json");
    logInfo("Ready to run simulation script");
    
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
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        logError(error);
        process.exit(1);
    });