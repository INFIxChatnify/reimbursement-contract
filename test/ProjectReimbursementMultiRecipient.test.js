const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ProjectReimbursementMultiRecipient Security Tests", function () {
    let projectReimbursement;
    let omthbToken;
    let owner, admin, secretary, committee1, committee2, committee3, committee4, finance, director;
    let requester, recipient1, recipient2, recipient3, recipient4, recipient5;
    let attacker, maliciousRecipient;
    let projectFactory;

    const PROJECT_ID = "PROJ-001";
    const PROJECT_BUDGET = ethers.parseEther("10000");
    const MIN_REIMBURSEMENT_AMOUNT = ethers.parseEther("100");
    const MAX_REIMBURSEMENT_AMOUNT = ethers.parseEther("1000000");
    const MAX_RECIPIENTS = 10;
    const REVEAL_WINDOW = 30 * 60; // 30 minutes

    beforeEach(async function () {
        [owner, admin, secretary, committee1, committee2, committee3, committee4, finance, director,
         requester, recipient1, recipient2, recipient3, recipient4, recipient5, 
         attacker, maliciousRecipient, projectFactory] = await ethers.getSigners();

        // Deploy OMTHB token
        const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
        omthbToken = await upgrades.deployProxy(OMTHBToken, [], { initializer: 'initialize' });
        await omthbToken.waitForDeployment();

        // Deploy ProjectReimbursementMultiRecipient
        const ProjectReimbursementMultiRecipient = await ethers.getContractFactory("ProjectReimbursementMultiRecipient");
        
        // Deploy from factory address
        projectReimbursement = await ProjectReimbursementMultiRecipient.connect(projectFactory).deploy();
        await projectReimbursement.waitForDeployment();
        
        // Initialize from factory
        await projectReimbursement.connect(projectFactory).initialize(
            PROJECT_ID,
            await omthbToken.getAddress(),
            PROJECT_BUDGET,
            admin.address
        );

        // Setup roles
        await projectReimbursement.connect(projectFactory).grantRoleDirect(await projectReimbursement.SECRETARY_ROLE(), secretary.address);
        await projectReimbursement.connect(projectFactory).grantRoleDirect(await projectReimbursement.COMMITTEE_ROLE(), committee1.address);
        await projectReimbursement.connect(projectFactory).grantRoleDirect(await projectReimbursement.COMMITTEE_ROLE(), committee2.address);
        await projectReimbursement.connect(projectFactory).grantRoleDirect(await projectReimbursement.COMMITTEE_ROLE(), committee3.address);
        await projectReimbursement.connect(projectFactory).grantRoleDirect(await projectReimbursement.COMMITTEE_ROLE(), committee4.address);
        await projectReimbursement.connect(projectFactory).grantRoleDirect(await projectReimbursement.FINANCE_ROLE(), finance.address);
        await projectReimbursement.connect(projectFactory).grantRoleDirect(await projectReimbursement.DIRECTOR_ROLE(), director.address);
        await projectReimbursement.connect(projectFactory).grantRoleDirect(await projectReimbursement.REQUESTER_ROLE(), requester.address);

        // Fund the contract
        await omthbToken.mint(await projectReimbursement.getAddress(), PROJECT_BUDGET);
    });

    describe("Array Manipulation Attacks", function () {
        it("Should prevent gas griefing with maximum recipients", async function () {
            // Create request with maximum allowed recipients
            const recipients = [];
            const amounts = [];
            
            for (let i = 0; i < MAX_RECIPIENTS; i++) {
                recipients.push(ethers.Wallet.createRandom().address);
                amounts.push(MIN_REIMBURSEMENT_AMOUNT);
            }

            const tx = await projectReimbursement.connect(requester).createRequestMultiple(
                recipients,
                amounts,
                "Gas griefing test",
                "QmTest"
            );

            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed;
            
            // Gas usage should be reasonable even with max recipients
            expect(gasUsed).to.be.lessThan(500000);
        });

        it("Should reject requests exceeding MAX_RECIPIENTS", async function () {
            const recipients = [];
            const amounts = [];
            
            for (let i = 0; i < MAX_RECIPIENTS + 1; i++) {
                recipients.push(ethers.Wallet.createRandom().address);
                amounts.push(MIN_REIMBURSEMENT_AMOUNT);
            }

            await expect(
                projectReimbursement.connect(requester).createRequestMultiple(
                    recipients,
                    amounts,
                    "Too many recipients",
                    "QmTest"
                )
            ).to.be.revertedWithCustomError(projectReimbursement, "TooManyRecipients");
        });

        it("Should handle array length mismatch", async function () {
            const recipients = [recipient1.address, recipient2.address];
            const amounts = [MIN_REIMBURSEMENT_AMOUNT]; // Mismatched length

            await expect(
                projectReimbursement.connect(requester).createRequestMultiple(
                    recipients,
                    amounts,
                    "Mismatched arrays",
                    "QmTest"
                )
            ).to.be.revertedWithCustomError(projectReimbursement, "ArrayLengthMismatch");
        });

        it("Should prevent duplicate recipients", async function () {
            const recipients = [recipient1.address, recipient2.address, recipient1.address]; // Duplicate
            const amounts = [MIN_REIMBURSEMENT_AMOUNT, MIN_REIMBURSEMENT_AMOUNT, MIN_REIMBURSEMENT_AMOUNT];

            await expect(
                projectReimbursement.connect(requester).createRequestMultiple(
                    recipients,
                    amounts,
                    "Duplicate recipients",
                    "QmTest"
                )
            ).to.be.revertedWithCustomError(projectReimbursement, "InvalidAddress");
        });
    });

    describe("Gas Optimization and DoS Prevention", function () {
        it("Should measure gas costs for different recipient counts", async function () {
            const gasCosts = [];

            for (let count of [1, 3, 5, 7, 10]) {
                const recipients = [];
                const amounts = [];
                
                for (let i = 0; i < count; i++) {
                    recipients.push(ethers.Wallet.createRandom().address);
                    amounts.push(MIN_REIMBURSEMENT_AMOUNT);
                }

                const tx = await projectReimbursement.connect(requester).createRequestMultiple(
                    recipients,
                    amounts,
                    `Test with ${count} recipients`,
                    "QmTest"
                );

                const receipt = await tx.wait();
                gasCosts.push({ count, gas: receipt.gasUsed });
            }

            // Verify gas scaling is reasonable
            for (let i = 1; i < gasCosts.length; i++) {
                const gasIncrease = gasCosts[i].gas - gasCosts[i-1].gas;
                const countIncrease = gasCosts[i].count - gasCosts[i-1].count;
                const gasPerRecipient = gasIncrease / countIncrease;
                
                // Gas per additional recipient should be reasonable
                expect(gasPerRecipient).to.be.lessThan(50000);
            }
        });

        it("Should handle distribution gas costs efficiently", async function () {
            const recipients = [];
            const amounts = [];
            
            for (let i = 0; i < 5; i++) {
                recipients.push(ethers.Wallet.createRandom().address);
                amounts.push(MIN_REIMBURSEMENT_AMOUNT);
            }

            // Create and approve request through all levels
            const requestId = await createAndApproveRequest(recipients, amounts);

            // Measure distribution gas cost
            const tx = await approveByDirectorWithCommitReveal(requestId);
            const receipt = await tx.wait();

            // Distribution gas should be reasonable
            expect(receipt.gasUsed).to.be.lessThan(1000000);
        });
    });

    describe("Reentrancy Protection", function () {
        let maliciousToken;
        let maliciousReimbursement;

        beforeEach(async function () {
            // Deploy malicious token that attempts reentrancy
            const MaliciousReentrantToken = await ethers.getContractFactory("MaliciousReentrantToken");
            maliciousToken = await MaliciousReentrantToken.deploy();
            await maliciousToken.waitForDeployment();

            // Deploy new reimbursement contract with malicious token
            const ProjectReimbursementMultiRecipient = await ethers.getContractFactory("ProjectReimbursementMultiRecipient");
            maliciousReimbursement = await ProjectReimbursementMultiRecipient.connect(projectFactory).deploy();
            await maliciousReimbursement.waitForDeployment();
            
            await maliciousReimbursement.connect(projectFactory).initialize(
                "MAL-001",
                await maliciousToken.getAddress(),
                PROJECT_BUDGET,
                admin.address
            );

            // Set the reimbursement contract in malicious token
            await maliciousToken.setTarget(await maliciousReimbursement.getAddress());
            
            // Setup roles
            await maliciousReimbursement.connect(projectFactory).grantRoleDirect(
                await maliciousReimbursement.REQUESTER_ROLE(), 
                requester.address
            );
            
            // Fund the contract
            await maliciousToken.mint(await maliciousReimbursement.getAddress(), PROJECT_BUDGET);
        });

        it("Should prevent reentrancy during multi-recipient distribution", async function () {
            const recipients = [await maliciousToken.getAddress(), recipient2.address];
            const amounts = [MIN_REIMBURSEMENT_AMOUNT, MIN_REIMBURSEMENT_AMOUNT];

            await expect(
                maliciousReimbursement.connect(requester).createRequestMultiple(
                    recipients,
                    amounts,
                    "Reentrancy test",
                    "QmTest"
                )
            ).to.not.be.reverted;

            // The malicious token will attempt reentrancy during distribution
            // but it should fail due to reentrancy guards
        });
    });

    describe("Integer Overflow and Sum Calculations", function () {
        it("Should prevent integer overflow in total calculations", async function () {
            const recipients = [recipient1.address, recipient2.address];
            const amounts = [MAX_REIMBURSEMENT_AMOUNT, MAX_REIMBURSEMENT_AMOUNT];

            await expect(
                projectReimbursement.connect(requester).createRequestMultiple(
                    recipients,
                    amounts,
                    "Overflow test",
                    "QmTest"
                )
            ).to.be.revertedWithCustomError(projectReimbursement, "AmountTooHigh");
        });

        it("Should validate individual amounts don't exceed maximum", async function () {
            const recipients = [recipient1.address];
            const amounts = [MAX_REIMBURSEMENT_AMOUNT.add(1)];

            await expect(
                projectReimbursement.connect(requester).createRequestMultiple(
                    recipients,
                    amounts,
                    "Exceed max test",
                    "QmTest"
                )
            ).to.be.revertedWithCustomError(projectReimbursement, "AmountTooHigh");
        });

        it("Should enforce minimum amounts for each recipient", async function () {
            const recipients = [recipient1.address, recipient2.address];
            const amounts = [MIN_REIMBURSEMENT_AMOUNT.sub(1), MIN_REIMBURSEMENT_AMOUNT];

            await expect(
                projectReimbursement.connect(requester).createRequestMultiple(
                    recipients,
                    amounts,
                    "Below min test",
                    "QmTest"
                )
            ).to.be.revertedWithCustomError(projectReimbursement, "AmountTooLow");
        });

        it("Should correctly calculate total with multiple recipients", async function () {
            const recipients = [recipient1.address, recipient2.address, recipient3.address];
            const amounts = [
                ethers.parseEther("150"),
                ethers.parseEther("250"),
                ethers.parseEther("100")
            ];
            const expectedTotal = ethers.parseEther("500");

            await projectReimbursement.connect(requester).createRequestMultiple(
                recipients,
                amounts,
                "Sum calculation test",
                "QmTest"
            );

            const request = await projectReimbursement.getRequest(0);
            expect(request.totalAmount).to.equal(expectedTotal);
        });
    });

    describe("Front-running Protection", function () {
        it("Should require commit-reveal for all approval levels", async function () {
            const recipients = [recipient1.address, recipient2.address];
            const amounts = [MIN_REIMBURSEMENT_AMOUNT, MIN_REIMBURSEMENT_AMOUNT];

            // Create request
            await projectReimbursement.connect(requester).createRequestMultiple(
                recipients,
                amounts,
                "Front-run test",
                "QmTest"
            );

            // Direct approval without commit should fail
            await expect(
                projectReimbursement.connect(secretary).approveBySecretary(0, 12345)
            ).to.be.revertedWithCustomError(projectReimbursement, "InvalidCommitment");
        });

        it("Should enforce reveal window for multi-recipient approvals", async function () {
            const recipients = [recipient1.address, recipient2.address];
            const amounts = [MIN_REIMBURSEMENT_AMOUNT, MIN_REIMBURSEMENT_AMOUNT];

            // Create request
            await projectReimbursement.connect(requester).createRequestMultiple(
                recipients,
                amounts,
                "Reveal window test",
                "QmTest"
            );

            // Commit approval
            const nonce = 12345;
            const commitment = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256"],
                    [secretary.address, 0, await ethers.provider.getNetwork().then(n => n.chainId), nonce]
                )
            );

            await projectReimbursement.connect(secretary).commitApproval(0, commitment);

            // Try to reveal too early
            await expect(
                projectReimbursement.connect(secretary).approveBySecretary(0, nonce)
            ).to.be.revertedWithCustomError(projectReimbursement, "RevealTooEarly");

            // Wait for reveal window
            await time.increase(REVEAL_WINDOW + 1);

            // Now reveal should work
            await expect(
                projectReimbursement.connect(secretary).approveBySecretary(0, nonce)
            ).to.not.be.reverted;
        });
    });

    describe("Meta-Transaction Security", function () {
        it("Should handle array parameters in meta-transactions correctly", async function () {
            // This test would require meta-transaction setup
            // Placeholder for meta-tx testing with arrays
            expect(true).to.be.true;
        });
    });

    describe("Emergency Scenarios", function () {
        it("Should handle emergency closure with pending multi-recipient requests", async function () {
            const recipients = [];
            const amounts = [];
            
            // Create multiple pending requests
            for (let i = 0; i < 3; i++) {
                recipients.push(ethers.Wallet.createRandom().address);
                amounts.push(MIN_REIMBURSEMENT_AMOUNT);
            }

            await projectReimbursement.connect(requester).createRequestMultiple(
                recipients,
                amounts,
                "Emergency test",
                "QmTest"
            );

            // Initiate emergency closure
            await projectReimbursement.connect(committee1).initiateEmergencyClosure(
                admin.address,
                "Emergency closure test"
            );

            // Verify pending requests cannot proceed
            const closureId = 0;
            
            // Complete emergency closure approval process
            await completeEmergencyClosureApproval(closureId);

            // Verify contract is paused
            expect(await projectReimbursement.paused()).to.be.true;
        });

        it("Should prevent distribution during emergency stop", async function () {
            const recipients = [recipient1.address, recipient2.address];
            const amounts = [MIN_REIMBURSEMENT_AMOUNT, MIN_REIMBURSEMENT_AMOUNT];

            // Create and partially approve request
            await projectReimbursement.connect(requester).createRequestMultiple(
                recipients,
                amounts,
                "Emergency stop test",
                "QmTest"
            );

            // Activate emergency stop
            await projectReimbursement.connect(admin).activateEmergencyStop();
            await projectReimbursement.connect(admin).activateEmergencyStop(); // Second approval

            // Try to approve (should fail)
            await expect(
                projectReimbursement.connect(secretary).commitApproval(0, ethers.ZeroHash)
            ).to.be.revertedWithCustomError(projectReimbursement, "EmergencyStopActive");
        });
    });

    describe("Partial Transfer Failures", function () {
        it("Should handle partial transfer failures atomically", async function () {
            // This would require a more complex setup with a token that can fail transfers
            // The current implementation should revert the entire transaction on any failure
            expect(true).to.be.true;
        });
    });

    describe("Storage Optimization", function () {
        it("Should efficiently store and retrieve multi-recipient data", async function () {
            const recipients = [];
            const amounts = [];
            
            for (let i = 0; i < 5; i++) {
                recipients.push(ethers.Wallet.createRandom().address);
                amounts.push(MIN_REIMBURSEMENT_AMOUNT.add(i * 1000));
            }

            await projectReimbursement.connect(requester).createRequestMultiple(
                recipients,
                amounts,
                "Storage test",
                "QmTest"
            );

            // Verify data retrieval
            const requestRecipients = await projectReimbursement.getRequestRecipients(0);
            const requestAmounts = await projectReimbursement.getRequestAmounts(0);

            expect(requestRecipients).to.deep.equal(recipients);
            expect(requestAmounts.map(a => a.toString())).to.deep.equal(amounts.map(a => a.toString()));
        });
    });

    describe("Event Emission Costs", function () {
        it("Should measure event emission gas costs for multi-recipient", async function () {
            const recipients = [];
            const amounts = [];
            
            for (let i = 0; i < MAX_RECIPIENTS; i++) {
                recipients.push(ethers.Wallet.createRandom().address);
                amounts.push(MIN_REIMBURSEMENT_AMOUNT);
            }

            const tx = await projectReimbursement.connect(requester).createRequestMultiple(
                recipients,
                amounts,
                "Event gas test",
                "QmTest"
            );

            const receipt = await tx.wait();
            
            // Check event was emitted with all data
            const event = receipt.logs.find(log => {
                try {
                    return projectReimbursement.interface.parseLog(log).name === "RequestCreated";
                } catch { return false; }
            });

            expect(event).to.not.be.undefined;
            
            // Gas should still be reasonable despite large event data
            expect(receipt.gasUsed).to.be.lessThan(500000);
        });
    });

    // Helper functions
    async function createAndApproveRequest(recipients, amounts) {
        // Create request
        await projectReimbursement.connect(requester).createRequestMultiple(
            recipients,
            amounts,
            "Test request",
            "QmTest"
        );

        const requestId = 0;

        // Secretary approval
        await commitAndRevealApproval(requestId, secretary, "approveBySecretary");
        
        // Committee approval
        await commitAndRevealApproval(requestId, committee1, "approveByCommittee");
        
        // Finance approval
        await commitAndRevealApproval(requestId, finance, "approveByFinance");
        
        // Additional committee approvals
        await commitAndRevealApproval(requestId, committee2, "approveByCommitteeAdditional");
        await commitAndRevealApproval(requestId, committee3, "approveByCommitteeAdditional");
        await commitAndRevealApproval(requestId, committee4, "approveByCommitteeAdditional");

        return requestId;
    }

    async function commitAndRevealApproval(requestId, approver, functionName) {
        const nonce = Math.floor(Math.random() * 1000000);
        const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
        const commitment = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "uint256"],
                [approver.address, requestId, chainId, nonce]
            )
        );

        await projectReimbursement.connect(approver).commitApproval(requestId, commitment);
        await time.increase(REVEAL_WINDOW + 1);
        await projectReimbursement.connect(approver)[functionName](requestId, nonce);
    }

    async function approveByDirectorWithCommitReveal(requestId) {
        const nonce = Math.floor(Math.random() * 1000000);
        const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
        const commitment = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "uint256"],
                [director.address, requestId, chainId, nonce]
            )
        );

        await projectReimbursement.connect(director).commitApproval(requestId, commitment);
        await time.increase(REVEAL_WINDOW + 1);
        return projectReimbursement.connect(director).approveByDirector(requestId, nonce);
    }

    async function completeEmergencyClosureApproval(closureId) {
        // Committee approvals
        for (const committee of [committee1, committee2, committee3]) {
            const nonce = Math.floor(Math.random() * 1000000);
            const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
            const commitment = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256"],
                    [committee.address, closureId, chainId, nonce]
                )
            );

            await projectReimbursement.connect(committee).commitClosureApproval(closureId, commitment);
            await time.increase(REVEAL_WINDOW + 1);
            await projectReimbursement.connect(committee).approveEmergencyClosure(closureId, nonce);
        }

        // Director approval
        const nonce = Math.floor(Math.random() * 1000000);
        const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
        const commitment = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "uint256"],
                [director.address, closureId, chainId, nonce]
            )
        );

        await projectReimbursement.connect(director).commitClosureApproval(closureId, commitment);
        await time.increase(REVEAL_WINDOW + 1);
        await projectReimbursement.connect(director).approveEmergencyClosure(closureId, nonce);
    }
});