const { ethers } = require("hardhat");
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

// Generate commitment for commit-reveal
function generateCommitment(approver, requestId, chainId, nonce) {
    return ethers.keccak256(ethers.solidityPacked(
        ["address", "uint256", "uint256", "uint256"],
        [approver, requestId, chainId, nonce]
    ));
}

// Sleep function for delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    logSection("REIMBURSEMENT APPROVAL FLOW SIMULATION");
    
    // Load deployment info
    const deploymentInfo = JSON.parse(fs.readFileSync('./deployment-info.json', 'utf8'));
    
    // Get signers
    const signers = await ethers.getSigners();
    const [admin, secretary, committee1, committee2, committee3, finance, director, requester1, requester2, requester3, requester4, requester5, recipient1, recipient2, recipient3, recipient4, recipient5] = signers;
    
    // Get contract instances
    const omthbToken = await ethers.getContractAt("OMTHBToken", deploymentInfo.omthbToken);
    const project = await ethers.getContractAt("ProjectReimbursement", deploymentInfo.project);
    
    logInfo(`Project Contract: ${colors.yellow}${deploymentInfo.project}${colors.reset}`);
    logInfo(`Project ID: ${colors.yellow}${deploymentInfo.projectId}${colors.reset}`);
    
    // Get initial project state
    const initialBalance = await omthbToken.balanceOf(deploymentInfo.project);
    logInfo(`Initial Project Treasury: ${formatOMTHB(initialBalance)}`);
    
    // 1. Create Payment Requests
    logSection("1. CREATING PAYMENT REQUESTS");
    
    const paymentRequests = [
        {
            requester: requester1,
            recipient: recipient1.address,
            amount: ethers.parseEther("50000"),
            description: "Research equipment and materials",
            documentHash: "QmX1Y2Z3...equipmentInvoice"
        },
        {
            requester: requester2,
            recipient: recipient2.address,
            amount: ethers.parseEther("75000"),
            description: "Conference travel and accommodation",
            documentHash: "QmA4B5C6...travelReceipts"
        },
        {
            requester: requester3,
            recipient: recipient3.address,
            amount: ethers.parseEther("120000"),
            description: "Software licenses and subscriptions",
            documentHash: "QmD7E8F9...softwareLicenses"
        },
        {
            requester: requester4,
            recipient: recipient4.address,
            amount: ethers.parseEther("90000"),
            description: "External consultant services",
            documentHash: "QmG1H2I3...consultantInvoice"
        },
        {
            requester: requester5,
            recipient: recipient5.address,
            amount: ethers.parseEther("165000"),
            description: "Laboratory equipment maintenance",
            documentHash: "QmJ4K5L6...maintenanceContract"
        }
    ];
    
    const requestIds = [];
    let totalRequested = BigInt(0);
    
    for (let i = 0; i < paymentRequests.length; i++) {
        const req = paymentRequests[i];
        const tx = await project.connect(req.requester).createRequest(
            req.recipient,
            req.amount,
            req.description,
            req.documentHash
        );
        const receipt = await tx.wait();
        
        // Get request ID from event
        const event = receipt.logs.find(log => {
            try {
                const parsed = project.interface.parseLog(log);
                return parsed && parsed.name === 'RequestCreated';
            } catch (e) {
                return false;
            }
        });
        
        const requestId = event.args.requestId;
        requestIds.push(requestId);
        totalRequested += req.amount;
        
        logSuccess(`Request #${requestId} created by requester${i + 1}`);
        console.log(`  - Recipient: ${colors.yellow}${req.recipient}${colors.reset}`);
        console.log(`  - Amount: ${formatOMTHB(req.amount)}`);
        console.log(`  - Description: ${req.description}`);
    }
    
    logInfo(`Total requested: ${formatOMTHB(totalRequested)}`);
    
    // Get chain ID for commit-reveal
    const chainId = (await ethers.provider.getNetwork()).chainId;
    
    // 2. Secretary Approval (Level 1)
    logSection("2. SECRETARY APPROVAL (LEVEL 1)");
    
    for (let i = 0; i < requestIds.length; i++) {
        const requestId = requestIds[i];
        const nonce = ethers.randomBytes(32);
        const nonceUint = BigInt("0x" + Buffer.from(nonce).toString('hex'));
        
        // Commit phase
        const commitment = generateCommitment(secretary.address, requestId, chainId, nonceUint);
        await project.connect(secretary).commitApproval(requestId, commitment);
        logInfo(`Secretary committed approval for request #${requestId}`);
        
        // Store nonce for reveal
        paymentRequests[i].secretaryNonce = nonceUint;
    }
    
    // Wait for reveal window (30 minutes in production, 2 seconds in simulation)
    logWarning("Waiting for reveal window (simulated 2 seconds)...");
    await sleep(2000);
    
    // Reveal phase
    for (let i = 0; i < requestIds.length; i++) {
        const requestId = requestIds[i];
        await project.connect(secretary).approveBySecretary(requestId, paymentRequests[i].secretaryNonce);
        logSuccess(`Secretary approved request #${requestId}`);
        
        const request = await project.getRequest(requestId);
        console.log(`  - Status: ${formatStatus(request.status)}`);
    }
    
    // 3. Committee Approval (Level 2)
    logSection("3. COMMITTEE APPROVAL (LEVEL 2)");
    
    for (let i = 0; i < requestIds.length; i++) {
        const requestId = requestIds[i];
        const nonce = ethers.randomBytes(32);
        const nonceUint = BigInt("0x" + Buffer.from(nonce).toString('hex'));
        
        // Commit phase
        const commitment = generateCommitment(committee1.address, requestId, chainId, nonceUint);
        await project.connect(committee1).commitApproval(requestId, commitment);
        logInfo(`Committee1 committed approval for request #${requestId}`);
        
        paymentRequests[i].committee1Nonce = nonceUint;
    }
    
    await sleep(2000);
    
    // Reveal phase
    for (let i = 0; i < requestIds.length; i++) {
        const requestId = requestIds[i];
        await project.connect(committee1).approveByCommittee(requestId, paymentRequests[i].committee1Nonce);
        logSuccess(`Committee1 approved request #${requestId}`);
        
        const request = await project.getRequest(requestId);
        console.log(`  - Status: ${formatStatus(request.status)}`);
    }
    
    // 4. Finance Approval (Level 3)
    logSection("4. FINANCE APPROVAL (LEVEL 3)");
    
    for (let i = 0; i < requestIds.length; i++) {
        const requestId = requestIds[i];
        const nonce = ethers.randomBytes(32);
        const nonceUint = BigInt("0x" + Buffer.from(nonce).toString('hex'));
        
        // Commit phase
        const commitment = generateCommitment(finance.address, requestId, chainId, nonceUint);
        await project.connect(finance).commitApproval(requestId, commitment);
        logInfo(`Finance committed approval for request #${requestId}`);
        
        paymentRequests[i].financeNonce = nonceUint;
    }
    
    await sleep(2000);
    
    // Reveal phase
    for (let i = 0; i < requestIds.length; i++) {
        const requestId = requestIds[i];
        await project.connect(finance).approveByFinance(requestId, paymentRequests[i].financeNonce);
        logSuccess(`Finance approved request #${requestId}`);
        
        const request = await project.getRequest(requestId);
        console.log(`  - Status: ${formatStatus(request.status)}`);
    }
    
    // 5. Additional Committee Approval (Level 4)
    logSection("5. ADDITIONAL COMMITTEE APPROVAL (LEVEL 4)");
    
    // Use different committee members for each request
    const additionalCommittees = [committee2, committee3, committee2, committee3, committee2];
    
    for (let i = 0; i < requestIds.length; i++) {
        const requestId = requestIds[i];
        const committee = additionalCommittees[i];
        const nonce = ethers.randomBytes(32);
        const nonceUint = BigInt("0x" + Buffer.from(nonce).toString('hex'));
        
        // Commit phase
        const commitment = generateCommitment(committee.address, requestId, chainId, nonceUint);
        await project.connect(committee).commitApproval(requestId, commitment);
        logInfo(`Committee (${committee === committee2 ? '2' : '3'}) committed approval for request #${requestId}`);
        
        paymentRequests[i].additionalCommitteeNonce = nonceUint;
        paymentRequests[i].additionalCommittee = committee;
    }
    
    await sleep(2000);
    
    // Reveal phase
    for (let i = 0; i < requestIds.length; i++) {
        const requestId = requestIds[i];
        const committee = paymentRequests[i].additionalCommittee;
        await project.connect(committee).approveByCommitteeAdditional(requestId, paymentRequests[i].additionalCommitteeNonce);
        logSuccess(`Additional committee approved request #${requestId}`);
        
        const request = await project.getRequest(requestId);
        console.log(`  - Status: ${formatStatus(request.status)}`);
    }
    
    // 6. Director Approval & Auto-Distribution (Level 5)
    logSection("6. DIRECTOR APPROVAL & AUTO-DISTRIBUTION (LEVEL 5)");
    
    // Get recipient balances before distribution
    const recipientBalancesBefore = [];
    for (let i = 0; i < 5; i++) {
        const balance = await omthbToken.balanceOf(paymentRequests[i].recipient);
        recipientBalancesBefore.push(balance);
    }
    
    for (let i = 0; i < requestIds.length; i++) {
        const requestId = requestIds[i];
        const nonce = ethers.randomBytes(32);
        const nonceUint = BigInt("0x" + Buffer.from(nonce).toString('hex'));
        
        // Commit phase
        const commitment = generateCommitment(director.address, requestId, chainId, nonceUint);
        await project.connect(director).commitApproval(requestId, commitment);
        logInfo(`Director committed approval for request #${requestId}`);
        
        paymentRequests[i].directorNonce = nonceUint;
    }
    
    await sleep(2000);
    
    // Reveal phase - this triggers auto-distribution
    for (let i = 0; i < requestIds.length; i++) {
        const requestId = requestIds[i];
        await project.connect(director).approveByDirector(requestId, paymentRequests[i].directorNonce);
        logSuccess(`Director approved request #${requestId} - Funds distributed automatically!`);
        
        const request = await project.getRequest(requestId);
        console.log(`  - Status: ${formatStatus(request.status)}`);
        
        // Verify recipient received funds
        const recipientBalanceAfter = await omthbToken.balanceOf(paymentRequests[i].recipient);
        const received = recipientBalanceAfter - recipientBalancesBefore[i];
        console.log(`  - Recipient ${colors.yellow}${paymentRequests[i].recipient}${colors.reset} received: ${formatOMTHB(received)}`);
    }
    
    // 7. Final Summary
    logSection("7. FINAL SUMMARY");
    
    const finalProjectBalance = await omthbToken.balanceOf(deploymentInfo.project);
    const totalDistributed = await project.totalDistributed();
    
    console.log(colors.bright + "Distribution Summary:" + colors.reset);
    console.log("━".repeat(50));
    console.log(`Initial Treasury Balance: ${formatOMTHB(initialBalance)}`);
    console.log(`Total Distributed: ${formatOMTHB(totalDistributed)}`);
    console.log(`Remaining Treasury Balance: ${formatOMTHB(finalProjectBalance)}`);
    console.log("━".repeat(50));
    
    console.log("");
    console.log(colors.bright + "Request Details:" + colors.reset);
    console.log("━".repeat(80));
    for (let i = 0; i < requestIds.length; i++) {
        const request = await project.getRequest(requestIds[i]);
        console.log(`Request #${requestIds[i]}:`);
        console.log(`  Requester: ${request.requester}`);
        console.log(`  Recipient: ${request.recipient}`);
        console.log(`  Amount: ${formatOMTHB(request.amount)}`);
        console.log(`  Status: ${formatStatus(request.status)}`);
        console.log(`  Description: ${request.description}`);
        console.log("━".repeat(80));
    }
    
    logSuccess("Simulation completed successfully!");
    logInfo(`All ${requestIds.length} payment requests have been approved and distributed.`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        logError(error);
        process.exit(1);
    });