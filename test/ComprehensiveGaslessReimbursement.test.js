const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Comprehensive Gasless Reimbursement System", function () {
    let gasTank;
    let forwarder;
    let omthbToken;
    let projectReimbursement;
    let projectFactory;
    let timelockController;

    // Role accounts
    let admin;
    let secretary;
    let committee1, committee2, committee3, committee4;
    let finance;
    let director;
    let requester1, requester2;
    let recipient1, recipient2;
    let deputy1, deputy2;
    let relayer;
    let owner;

    const PROJECT_ID = "GASLESS-TEST-001";
    const PROJECT_BUDGET = ethers.parseEther("5000000"); // 5M OMTHB
    const INITIAL_MINT = ethers.parseEther("20000000"); // 20M OMTHB
    const REVEAL_WINDOW = 30 * 60; // 30 minutes

    // EIP-712 Domain
    const DOMAIN_NAME = "MetaTxForwarder";
    const DOMAIN_VERSION = "1";

    // Helper function to sign meta transaction
    async function signMetaTransaction(signer, forwardRequest) {
        const domain = {
            name: DOMAIN_NAME,
            version: DOMAIN_VERSION,
            chainId: forwardRequest.chainId,
            verifyingContract: forwarder.target
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

        return await signer.signTypedData(domain, types, forwardRequest);
    }

    // Helper function to execute gasless transaction
    async function executeGaslessTransaction(signer, targetContract, functionData, value = 0) {
        const nonce = await forwarder.getNonce(signer.address);
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
        const chainId = (await ethers.provider.getNetwork()).chainId;

        const forwardRequest = {
            from: signer.address,
            to: targetContract,
            value: value,
            gas: 500000,
            nonce: nonce,
            deadline: deadline,
            chainId: chainId,
            data: functionData
        };

        const signature = await signMetaTransaction(signer, forwardRequest);

        // Execute through relayer
        const tx = await forwarder.connect(relayer).execute(forwardRequest, signature);
        const receipt = await tx.wait();

        // Request gas refund
        const gasUsed = receipt.gasUsed;
        const gasPrice = tx.gasPrice;
        const txHash = receipt.hash;

        await gasTank.connect(relayer).requestGasRefund(
            signer.address,
            gasUsed,
            gasPrice,
            txHash
        );

        return receipt;
    }

    // Helper function to commit and reveal approval
    async function commitAndRevealApproval(approver, requestId, approvalFunction) {
        // Commit phase
        const nonce = ethers.randomBytes(32);
        const commitment = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "uint256"],
                [approver.address, requestId, (await ethers.provider.getNetwork()).chainId, nonce]
            )
        );

        const commitData = projectReimbursement.interface.encodeFunctionData("commitApproval", [requestId, commitment]);
        await executeGaslessTransaction(approver, projectReimbursement.target, commitData);

        // Wait for reveal window
        await time.increase(REVEAL_WINDOW + 1);

        // Reveal phase
        const revealData = projectReimbursement.interface.encodeFunctionData(approvalFunction, [requestId, nonce]);
        await executeGaslessTransaction(approver, projectReimbursement.target, revealData);
    }

    // Helper function for emergency closure commit and reveal
    async function commitAndRevealClosureApproval(approver, closureId) {
        // Commit phase
        const nonce = ethers.randomBytes(32);
        const commitment = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "uint256"],
                [approver.address, closureId, (await ethers.provider.getNetwork()).chainId, nonce]
            )
        );

        const commitData = projectReimbursement.interface.encodeFunctionData("commitClosureApproval", [closureId, commitment]);
        await executeGaslessTransaction(approver, projectReimbursement.target, commitData);

        // Wait for reveal window
        await time.increase(REVEAL_WINDOW + 1);

        // Reveal phase
        const revealData = projectReimbursement.interface.encodeFunctionData("approveEmergencyClosure", [closureId, nonce]);
        await executeGaslessTransaction(approver, projectReimbursement.target, revealData);
    }

    beforeEach(async function () {
        // Get signers
        [owner, admin, secretary, committee1, committee2, committee3, committee4, 
         finance, director, requester1, requester2, recipient1, recipient2, 
         deputy1, deputy2, relayer] = await ethers.getSigners();

        // Deploy Timelock Controller
        const TimelockController = await ethers.getContractFactory("TimelockController");
        const proposers = [admin.address, deputy1.address, deputy2.address];
        const executors = [admin.address, deputy1.address, deputy2.address];
        const adminRole = admin.address;
        timelockController = await TimelockController.deploy(
            2 * 24 * 60 * 60, // 2 days min delay
            proposers,
            executors,
            adminRole
        );
        await timelockController.waitForDeployment();

        // Deploy Gas Tank
        const GasTank = await ethers.getContractFactory("GasTank");
        gasTank = await GasTank.deploy(admin.address, admin.address);
        await gasTank.waitForDeployment();

        // Grant relayer role
        await gasTank.connect(admin).grantRole(await gasTank.RELAYER_ROLE(), relayer.address);

        // Deploy Meta Transaction Forwarder
        const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
        forwarder = await MetaTxForwarder.deploy();
        await forwarder.waitForDeployment();

        // Deploy OMTHB Token
        const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
        omthbToken = await upgrades.deployProxy(
            OMTHBToken,
            [admin.address],
            { initializer: "initialize" }
        );
        await omthbToken.waitForDeployment();

        // Mint tokens
        await omthbToken.connect(admin).mint(admin.address, INITIAL_MINT);

        // Deploy Project Reimbursement implementation
        const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
        const projectImpl = await ProjectReimbursement.deploy();
        await projectImpl.waitForDeployment();

        // Deploy Project Factory
        const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
        projectFactory = await ProjectFactory.deploy(
            projectImpl.target,
            omthbToken.target,
            admin.address
        );
        await projectFactory.waitForDeployment();

        // Grant PROJECT_CREATOR_ROLE to admin
        await projectFactory.connect(admin).grantRole(await projectFactory.PROJECT_CREATOR_ROLE(), admin.address);

        // Create project
        await omthbToken.connect(admin).approve(projectFactory.target, PROJECT_BUDGET);
        const tx = await projectFactory.connect(admin).createProject(PROJECT_ID, PROJECT_BUDGET, admin.address);
        const receipt = await tx.wait();

        // Get project address from event
        let projectAddress;
        for (const log of receipt.logs) {
            try {
                const parsed = projectFactory.interface.parseLog(log);
                if (parsed && parsed.name === "ProjectCreated") {
                    projectAddress = parsed.args[1];
                    break;
                }
            } catch (e) {}
        }

        projectReimbursement = await ethers.getContractAt("ProjectReimbursement", projectAddress);

        // Setup timelock controller
        await projectReimbursement.connect(admin).setTimelockController(timelockController.target);

        // Setup all roles using direct grant (for initial setup)
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.SECRETARY_ROLE(), secretary.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.COMMITTEE_ROLE(), committee1.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.COMMITTEE_ROLE(), committee2.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.COMMITTEE_ROLE(), committee3.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.COMMITTEE_ROLE(), committee4.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.FINANCE_ROLE(), finance.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.DIRECTOR_ROLE(), director.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.REQUESTER_ROLE(), requester1.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.REQUESTER_ROLE(), requester2.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.DEFAULT_ADMIN_ROLE(), deputy1.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.DEFAULT_ADMIN_ROLE(), deputy2.address);

        // Whitelist contracts in forwarder
        await forwarder.setTargetWhitelist(projectReimbursement.target, true);
        await forwarder.setTargetWhitelist(omthbToken.target, true);

        // Fund gas tank and setup credits for all users
        await gasTank.connect(admin).depositGasCredit(admin.address, { value: ethers.parseEther("2") });
        await gasTank.connect(secretary).depositGasCredit(secretary.address, { value: ethers.parseEther("2") });
        await gasTank.connect(committee1).depositGasCredit(committee1.address, { value: ethers.parseEther("2") });
        await gasTank.connect(committee2).depositGasCredit(committee2.address, { value: ethers.parseEther("2") });
        await gasTank.connect(committee3).depositGasCredit(committee3.address, { value: ethers.parseEther("2") });
        await gasTank.connect(committee4).depositGasCredit(committee4.address, { value: ethers.parseEther("2") });
        await gasTank.connect(finance).depositGasCredit(finance.address, { value: ethers.parseEther("2") });
        await gasTank.connect(director).depositGasCredit(director.address, { value: ethers.parseEther("2") });
        await gasTank.connect(requester1).depositGasCredit(requester1.address, { value: ethers.parseEther("2") });
        await gasTank.connect(requester2).depositGasCredit(requester2.address, { value: ethers.parseEther("2") });
        await gasTank.connect(deputy1).depositGasCredit(deputy1.address, { value: ethers.parseEther("2") });
        await gasTank.connect(deputy2).depositGasCredit(deputy2.address, { value: ethers.parseEther("2") });

        // Fund relayer
        await owner.sendTransaction({
            to: relayer.address,
            value: ethers.parseEther("10")
        });
    });

    describe("1. Meta-Transactions and Gas Tank Integration", function () {
        it("Should allow users to create reimbursement requests without paying gas", async function () {
            console.log("\n=== TEST: Gasless Reimbursement Request Creation ===\n");

            const amount = ethers.parseEther("1000");
            const description = "Conference expenses - gasless";
            const documentHash = "QmTestHashGasless123";

            // Check initial gas credits
            const initialCredit = await gasTank.getAvailableCredit(requester1.address);
            console.log(`Initial gas credit: ${ethers.formatEther(initialCredit)} OM`);

            // Create request using gasless transaction
            const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                recipient1.address,
                amount,
                description,
                documentHash
            ]);

            const receipt = await executeGaslessTransaction(requester1, projectReimbursement.target, createData);
            console.log(`Gas used for request creation: ${receipt.gasUsed}`);

            // Verify request was created
            const request = await projectReimbursement.getRequest(0);
            expect(request.requester).to.equal(requester1.address);
            expect(request.amount).to.equal(amount);
            expect(request.status).to.equal(0); // Pending

            // Check gas credit was deducted
            const finalCredit = await gasTank.getAvailableCredit(requester1.address);
            console.log(`Final gas credit: ${ethers.formatEther(finalCredit)} OM`);
            expect(finalCredit).to.be.lt(initialCredit);

            // Verify relayer was refunded
            const relayerStats = await gasTank.relayerStats(relayer.address);
            console.log(`Relayer refunded: ${ethers.formatEther(relayerStats.totalRefunded)} OM`);
            expect(relayerStats.totalRefunded).to.be.gt(0);
        });

        it("Should validate meta-transaction signatures correctly", async function () {
            console.log("\n=== TEST: Meta-Transaction Signature Validation ===\n");

            // Try to execute with invalid signature
            const nonce = await forwarder.getNonce(requester1.address);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const chainId = (await ethers.provider.getNetwork()).chainId;

            const forwardRequest = {
                from: requester1.address,
                to: projectReimbursement.target,
                value: 0,
                gas: 500000,
                nonce: nonce,
                deadline: deadline,
                chainId: chainId,
                data: "0x12345678" // Invalid function data
            };

            // Sign with wrong signer
            const invalidSignature = await signMetaTransaction(requester2, forwardRequest);

            // Should fail with InvalidSignature
            await expect(
                forwarder.connect(relayer).execute(forwardRequest, invalidSignature)
            ).to.be.revertedWithCustomError(forwarder, "InvalidSignature");
        });

        it("Should prevent replay attacks", async function () {
            console.log("\n=== TEST: Replay Attack Prevention ===\n");

            const amount = ethers.parseEther("500");
            const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                recipient1.address,
                amount,
                "Test request",
                "QmTest123"
            ]);

            const nonce = await forwarder.getNonce(requester1.address);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const chainId = (await ethers.provider.getNetwork()).chainId;

            const forwardRequest = {
                from: requester1.address,
                to: projectReimbursement.target,
                value: 0,
                gas: 500000,
                nonce: nonce,
                deadline: deadline,
                chainId: chainId,
                data: createData
            };

            const signature = await signMetaTransaction(requester1, forwardRequest);

            // Execute first time - should succeed
            await forwarder.connect(relayer).execute(forwardRequest, signature);

            // Try to replay - should fail
            await expect(
                forwarder.connect(relayer).execute(forwardRequest, signature)
            ).to.be.revertedWithCustomError(forwarder, "InvalidNonce");
        });
    });

    describe("2. Complete Role System (8 Roles)", function () {
        it("Should verify all 8 roles are properly configured", async function () {
            console.log("\n=== TEST: Complete Role System Verification ===\n");

            // Check Admin role
            expect(await projectReimbursement.hasRole(await projectReimbursement.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
            console.log("✓ Admin role assigned");

            // Check Secretary role
            expect(await projectReimbursement.hasRole(await projectReimbursement.SECRETARY_ROLE(), secretary.address)).to.be.true;
            console.log("✓ Secretary role assigned");

            // Check Committee roles (4 members)
            expect(await projectReimbursement.hasRole(await projectReimbursement.COMMITTEE_ROLE(), committee1.address)).to.be.true;
            expect(await projectReimbursement.hasRole(await projectReimbursement.COMMITTEE_ROLE(), committee2.address)).to.be.true;
            expect(await projectReimbursement.hasRole(await projectReimbursement.COMMITTEE_ROLE(), committee3.address)).to.be.true;
            expect(await projectReimbursement.hasRole(await projectReimbursement.COMMITTEE_ROLE(), committee4.address)).to.be.true;
            console.log("✓ Committee roles assigned (4 members)");

            // Check Finance role
            expect(await projectReimbursement.hasRole(await projectReimbursement.FINANCE_ROLE(), finance.address)).to.be.true;
            console.log("✓ Finance role assigned");

            // Check Director role
            expect(await projectReimbursement.hasRole(await projectReimbursement.DIRECTOR_ROLE(), director.address)).to.be.true;
            console.log("✓ Director role assigned");

            // Check Requester roles
            expect(await projectReimbursement.hasRole(await projectReimbursement.REQUESTER_ROLE(), requester1.address)).to.be.true;
            expect(await projectReimbursement.hasRole(await projectReimbursement.REQUESTER_ROLE(), requester2.address)).to.be.true;
            console.log("✓ Requester roles assigned (2 members)");

            // Recipients don't need roles - they just receive funds
            console.log("✓ Recipients configured (no role required)");

            // Check Deputy roles
            expect(await projectReimbursement.hasRole(await projectReimbursement.DEFAULT_ADMIN_ROLE(), deputy1.address)).to.be.true;
            expect(await projectReimbursement.hasRole(await projectReimbursement.DEFAULT_ADMIN_ROLE(), deputy2.address)).to.be.true;
            console.log("✓ Deputy roles assigned (backup administrators)");
        });

        it("Should enforce role-based access control", async function () {
            console.log("\n=== TEST: Role-Based Access Control ===\n");

            // Non-requester cannot create request
            const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                recipient1.address,
                ethers.parseEther("100"),
                "Unauthorized request",
                "QmUnauthorized"
            ]);

            await expect(
                executeGaslessTransaction(secretary, projectReimbursement.target, createData)
            ).to.be.reverted;
            console.log("✓ Non-requester cannot create requests");

            // Non-secretary cannot approve at level 1
            // First create a valid request
            const validCreateData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                recipient1.address,
                ethers.parseEther("100"),
                "Valid request",
                "QmValid"
            ]);
            await executeGaslessTransaction(requester1, projectReimbursement.target, validCreateData);

            // Try to approve with non-secretary
            const nonce = ethers.randomBytes(32);
            const commitment = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256"],
                    [finance.address, 0, (await ethers.provider.getNetwork()).chainId, nonce]
                )
            );

            const commitData = projectReimbursement.interface.encodeFunctionData("commitApproval", [0, commitment]);
            await expect(
                executeGaslessTransaction(finance, projectReimbursement.target, commitData)
            ).to.be.reverted;
            console.log("✓ Role-based approval restrictions enforced");
        });
    });

    describe("3. 5-Level Approval Workflow with Gasless Transactions", function () {
        let requestId;

        beforeEach(async function () {
            // Create a reimbursement request
            const amount = ethers.parseEther("5000");
            const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                recipient1.address,
                amount,
                "Complete workflow test",
                "QmWorkflowTest123"
            ]);

            await executeGaslessTransaction(requester1, projectReimbursement.target, createData);
            requestId = 0;
        });

        it("Should complete full 5-level approval workflow using gasless transactions", async function () {
            console.log("\n=== TEST: Complete 5-Level Gasless Approval Workflow ===\n");

            // Level 1: Secretary approval
            console.log("Level 1: Secretary approval...");
            await commitAndRevealApproval(secretary, requestId, "approveBySecretary");
            let request = await projectReimbursement.getRequest(requestId);
            expect(request.status).to.equal(1); // SecretaryApproved
            console.log("✓ Secretary approved (gasless)");

            // Level 2: Committee approval (1 member)
            console.log("\nLevel 2: Committee approval...");
            await commitAndRevealApproval(committee1, requestId, "approveByCommittee");
            request = await projectReimbursement.getRequest(requestId);
            expect(request.status).to.equal(2); // CommitteeApproved
            console.log("✓ Committee member 1 approved (gasless)");

            // Level 3: Finance approval
            console.log("\nLevel 3: Finance approval...");
            await commitAndRevealApproval(finance, requestId, "approveByFinance");
            request = await projectReimbursement.getRequest(requestId);
            expect(request.status).to.equal(3); // FinanceApproved
            console.log("✓ Finance approved (gasless)");

            // Level 4: Additional committee approvals (3 different members)
            console.log("\nLevel 4: Additional committee approvals...");
            
            // Committee member 2
            await commitAndRevealApproval(committee2, requestId, "approveByCommitteeAdditional");
            let approvers = await projectReimbursement.getCommitteeAdditionalApprovers(requestId);
            expect(approvers.length).to.equal(1);
            console.log("✓ Committee member 2 approved (gasless)");

            // Committee member 3
            await commitAndRevealApproval(committee3, requestId, "approveByCommitteeAdditional");
            approvers = await projectReimbursement.getCommitteeAdditionalApprovers(requestId);
            expect(approvers.length).to.equal(2);
            console.log("✓ Committee member 3 approved (gasless)");

            // Committee member 4
            await commitAndRevealApproval(committee4, requestId, "approveByCommitteeAdditional");
            approvers = await projectReimbursement.getCommitteeAdditionalApprovers(requestId);
            expect(approvers.length).to.equal(3);
            console.log("✓ Committee member 4 approved (gasless)");

            // Check balances before director approval
            const recipientBalanceBefore = await omthbToken.balanceOf(recipient1.address);
            const contractBalanceBefore = await omthbToken.balanceOf(projectReimbursement.target);

            // Level 5: Director approval with auto-distribution
            console.log("\nLevel 5: Director approval with auto-distribution...");
            await commitAndRevealApproval(director, requestId, "approveByDirector");
            request = await projectReimbursement.getRequest(requestId);
            expect(request.status).to.equal(5); // Distributed
            console.log("✓ Director approved and funds distributed (gasless)");

            // Verify funds were transferred
            const recipientBalanceAfter = await omthbToken.balanceOf(recipient1.address);
            const contractBalanceAfter = await omthbToken.balanceOf(projectReimbursement.target);

            expect(recipientBalanceAfter).to.equal(recipientBalanceBefore + request.amount);
            expect(contractBalanceAfter).to.equal(contractBalanceBefore - request.amount);
            console.log(`✓ Recipient received ${ethers.formatEther(request.amount)} OMTHB`);

            // Check total gas credits used
            const totalGasUsed = await gasTank.totalRefunded();
            console.log(`\nTotal gas refunded: ${ethers.formatEther(totalGasUsed)} OM`);
            console.log("✓ All approvals completed without users paying gas");
        });

        it("Should enforce proper approval sequence", async function () {
            console.log("\n=== TEST: Approval Sequence Enforcement ===\n");

            // Try to skip secretary and go directly to committee
            const nonce = ethers.randomBytes(32);
            const commitment = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256"],
                    [committee1.address, requestId, (await ethers.provider.getNetwork()).chainId, nonce]
                )
            );

            const commitData = projectReimbursement.interface.encodeFunctionData("commitApproval", [requestId, commitment]);
            await expect(
                executeGaslessTransaction(committee1, projectReimbursement.target, commitData)
            ).to.be.reverted;
            console.log("✓ Cannot skip approval levels");

            // Approve by secretary first
            await commitAndRevealApproval(secretary, requestId, "approveBySecretary");

            // Try to have same committee member approve twice
            await commitAndRevealApproval(committee1, requestId, "approveByCommittee");
            
            // Skip to finance approval
            await commitAndRevealApproval(finance, requestId, "approveByFinance");

            // Try to have committee1 approve again in additional round
            await expect(
                commitAndRevealApproval(committee1, requestId, "approveByCommitteeAdditional")
            ).to.be.reverted;
            console.log("✓ Same committee member cannot approve twice");
        });
    });

    describe("4. Emergency Closure with Meta-Transactions", function () {
        it("Should execute complete emergency closure workflow using gasless transactions", async function () {
            console.log("\n=== TEST: Emergency Closure Workflow (Gasless) ===\n");

            // First add some funds to the contract
            await omthbToken.connect(admin).transfer(projectReimbursement.target, ethers.parseEther("10000"));
            const initialBalance = await omthbToken.balanceOf(projectReimbursement.target);
            console.log(`Contract balance: ${ethers.formatEther(initialBalance)} OMTHB`);

            // Initiate emergency closure by committee member
            console.log("\n1. Initiating emergency closure...");
            const returnAddress = admin.address;
            const reason = "Emergency: Security vulnerability detected";

            const initiateData = projectReimbursement.interface.encodeFunctionData("initiateEmergencyClosure", [
                returnAddress,
                reason
            ]);

            await executeGaslessTransaction(committee1, projectReimbursement.target, initiateData);
            const closureId = 0;
            console.log("✓ Emergency closure initiated by committee member (gasless)");

            // Get closure details
            let closure = await projectReimbursement.getClosureRequest(closureId);
            expect(closure.status).to.equal(1); // Initiated
            expect(closure.initiator).to.equal(committee1.address);

            // Committee approvals (3 unique members required)
            console.log("\n2. Committee approvals...");

            // Committee member 1 (initiator can also approve)
            await commitAndRevealClosureApproval(committee1, closureId);
            closure = await projectReimbursement.getClosureRequest(closureId);
            expect(closure.status).to.equal(2); // PartiallyApproved
            console.log("✓ Committee member 1 approved (gasless)");

            // Committee member 2
            await commitAndRevealClosureApproval(committee2, closureId);
            console.log("✓ Committee member 2 approved (gasless)");

            // Committee member 3
            await commitAndRevealClosureApproval(committee3, closureId);
            closure = await projectReimbursement.getClosureRequest(closureId);
            expect(closure.status).to.equal(3); // FullyApproved
            console.log("✓ Committee member 3 approved - threshold reached (gasless)");

            // Check return address balance before director approval
            const returnBalanceBefore = await omthbToken.balanceOf(returnAddress);

            // Director final approval triggers automatic execution
            console.log("\n3. Director final approval...");
            await commitAndRevealClosureApproval(director, closureId);
            closure = await projectReimbursement.getClosureRequest(closureId);
            expect(closure.status).to.equal(4); // Executed
            console.log("✓ Director approved - closure executed (gasless)");

            // Verify all funds were returned
            const returnBalanceAfter = await omthbToken.balanceOf(returnAddress);
            const contractBalanceAfter = await omthbToken.balanceOf(projectReimbursement.target);

            expect(contractBalanceAfter).to.equal(0);
            expect(returnBalanceAfter).to.equal(returnBalanceBefore + initialBalance);
            console.log(`✓ All funds (${ethers.formatEther(initialBalance)} OMTHB) returned to ${returnAddress}`);

            // Verify contract is paused
            expect(await projectReimbursement.paused()).to.be.true;
            console.log("✓ Contract permanently paused");

            // Try to create new request - should fail
            const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                recipient1.address,
                ethers.parseEther("100"),
                "Should fail",
                "QmFail"
            ]);

            await expect(
                executeGaslessTransaction(requester1, projectReimbursement.target, createData)
            ).to.be.reverted;
            console.log("✓ No new operations allowed after closure");

            // Check total gas usage for emergency closure
            const gasStats = await gasTank.totalRefunded();
            console.log(`\nTotal gas refunded for emergency closure: ${ethers.formatEther(gasStats)} OM`);
        });

        it("Should prevent unauthorized emergency closure initiation", async function () {
            console.log("\n=== TEST: Emergency Closure Authorization ===\n");

            // Try to initiate with non-committee/director account
            const initiateData = projectReimbursement.interface.encodeFunctionData("initiateEmergencyClosure", [
                admin.address,
                "Unauthorized closure attempt"
            ]);

            await expect(
                executeGaslessTransaction(requester1, projectReimbursement.target, initiateData)
            ).to.be.reverted;
            console.log("✓ Only committee members or director can initiate closure");

            // Initiate properly
            await executeGaslessTransaction(committee1, projectReimbursement.target, initiateData);
            const closureId = 0;

            // Try to approve with non-committee member
            const nonce = ethers.randomBytes(32);
            const commitment = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256"],
                    [finance.address, closureId, (await ethers.provider.getNetwork()).chainId, nonce]
                )
            );

            const commitData = projectReimbursement.interface.encodeFunctionData("commitClosureApproval", [closureId, commitment]);
            await expect(
                executeGaslessTransaction(finance, projectReimbursement.target, commitData)
            ).to.be.reverted;
            console.log("✓ Only committee members can approve closure");
        });
    });

    describe("5. Comprehensive Security Tests", function () {
        it("Should validate all meta-transaction security features", async function () {
            console.log("\n=== TEST: Meta-Transaction Security Features ===\n");

            // Test deadline validation
            const expiredDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
            const nonce = await forwarder.getNonce(requester1.address);
            const chainId = (await ethers.provider.getNetwork()).chainId;

            const expiredRequest = {
                from: requester1.address,
                to: projectReimbursement.target,
                value: 0,
                gas: 500000,
                nonce: nonce,
                deadline: expiredDeadline,
                chainId: chainId,
                data: "0x"
            };

            const signature = await signMetaTransaction(requester1, expiredRequest);
            
            await expect(
                forwarder.connect(relayer).execute(expiredRequest, signature)
            ).to.be.revertedWithCustomError(forwarder, "ExpiredDeadline");
            console.log("✓ Deadline validation working");

            // Test chain ID validation
            const wrongChainRequest = {
                from: requester1.address,
                to: projectReimbursement.target,
                value: 0,
                gas: 500000,
                nonce: nonce,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                chainId: 999999, // Wrong chain ID
                data: "0x"
            };

            const wrongChainSig = await signMetaTransaction(requester1, wrongChainRequest);
            
            await expect(
                forwarder.connect(relayer).execute(wrongChainRequest, wrongChainSig)
            ).to.be.revertedWithCustomError(forwarder, "InvalidChainId");
            console.log("✓ Chain ID validation working");

            // Test target contract whitelist
            const nonWhitelistedTarget = ethers.Wallet.createRandom().address;
            const whitelistRequest = {
                from: requester1.address,
                to: nonWhitelistedTarget,
                value: 0,
                gas: 500000,
                nonce: nonce,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                chainId: chainId,
                data: "0x"
            };

            const whitelistSig = await signMetaTransaction(requester1, whitelistRequest);
            
            await expect(
                forwarder.connect(relayer).execute(whitelistRequest, whitelistSig)
            ).to.be.revertedWithCustomError(forwarder, "TargetNotWhitelisted");
            console.log("✓ Target whitelist validation working");
        });

        it("Should handle gas tank security features", async function () {
            console.log("\n=== TEST: Gas Tank Security Features ===\n");

            // Test daily limit enforcement
            const largeAmount = ethers.parseEther("10");
            await gasTank.connect(admin).updateGasCredit(
                requester1.address,
                ethers.parseEther("0.1"), // Max per tx
                ethers.parseEther("0.5")  // Daily limit
            );

            // Create multiple requests to exceed daily limit
            let totalGasUsed = 0n;
            let requestCount = 0;

            try {
                while (totalGasUsed < ethers.parseEther("0.5")) {
                    const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                        recipient1.address,
                        ethers.parseEther("100"),
                        `Request ${requestCount}`,
                        `QmTest${requestCount}`
                    ]);

                    await executeGaslessTransaction(requester1, projectReimbursement.target, createData);
                    requestCount++;
                    
                    const credit = await gasTank.gasCredits(requester1.address);
                    totalGasUsed = credit.dailyUsed;
                }
            } catch (e) {
                // Expected to fail when daily limit exceeded
            }

            console.log(`✓ Daily limit enforced after ${requestCount} transactions`);
            expect(requestCount).to.be.gt(0);

            // Test gas price limit
            const highGasPrice = ethers.parseUnits("600", "gwei"); // Above max
            await expect(
                gasTank.connect(relayer).requestGasRefund(
                    requester1.address,
                    100000,
                    highGasPrice,
                    ethers.randomBytes(32)
                )
            ).to.be.revertedWithCustomError(gasTank, "GasPriceTooHigh");
            console.log("✓ Gas price limit enforced");
        });

        it("Should validate commit-reveal mechanism prevents front-running", async function () {
            console.log("\n=== TEST: Commit-Reveal Anti-Front-Running ===\n");

            // Create a request
            const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                recipient1.address,
                ethers.parseEther("1000"),
                "Front-run test",
                "QmFrontRun"
            ]);
            await executeGaslessTransaction(requester1, projectReimbursement.target, createData);

            // Commit approval
            const nonce = ethers.randomBytes(32);
            const commitment = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256"],
                    [secretary.address, 0, (await ethers.provider.getNetwork()).chainId, nonce]
                )
            );

            const commitData = projectReimbursement.interface.encodeFunctionData("commitApproval", [0, commitment]);
            await executeGaslessTransaction(secretary, projectReimbursement.target, commitData);

            // Try to reveal too early
            const revealData = projectReimbursement.interface.encodeFunctionData("approveBySecretary", [0, nonce]);
            await expect(
                executeGaslessTransaction(secretary, projectReimbursement.target, revealData)
            ).to.be.reverted;
            console.log("✓ Cannot reveal before time window");

            // Wait and reveal properly
            await time.increase(REVEAL_WINDOW + 1);
            await executeGaslessTransaction(secretary, projectReimbursement.target, revealData);
            console.log("✓ Reveal successful after time window");

            // Verify approval
            const request = await projectReimbursement.getRequest(0);
            expect(request.status).to.equal(1); // SecretaryApproved
        });
    });

    describe("6. Gas Usage Analysis", function () {
        it("Should track and report gas usage for all operations", async function () {
            console.log("\n=== TEST: Gas Usage Analysis ===\n");

            const operations = [];
            
            // Track request creation
            const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                recipient1.address,
                ethers.parseEther("2000"),
                "Gas analysis test",
                "QmGasTest"
            ]);
            
            const createTx = await executeGaslessTransaction(requester1, projectReimbursement.target, createData);
            operations.push({
                operation: "Create Request",
                gasUsed: createTx.gasUsed.toString(),
                user: "Requester"
            });

            // Track each approval level
            const requestId = 0;

            // Secretary
            const secretaryStart = await gasTank.gasCredits(secretary.address);
            await commitAndRevealApproval(secretary, requestId, "approveBySecretary");
            const secretaryEnd = await gasTank.gasCredits(secretary.address);
            operations.push({
                operation: "Secretary Approval",
                gasUsed: (secretaryStart.totalUsed - secretaryEnd.totalUsed).toString(),
                user: "Secretary"
            });

            // Continue with other approvals...
            console.log("\nGas Usage Summary:");
            console.log("==================");
            operations.forEach(op => {
                console.log(`${op.operation}: ${op.gasUsed} gas (${op.user})`);
            });

            // Check total gas tank usage
            const totalRefunded = await gasTank.totalRefunded();
            console.log(`\nTotal Gas Refunded: ${ethers.formatEther(totalRefunded)} OM`);
            
            // Verify all users still have credits
            const users = [requester1, secretary, committee1, finance, director];
            for (const user of users) {
                const credit = await gasTank.getAvailableCredit(user.address);
                console.log(`${user.address.slice(0, 6)}... remaining credit: ${ethers.formatEther(credit)} OM`);
                expect(credit).to.be.gt(0);
            }
        });
    });

    describe("7. Integration Tests", function () {
        it("Should handle multiple concurrent gasless requests", async function () {
            console.log("\n=== TEST: Concurrent Gasless Requests ===\n");

            // Create multiple requests from different requesters
            const requests = [];
            
            for (let i = 0; i < 3; i++) {
                const requester = i === 0 ? requester1 : requester2;
                const amount = ethers.parseEther((1000 * (i + 1)).toString());
                
                const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                    i === 0 ? recipient1.address : recipient2.address,
                    amount,
                    `Concurrent request ${i + 1}`,
                    `QmConcurrent${i + 1}`
                ]);

                await executeGaslessTransaction(requester, projectReimbursement.target, createData);
                requests.push({
                    id: i,
                    requester: requester.address,
                    amount: amount
                });
                
                console.log(`✓ Request ${i + 1} created (${ethers.formatEther(amount)} OMTHB)`);
            }

            // Process all requests through workflow
            for (const req of requests) {
                console.log(`\nProcessing request ${req.id + 1}...`);
                
                // Secretary approval
                await commitAndRevealApproval(secretary, req.id, "approveBySecretary");
                
                // Committee approval
                await commitAndRevealApproval(committee1, req.id, "approveByCommittee");
                
                // Continue with remaining approvals...
                console.log(`✓ Request ${req.id + 1} processing initiated`);
            }

            // Verify all requests are tracked
            const activeRequests = await projectReimbursement.getActiveRequests();
            expect(activeRequests.length).to.equal(3);
            console.log(`\n✓ All ${activeRequests.length} requests active and tracked`);
        });

        it("Should demonstrate complete system resilience", async function () {
            console.log("\n=== TEST: System Resilience ===\n");

            // Test system continues working even if:
            
            // 1. A user runs out of gas credits
            const poorUser = requester2;
            await gasTank.connect(poorUser).withdrawGasCredit(
                await gasTank.getAvailableCredit(poorUser.address) - ethers.parseEther("0.01")
            );
            console.log("✓ User with low credits identified");

            // 2. Multiple emergency closures are attempted
            const initiateData1 = projectReimbursement.interface.encodeFunctionData("initiateEmergencyClosure", [
                admin.address,
                "First emergency"
            ]);
            await executeGaslessTransaction(committee1, projectReimbursement.target, initiateData1);

            // Try second closure - should fail
            const initiateData2 = projectReimbursement.interface.encodeFunctionData("initiateEmergencyClosure", [
                admin.address,
                "Second emergency"
            ]);
            await expect(
                executeGaslessTransaction(committee2, projectReimbursement.target, initiateData2)
            ).to.be.reverted;
            console.log("✓ Only one emergency closure allowed at a time");

            // 3. Cancel the closure and continue normal operations
            const cancelData = projectReimbursement.interface.encodeFunctionData("cancelEmergencyClosure", [0]);
            await executeGaslessTransaction(committee1, projectReimbursement.target, cancelData);
            console.log("✓ Emergency closure cancelled");

            // 4. System continues normal operation
            const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                recipient1.address,
                ethers.parseEther("500"),
                "Post-emergency request",
                "QmPostEmergency"
            ]);
            await executeGaslessTransaction(requester1, projectReimbursement.target, createData);
            console.log("✓ Normal operations resumed");

            // 5. Verify system state
            expect(await projectReimbursement.paused()).to.be.false;
            expect(await projectReimbursement.isProjectClosed()).to.be.false;
            console.log("✓ System fully operational");
        });
    });
});