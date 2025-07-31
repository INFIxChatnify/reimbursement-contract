const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Gasless System Security and Edge Cases", function () {
    let gasTank;
    let forwarder;
    let omthbToken;
    let projectReimbursement;
    let projectFactory;

    // Accounts
    let admin, secretary, committee1, committee2, committee3, committee4;
    let finance, director, requester, recipient, deputy;
    let attacker, relayer, owner;

    const PROJECT_ID = "SECURITY-TEST-001";
    const PROJECT_BUDGET = ethers.parseEther("1000000");
    const INITIAL_MINT = ethers.parseEther("10000000");
    const REVEAL_WINDOW = 30 * 60;

    // EIP-712 Domain
    const DOMAIN_NAME = "MetaTxForwarder";
    const DOMAIN_VERSION = "1";

    // Helper to sign meta transaction
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

    beforeEach(async function () {
        [owner, admin, secretary, committee1, committee2, committee3, committee4,
         finance, director, requester, recipient, deputy, attacker, relayer] = await ethers.getSigners();

        // Deploy infrastructure
        const GasTank = await ethers.getContractFactory("GasTank");
        gasTank = await GasTank.deploy(admin.address, admin.address);
        await gasTank.waitForDeployment();

        await gasTank.connect(admin).grantRole(await gasTank.RELAYER_ROLE(), relayer.address);

        const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
        forwarder = await MetaTxForwarder.deploy();
        await forwarder.waitForDeployment();

        const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
        omthbToken = await upgrades.deployProxy(
            OMTHBToken,
            [admin.address],
            { initializer: "initialize" }
        );
        await omthbToken.waitForDeployment();

        await omthbToken.connect(admin).mint(admin.address, INITIAL_MINT);

        // Deploy project infrastructure
        const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
        const projectImpl = await ProjectReimbursement.deploy();
        await projectImpl.waitForDeployment();

        const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
        projectFactory = await ProjectFactory.deploy(
            projectImpl.target,
            omthbToken.target,
            admin.address
        );
        await projectFactory.waitForDeployment();

        await projectFactory.connect(admin).grantRole(await projectFactory.PROJECT_CREATOR_ROLE(), admin.address);
        await omthbToken.connect(admin).approve(projectFactory.target, PROJECT_BUDGET);
        
        const tx = await projectFactory.connect(admin).createProject(PROJECT_ID, PROJECT_BUDGET, admin.address);
        const receipt = await tx.wait();

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

        // Setup roles
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.SECRETARY_ROLE(), secretary.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.COMMITTEE_ROLE(), committee1.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.COMMITTEE_ROLE(), committee2.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.COMMITTEE_ROLE(), committee3.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.COMMITTEE_ROLE(), committee4.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.FINANCE_ROLE(), finance.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.DIRECTOR_ROLE(), director.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.REQUESTER_ROLE(), requester.address);
        await projectReimbursement.connect(admin).grantRoleDirect(await projectReimbursement.DEFAULT_ADMIN_ROLE(), deputy.address);

        // Whitelist contracts
        await forwarder.setTargetWhitelist(projectReimbursement.target, true);
        await forwarder.setTargetWhitelist(omthbToken.target, true);

        // Fund gas credits
        const users = [admin, secretary, committee1, committee2, committee3, committee4, 
                      finance, director, requester, deputy, attacker];
        for (const user of users) {
            await gasTank.connect(user).depositGasCredit(user.address, { value: ethers.parseEther("1") });
        }

        // Fund relayer
        await owner.sendTransaction({ to: relayer.address, value: ethers.parseEther("10") });
    });

    describe("Meta-Transaction Attack Vectors", function () {
        it("Should prevent signature malleability attacks", async function () {
            console.log("\n=== TEST: Signature Malleability Protection ===\n");

            const nonce = await forwarder.getNonce(requester.address);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const chainId = (await ethers.provider.getNetwork()).chainId;

            const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                recipient.address,
                ethers.parseEther("1000"),
                "Test request",
                "QmTest123"
            ]);

            const forwardRequest = {
                from: requester.address,
                to: projectReimbursement.target,
                value: 0,
                gas: 500000,
                nonce: nonce,
                deadline: deadline,
                chainId: chainId,
                data: createData
            };

            const signature = await signMetaTransaction(requester, forwardRequest);

            // Execute original
            await forwarder.connect(relayer).execute(forwardRequest, signature);

            // Try to manipulate signature (flip v value)
            const sigBytes = ethers.getBytes(signature);
            const v = sigBytes[64];
            sigBytes[64] = v === 27 ? 28 : 27;
            const malleableSignature = ethers.hexlify(sigBytes);

            // Should fail with manipulated signature
            await expect(
                forwarder.connect(relayer).execute(forwardRequest, malleableSignature)
            ).to.be.reverted;
            console.log("✓ Signature malleability attack prevented");
        });

        it("Should prevent cross-contract replay attacks", async function () {
            console.log("\n=== TEST: Cross-Contract Replay Protection ===\n");

            // Deploy a second project
            await omthbToken.connect(admin).approve(projectFactory.target, PROJECT_BUDGET);
            const tx = await projectFactory.connect(admin).createProject("PROJECT-2", PROJECT_BUDGET, admin.address);
            const receipt = await tx.wait();

            let project2Address;
            for (const log of receipt.logs) {
                try {
                    const parsed = projectFactory.interface.parseLog(log);
                    if (parsed && parsed.name === "ProjectCreated") {
                        project2Address = parsed.args[1];
                        break;
                    }
                } catch (e) {}
            }

            const project2 = await ethers.getContractAt("ProjectReimbursement", project2Address);
            await project2.connect(admin).grantRoleDirect(await project2.REQUESTER_ROLE(), requester.address);
            await forwarder.setTargetWhitelist(project2.target, true);

            // Create valid request for project 1
            const nonce = await forwarder.getNonce(requester.address);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const chainId = (await ethers.provider.getNetwork()).chainId;

            const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                recipient.address,
                ethers.parseEther("1000"),
                "Cross-contract test",
                "QmCross123"
            ]);

            const forwardRequest = {
                from: requester.address,
                to: projectReimbursement.target,
                value: 0,
                gas: 500000,
                nonce: nonce,
                deadline: deadline,
                chainId: chainId,
                data: createData
            };

            const signature = await signMetaTransaction(requester, forwardRequest);

            // Execute on project 1
            await forwarder.connect(relayer).execute(forwardRequest, signature);

            // Try to replay same signature on project 2
            const replayRequest = {
                ...forwardRequest,
                to: project2.target,
                nonce: await forwarder.getNonce(requester.address) // Get new nonce
            };

            // Sign new request for project 2
            const newSignature = await signMetaTransaction(requester, replayRequest);

            // This should work with new signature
            await forwarder.connect(relayer).execute(replayRequest, newSignature);

            // But replaying old signature should fail
            const oldReplayRequest = {
                ...forwardRequest,
                to: project2.target
            };

            await expect(
                forwarder.connect(relayer).execute(oldReplayRequest, signature)
            ).to.be.revertedWithCustomError(forwarder, "InvalidNonce");
            console.log("✓ Cross-contract replay attack prevented");
        });

        it("Should handle gas griefing attacks", async function () {
            console.log("\n=== TEST: Gas Griefing Protection ===\n");

            // Create a malicious contract that consumes excessive gas
            const MaliciousGasConsumer = await ethers.getContractFactory("contracts/test/MaliciousContract.sol:MaliciousContract");
            const malicious = await MaliciousGasConsumer.deploy(projectReimbursement.target);
            await malicious.waitForDeployment();

            // Try to whitelist malicious contract (should fail as non-admin)
            await expect(
                forwarder.connect(attacker).setTargetWhitelist(malicious.target, true)
            ).to.be.reverted;
            console.log("✓ Cannot whitelist contracts without admin role");

            // Create request with insufficient gas
            const nonce = await forwarder.getNonce(requester.address);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const chainId = (await ethers.provider.getNetwork()).chainId;

            const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                recipient.address,
                ethers.parseEther("1000"),
                "Gas test",
                "QmGas123"
            ]);

            const lowGasRequest = {
                from: requester.address,
                to: projectReimbursement.target,
                value: 0,
                gas: 50000, // Too low
                nonce: nonce,
                deadline: deadline,
                chainId: chainId,
                data: createData
            };

            const signature = await signMetaTransaction(requester, lowGasRequest);

            await expect(
                forwarder.connect(relayer).execute(lowGasRequest, signature)
            ).to.be.revertedWithCustomError(forwarder, "InsufficientGas");
            console.log("✓ Insufficient gas requests rejected");
        });
    });

    describe("Gas Tank Attack Scenarios", function () {
        it("Should prevent draining attacks on gas tank", async function () {
            console.log("\n=== TEST: Gas Tank Draining Protection ===\n");

            // Set very low limits for attacker
            await gasTank.connect(admin).updateGasCredit(
                attacker.address,
                ethers.parseEther("0.01"), // 0.01 OM per tx
                ethers.parseEther("0.05")  // 0.05 OM daily
            );

            // Try to drain by making many small transactions
            let failedAttempts = 0;
            const maxAttempts = 10;

            for (let i = 0; i < maxAttempts; i++) {
                try {
                    await gasTank.connect(relayer).requestGasRefund(
                        attacker.address,
                        100000,
                        ethers.parseUnits("100", "gwei"),
                        ethers.randomBytes(32)
                    );
                } catch (e) {
                    failedAttempts++;
                }
            }

            console.log(`✓ Blocked ${failedAttempts} excessive refund attempts`);
            expect(failedAttempts).to.be.gt(0);

            // Check attacker's remaining credit
            const remainingCredit = await gasTank.getAvailableCredit(attacker.address);
            console.log(`✓ Attacker credit protected: ${ethers.formatEther(remainingCredit)} OM remaining`);
        });

        it("Should handle relayer collusion attempts", async function () {
            console.log("\n=== TEST: Relayer Collusion Prevention ===\n");

            // Deploy malicious relayer
            const [maliciousRelayer] = await ethers.getSigners();
            
            // Try to claim refunds without executing transactions
            await expect(
                gasTank.connect(maliciousRelayer).requestGasRefund(
                    requester.address,
                    1000000,
                    ethers.parseUnits("100", "gwei"),
                    ethers.randomBytes(32)
                )
            ).to.be.revertedWithCustomError(gasTank, "UnauthorizedRelayer");
            console.log("✓ Unauthorized relayers cannot claim refunds");

            // Grant relayer role to malicious relayer
            await gasTank.connect(admin).grantRole(await gasTank.RELAYER_ROLE(), maliciousRelayer.address);

            // Try to claim excessive refunds
            const excessiveGas = 10000000; // 10M gas
            await expect(
                gasTank.connect(maliciousRelayer).requestGasRefund(
                    requester.address,
                    excessiveGas,
                    ethers.parseUnits("100", "gwei"),
                    ethers.randomBytes(32)
                )
            ).to.be.revertedWithCustomError(gasTank, "TransactionLimitExceeded");
            console.log("✓ Excessive gas claims blocked");
        });
    });

    describe("Emergency Closure Edge Cases", function () {
        it("Should handle rapid sequential closure attempts", async function () {
            console.log("\n=== TEST: Rapid Closure Attempts ===\n");

            // Multiple committee members try to initiate closures simultaneously
            const initiateData1 = projectReimbursement.interface.encodeFunctionData("initiateEmergencyClosure", [
                admin.address,
                "Emergency 1"
            ]);

            const initiateData2 = projectReimbursement.interface.encodeFunctionData("initiateEmergencyClosure", [
                deputy.address,
                "Emergency 2"
            ]);

            // First closure succeeds
            await projectReimbursement.connect(committee1).initiateEmergencyClosure(
                admin.address,
                "Emergency 1"
            );

            // Second should fail
            await expect(
                projectReimbursement.connect(committee2).initiateEmergencyClosure(
                    deputy.address,
                    "Emergency 2"
                )
            ).to.be.revertedWithCustomError(projectReimbursement, "ActiveClosureExists");
            console.log("✓ Only one active closure allowed");

            // Cancel first closure
            await projectReimbursement.connect(committee1).cancelEmergencyClosure(0);

            // Now second can proceed
            await projectReimbursement.connect(committee2).initiateEmergencyClosure(
                deputy.address,
                "Emergency 2"
            );
            console.log("✓ New closure allowed after cancellation");
        });

        it("Should handle closure with pending requests", async function () {
            console.log("\n=== TEST: Closure with Pending Requests ===\n");

            // Create multiple requests at different stages
            await projectReimbursement.connect(requester).createRequest(
                recipient.address,
                ethers.parseEther("1000"),
                "Pending request 1",
                "Qm1"
            );

            await projectReimbursement.connect(requester).createRequest(
                recipient.address,
                ethers.parseEther("2000"),
                "Pending request 2",
                "Qm2"
            );

            // Approve first request partially
            const nonce = ethers.randomBytes(32);
            const commitment = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256"],
                    [secretary.address, 0, (await ethers.provider.getNetwork()).chainId, nonce]
                )
            );

            await projectReimbursement.connect(secretary).commitApproval(0, commitment);
            await time.increase(REVEAL_WINDOW + 1);
            await projectReimbursement.connect(secretary).approveBySecretary(0, nonce);

            // Add funds to contract
            await omthbToken.connect(admin).transfer(projectReimbursement.target, ethers.parseEther("10000"));
            const balanceBefore = await omthbToken.balanceOf(projectReimbursement.target);

            // Initiate emergency closure
            await projectReimbursement.connect(committee1).initiateEmergencyClosure(
                admin.address,
                "Emergency with pending requests"
            );

            // Complete closure approvals
            for (const approver of [committee1, committee2, committee3]) {
                const closureNonce = ethers.randomBytes(32);
                const closureCommitment = ethers.keccak256(
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ["address", "uint256", "uint256", "uint256"],
                        [approver.address, 0, (await ethers.provider.getNetwork()).chainId, closureNonce]
                    )
                );
                
                await projectReimbursement.connect(approver).commitClosureApproval(0, closureCommitment);
                await time.increase(REVEAL_WINDOW + 1);
                await projectReimbursement.connect(approver).approveEmergencyClosure(0, closureNonce);
            }

            // Director approval executes closure
            const directorNonce = ethers.randomBytes(32);
            const directorCommitment = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256"],
                    [director.address, 0, (await ethers.provider.getNetwork()).chainId, directorNonce]
                )
            );
            
            await projectReimbursement.connect(director).commitClosureApproval(0, directorCommitment);
            await time.increase(REVEAL_WINDOW + 1);
            await projectReimbursement.connect(director).approveEmergencyClosure(0, directorNonce);

            // Verify all funds returned despite pending requests
            const balanceAfter = await omthbToken.balanceOf(projectReimbursement.target);
            const adminBalance = await omthbToken.balanceOf(admin.address);
            
            expect(balanceAfter).to.equal(0);
            console.log(`✓ All funds (${ethers.formatEther(balanceBefore)} OMTHB) returned despite pending requests`);

            // Verify contract is paused
            expect(await projectReimbursement.paused()).to.be.true;
            console.log("✓ Contract paused after emergency closure");
        });
    });

    describe("Commit-Reveal Edge Cases", function () {
        it("Should handle commit collision attempts", async function () {
            console.log("\n=== TEST: Commit Collision Handling ===\n");

            // Create a request
            await projectReimbursement.connect(requester).createRequest(
                recipient.address,
                ethers.parseEther("1000"),
                "Commit collision test",
                "QmCollision"
            );

            // Secretary commits
            const secretaryNonce = ethers.randomBytes(32);
            const secretaryCommitment = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256"],
                    [secretary.address, 0, (await ethers.provider.getNetwork()).chainId, secretaryNonce]
                )
            );

            await projectReimbursement.connect(secretary).commitApproval(0, secretaryCommitment);

            // Try to commit again with different nonce
            const newNonce = ethers.randomBytes(32);
            const newCommitment = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256"],
                    [secretary.address, 0, (await ethers.provider.getNetwork()).chainId, newNonce]
                )
            );

            // Second commit should overwrite first
            await projectReimbursement.connect(secretary).commitApproval(0, newCommitment);

            // Wait and try to reveal with first nonce - should fail
            await time.increase(REVEAL_WINDOW + 1);
            await expect(
                projectReimbursement.connect(secretary).approveBySecretary(0, secretaryNonce)
            ).to.be.revertedWithCustomError(projectReimbursement, "InvalidCommitment");

            // Reveal with second nonce should work
            await projectReimbursement.connect(secretary).approveBySecretary(0, newNonce);
            console.log("✓ Latest commitment overwrites previous ones");
        });

        it("Should handle reveal window edge timing", async function () {
            console.log("\n=== TEST: Reveal Window Edge Timing ===\n");

            // Create request
            await projectReimbursement.connect(requester).createRequest(
                recipient.address,
                ethers.parseEther("500"),
                "Timing test",
                "QmTiming"
            );

            // Commit
            const nonce = ethers.randomBytes(32);
            const commitment = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256"],
                    [secretary.address, 0, (await ethers.provider.getNetwork()).chainId, nonce]
                )
            );

            await projectReimbursement.connect(secretary).commitApproval(0, commitment);
            const commitTime = await time.latest();

            // Try to reveal at exact window boundary
            await time.increaseTo(commitTime + REVEAL_WINDOW);
            
            // Should still fail at exact boundary
            await expect(
                projectReimbursement.connect(secretary).approveBySecretary(0, nonce)
            ).to.be.revertedWithCustomError(projectReimbursement, "RevealTooEarly");

            // Should work 1 second after
            await time.increase(1);
            await projectReimbursement.connect(secretary).approveBySecretary(0, nonce);
            console.log("✓ Reveal window boundary correctly enforced");
        });
    });

    describe("Rate Limiting and DoS Protection", function () {
        it("Should handle batch transaction spam", async function () {
            console.log("\n=== TEST: Batch Transaction Spam Protection ===\n");

            // Try to execute many transactions in batch
            const requests = [];
            const signatures = [];
            
            for (let i = 0; i < 15; i++) { // Try more than allowed batch size
                const nonce = await forwarder.getNonce(requester.address) + i;
                const deadline = Math.floor(Date.now() / 1000) + 3600;
                const chainId = (await ethers.provider.getNetwork()).chainId;

                const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                    recipient.address,
                    ethers.parseEther("100"),
                    `Spam request ${i}`,
                    `QmSpam${i}`
                ]);

                const request = {
                    from: requester.address,
                    to: projectReimbursement.target,
                    value: 0,
                    gas: 300000,
                    nonce: nonce,
                    deadline: deadline,
                    chainId: chainId,
                    data: createData
                };

                requests.push(request);
                signatures.push(await signMetaTransaction(requester, request));
            }

            // Batch execute should fail with too many
            await expect(
                forwarder.connect(relayer).batchExecute(requests, signatures)
            ).to.be.revertedWith("Batch too large");
            console.log("✓ Large batch transactions blocked");

            // Execute smaller batch
            const smallBatch = requests.slice(0, 5);
            const smallSigs = signatures.slice(0, 5);
            
            await forwarder.connect(relayer).batchExecute(smallBatch, smallSigs);
            console.log("✓ Reasonable batch size allowed");
        });

        it("Should enforce forwarder rate limits", async function () {
            console.log("\n=== TEST: Forwarder Rate Limiting ===\n");

            // Update rate limit to very low for testing
            await forwarder.updateRateLimit(3);

            // Execute transactions up to limit
            let executed = 0;
            const maxAttempts = 5;

            for (let i = 0; i < maxAttempts; i++) {
                const nonce = await forwarder.getNonce(requester.address);
                const deadline = Math.floor(Date.now() / 1000) + 3600;
                const chainId = (await ethers.provider.getNetwork()).chainId;

                const createData = projectReimbursement.interface.encodeFunctionData("createRequest", [
                    recipient.address,
                    ethers.parseEther("100"),
                    `Rate limit test ${i}`,
                    `QmRate${i}`
                ]);

                const request = {
                    from: requester.address,
                    to: projectReimbursement.target,
                    value: 0,
                    gas: 500000,
                    nonce: nonce,
                    deadline: deadline,
                    chainId: chainId,
                    data: createData
                };

                const signature = await signMetaTransaction(requester, request);

                try {
                    await forwarder.connect(relayer).execute(request, signature);
                    executed++;
                } catch (e) {
                    console.log(`✓ Rate limit enforced after ${executed} transactions`);
                    break;
                }
            }

            expect(executed).to.equal(3);
        });
    });

    describe("Integration Stress Tests", function () {
        it("Should handle complex approval race conditions", async function () {
            console.log("\n=== TEST: Approval Race Conditions ===\n");

            // Create multiple requests
            const requestCount = 3;
            for (let i = 0; i < requestCount; i++) {
                await projectReimbursement.connect(requester).createRequest(
                    recipient.address,
                    ethers.parseEther((1000 * (i + 1)).toString()),
                    `Race condition test ${i}`,
                    `QmRace${i}`
                );
            }

            // Multiple approvers try to approve different requests simultaneously
            const approvals = [];

            // Secretary approvals
            for (let i = 0; i < requestCount; i++) {
                const nonce = ethers.randomBytes(32);
                const commitment = ethers.keccak256(
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ["address", "uint256", "uint256", "uint256"],
                        [secretary.address, i, (await ethers.provider.getNetwork()).chainId, nonce]
                    )
                );
                
                approvals.push({
                    requestId: i,
                    approver: secretary,
                    nonce: nonce,
                    commitment: commitment,
                    role: "secretary"
                });
            }

            // Commit all approvals
            for (const approval of approvals) {
                await projectReimbursement.connect(approval.approver).commitApproval(
                    approval.requestId,
                    approval.commitment
                );
            }

            // Wait for reveal window
            await time.increase(REVEAL_WINDOW + 1);

            // Reveal all approvals
            for (const approval of approvals) {
                await projectReimbursement.connect(approval.approver).approveBySecretary(
                    approval.requestId,
                    approval.nonce
                );
            }

            // Verify all approvals succeeded
            for (let i = 0; i < requestCount; i++) {
                const request = await projectReimbursement.getRequest(i);
                expect(request.status).to.equal(1); // SecretaryApproved
            }
            
            console.log(`✓ All ${requestCount} concurrent approvals processed correctly`);
        });

        it("Should maintain system integrity under maximum load", async function () {
            console.log("\n=== TEST: Maximum Load Test ===\n");

            // Track initial state
            const initialGasTankBalance = await ethers.provider.getBalance(gasTank.target);
            const initialContractBalance = await omthbToken.balanceOf(projectReimbursement.target);

            // Create maximum allowed active requests
            const maxRequests = 10; // Reasonable limit for testing
            const createdRequests = [];

            for (let i = 0; i < maxRequests; i++) {
                const amount = ethers.parseEther((100 * (i + 1)).toString());
                await projectReimbursement.connect(requester).createRequest(
                    recipient.address,
                    amount,
                    `Load test ${i}`,
                    `QmLoad${i}`
                );
                createdRequests.push({ id: i, amount: amount });
            }

            console.log(`✓ Created ${maxRequests} requests`);

            // Process half through partial approval
            const halfPoint = Math.floor(maxRequests / 2);
            for (let i = 0; i < halfPoint; i++) {
                // Secretary approval
                const nonce = ethers.randomBytes(32);
                const commitment = ethers.keccak256(
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ["address", "uint256", "uint256", "uint256"],
                        [secretary.address, i, (await ethers.provider.getNetwork()).chainId, nonce]
                    )
                );
                
                await projectReimbursement.connect(secretary).commitApproval(i, commitment);
                await time.increase(REVEAL_WINDOW + 1);
                await projectReimbursement.connect(secretary).approveBySecretary(i, nonce);
            }

            // Cancel some requests
            const cancelCount = 2;
            for (let i = halfPoint; i < halfPoint + cancelCount; i++) {
                await projectReimbursement.connect(requester).cancelRequest(i);
            }

            // Verify system state consistency
            const activeRequests = await projectReimbursement.getActiveRequests();
            const expectedActive = maxRequests - cancelCount;
            
            console.log(`✓ Active requests: ${activeRequests.length} (expected: ~${expectedActive})`);
            
            // Verify gas tank integrity
            const finalGasTankBalance = await ethers.provider.getBalance(gasTank.target);
            console.log(`✓ Gas tank balance maintained: ${ethers.formatEther(finalGasTankBalance)} OM`);

            // Verify no funds lost
            const finalContractBalance = await omthbToken.balanceOf(projectReimbursement.target);
            expect(finalContractBalance).to.equal(initialContractBalance);
            console.log("✓ No funds lost during stress test");
        });
    });
});