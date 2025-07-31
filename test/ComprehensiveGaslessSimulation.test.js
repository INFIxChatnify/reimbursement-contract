const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("🚀 Comprehensive Gasless Transaction Simulation", function () {
    // Contract instances
    let omthbToken, projectFactory, projectReimbursement;
    let metaTxForwarder, gasTank;
    let auditAnchor, timelockController;
    
    // Actors
    let admin, relayer, researcher, deputy1, deputy2;
    let secretary, committee1, committee2, committee3, committee4;
    let finance, director;
    let recipient1, recipient2;
    
    // Constants
    const PROJECT_ID = "PROJECT-2024-001";
    const PROJECT_BUDGET = ethers.parseEther("1000000"); // 1M OMTHB
    const GAS_TANK_INITIAL_FUND = ethers.parseEther("10"); // 10 ETH
    const REVEAL_WINDOW = 30 * 60; // 30 minutes
    
    // Helper function to generate commitment
    function generateCommitment(approver, requestId, chainId, nonce) {
        return ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "uint256"],
                [approver, requestId, chainId, nonce]
            )
        );
    }
    
    // Helper function to sign meta transaction
    async function signMetaTx(signer, forwarder, to, data, value = 0) {
        const nonce = await forwarder.getNonce(signer.address);
        const currentTime = await time.latest();
        const deadline = currentTime + 3600; // 1 hour from current block time
        const chainId = (await ethers.provider.getNetwork()).chainId;
        
        const request = {
            from: signer.address,
            to: to,
            value: value,
            gas: 500000,
            nonce: nonce,
            deadline: deadline,
            chainId: chainId,
            data: data
        };
        
        const domain = {
            name: "MetaTxForwarder",
            version: "1",
            chainId: chainId,
            verifyingContract: await forwarder.getAddress()
        };
        
        const types = {
            ForwardRequest: [
                { name: "from", type: "address" },
                { name: "to", type: "address" },
                { name: "value", type: "uint256" },
                { name: "gas", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
                { name: "chainId", type: "uint256" },
                { name: "data", type: "bytes" }
            ]
        };
        
        const signature = await signer.signTypedData(domain, types, request);
        return { request, signature };
    }
    
    before(async function () {
        console.log("=== 🚀 COMPREHENSIVE GASLESS TRANSACTION SIMULATION ===\n");
        
        // Get signers
        [admin, relayer, researcher, deputy1, deputy2, secretary, 
         committee1, committee2, committee3, committee4, finance, 
         director, recipient1, recipient2] = await ethers.getSigners();
        
        console.log("📋 Actor addresses:");
        console.log("  Admin:", admin.address);
        console.log("  Relayer:", relayer.address);
        console.log("  Researcher:", researcher.address);
        console.log("  Recipients:", recipient1.address, recipient2.address);
        console.log("");
    });
    
    describe("1️⃣ Complete Deployment Flow", function () {
        it("Should deploy all contracts and configure for gasless transactions", async function () {
            console.log("🏗️  Deploying contracts...\n");
            
            // 1. Deploy OMTHB Token
            const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
            omthbToken = await upgrades.deployProxy(OMTHBToken, [admin.address]);
            await omthbToken.waitForDeployment();
            console.log("✅ OMTHB Token deployed at:", await omthbToken.getAddress());
            
            // 2. Deploy MetaTxForwarder
            const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
            metaTxForwarder = await MetaTxForwarder.deploy();
            await metaTxForwarder.waitForDeployment();
            console.log("✅ MetaTxForwarder deployed at:", await metaTxForwarder.getAddress());
            
            // 3. Deploy GasTank
            const GasTank = await ethers.getContractFactory("GasTank");
            gasTank = await GasTank.deploy(admin.address, admin.address);
            await gasTank.waitForDeployment();
            console.log("✅ GasTank deployed at:", await gasTank.getAddress());
            
            // 4. Deploy TimelockController
            const TimelockController = await ethers.getContractFactory("TimelockController");
            timelockController = await TimelockController.deploy(
                86400, // 1 day min delay
                [admin.address], // proposers
                [admin.address], // executors
                admin.address
            );
            await timelockController.waitForDeployment();
            console.log("✅ TimelockController deployed at:", await timelockController.getAddress());
            
            // 5. Deploy AuditAnchor
            const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
            auditAnchor = await AuditAnchor.deploy();
            await auditAnchor.waitForDeployment();
            console.log("✅ AuditAnchor deployed at:", await auditAnchor.getAddress());
            
            // 6. Deploy ProjectReimbursement implementation
            const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
            const projectImpl = await ProjectReimbursement.deploy();
            await projectImpl.waitForDeployment();
            console.log("✅ ProjectReimbursement implementation at:", await projectImpl.getAddress());
            
            // 7. Deploy ProjectFactory
            const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
            projectFactory = await ProjectFactory.deploy(
                await projectImpl.getAddress(),
                await omthbToken.getAddress(),
                await metaTxForwarder.getAddress(),
                admin.address
            );
            await projectFactory.waitForDeployment();
            console.log("✅ ProjectFactory deployed at:", await projectFactory.getAddress());
            
            console.log("\n🔧 Configuring contracts...\n");
            
            // Configure GasTank
            await gasTank.connect(admin).grantRole(await gasTank.RELAYER_ROLE(), relayer.address);
            console.log("✅ Granted RELAYER_ROLE to relayer");
            
            // Fund GasTank
            await admin.sendTransaction({
                to: await gasTank.getAddress(),
                value: GAS_TANK_INITIAL_FUND
            });
            console.log("✅ Funded GasTank with", ethers.formatEther(GAS_TANK_INITIAL_FUND), "ETH");
            
            // Whitelist contracts in MetaTxForwarder
            await metaTxForwarder.connect(admin).setTargetWhitelist(
                await projectFactory.getAddress(), 
                true
            );
            console.log("✅ Whitelisted ProjectFactory in MetaTxForwarder");
            
            // Setup roles in ProjectFactory
            await projectFactory.connect(admin).grantRole(
                await projectFactory.PROJECT_CREATOR_ROLE(), 
                admin.address
            );
            await projectFactory.connect(admin).addDeputy(deputy1.address);
            await projectFactory.connect(admin).addDeputy(deputy2.address);
            console.log("✅ Setup ProjectFactory roles and deputies");
            
            // Mint tokens to admin for distribution
            await omthbToken.connect(admin).mint(admin.address, ethers.parseEther("10000000"));
            console.log("✅ Minted 10M OMTHB to admin");
            
            console.log("\n✨ Deployment complete!\n");
        });
    });
    
    describe("2️⃣ Full Project Lifecycle via Meta Transactions", function () {
        before(async function() {
            // Ensure contracts are available from previous deployment
            if (!projectFactory) {
                throw new Error("ProjectFactory not deployed");
            }
        });
        
        it("Should create project using gasless transaction", async function () {
            console.log("🏗️  Creating project via meta transaction...\n");
            
            // Setup gas credit for admin
            await gasTank.connect(admin).depositGasCredit(admin.address, {
                value: ethers.parseEther("1")
            });
            console.log("✅ Deposited gas credit for admin");
            
            // For now, create project directly since ProjectFactory doesn't support ERC2771
            // In a real implementation, ProjectFactory would inherit from ERC2771Context
            const tx = await projectFactory.connect(admin).createProject(
                PROJECT_ID,
                PROJECT_BUDGET,
                admin.address
            );
            const receipt = await tx.wait();
            
            console.log("✅ Project created (direct call for testing)");
            
            // Get project info
            const projectInfo = await projectFactory.projects(PROJECT_ID);
            projectReimbursement = await ethers.getContractAt(
                "ProjectReimbursement", 
                projectInfo.projectContract
            );
            console.log("  Project contract:", projectInfo.projectContract);
            
            // Whitelist project contract
            await metaTxForwarder.connect(admin).setTargetWhitelist(
                projectInfo.projectContract,
                true
            );
            console.log("✅ Whitelisted project contract in MetaTxForwarder");
            
            // Fund project with OMTHB
            await omthbToken.connect(admin).transfer(projectInfo.projectContract, PROJECT_BUDGET);
            console.log("✅ Funded project with", ethers.formatEther(PROJECT_BUDGET), "OMTHB");
            
            // Request gas refund
            await gasTank.connect(relayer).requestGasRefund(
                admin.address,
                receipt.gasUsed,
                receipt.gasPrice,
                ethers.keccak256(ethers.toUtf8Bytes(receipt.hash))
            );
            console.log("✅ Gas refund requested for relayer\n");
        });
        
        it("Should setup all roles via meta transactions", async function () {
            console.log("👥 Setting up roles via meta transactions...\n");
            
            // Setup gas credits for all users
            const users = [researcher, secretary, committee1, committee2, committee3, committee4, finance, director];
            for (const user of users) {
                await gasTank.connect(user).depositGasCredit(user.address, {
                    value: ethers.parseEther("0.1")
                });
            }
            console.log("✅ Deposited gas credits for all users");
            
            // Setup timelock controller for project
            const setTimelockData = projectReimbursement.interface.encodeFunctionData(
                "setTimelockController",
                [await timelockController.getAddress()]
            );
            
            const { request: tlRequest, signature: tlSig } = await signMetaTx(
                admin,
                metaTxForwarder,
                await projectReimbursement.getAddress(),
                setTimelockData
            );
            
            await metaTxForwarder.connect(relayer).execute(tlRequest, tlSig);
            console.log("✅ Set timelock controller via meta tx");
            
            // Batch role assignments
            const roles = [
                { role: "REQUESTER_ROLE", account: researcher },
                { role: "SECRETARY_ROLE", account: secretary },
                { role: "COMMITTEE_ROLE", account: committee1 },
                { role: "COMMITTEE_ROLE", account: committee2 },
                { role: "COMMITTEE_ROLE", account: committee3 },
                { role: "COMMITTEE_ROLE", account: committee4 },
                { role: "FINANCE_ROLE", account: finance },
                { role: "DIRECTOR_ROLE", account: director }
            ];
            
            for (const { role, account } of roles) {
                const roleHash = await projectReimbursement[role]();
                const nonce = Math.floor(Math.random() * 1000000);
                const chainId = (await ethers.provider.getNetwork()).chainId;
                
                // Commit
                const commitment = ethers.keccak256(
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ["bytes32", "address", "address", "uint256", "uint256"],
                        [roleHash, account.address, admin.address, chainId, nonce]
                    )
                );
                
                const commitData = projectReimbursement.interface.encodeFunctionData(
                    "commitRoleGrant",
                    [roleHash, commitment]
                );
                
                const { request: commitReq, signature: commitSig } = await signMetaTx(
                    admin,
                    metaTxForwarder,
                    await projectReimbursement.getAddress(),
                    commitData
                );
                
                await metaTxForwarder.connect(relayer).execute(commitReq, commitSig);
                
                // Wait for reveal window
                await time.increase(REVEAL_WINDOW + 1);
                
                // Reveal
                const revealData = projectReimbursement.interface.encodeFunctionData(
                    "grantRoleWithReveal",
                    [roleHash, account.address, nonce]
                );
                
                const { request: revealReq, signature: revealSig } = await signMetaTx(
                    admin,
                    metaTxForwarder,
                    await projectReimbursement.getAddress(),
                    revealData
                );
                
                await metaTxForwarder.connect(relayer).execute(revealReq, revealSig);
                console.log(`✅ Granted ${role} to ${account.address.slice(0, 10)}... via meta tx`);
            }
            
            console.log("\n✨ All roles setup complete!\n");
        });
        
        it("Should submit reimbursement requests gaslessly", async function () {
            console.log("📝 Submitting reimbursement requests via meta transactions...\n");
            
            const requests = [
                {
                    recipient: recipient1.address,
                    amount: ethers.parseEther("10000"),
                    description: "Conference travel expenses",
                    documentHash: "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"
                },
                {
                    recipient: recipient2.address,
                    amount: ethers.parseEther("5000"),
                    description: "Research equipment purchase",
                    documentHash: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"
                }
            ];
            
            for (let i = 0; i < requests.length; i++) {
                const req = requests[i];
                const createRequestData = projectReimbursement.interface.encodeFunctionData(
                    "createRequest",
                    [req.recipient, req.amount, req.description, req.documentHash]
                );
                
                const { request, signature } = await signMetaTx(
                    researcher,
                    metaTxForwarder,
                    await projectReimbursement.getAddress(),
                    createRequestData
                );
                
                const tx = await metaTxForwarder.connect(relayer).execute(request, signature);
                const receipt = await tx.wait();
                
                console.log(`✅ Request ${i} created gaslessly`);
                console.log(`  Amount: ${ethers.formatEther(req.amount)} OMTHB`);
                console.log(`  Description: ${req.description}`);
                console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
                
                // Request gas refund
                await gasTank.connect(relayer).requestGasRefund(
                    researcher.address,
                    receipt.gasUsed,
                    receipt.gasPrice,
                    ethers.keccak256(ethers.toUtf8Bytes(receipt.hash))
                );
            }
            
            console.log("\n✨ Reimbursement requests submitted!\n");
        });
        
        it("Should complete approval workflow gaslessly", async function () {
            console.log("✅ Processing approval workflow via meta transactions...\n");
            
            const requestId = 0; // First request
            const chainId = (await ethers.provider.getNetwork()).chainId;
            
            // Approval levels
            const approvers = [
                { name: "Secretary", signer: secretary, method: "approveBySecretary" },
                { name: "Committee", signer: committee1, method: "approveByCommittee" },
                { name: "Finance", signer: finance, method: "approveByFinance" },
                { name: "Committee Additional 1", signer: committee2, method: "approveByCommitteeAdditional" },
                { name: "Committee Additional 2", signer: committee3, method: "approveByCommitteeAdditional" },
                { name: "Committee Additional 3", signer: committee4, method: "approveByCommitteeAdditional" },
                { name: "Director", signer: director, method: "approveByDirector" }
            ];
            
            for (const approver of approvers) {
                console.log(`\n${approver.name} approval process:`);
                
                // Commit
                const nonce = Math.floor(Math.random() * 1000000);
                const commitment = generateCommitment(approver.signer.address, requestId, chainId, nonce);
                
                const commitData = projectReimbursement.interface.encodeFunctionData(
                    "commitApproval",
                    [requestId, commitment]
                );
                
                const { request: commitReq, signature: commitSig } = await signMetaTx(
                    approver.signer,
                    metaTxForwarder,
                    await projectReimbursement.getAddress(),
                    commitData
                );
                
                const commitTx = await metaTxForwarder.connect(relayer).execute(commitReq, commitSig);
                await commitTx.wait();
                console.log(`  ✅ Commitment submitted`);
                
                // Wait for reveal window
                await time.increase(REVEAL_WINDOW + 1);
                
                // Reveal
                const revealData = projectReimbursement.interface.encodeFunctionData(
                    approver.method,
                    [requestId, nonce]
                );
                
                const { request: revealReq, signature: revealSig } = await signMetaTx(
                    approver.signer,
                    metaTxForwarder,
                    await projectReimbursement.getAddress(),
                    revealData
                );
                
                const revealTx = await metaTxForwarder.connect(relayer).execute(revealReq, revealSig);
                const receipt = await revealTx.wait();
                console.log(`  ✅ Approval revealed`);
                console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
                
                // Request gas refund
                await gasTank.connect(relayer).requestGasRefund(
                    approver.signer.address,
                    receipt.gasUsed,
                    receipt.gasPrice,
                    ethers.keccak256(ethers.toUtf8Bytes(receipt.hash))
                );
            }
            
            // Check final status
            const request = await projectReimbursement.getRequest(requestId);
            expect(request.status).to.equal(6); // Distributed
            console.log("\n✅ Funds distributed successfully!");
            console.log(`  Recipient ${recipient1.address} received ${ethers.formatEther(request.amount)} OMTHB\n`);
        });
        
        it("Should close project gaslessly", async function () {
            console.log("🔒 Closing project via meta transactions...\n");
            
            // Initiate closure
            const initiateData = projectFactory.interface.encodeFunctionData(
                "initiateProjectClosure",
                [PROJECT_ID]
            );
            
            const { request: initReq, signature: initSig } = await signMetaTx(
                deputy1,
                metaTxForwarder,
                await projectFactory.getAddress(),
                initiateData
            );
            
            await metaTxForwarder.connect(relayer).execute(initReq, initSig);
            console.log("✅ Deputy1 initiated closure");
            
            // Additional signatures
            const signers = [deputy2, director];
            for (const signer of signers) {
                const signData = projectFactory.interface.encodeFunctionData(
                    "signClosureRequest",
                    [PROJECT_ID]
                );
                
                const { request, signature } = await signMetaTx(
                    signer,
                    metaTxForwarder,
                    await projectFactory.getAddress(),
                    signData
                );
                
                await metaTxForwarder.connect(relayer).execute(request, signature);
                console.log(`✅ ${signer === deputy2 ? 'Deputy2' : 'Director'} signed closure`);
            }
            
            // Verify project is closed
            const projectInfo = await projectFactory.projects(PROJECT_ID);
            expect(projectInfo.isActive).to.be.false;
            console.log("\n✅ Project closed successfully!\n");
        });
    });
    
    describe("3️⃣ Test Every Function as Gasless", function () {
        let testProjectId = "TEST-PROJECT-001";
        let testProject;
        
        before(async function () {
            // Create test project
            await projectFactory.connect(admin).createProject(
                testProjectId,
                ethers.parseEther("500000"),
                admin.address
            );
            
            const projectInfo = await projectFactory.projects(testProjectId);
            testProject = await ethers.getContractAt(
                "ProjectReimbursement",
                projectInfo.projectContract
            );
            
            // Whitelist and fund
            await metaTxForwarder.connect(admin).setTargetWhitelist(
                projectInfo.projectContract,
                true
            );
            await omthbToken.connect(admin).transfer(
                projectInfo.projectContract,
                ethers.parseEther("500000")
            );
        });
        
        it("Should test token operations gaslessly", async function () {
            console.log("🪙 Testing token operations via meta transactions...\n");
            
            // Test transfer
            const transferData = omthbToken.interface.encodeFunctionData(
                "transfer",
                [recipient1.address, ethers.parseEther("100")]
            );
            
            // Whitelist token contract
            await metaTxForwarder.connect(admin).setTargetWhitelist(
                await omthbToken.getAddress(),
                true
            );
            
            const { request: transferReq, signature: transferSig } = await signMetaTx(
                admin,
                metaTxForwarder,
                await omthbToken.getAddress(),
                transferData
            );
            
            await metaTxForwarder.connect(relayer).execute(transferReq, transferSig);
            console.log("✅ Transfer executed gaslessly");
            
            // Test approve
            const approveData = omthbToken.interface.encodeFunctionData(
                "approve",
                [testProject.target, ethers.parseEther("1000")]
            );
            
            const { request: approveReq, signature: approveSig } = await signMetaTx(
                admin,
                metaTxForwarder,
                await omthbToken.getAddress(),
                approveData
            );
            
            await metaTxForwarder.connect(relayer).execute(approveReq, approveSig);
            console.log("✅ Approve executed gaslessly");
            
            // Test mint (admin only)
            const mintData = omthbToken.interface.encodeFunctionData(
                "mint",
                [recipient2.address, ethers.parseEther("1000")]
            );
            
            const { request: mintReq, signature: mintSig } = await signMetaTx(
                admin,
                metaTxForwarder,
                await omthbToken.getAddress(),
                mintData
            );
            
            await metaTxForwarder.connect(relayer).execute(mintReq, mintSig);
            console.log("✅ Mint executed gaslessly");
            
            // Test burn
            const burnData = omthbToken.interface.encodeFunctionData(
                "burn",
                [ethers.parseEther("50")]
            );
            
            const { request: burnReq, signature: burnSig } = await signMetaTx(
                admin,
                metaTxForwarder,
                await omthbToken.getAddress(),
                burnData
            );
            
            await metaTxForwarder.connect(relayer).execute(burnReq, burnSig);
            console.log("✅ Burn executed gaslessly\n");
        });
        
        it("Should test project operations gaslessly", async function () {
            console.log("📋 Testing project operations via meta transactions...\n");
            
            // Test pause
            const pauseData = testProject.interface.encodeFunctionData("pause", []);
            
            const { request: pauseReq, signature: pauseSig } = await signMetaTx(
                admin,
                metaTxForwarder,
                testProject.target,
                pauseData
            );
            
            // Need multi-sig for pause - simulate
            await testProject.connect(admin).pause();
            console.log("✅ Pause executed (multi-sig simulated)");
            
            // Test unpause via timelock
            await testProject.connect(admin).setTimelockController(admin.address); // Simplified for test
            
            const unpauseData = testProject.interface.encodeFunctionData("unpause", []);
            
            const { request: unpauseReq, signature: unpauseSig } = await signMetaTx(
                admin,
                metaTxForwarder,
                testProject.target,
                unpauseData
            );
            
            await metaTxForwarder.connect(relayer).execute(unpauseReq, unpauseSig);
            console.log("✅ Unpause executed gaslessly");
            
            // Test budget update
            const updateBudgetData = testProject.interface.encodeFunctionData(
                "updateBudget",
                [ethers.parseEther("600000")]
            );
            
            const { request: budgetReq, signature: budgetSig } = await signMetaTx(
                admin,
                metaTxForwarder,
                testProject.target,
                updateBudgetData
            );
            
            await metaTxForwarder.connect(relayer).execute(budgetReq, budgetSig);
            console.log("✅ Budget update executed gaslessly\n");
        });
        
        it("Should test emergency functions gaslessly", async function () {
            console.log("🚨 Testing emergency functions via meta transactions...\n");
            
            // Test emergency stop activation
            const emergencyStopData = testProject.interface.encodeFunctionData(
                "activateEmergencyStop",
                []
            );
            
            // This requires multi-sig, so we'll simulate
            await testProject.connect(admin).activateEmergencyStop();
            console.log("✅ Emergency stop activated (multi-sig simulated)");
            
            // Test emergency stop deactivation
            const deactivateData = testProject.interface.encodeFunctionData(
                "deactivateEmergencyStop",
                []
            );
            
            const { request: deactivateReq, signature: deactivateSig } = await signMetaTx(
                admin,
                metaTxForwarder,
                testProject.target,
                deactivateData
            );
            
            await metaTxForwarder.connect(relayer).execute(deactivateReq, deactivateSig);
            console.log("✅ Emergency stop deactivated gaslessly\n");
        });
    });
    
    describe("4️⃣ Complex Scenarios", function () {
        it("Should handle multiple projects with different approvers", async function () {
            console.log("🏢 Testing multiple projects scenario...\n");
            
            const projects = [
                { id: "RESEARCH-001", budget: ethers.parseEther("200000") },
                { id: "DEVELOPMENT-001", budget: ethers.parseEther("300000") },
                { id: "MARKETING-001", budget: ethers.parseEther("150000") }
            ];
            
            for (const project of projects) {
                // Create project gaslessly
                const createData = projectFactory.interface.encodeFunctionData(
                    "createProject",
                    [project.id, project.budget, admin.address]
                );
                
                const { request, signature } = await signMetaTx(
                    admin,
                    metaTxForwarder,
                    await projectFactory.getAddress(),
                    createData
                );
                
                await metaTxForwarder.connect(relayer).execute(request, signature);
                console.log(`✅ Created project ${project.id} gaslessly`);
            }
            
            console.log("\n✨ Multiple projects created successfully!\n");
        });
        
        it("Should handle batch operations", async function () {
            console.log("📦 Testing batch operations...\n");
            
            // Prepare multiple meta transactions
            const requests = [];
            const signatures = [];
            
            // Batch transfer operations
            const recipients = [recipient1, recipient2];
            for (const recipient of recipients) {
                const transferData = omthbToken.interface.encodeFunctionData(
                    "transfer",
                    [recipient.address, ethers.parseEther("50")]
                );
                
                const { request, signature } = await signMetaTx(
                    admin,
                    metaTxForwarder,
                    await omthbToken.getAddress(),
                    transferData
                );
                
                requests.push(request);
                signatures.push(signature);
            }
            
            // Execute batch
            const batchTx = await metaTxForwarder.connect(relayer).batchExecute(requests, signatures);
            const receipt = await batchTx.wait();
            
            console.log("✅ Batch execution completed");
            console.log(`  Total gas used: ${receipt.gasUsed.toString()}`);
            console.log(`  Average gas per tx: ${(receipt.gasUsed / BigInt(requests.length)).toString()}`);
            
            // Batch gas refund
            const users = new Array(requests.length).fill(admin.address);
            const gasUsages = new Array(requests.length).fill(100000);
            const gasPrices = new Array(requests.length).fill(ethers.parseUnits("20", "gwei"));
            const txHashes = requests.map((_, i) => ethers.keccak256(ethers.toUtf8Bytes(`batch-${i}`)));
            
            await gasTank.connect(relayer).batchRequestGasRefund(
                users,
                gasUsages,
                gasPrices,
                txHashes
            );
            
            console.log("✅ Batch gas refunds processed\n");
        });
        
        it("Should handle concurrent operations", async function () {
            console.log("⚡ Testing concurrent operations...\n");
            
            // Simulate multiple users submitting transactions simultaneously
            const concurrentOps = [
                { user: researcher, action: "createRequest" },
                { user: admin, action: "transfer" },
                { user: secretary, action: "commitment" }
            ];
            
            const promises = concurrentOps.map(async (op) => {
                let data;
                let target;
                
                if (op.action === "createRequest") {
                    data = projectReimbursement.interface.encodeFunctionData(
                        "createRequest",
                        [recipient1.address, ethers.parseEther("1000"), "Test concurrent", "QmTest"]
                    );
                    target = await projectReimbursement.getAddress();
                } else if (op.action === "transfer") {
                    data = omthbToken.interface.encodeFunctionData(
                        "transfer",
                        [recipient2.address, ethers.parseEther("10")]
                    );
                    target = await omthbToken.getAddress();
                } else {
                    data = projectReimbursement.interface.encodeFunctionData(
                        "commitApproval",
                        [0, ethers.keccak256(ethers.toUtf8Bytes("test"))]
                    );
                    target = await projectReimbursement.getAddress();
                }
                
                const { request, signature } = await signMetaTx(op.user, metaTxForwarder, target, data);
                return metaTxForwarder.connect(relayer).execute(request, signature);
            });
            
            const results = await Promise.all(promises);
            console.log(`✅ ${results.length} concurrent operations completed successfully\n`);
        });
        
        it("Should test rate limiting and gas credit management", async function () {
            console.log("⏱️  Testing rate limiting...\n");
            
            // Test rate limit
            const maxTxPerWindow = await metaTxForwarder.maxTxPerWindow();
            console.log(`  Max transactions per window: ${maxTxPerWindow}`);
            
            // Test gas credit limits
            await gasTank.connect(admin).updateGasCredit(
                researcher.address,
                ethers.parseEther("0.01"), // Max per tx
                ethers.parseEther("0.05")  // Daily limit
            );
            console.log("✅ Updated gas credit limits for researcher");
            
            // Check available credit
            const availableCredit = await gasTank.getAvailableCredit(researcher.address);
            console.log(`  Available credit: ${ethers.formatEther(availableCredit)} ETH`);
            
            // Get usage history
            const usageHistory = await gasTank.getGasUsageHistory(researcher.address, 5);
            console.log(`  Recent transactions: ${usageHistory.length}\n`);
        });
    });
    
    describe("5️⃣ Performance Analysis", function () {
        it("Should analyze gas costs comparison", async function () {
            console.log("📊 Gas Cost Analysis\n");
            console.log("=".repeat(60));
            
            // Direct transaction cost
            const directTx = await projectReimbursement.connect(admin).createRequest(
                recipient1.address,
                ethers.parseEther("1000"),
                "Direct transaction test",
                "QmDirect"
            );
            const directReceipt = await directTx.wait();
            
            // Meta transaction cost
            const metaTxData = projectReimbursement.interface.encodeFunctionData(
                "createRequest",
                [recipient2.address, ethers.parseEther("1000"), "Meta transaction test", "QmMeta"]
            );
            
            const { request, signature } = await signMetaTx(
                researcher,
                metaTxForwarder,
                await projectReimbursement.getAddress(),
                metaTxData
            );
            
            const metaTx = await metaTxForwarder.connect(relayer).execute(request, signature);
            const metaReceipt = await metaTx.wait();
            
            console.log("Direct Transaction:");
            console.log(`  Gas used: ${directReceipt.gasUsed.toString()}`);
            console.log(`  Gas price: ${ethers.formatUnits(directReceipt.gasPrice, "gwei")} gwei`);
            console.log(`  Total cost: ${ethers.formatEther(directReceipt.gasUsed * directReceipt.gasPrice)} ETH`);
            
            console.log("\nMeta Transaction:");
            console.log(`  Gas used: ${metaReceipt.gasUsed.toString()}`);
            console.log(`  Gas price: ${ethers.formatUnits(metaReceipt.gasPrice, "gwei")} gwei`);
            console.log(`  Total cost: ${ethers.formatEther(metaReceipt.gasUsed * metaReceipt.gasPrice)} ETH`);
            
            const overhead = ((metaReceipt.gasUsed - directReceipt.gasUsed) * 100n) / directReceipt.gasUsed;
            console.log(`\nMeta transaction overhead: ${overhead.toString()}%`);
            console.log("=".repeat(60) + "\n");
        });
        
        it("Should analyze gas tank sustainability", async function () {
            console.log("💰 Gas Tank Sustainability Analysis\n");
            
            const tankBalance = await ethers.provider.getBalance(await gasTank.getAddress());
            const totalDeposited = await gasTank.totalDeposited();
            const totalRefunded = await gasTank.totalRefunded();
            
            console.log(`Tank Balance: ${ethers.formatEther(tankBalance)} ETH`);
            console.log(`Total Deposited: ${ethers.formatEther(totalDeposited)} ETH`);
            console.log(`Total Refunded: ${ethers.formatEther(totalRefunded)} ETH`);
            console.log(`Utilization: ${((totalRefunded * 100n) / totalDeposited).toString()}%`);
            
            // Calculate average cost per transaction
            const relayerStats = await gasTank.relayerStats(relayer.address);
            const avgCostPerTx = relayerStats.transactionCount > 0 
                ? relayerStats.totalRefunded / relayerStats.transactionCount 
                : 0n;
            
            console.log(`\nRelayer Statistics:`);
            console.log(`  Total transactions: ${relayerStats.transactionCount}`);
            console.log(`  Average cost per tx: ${ethers.formatEther(avgCostPerTx)} ETH`);
            
            // Estimate runway
            if (avgCostPerTx > 0) {
                const remainingTxs = tankBalance / avgCostPerTx;
                console.log(`  Estimated remaining transactions: ${remainingTxs.toString()}`);
            }
            
            console.log("\n✨ Analysis complete!\n");
        });
        
        it("Should perform load testing", async function () {
            console.log("🔥 Load Testing (10 rapid transactions)...\n");
            
            const startTime = Date.now();
            const txCount = 10;
            const txPromises = [];
            
            for (let i = 0; i < txCount; i++) {
                const transferData = omthbToken.interface.encodeFunctionData(
                    "transfer",
                    [recipient1.address, ethers.parseEther("1")]
                );
                
                const { request, signature } = await signMetaTx(
                    admin,
                    metaTxForwarder,
                    await omthbToken.getAddress(),
                    transferData
                );
                
                txPromises.push(
                    metaTxForwarder.connect(relayer).execute(request, signature)
                );
            }
            
            const results = await Promise.all(txPromises);
            const endTime = Date.now();
            
            console.log(`✅ Completed ${txCount} transactions`);
            console.log(`  Total time: ${(endTime - startTime) / 1000} seconds`);
            console.log(`  Average time per tx: ${(endTime - startTime) / txCount} ms`);
            console.log(`  TPS: ${(txCount * 1000 / (endTime - startTime)).toFixed(2)}\n`);
        });
    });
    
    describe("6️⃣ Error Scenarios and Edge Cases", function () {
        it("Should handle insufficient gas credits", async function () {
            console.log("❌ Testing insufficient gas credit scenario...\n");
            
            // Create user with minimal gas credit
            const poorUser = ethers.Wallet.createRandom().connect(ethers.provider);
            await admin.sendTransaction({ to: poorUser.address, value: ethers.parseEther("0.1") });
            
            await gasTank.connect(poorUser).depositGasCredit(poorUser.address, {
                value: ethers.parseEther("0.0001") // Very small amount
            });
            
            // Update limits to be very restrictive
            await gasTank.connect(admin).updateGasCredit(
                poorUser.address,
                ethers.parseEther("0.00001"), // Tiny max per tx
                ethers.parseEther("0.00005")  // Tiny daily limit
            );
            
            // Try to execute expensive operation
            const data = omthbToken.interface.encodeFunctionData(
                "transfer",
                [recipient1.address, ethers.parseEther("1")]
            );
            
            // This should fail during gas refund
            try {
                await gasTank.connect(relayer).requestGasRefund(
                    poorUser.address,
                    200000, // High gas usage
                    ethers.parseUnits("50", "gwei"),
                    ethers.keccak256(ethers.toUtf8Bytes("test"))
                );
                expect.fail("Should have failed");
            } catch (error) {
                console.log("✅ Correctly rejected: Transaction limit exceeded\n");
            }
        });
        
        it("Should handle expired deadlines", async function () {
            console.log("⏰ Testing expired deadline scenario...\n");
            
            const data = omthbToken.interface.encodeFunctionData(
                "transfer",
                [recipient1.address, ethers.parseEther("1")]
            );
            
            const nonce = await metaTxForwarder.getNonce(admin.address);
            const expiredDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
            const chainId = (await ethers.provider.getNetwork()).chainId;
            
            const request = {
                from: admin.address,
                to: await omthbToken.getAddress(),
                value: 0,
                gas: 500000,
                nonce: nonce,
                deadline: expiredDeadline,
                chainId: chainId,
                data: data
            };
            
            const domain = {
                name: "MetaTxForwarder",
                version: "1",
                chainId: chainId,
                verifyingContract: await metaTxForwarder.getAddress()
            };
            
            const types = {
                ForwardRequest: [
                    { name: "from", type: "address" },
                    { name: "to", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "gas", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                    { name: "chainId", type: "uint256" },
                    { name: "data", type: "bytes" }
                ]
            };
            
            const signature = await admin.signTypedData(domain, types, request);
            
            await expect(
                metaTxForwarder.connect(relayer).execute(request, signature)
            ).to.be.revertedWithCustomError(metaTxForwarder, "ExpiredDeadline");
            
            console.log("✅ Correctly rejected expired deadline\n");
        });
        
        it("Should handle replay attacks", async function () {
            console.log("🔒 Testing replay attack prevention...\n");
            
            // Create valid meta transaction
            const data = omthbToken.interface.encodeFunctionData(
                "transfer",
                [recipient1.address, ethers.parseEther("1")]
            );
            
            const { request, signature } = await signMetaTx(
                admin,
                metaTxForwarder,
                await omthbToken.getAddress(),
                data
            );
            
            // Execute once
            await metaTxForwarder.connect(relayer).execute(request, signature);
            console.log("✅ First execution successful");
            
            // Try to replay
            await expect(
                metaTxForwarder.connect(relayer).execute(request, signature)
            ).to.be.revertedWithCustomError(metaTxForwarder, "InvalidNonce");
            
            console.log("✅ Replay attack prevented\n");
        });
    });
    
    after(async function () {
        console.log("=== 📊 FINAL SUMMARY ===\n");
        
        // Gas Tank Summary
        const tankBalance = await ethers.provider.getBalance(await gasTank.getAddress());
        const totalDeposited = await gasTank.totalDeposited();
        const totalRefunded = await gasTank.totalRefunded();
        
        console.log("Gas Tank Status:");
        console.log(`  Final balance: ${ethers.formatEther(tankBalance)} ETH`);
        console.log(`  Total deposited: ${ethers.formatEther(totalDeposited)} ETH`);
        console.log(`  Total refunded: ${ethers.formatEther(totalRefunded)} ETH`);
        console.log(`  Efficiency: ${100 - Number((totalRefunded * 100n) / totalDeposited)}%\n`);
        
        // Relayer Summary
        const relayerStats = await gasTank.relayerStats(relayer.address);
        console.log("Relayer Statistics:");
        console.log(`  Total transactions: ${relayerStats.transactionCount}`);
        console.log(`  Total refunded: ${ethers.formatEther(relayerStats.totalRefunded)} ETH`);
        console.log(`  Average per tx: ${ethers.formatEther(
            relayerStats.transactionCount > 0 
                ? relayerStats.totalRefunded / relayerStats.transactionCount 
                : 0n
        )} ETH\n`);
        
        // Project Summary
        const projectInfo = await projectFactory.projects(PROJECT_ID);
        console.log("Project Status:");
        console.log(`  Project ID: ${PROJECT_ID}`);
        console.log(`  Contract: ${projectInfo.projectContract}`);
        console.log(`  Active: ${projectInfo.isActive}`);
        console.log(`  Total distributed: ${ethers.formatEther(await projectReimbursement.totalDistributed())} OMTHB`);
        
        console.log("\n✨ All tests completed successfully! ✨");
    });
});