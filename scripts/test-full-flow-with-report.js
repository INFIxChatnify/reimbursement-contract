const { ethers, upgrades } = require("hardhat");
const fs = require('fs');
const path = require('path');

// Test report structure
const testReport = {
    testRunInfo: {
        timestamp: new Date().toISOString(),
        network: "hardhat",
        gasUsed: {}
    },
    deployments: {
        contracts: {},
        addresses: {}
    },
    testCases: [],
    summary: {
        total: 0,
        passed: 0,
        failed: 0
    }
};

// Color codes for console output
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
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

function logError(message) {
    console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function logInfo(message) {
    console.log(`${colors.blue}ℹ ${message}${colors.reset}`);
}

// Helper to record test case
function recordTestCase(name, status, parameters, outputs, gasUsed, events = []) {
    const testCase = {
        name,
        status,
        timestamp: new Date().toISOString(),
        parameters,
        outputs,
        gasUsed: gasUsed ? gasUsed.toString() : "0",
        events
    };
    
    testReport.testCases.push(testCase);
    testReport.summary.total++;
    if (status === "PASS") {
        testReport.summary.passed++;
    } else {
        testReport.summary.failed++;
    }
    
    return testCase;
}

// Generate commitment for commit-reveal
function generateCommitment(approver, requestId, chainId, nonce) {
    return ethers.keccak256(ethers.solidityPacked(
        ["address", "uint256", "uint256", "uint256"],
        [approver, requestId, chainId, nonce]
    ));
}

async function deployContracts() {
    logSection("DEPLOYING CONTRACTS");
    
    const testCase = {
        name: "Contract Deployment",
        parameters: {},
        outputs: {}
    };
    
    try {
        // Get signers
        const signers = await ethers.getSigners();
        const [admin, secretary, committee1, committee2, committee3, finance, director, requester, recipient] = signers;
        
        testCase.parameters.signers = {
            admin: admin.address,
            secretary: secretary.address,
            committee1: committee1.address,
            committee2: committee2.address,
            committee3: committee3.address,
            finance: finance.address,
            director: director.address,
            requester: requester.address,
            recipient: recipient.address
        };
        
        // Deploy libraries first
        logInfo("Deploying libraries...");
        
        // Deploy ValidationLib
        const ValidationLib = await ethers.getContractFactory("ValidationLib");
        const validationLib = await ValidationLib.deploy();
        await validationLib.waitForDeployment();
        const validationLibAddress = await validationLib.getAddress();
        
        // Deploy ViewLib
        const ViewLib = await ethers.getContractFactory("ViewLib");
        const viewLib = await ViewLib.deploy();
        await viewLib.waitForDeployment();
        const viewLibAddress = await viewLib.getAddress();
        
        // Deploy ArrayLib
        const ArrayLib = await ethers.getContractFactory("ArrayLib");
        const arrayLib = await ArrayLib.deploy();
        await arrayLib.waitForDeployment();
        const arrayLibAddress = await arrayLib.getAddress();
        
        // Deploy EmergencyClosureLib
        const EmergencyClosureLib = await ethers.getContractFactory("EmergencyClosureLib");
        const emergencyClosureLib = await EmergencyClosureLib.deploy();
        await emergencyClosureLib.waitForDeployment();
        const emergencyClosureLibAddress = await emergencyClosureLib.getAddress();
        
        logSuccess("Libraries deployed");
        
        // Deploy OMTHB Token (using MockERC20 for testing)
        logInfo("Deploying MockERC20 token for testing...");
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const omthbToken = await MockERC20.deploy("OMTHB Test Token", "OMTHB");
        await omthbToken.waitForDeployment();
        const omthbAddress = await omthbToken.getAddress();
        
        logSuccess(`Mock OMTHB Token deployed at: ${omthbAddress}`);
        
        // Deploy Project Implementation with libraries
        logInfo("Deploying ProjectReimbursementOptimized...");
        const ProjectReimbursementOptimized = await ethers.getContractFactory("contracts/ProjectReimbursementOptimized.sol:ProjectReimbursementOptimized");
        const projectImplementation = await ProjectReimbursementOptimized.deploy();
        await projectImplementation.waitForDeployment();
        const implementationAddress = await projectImplementation.getAddress();
        logSuccess(`Project Implementation deployed at: ${implementationAddress}`);
        
        // Deploy GasTank first (required by MetaTxForwarder)
        logInfo("Deploying GasTank...");
        const GasTank = await ethers.getContractFactory("GasTank");
        const gasTank = await GasTank.deploy(admin.address, admin.address); // admin as both admin and emergency withdraw
        await gasTank.waitForDeployment();
        const gasTankAddress = await gasTank.getAddress();
        logSuccess(`GasTank deployed at: ${gasTankAddress}`);
        
        // Deploy MetaTxForwarder
        logInfo("Deploying MetaTxForwarder...");
        const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarderV2");
        const metaTxForwarder = await MetaTxForwarder.deploy(gasTankAddress);
        await metaTxForwarder.waitForDeployment();
        const forwarderAddress = await metaTxForwarder.getAddress();
        logSuccess(`MetaTxForwarder deployed at: ${forwarderAddress}`);
        
        // Deploy Factory
        logInfo("Deploying ProjectFactory...");
        const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
        const factory = await ProjectFactory.deploy(
            implementationAddress,
            omthbAddress,
            forwarderAddress,
            admin.address
        );
        await factory.waitForDeployment();
        const factoryAddress = await factory.getAddress();
        logSuccess(`ProjectFactory deployed at: ${factoryAddress}`);
        
        // Grant PROJECT_CREATOR_ROLE
        const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
        await factory.connect(admin).grantRole(PROJECT_CREATOR_ROLE, admin.address);
        
        // Mint tokens for testing
        const mintAmount = ethers.parseEther("2000000"); // 2M OMTHB
        await omthbToken.connect(admin).mint(admin.address, mintAmount);
        logSuccess(`Minted ${ethers.formatEther(mintAmount)} OMTHB to admin`);
        
        testCase.outputs = {
            omthbToken: omthbAddress,
            factory: factoryAddress,
            projectImplementation: implementationAddress,
            metaTxForwarder: forwarderAddress,
            libraries: {
                ValidationLib: validationLibAddress,
                ViewLib: viewLibAddress,
                ArrayLib: arrayLibAddress,
                EmergencyClosureLib: emergencyClosureLibAddress
            }
        };
        
        // Record deployment info
        testReport.deployments.contracts = {
            OMTHBTokenV3: omthbToken,
            ProjectFactory: factory,
            ProjectReimbursementOptimized: projectImplementation,
            MetaTxForwarder: metaTxForwarder
        };
        
        testReport.deployments.addresses = testCase.outputs;
        
        recordTestCase(testCase.name, "PASS", testCase.parameters, testCase.outputs, 0);
        
        return {
            signers: { admin, secretary, committee1, committee2, committee3, finance, director, requester, recipient },
            contracts: { omthbToken, factory, projectImplementation, metaTxForwarder },
            addresses: testCase.outputs
        };
        
    } catch (error) {
        recordTestCase(testCase.name, "FAIL", testCase.parameters, { error: error.message }, 0);
        throw error;
    }
}

async function testProjectCreationWithZeroBudget(deployment) {
    logSection("TEST: PROJECT CREATION WITH 0 BUDGET");
    
    const testCase = {
        name: "Project Creation with 0 Budget",
        parameters: {
            projectId: "TEST-PROJECT-001",
            initialBudget: "0",
            projectAdmin: deployment.signers.admin.address
        },
        outputs: {}
    };
    
    try {
        const { contracts, signers } = deployment;
        const { factory, omthbToken } = contracts;
        const { admin } = signers;
        
        // Create project with 0 budget (testing the fix)
        logInfo("Creating project with 0 budget...");
        const tx = await factory.connect(admin).createProject(
            testCase.parameters.projectId,
            admin.address
        );
        const receipt = await tx.wait();
        
        // Get project address from event
        const projectCreatedEvent = receipt.logs.find(log => {
            try {
                const parsed = factory.interface.parseLog(log);
                return parsed && parsed.name === 'ProjectCreated';
            } catch (e) {
                return false;
            }
        });
        
        const projectAddress = projectCreatedEvent.args.projectContract;
        const project = await ethers.getContractAt("contracts/ProjectReimbursementOptimized.sol:ProjectReimbursementOptimized", projectAddress);
        
        // Verify project details
        const projectId = await project.projectId();
        const projectBudget = await project.projectBudget();
        const totalDistributed = await project.totalDistributed();
        
        testCase.outputs = {
            projectAddress,
            projectId,
            projectBudget: projectBudget.toString(),
            totalDistributed: totalDistributed.toString(),
            gasUsed: receipt.gasUsed.toString()
        };
        
        // Verify budget is 0
        if (projectBudget === 0n) {
            logSuccess("✓ Project created successfully with 0 budget");
            recordTestCase(testCase.name, "PASS", testCase.parameters, testCase.outputs, receipt.gasUsed);
        } else {
            throw new Error(`Expected budget 0, got ${projectBudget}`);
        }
        
        return { project, projectAddress };
        
    } catch (error) {
        logError(`✗ ${error.message}`);
        recordTestCase(testCase.name, "FAIL", testCase.parameters, { error: error.message }, 0);
        throw error;
    }
}

async function testBudgetUpdate(deployment, project) {
    logSection("TEST: BUDGET UPDATE");
    
    const testCase = {
        name: "Budget Update After Creation",
        parameters: {
            newBudget: ethers.parseEther("1000000").toString(), // 1M OMTHB
            projectAddress: await project.getAddress()
        },
        outputs: {}
    };
    
    try {
        const { contracts, signers } = deployment;
        const { omthbToken } = contracts;
        const { admin } = signers;
        
        // Update budget
        logInfo("Updating project budget...");
        const updateTx = await project.connect(admin).updateBudget(ethers.parseEther("1000000"));
        const updateReceipt = await updateTx.wait();
        
        // Fund the project
        logInfo("Funding project with OMTHB...");
        const transferTx = await omthbToken.connect(admin).transfer(
            await project.getAddress(),
            ethers.parseEther("1000000")
        );
        await transferTx.wait();
        
        // Verify new budget
        const newBudget = await project.projectBudget();
        const projectBalance = await omthbToken.balanceOf(await project.getAddress());
        
        testCase.outputs = {
            newBudget: newBudget.toString(),
            projectBalance: projectBalance.toString(),
            gasUsed: updateReceipt.gasUsed.toString()
        };
        
        logSuccess(`✓ Budget updated to ${ethers.formatEther(newBudget)} OMTHB`);
        recordTestCase(testCase.name, "PASS", testCase.parameters, testCase.outputs, updateReceipt.gasUsed);
        
    } catch (error) {
        logError(`✗ ${error.message}`);
        recordTestCase(testCase.name, "FAIL", testCase.parameters, { error: error.message }, 0);
        throw error;
    }
}

async function testRoleAssignment(deployment, project) {
    logSection("TEST: ROLE ASSIGNMENT");
    
    const testCase = {
        name: "Role Assignment via grantRoleDirect",
        parameters: {
            roles: ["SECRETARY", "COMMITTEE", "FINANCE", "DIRECTOR", "REQUESTER"]
        },
        outputs: {}
    };
    
    try {
        const { signers } = deployment;
        const { admin, secretary, committee1, committee2, committee3, finance, director, requester } = signers;
        
        // Get role constants
        const SECRETARY_ROLE = await project.SECRETARY_ROLE();
        const COMMITTEE_ROLE = await project.COMMITTEE_ROLE();
        const FINANCE_ROLE = await project.FINANCE_ROLE();
        const DIRECTOR_ROLE = await project.DIRECTOR_ROLE();
        const REQUESTER_ROLE = await project.REQUESTER_ROLE();
        
        // Grant roles using grantRoleDirect (for initial setup)
        logInfo("Granting roles...");
        await project.connect(admin).grantRoleDirect(SECRETARY_ROLE, secretary.address);
        await project.connect(admin).grantRoleDirect(COMMITTEE_ROLE, committee1.address);
        await project.connect(admin).grantRoleDirect(COMMITTEE_ROLE, committee2.address);
        await project.connect(admin).grantRoleDirect(COMMITTEE_ROLE, committee3.address);
        await project.connect(admin).grantRoleDirect(FINANCE_ROLE, finance.address);
        await project.connect(admin).grantRoleDirect(DIRECTOR_ROLE, director.address);
        await project.connect(admin).grantRoleDirect(REQUESTER_ROLE, requester.address);
        
        // Verify roles
        const hasSecretaryRole = await project.hasRole(SECRETARY_ROLE, secretary.address);
        const hasCommitteeRole = await project.hasRole(COMMITTEE_ROLE, committee1.address);
        const hasFinanceRole = await project.hasRole(FINANCE_ROLE, finance.address);
        const hasDirectorRole = await project.hasRole(DIRECTOR_ROLE, director.address);
        const hasRequesterRole = await project.hasRole(REQUESTER_ROLE, requester.address);
        
        testCase.outputs = {
            secretaryRole: hasSecretaryRole,
            committeeRole: hasCommitteeRole,
            financeRole: hasFinanceRole,
            directorRole: hasDirectorRole,
            requesterRole: hasRequesterRole
        };
        
        logSuccess("✓ All roles assigned successfully");
        recordTestCase(testCase.name, "PASS", testCase.parameters, testCase.outputs, 0);
        
    } catch (error) {
        logError(`✗ ${error.message}`);
        recordTestCase(testCase.name, "FAIL", testCase.parameters, { error: error.message }, 0);
        throw error;
    }
}

async function testFiveLevelApproval(deployment, project) {
    logSection("TEST: 5-LEVEL APPROVAL WORKFLOW");
    
    const testCase = {
        name: "5-Level Approval Workflow",
        parameters: {
            amount: ethers.parseEther("50000").toString(),
            description: "Research equipment and laboratory supplies",
            documentHash: "QmX1Y2Z3...equipmentInvoice"
        },
        outputs: {}
    };
    
    try {
        const { contracts, signers } = deployment;
        const { omthbToken } = contracts;
        const { secretary, committee1, committee2, committee3, finance, director, requester, recipient } = signers;
        
        // Get chain ID for commit-reveal
        const chainId = (await ethers.provider.getNetwork()).chainId;
        
        // Create reimbursement request
        logInfo("Creating reimbursement request...");
        const createTx = await project.connect(requester).createRequest(
            recipient.address,
            ethers.parseEther("50000"),
            testCase.parameters.description,
            testCase.parameters.documentHash
        );
        const createReceipt = await createTx.wait();
        
        // Get request ID from event
        const requestEvent = createReceipt.logs.find(log => {
            try {
                const parsed = project.interface.parseLog(log);
                return parsed && parsed.name === 'RequestCreated';
            } catch (e) {
                return false;
            }
        });
        
        const requestId = requestEvent.args.requestId;
        logSuccess(`Created request #${requestId}`);
        
        // Record recipient balance before
        const recipientBalanceBefore = await omthbToken.balanceOf(recipient.address);
        
        // Secretary approval (Level 1)
        logInfo("Level 1: Secretary approval...");
        const secretaryNonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
        const secretaryCommitment = generateCommitment(secretary.address, requestId, chainId, secretaryNonce);
        await project.connect(secretary).commitApproval(requestId, secretaryCommitment);
        
        // Fast forward time (30 minutes + 1 second for commit-reveal)
        await ethers.provider.send("evm_increaseTime", [1801]); // 30 minutes + 1 second
        await ethers.provider.send("evm_mine");
        
        await project.connect(secretary).approveBySecretary(requestId, secretaryNonce);
        
        // Committee approval (Level 2)
        logInfo("Level 2: Committee approval...");
        const committee1Nonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
        const committee1Commitment = generateCommitment(committee1.address, requestId, chainId, committee1Nonce);
        await project.connect(committee1).commitApproval(requestId, committee1Commitment);
        
        // Fast forward time for commit-reveal
        await ethers.provider.send("evm_increaseTime", [1801]);
        await ethers.provider.send("evm_mine");
        
        await project.connect(committee1).approveByCommittee(requestId, committee1Nonce);
        
        // Finance approval (Level 3)
        logInfo("Level 3: Finance approval...");
        const financeNonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
        const financeCommitment = generateCommitment(finance.address, requestId, chainId, financeNonce);
        await project.connect(finance).commitApproval(requestId, financeCommitment);
        
        // Fast forward time for commit-reveal
        await ethers.provider.send("evm_increaseTime", [1801]);
        await ethers.provider.send("evm_mine");
        
        await project.connect(finance).approveByFinance(requestId, financeNonce);
        
        // Additional Committee approvals (Level 4)
        logInfo("Level 4: Additional committee approvals...");
        
        // Committee 1 (same person who approved in Level 2, now allowed)
        const committee1AdditionalNonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
        const committee1AdditionalCommitment = generateCommitment(committee1.address, requestId, chainId, committee1AdditionalNonce);
        await project.connect(committee1).commitApproval(requestId, committee1AdditionalCommitment);
        
        // Fast forward time for commit-reveal
        await ethers.provider.send("evm_increaseTime", [1801]);
        await ethers.provider.send("evm_mine");
        
        await project.connect(committee1).approveByCommitteeAdditional(requestId, committee1AdditionalNonce);
        
        // Committee 2
        const committee2Nonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
        const committee2Commitment = generateCommitment(committee2.address, requestId, chainId, committee2Nonce);
        await project.connect(committee2).commitApproval(requestId, committee2Commitment);
        
        // Fast forward time for commit-reveal
        await ethers.provider.send("evm_increaseTime", [1801]);
        await ethers.provider.send("evm_mine");
        
        await project.connect(committee2).approveByCommitteeAdditional(requestId, committee2Nonce);
        
        // Committee 3
        const committee3Nonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
        const committee3Commitment = generateCommitment(committee3.address, requestId, chainId, committee3Nonce);
        await project.connect(committee3).commitApproval(requestId, committee3Commitment);
        
        // Fast forward time for commit-reveal
        await ethers.provider.send("evm_increaseTime", [1801]);
        await ethers.provider.send("evm_mine");
        
        await project.connect(committee3).approveByCommitteeAdditional(requestId, committee3Nonce);
        
        // Director approval (Level 5) - Auto-distributes
        logInfo("Level 5: Director approval (auto-distributes)...");
        const directorNonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
        const directorCommitment = generateCommitment(director.address, requestId, chainId, directorNonce);
        await project.connect(director).commitApproval(requestId, directorCommitment);
        
        // Fast forward time for commit-reveal
        await ethers.provider.send("evm_increaseTime", [1801]);
        await ethers.provider.send("evm_mine");
        
        const directorTx = await project.connect(director).approveByDirector(requestId, directorNonce);
        const directorReceipt = await directorTx.wait();
        
        // Get final request status
        const finalRequest = await project.getRequest(requestId);
        const recipientBalanceAfter = await omthbToken.balanceOf(recipient.address);
        const amountReceived = recipientBalanceAfter - recipientBalanceBefore;
        
        // Debug logging
        console.log("Final request status:", finalRequest.status);
        console.log("Expected status: 5 (DISTRIBUTED)");
        console.log("Amount received:", ethers.formatEther(amountReceived), "OMTHB");
        console.log("Expected amount:", "50000.0 OMTHB");
        console.log("Request details:", {
            totalAmount: ethers.formatEther(finalRequest.totalAmount),
            recipients: finalRequest.recipients,
            expectedRecipient: recipient.address
        });
        
        testCase.outputs = {
            requestId: requestId.toString(),
            finalStatus: finalRequest.status.toString(),
            recipientBalanceBefore: recipientBalanceBefore.toString(),
            recipientBalanceAfter: recipientBalanceAfter.toString(),
            amountReceived: amountReceived.toString(),
            gasUsed: directorReceipt.gasUsed.toString()
        };
        
        // Status 5 is DISTRIBUTED
        if (finalRequest.status === 5n && amountReceived === ethers.parseEther("50000")) {
            logSuccess("✓ 5-level approval completed and funds distributed");
            recordTestCase(testCase.name, "PASS", testCase.parameters, testCase.outputs, directorReceipt.gasUsed);
        } else {
            throw new Error(`Approval workflow failed or funds not distributed correctly. Status: ${finalRequest.status}, Amount received: ${ethers.formatEther(amountReceived)}`);
        }
        
    } catch (error) {
        logError(`✗ ${error.message}`);
        recordTestCase(testCase.name, "FAIL", testCase.parameters, { error: error.message }, 0);
        throw error;
    }
}

async function generateReport() {
    logSection("GENERATING TEST REPORT");
    
    try {
        // Calculate total gas used
        let totalGasUsed = BigInt(0);
        testReport.testCases.forEach(tc => {
            if (tc.gasUsed && tc.gasUsed !== "0") {
                totalGasUsed += BigInt(tc.gasUsed);
            }
        });
        
        testReport.testRunInfo.gasUsed.total = totalGasUsed.toString();
        
        // Save JSON report
        const reportPath = path.join(__dirname, '../test-reports');
        if (!fs.existsSync(reportPath)) {
            fs.mkdirSync(reportPath);
        }
        
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const jsonReportFile = path.join(reportPath, `test-report-${timestamp}.json`);
        fs.writeFileSync(jsonReportFile, JSON.stringify(testReport, null, 2));
        
        // Generate human-readable report
        let readableReport = `
TEST EXECUTION REPORT
Timestamp: ${testReport.testRunInfo.timestamp}
Network: ${testReport.testRunInfo.network}
Total Gas Used: ${totalGasUsed.toString()}

DEPLOYMENT ADDRESSES
`;
        
        Object.entries(testReport.deployments.addresses).forEach(([name, address]) => {
            if (typeof address === 'string') {
                readableReport += `${name}: ${address}\n`;
            } else if (typeof address === 'object') {
                readableReport += `${name}:\n`;
                Object.entries(address).forEach(([subName, subAddress]) => {
                    readableReport += `  ${subName}: ${subAddress}\n`;
                });
            }
        });
        
        readableReport += `
TEST RESULTS
`;
        
        testReport.testCases.forEach((tc, index) => {
            readableReport += `
${index + 1}. ${tc.name}
   Status: ${tc.status}
   Gas Used: ${tc.gasUsed}
`;
            if (tc.outputs.error) {
                readableReport += `   Error: ${tc.outputs.error}\n`;
            } else {
                Object.entries(tc.outputs).forEach(([key, value]) => {
                    readableReport += `   ${key}: ${value}\n`;
                });
            }
        });
        
        readableReport += `
SUMMARY
Total Tests: ${testReport.summary.total}
Passed: ${testReport.summary.passed}
Failed: ${testReport.summary.failed}
Success Rate: ${((testReport.summary.passed / testReport.summary.total) * 100).toFixed(2)}%
`;
        
        const textReportFile = path.join(reportPath, `test-report-${timestamp}.txt`);
        fs.writeFileSync(textReportFile, readableReport);
        
        logSuccess(`JSON report saved to: ${jsonReportFile}`);
        logSuccess(`Text report saved to: ${textReportFile}`);
        
        // Display summary
        console.log(readableReport);
        
    } catch (error) {
        logError(`Failed to generate report: ${error.message}`);
    }
}

async function main() {
    try {
        logSection("FULL APPLICATION FLOW TEST");
        logInfo("Testing contract deployment and complete workflow");
        
        // Deploy all contracts
        const deployment = await deployContracts();
        
        // Test 1: Create project with 0 budget
        const { project } = await testProjectCreationWithZeroBudget(deployment);
        
        // Test 2: Update budget
        await testBudgetUpdate(deployment, project);
        
        // Test 3: Assign roles
        await testRoleAssignment(deployment, project);
        
        // Test 4: 5-level approval workflow
        await testFiveLevelApproval(deployment, project);
        
        // Generate report
        await generateReport();
        
        if (testReport.summary.failed === 0) {
            logSuccess("\n✅ ALL TESTS PASSED!");
        } else {
            logError(`\n❌ ${testReport.summary.failed} TESTS FAILED!`);
            process.exit(1);
        }
        
    } catch (error) {
        logError(`\nFATAL ERROR: ${error.message}`);
        console.error(error);
        
        // Still try to generate report even on failure
        await generateReport();
        process.exit(1);
    }
}

// Run tests
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
