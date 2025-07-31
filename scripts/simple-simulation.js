const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

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
    cyan: "\x1b[36m",
    white: "\x1b[37m"
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

function logSubSection(title) {
    console.log("");
    console.log(`${colors.bright}${colors.yellow}${'-'.repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}${colors.yellow}${title}${colors.reset}`);
    console.log(`${colors.bright}${colors.yellow}${'-'.repeat(60)}${colors.reset}`);
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

function formatStatus(status) {
    const statusNames = [
        "Pending",
        "SecretaryApproved",
        "CommitteeApproved",
        "FinanceApproved",
        "DirectorApproved",
        "Distributed",
        "Cancelled"
    ];
    return `${colors.magenta}${statusNames[status]}${colors.reset}`;
}

function formatClosureStatus(status) {
    const statusNames = [
        "None",
        "Initiated",
        "PartiallyApproved",
        "FullyApproved",
        "Executed",
        "Cancelled"
    ];
    return `${colors.magenta}${statusNames[status]}${colors.reset}`;
}

// Sleep function for visual effect
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    try {
        logSection("SIMPLE REIMBURSEMENT SYSTEM SIMULATION");
        logInfo("This simulation demonstrates the complete workflow without commit-reveal complexity");
        
        // Get all signers
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
        
        // Deploy contracts
        logSection("DEPLOYING CONTRACTS");
        
        // Deploy OMTHB Token
        logSubSection("Deploying OMTHB Token");
        const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
        const omthbToken = await upgrades.deployProxy(OMTHBToken, [admin.address], {
            initializer: 'initialize',
            kind: 'uups'
        });
        await omthbToken.waitForDeployment();
        const omthbAddress = await omthbToken.getAddress();
        logSuccess(`OMTHB Token deployed at: ${omthbAddress}`);
        
        // Deploy SimulationHelper (instead of ProjectReimbursement)
        logSubSection("Deploying SimulationHelper");
        const SimulationHelper = await ethers.getContractFactory("SimulationHelper");
        const projectImplementation = await SimulationHelper.deploy();
        await projectImplementation.waitForDeployment();
        const implementationAddress = await projectImplementation.getAddress();
        logSuccess(`SimulationHelper deployed at: ${implementationAddress}`);
        
        // Deploy MetaTxForwarder
        const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
        const metaTxForwarder = await MetaTxForwarder.deploy();
        await metaTxForwarder.waitForDeployment();
        const forwarderAddress = await metaTxForwarder.getAddress();
        
        // Deploy Factory
        logSubSection("Deploying Project Factory");
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
        
        // Setup factory roles
        const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
        await factory.connect(admin).grantRole(PROJECT_CREATOR_ROLE, admin.address);
        
        // Mint tokens
        const projectBudget = ethers.parseEther("1000000"); // 1M OMTHB
        await omthbToken.connect(admin).mint(admin.address, projectBudget);
        logSuccess(`Minted ${formatOMTHB(projectBudget)} to admin`);
        
        // Create project
        logSubSection("Creating Project");
        const projectId = "RESEARCH-2025-DEMO";
        const createTx = await factory.connect(admin).createProject(projectId, projectBudget, admin.address);
        const createReceipt = await createTx.wait();
        
        const projectCreatedEvent = createReceipt.logs.find(log => {
            try {
                const parsed = factory.interface.parseLog(log);
                return parsed && parsed.name === 'ProjectCreated';
            } catch (e) {
                return false;
            }
        });
        
        const projectAddress = projectCreatedEvent.args.projectContract;
        logSuccess(`Project created: ${projectId} at ${projectAddress}`);
        
        // Fund project
        await omthbToken.connect(admin).transfer(projectAddress, projectBudget);
        logSuccess(`Funded project with ${formatOMTHB(projectBudget)}`);
        
        // Get project contract instance (as SimulationHelper)
        const project = await ethers.getContractAt("SimulationHelper", projectAddress);
        
        // Setup roles using direct grant
        logSection("SETTING UP ROLES");
        logInfo("Using direct role assignment for simulation");
        
        const SECRETARY_ROLE = await project.SECRETARY_ROLE();
        const COMMITTEE_ROLE = await project.COMMITTEE_ROLE();
        const FINANCE_ROLE = await project.FINANCE_ROLE();
        const DIRECTOR_ROLE = await project.DIRECTOR_ROLE();
        const REQUESTER_ROLE = await project.REQUESTER_ROLE();
        
        // Grant roles
        await project.connect(admin).directGrantRole(SECRETARY_ROLE, secretary.address);
        logSuccess(`Granted SECRETARY_ROLE to ${secretary.address}`);
        
        await project.connect(admin).directGrantRole(COMMITTEE_ROLE, committee1.address);
        logSuccess(`Granted COMMITTEE_ROLE to Committee 1: ${committee1.address}`);
        
        await project.connect(admin).directGrantRole(COMMITTEE_ROLE, committee2.address);
        logSuccess(`Granted COMMITTEE_ROLE to Committee 2: ${committee2.address}`);
        
        await project.connect(admin).directGrantRole(COMMITTEE_ROLE, committee3.address);
        logSuccess(`Granted COMMITTEE_ROLE to Committee 3: ${committee3.address}`);
        
        await project.connect(admin).directGrantRole(FINANCE_ROLE, finance.address);
        logSuccess(`Granted FINANCE_ROLE to ${finance.address}`);
        
        await project.connect(admin).directGrantRole(DIRECTOR_ROLE, director.address);
        logSuccess(`Granted DIRECTOR_ROLE to ${director.address}`);
        
        await project.connect(admin).directGrantRole(REQUESTER_ROLE, requester1.address);
        logSuccess(`Granted REQUESTER_ROLE to Requester 1: ${requester1.address}`);
        
        await project.connect(admin).directGrantRole(REQUESTER_ROLE, requester2.address);
        logSuccess(`Granted REQUESTER_ROLE to Requester 2: ${requester2.address}`);
        
        // Create reimbursement request
        logSection("CREATING REIMBURSEMENT REQUEST");
        
        const requestAmount = ethers.parseEther("50000"); // 50,000 OMTHB
        const description = "Research equipment and laboratory supplies for Q1 2025";
        const documentHash = "QmX1Y2Z3...equipmentInvoice";
        
        const createReqTx = await project.connect(requester1).createRequest(
            recipient1.address,
            requestAmount,
            description,
            documentHash
        );
        const createReqReceipt = await createReqTx.wait();
        
        const requestEvent = createReqReceipt.logs.find(log => {
            try {
                const parsed = project.interface.parseLog(log);
                return parsed && parsed.name === 'RequestCreated';
            } catch (e) {
                return false;
            }
        });
        
        const requestId = requestEvent.args.requestId;
        logSuccess(`Created reimbursement request #${requestId}`);
        console.log(`  Amount: ${formatOMTHB(requestAmount)}`);
        console.log(`  Recipient: ${recipient1.address}`);
        console.log(`  Description: ${description}`);
        
        // Demonstrate 5-level approval workflow
        logSection("5-LEVEL APPROVAL WORKFLOW");
        
        // Level 1: Secretary Approval
        logSubSection("Level 1: Secretary Approval");
        await sleep(1000);
        
        await project.connect(secretary).directApproveBySecretary(requestId);
        logSuccess("Secretary approved the request");
        
        let request = await project.getRequest(requestId);
        console.log(`  Status: ${formatStatus(request.status)}`);
        console.log(`  Approver: ${request.approvalInfo.secretaryApprover}`);
        
        // Level 2: Committee Approval
        logSubSection("Level 2: Committee Approval");
        await sleep(1000);
        
        await project.connect(committee1).directApproveByCommittee(requestId);
        logSuccess("Committee member 1 approved the request");
        
        request = await project.getRequest(requestId);
        console.log(`  Status: ${formatStatus(request.status)}`);
        console.log(`  Approver: ${request.approvalInfo.committeeApprover}`);
        
        // Level 3: Finance Approval
        logSubSection("Level 3: Finance Approval");
        await sleep(1000);
        
        await project.connect(finance).directApproveByFinance(requestId);
        logSuccess("Finance approved the request");
        
        request = await project.getRequest(requestId);
        console.log(`  Status: ${formatStatus(request.status)}`);
        console.log(`  Approver: ${request.approvalInfo.financeApprover}`);
        
        // Level 4: Additional Committee Approvals (3 required)
        logSubSection("Level 4: Additional Committee Approvals (3 different members)");
        await sleep(1000);
        
        // First additional committee approval
        await project.connect(committee2).directApproveByCommitteeAdditional(requestId);
        logSuccess("Committee member 2 provided additional approval");
        
        // Second additional committee approval
        await project.connect(committee3).directApproveByCommitteeAdditional(requestId);
        logSuccess("Committee member 3 provided additional approval");
        
        // For the third approval, we need another committee member
        // In real scenario, we'd have more committee members
        // For simulation, let's add one more committee member
        const committee4 = signers[14];
        await project.connect(admin).directGrantRole(COMMITTEE_ROLE, committee4.address);
        await project.connect(committee4).directApproveByCommitteeAdditional(requestId);
        logSuccess("Committee member 4 provided additional approval");
        
        const additionalApprovers = await project.getCommitteeAdditionalApprovers(requestId);
        console.log(`  Additional approvers: ${additionalApprovers.length}/3`);
        
        // Level 5: Director Approval (Auto-distributes)
        logSubSection("Level 5: Director Approval (Auto-distributes funds)");
        await sleep(1000);
        
        const recipientBalanceBefore = await omthbToken.balanceOf(recipient1.address);
        console.log(`  Recipient balance before: ${formatOMTHB(recipientBalanceBefore)}`);
        
        await project.connect(director).directApproveByDirector(requestId);
        logSuccess("Director approved the request - Funds distributed automatically!");
        
        request = await project.getRequest(requestId);
        console.log(`  Final Status: ${formatStatus(request.status)}`);
        console.log(`  Director Approver: ${request.approvalInfo.directorApprover}`);
        
        const recipientBalanceAfter = await omthbToken.balanceOf(recipient1.address);
        const received = recipientBalanceAfter - recipientBalanceBefore;
        console.log(`  Recipient balance after: ${formatOMTHB(recipientBalanceAfter)}`);
        console.log(`  Amount received: ${formatOMTHB(received)}`);
        
        // Emergency Closure Demonstration
        logSection("EMERGENCY CLOSURE DEMONSTRATION");
        
        logSubSection("Initiating Emergency Closure");
        
        const closureReason = "Project terminated due to regulatory compliance issues";
        const closureTx = await project.connect(committee1).initiateEmergencyClosure(
            treasuryReturn.address,
            closureReason
        );
        const closureReceipt = await closureTx.wait();
        
        const closureEvent = closureReceipt.logs.find(log => {
            try {
                const parsed = project.interface.parseLog(log);
                return parsed && parsed.name === 'EmergencyClosureInitiated';
            } catch (e) {
                return false;
            }
        });
        
        const closureId = closureEvent.args.closureId;
        logSuccess(`Emergency closure initiated with ID: ${closureId}`);
        console.log(`  Initiator: ${committee1.address}`);
        console.log(`  Return address: ${treasuryReturn.address}`);
        console.log(`  Reason: ${closureReason}`);
        
        logSubSection("Committee Approvals (3 required)");
        await sleep(1000);
        
        // Committee approvals
        await project.connect(committee1).directApproveEmergencyClosure(closureId);
        logSuccess("Committee 1 approved emergency closure");
        
        await project.connect(committee2).directApproveEmergencyClosure(closureId);
        logSuccess("Committee 2 approved emergency closure");
        
        await project.connect(committee3).directApproveEmergencyClosure(closureId);
        logSuccess("Committee 3 approved emergency closure");
        
        let [committeeCount, hasDirectorApproval] = await project.getClosureApprovalStatus(closureId);
        console.log(`  Committee approvals: ${committeeCount}/3`);
        
        logSubSection("Director Approval (Final step - auto-executes)");
        await sleep(1000);
        
        const projectBalanceBefore = await omthbToken.balanceOf(projectAddress);
        const returnBalanceBefore = await omthbToken.balanceOf(treasuryReturn.address);
        console.log(`  Project balance before: ${formatOMTHB(projectBalanceBefore)}`);
        console.log(`  Return address balance before: ${formatOMTHB(returnBalanceBefore)}`);
        
        await project.connect(director).directApproveEmergencyClosure(closureId);
        logSuccess("Director approved emergency closure - All funds returned!");
        
        const projectBalanceAfter = await omthbToken.balanceOf(projectAddress);
        const returnBalanceAfter = await omthbToken.balanceOf(treasuryReturn.address);
        const returned = returnBalanceAfter - returnBalanceBefore;
        
        console.log(`  Project balance after: ${formatOMTHB(projectBalanceAfter)}`);
        console.log(`  Return address balance after: ${formatOMTHB(returnBalanceAfter)}`);
        console.log(`  Amount returned: ${formatOMTHB(returned)}`);
        
        const isPaused = await project.paused();
        console.log(`  Contract paused: ${isPaused ? colors.green + "Yes" + colors.reset : colors.red + "No" + colors.reset}`);
        
        // Final Summary
        logSection("SIMULATION SUMMARY");
        
        console.log(colors.bright + "Project Information:" + colors.reset);
        console.log("━".repeat(50));
        console.log(`Project ID: ${colors.yellow}${projectId}${colors.reset}`);
        console.log(`Project Address: ${colors.yellow}${projectAddress}${colors.reset}`);
        console.log(`OMTHB Token: ${colors.yellow}${omthbAddress}${colors.reset}`);
        console.log("━".repeat(50));
        
        console.log("");
        console.log(colors.bright + "Approval Workflow Demonstrated:" + colors.reset);
        console.log("━".repeat(50));
        console.log("1. Secretary Approval ✓");
        console.log("2. Committee Approval ✓");
        console.log("3. Finance Approval ✓");
        console.log("4. Additional Committee Approvals (3 members) ✓");
        console.log("5. Director Approval (auto-distributed funds) ✓");
        console.log("━".repeat(50));
        
        console.log("");
        console.log(colors.bright + "Emergency Closure Demonstrated:" + colors.reset);
        console.log("━".repeat(50));
        console.log("1. Closure Initiated by Committee Member ✓");
        console.log("2. Three Committee Approvals ✓");
        console.log("3. Director Final Approval ✓");
        console.log("4. All Funds Returned to Treasury ✓");
        console.log("5. Contract Permanently Paused ✓");
        console.log("━".repeat(50));
        
        const totalDistributed = await project.totalDistributed();
        console.log("");
        console.log(`Total Distributed: ${formatOMTHB(totalDistributed)}`);
        console.log(`Final Project Balance: ${formatOMTHB(projectBalanceAfter)}`);
        console.log(`Funds Returned: ${formatOMTHB(returned)}`);
        
        logSuccess("Simple simulation completed successfully!");
        
    } catch (error) {
        logError(`Error: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

// Run the simulation
main()
    .then(() => process.exit(0))
    .catch((error) => {
        logError(error);
        process.exit(1);
    });