const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Emergency Closure Feature", function () {
    // Fixture to deploy contracts
    async function deployFixture() {
        const [admin, committee1, committee2, committee3, committee4, director, requester, recipient, returnAddress] = await ethers.getSigners();

        // Deploy TimelockController
        const TimelockController = await ethers.getContractFactory("TimelockController");
        const timelockController = await TimelockController.deploy(
            86400, // 1 day delay
            [admin.address], // proposers
            [admin.address], // executors
            admin.address    // admin
        );

        // Deploy OMTHB Token (mock)
        const MockOMTHB = await ethers.getContractFactory("contracts/test/MockOMTHB.sol:MockOMTHB");
        const omthbToken = await MockOMTHB.deploy();
        await omthbToken.initialize();

        // Deploy ProjectReimbursement implementation
        const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
        const projectImplementation = await ProjectReimbursement.deploy();

        // Deploy MetaTxForwarder
        const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
        const metaTxForwarder = await MetaTxForwarder.deploy();

        // Deploy ProjectFactory
        const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
        const projectFactory = await ProjectFactory.deploy(
            await projectImplementation.getAddress(),
            await omthbToken.getAddress(),
            await metaTxForwarder.getAddress(),
            admin.address
        );

        // Grant PROJECT_CREATOR_ROLE to admin
        const PROJECT_CREATOR_ROLE = await projectFactory.PROJECT_CREATOR_ROLE();
        await projectFactory.grantRole(PROJECT_CREATOR_ROLE, admin.address);

        // Create a project
        const projectId = "PROJ-2025-001";
        const projectBudget = ethers.parseEther("10000");
        
        const tx = await projectFactory.createProject(projectId, projectBudget, admin.address);
        const receipt = await tx.wait();
        
        // Get project address from event
        const projectFactory_iface = projectFactory.interface;
        const projectCreatedEvent = receipt.logs
            .map(log => {
                try {
                    return projectFactory_iface.parseLog(log);
                } catch (e) {
                    return null;
                }
            })
            .find(log => log && log.name === "ProjectCreated");
        const projectAddress = projectCreatedEvent.args.projectContract;
        
        const project = await ethers.getContractAt("ProjectReimbursement", projectAddress);

        // Setup roles
        const COMMITTEE_ROLE = await project.COMMITTEE_ROLE();
        const DIRECTOR_ROLE = await project.DIRECTOR_ROLE();
        const REQUESTER_ROLE = await project.REQUESTER_ROLE();

        // Helper function to grant roles with commit-reveal
        async function grantRoleWithCommitReveal(role, account) {
            const nonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
            const commitment = ethers.keccak256(
                ethers.solidityPacked(
                    ["bytes32", "address", "address", "uint256"],
                    [role, account, admin.address, nonce]
                )
            );
            
            await project.connect(admin).commitRoleGrant(role, commitment);
            await ethers.provider.send("evm_increaseTime", [1801]); // Wait for reveal window (30 minutes)
            await ethers.provider.send("evm_mine", []);
            await project.connect(admin).grantRoleWithReveal(role, account, nonce);
        }
        
        // Grant roles
        await grantRoleWithCommitReveal(COMMITTEE_ROLE, committee1.address);
        await grantRoleWithCommitReveal(COMMITTEE_ROLE, committee2.address);
        await grantRoleWithCommitReveal(COMMITTEE_ROLE, committee3.address);
        await grantRoleWithCommitReveal(COMMITTEE_ROLE, committee4.address);
        await grantRoleWithCommitReveal(DIRECTOR_ROLE, director.address);
        await grantRoleWithCommitReveal(REQUESTER_ROLE, requester.address);

        // Set timelock controller
        await project.setTimelockController(await timelockController.getAddress());

        // Fund the project
        await omthbToken.mint(await project.getAddress(), projectBudget);

        return {
            project,
            omthbToken,
            projectFactory,
            admin,
            committee1,
            committee2,
            committee3,
            committee4,
            director,
            requester,
            recipient,
            returnAddress,
            projectId,
            projectBudget
        };
    }

    describe("Emergency Closure Initiation", function () {
        it("Should allow committee member to initiate emergency closure", async function () {
            const { project, committee1, returnAddress } = await loadFixture(deployFixture);
            
            const reason = "Critical security vulnerability discovered";
            
            await expect(project.connect(committee1).initiateEmergencyClosure(returnAddress.address, reason))
                .to.emit(project, "EmergencyClosureInitiated")
                .withArgs(0, committee1.address, returnAddress.address, reason);
                
            const closureRequest = await project.getClosureRequest(0);
            expect(closureRequest.initiator).to.equal(committee1.address);
            expect(closureRequest.returnAddress).to.equal(returnAddress.address);
            expect(closureRequest.reason).to.equal(reason);
            expect(closureRequest.status).to.equal(1); // Initiated
        });

        it("Should allow director to initiate emergency closure", async function () {
            const { project, director, returnAddress } = await loadFixture(deployFixture);
            
            const reason = "Project compromised";
            
            await expect(project.connect(director).initiateEmergencyClosure(returnAddress.address, reason))
                .to.emit(project, "EmergencyClosureInitiated");
        });

        it("Should not allow non-authorized users to initiate closure", async function () {
            const { project, requester, returnAddress } = await loadFixture(deployFixture);
            
            await expect(
                project.connect(requester).initiateEmergencyClosure(returnAddress.address, "Test")
            ).to.be.revertedWithCustomError(project, "UnauthorizedApprover");
        });

        it("Should not allow multiple active closure requests", async function () {
            const { project, committee1, returnAddress } = await loadFixture(deployFixture);
            
            await project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "First closure");
            
            await expect(
                project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "Second closure")
            ).to.be.revertedWithCustomError(project, "ActiveClosureExists");
        });

        it("Should validate inputs", async function () {
            const { project, committee1 } = await loadFixture(deployFixture);
            
            // Zero address
            await expect(
                project.connect(committee1).initiateEmergencyClosure(ethers.constants.AddressZero, "Test")
            ).to.be.revertedWithCustomError(project, "InvalidReturnAddress");
            
            // Empty reason
            await expect(
                project.connect(committee1).initiateEmergencyClosure(committee1.address, "")
            ).to.be.revertedWithCustomError(project, "InvalidDescription");
        });
    });

    describe("Emergency Closure Approval Flow", function () {
        it("Should require commit-reveal pattern for approvals", async function () {
            const { project, committee1, committee2, returnAddress } = await loadFixture(deployFixture);
            
            // Initiate closure
            await project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "Emergency");
            const closureId = 0;
            
            // Committee2 commits approval
            const nonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
            const chainId = await committee2.getChainId();
            const commitment = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "uint256", "uint256", "uint256"],
                    [committee2.address, closureId, chainId, nonce]
                )
            );
            
            await expect(project.connect(committee2).commitClosureApproval(closureId, commitment))
                .to.emit(project, "ClosureCommitted")
                .withArgs(closureId, committee2.address, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
            
            // Cannot reveal immediately
            await expect(
                project.connect(committee2).approveEmergencyClosure(closureId, nonce)
            ).to.be.revertedWithCustomError(project, "RevealTooEarly");
        });

        it("Should collect 3 unique committee approvals", async function () {
            const { project, committee1, committee2, committee3, committee4, returnAddress } = await loadFixture(deployFixture);
            
            // Initiate closure
            await project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "Emergency");
            const closureId = 0;
            
            // Fast forward time for commit-reveal
            const REVEAL_WINDOW = 30 * 60; // 30 minutes
            
            // Committee1 approval (initiator can also approve)
            const nonce1 = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
            const chainId = await committee1.getChainId();
            const commitment1 = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "uint256", "uint256", "uint256"],
                    [committee1.address, closureId, chainId, nonce1]
                )
            );
            await project.connect(committee1).commitClosureApproval(closureId, commitment1);
            await ethers.provider.send("evm_increaseTime", [REVEAL_WINDOW + 1]);
            await ethers.provider.send("evm_mine");
            
            await expect(project.connect(committee1).approveEmergencyClosure(closureId, nonce1))
                .to.emit(project, "EmergencyClosureApproved")
                .withArgs(closureId, committee1.address, 1);
            
            // Committee2 approval
            const nonce2 = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
            const commitment2 = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "uint256", "uint256", "uint256"],
                    [committee2.address, closureId, chainId, nonce2]
                )
            );
            await project.connect(committee2).commitClosureApproval(closureId, commitment2);
            await ethers.provider.send("evm_increaseTime", [REVEAL_WINDOW + 1]);
            await ethers.provider.send("evm_mine");
            
            await expect(project.connect(committee2).approveEmergencyClosure(closureId, nonce2))
                .to.emit(project, "EmergencyClosureApproved")
                .withArgs(closureId, committee2.address, 2);
            
            // Committee3 approval
            const nonce3 = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
            const commitment3 = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "uint256", "uint256", "uint256"],
                    [committee3.address, closureId, chainId, nonce3]
                )
            );
            await project.connect(committee3).commitClosureApproval(closureId, commitment3);
            await ethers.provider.send("evm_increaseTime", [REVEAL_WINDOW + 1]);
            await ethers.provider.send("evm_mine");
            
            await expect(project.connect(committee3).approveEmergencyClosure(closureId, nonce3))
                .to.emit(project, "EmergencyClosureApproved")
                .withArgs(closureId, committee3.address, 3);
            
            // Check status
            const closureRequest = await project.getClosureRequest(closureId);
            expect(closureRequest.status).to.equal(3); // FullyApproved
            expect(closureRequest.committeeApprovers.length).to.equal(3);
        });

        it("Should prevent duplicate committee approvals", async function () {
            const { project, committee1, returnAddress } = await loadFixture(deployFixture);
            
            // Initiate closure
            await project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "Emergency");
            const closureId = 0;
            
            const REVEAL_WINDOW = 30 * 60;
            
            // First approval
            const nonce1 = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
            const chainId = await committee1.getChainId();
            const commitment1 = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "uint256", "uint256", "uint256"],
                    [committee1.address, closureId, chainId, nonce1]
                )
            );
            await project.connect(committee1).commitClosureApproval(closureId, commitment1);
            await ethers.provider.send("evm_increaseTime", [REVEAL_WINDOW + 1]);
            await ethers.provider.send("evm_mine");
            await project.connect(committee1).approveEmergencyClosure(closureId, nonce1);
            
            // Try to approve again
            const nonce2 = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
            const commitment2 = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "uint256", "uint256", "uint256"],
                    [committee1.address, closureId, chainId, nonce2]
                )
            );
            await project.connect(committee1).commitClosureApproval(closureId, commitment2);
            await ethers.provider.send("evm_increaseTime", [REVEAL_WINDOW + 1]);
            await ethers.provider.send("evm_mine");
            
            await expect(
                project.connect(committee1).approveEmergencyClosure(closureId, nonce2)
            ).to.be.revertedWithCustomError(project, "DuplicateCommitteeApprover");
        });

        it("Should require director approval after committee approvals", async function () {
            const { project, committee1, committee2, committee3, director, returnAddress, projectBudget, omthbToken } = await loadFixture(deployFixture);
            
            // Initiate closure
            await project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "Emergency");
            const closureId = 0;
            
            const REVEAL_WINDOW = 30 * 60;
            const chainId = await committee1.getChainId();
            
            // Get 3 committee approvals
            const committees = [committee1, committee2, committee3];
            for (let i = 0; i < committees.length; i++) {
                const nonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
                const commitment = ethers.keccak256(
                    ethers.solidityPacked(
                        ["address", "uint256", "uint256", "uint256"],
                        [committees[i].address, closureId, chainId, nonce]
                    )
                );
                await project.connect(committees[i]).commitClosureApproval(closureId, commitment);
                await ethers.provider.send("evm_increaseTime", [REVEAL_WINDOW + 1]);
                await ethers.provider.send("evm_mine");
                await project.connect(committees[i]).approveEmergencyClosure(closureId, nonce);
            }
            
            // Director cannot commit before committee approvals are complete
            // (This is already done above, so director can now approve)
            
            // Director approval
            const directorNonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
            const directorCommitment = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "uint256", "uint256", "uint256"],
                    [director.address, closureId, chainId, directorNonce]
                )
            );
            await project.connect(director).commitClosureApproval(closureId, directorCommitment);
            await ethers.provider.send("evm_increaseTime", [REVEAL_WINDOW + 1]);
            await ethers.provider.send("evm_mine");
            
            // Director approval should execute the closure
            await expect(project.connect(director).approveEmergencyClosure(closureId, directorNonce))
                .to.emit(project, "EmergencyClosureApproved")
                .to.emit(project, "EmergencyClosureExecuted")
                .withArgs(closureId, returnAddress.address, projectBudget);
            
            // Check that funds were transferred
            expect(await omthbToken.balanceOf(returnAddress.address)).to.equal(projectBudget);
            expect(await omthbToken.balanceOf(project.address)).to.equal(0);
            
            // Check that contract is paused
            expect(await project.paused()).to.be.true;
        });
    });

    describe("Emergency Closure Cancellation", function () {
        it("Should allow initiator to cancel", async function () {
            const { project, committee1, returnAddress } = await loadFixture(deployFixture);
            
            await project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "Emergency");
            const closureId = 0;
            
            await expect(project.connect(committee1).cancelEmergencyClosure(closureId))
                .to.emit(project, "EmergencyClosureCancelled")
                .withArgs(closureId, committee1.address);
            
            const closureRequest = await project.getClosureRequest(closureId);
            expect(closureRequest.status).to.equal(5); // Cancelled
        });

        it("Should allow admin to cancel", async function () {
            const { project, committee1, admin, returnAddress } = await loadFixture(deployFixture);
            
            await project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "Emergency");
            const closureId = 0;
            
            await expect(project.connect(admin).cancelEmergencyClosure(closureId))
                .to.emit(project, "EmergencyClosureCancelled")
                .withArgs(closureId, admin.address);
        });

        it("Should not allow others to cancel", async function () {
            const { project, committee1, committee2, returnAddress } = await loadFixture(deployFixture);
            
            await project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "Emergency");
            const closureId = 0;
            
            await expect(
                project.connect(committee2).cancelEmergencyClosure(closureId)
            ).to.be.revertedWithCustomError(project, "UnauthorizedApprover");
        });

        it("Should not allow cancellation after execution", async function () {
            const { project, committee1, committee2, committee3, director, returnAddress } = await loadFixture(deployFixture);
            
            // Execute a full closure
            await project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "Emergency");
            const closureId = 0;
            
            const REVEAL_WINDOW = 30 * 60;
            const chainId = await committee1.getChainId();
            
            // Get all approvals
            const approvers = [committee1, committee2, committee3, director];
            for (let i = 0; i < approvers.length; i++) {
                const nonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
                const commitment = ethers.keccak256(
                    ethers.solidityPacked(
                        ["address", "uint256", "uint256", "uint256"],
                        [approvers[i].address, closureId, chainId, nonce]
                    )
                );
                await project.connect(approvers[i]).commitClosureApproval(closureId, commitment);
                await ethers.provider.send("evm_increaseTime", [REVEAL_WINDOW + 1]);
                await ethers.provider.send("evm_mine");
                await project.connect(approvers[i]).approveEmergencyClosure(closureId, nonce);
            }
            
            // Try to cancel after execution
            await expect(
                project.connect(committee1).cancelEmergencyClosure(closureId)
            ).to.be.revertedWithCustomError(project, "InvalidClosureStatus");
        });
    });

    describe("View Functions", function () {
        it("Should return closure committee approvers", async function () {
            const { project, committee1, committee2, returnAddress } = await loadFixture(deployFixture);
            
            await project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "Emergency");
            const closureId = 0;
            
            const REVEAL_WINDOW = 30 * 60;
            const chainId = await committee1.getChainId();
            
            // Add two approvers
            const committees = [committee1, committee2];
            for (let i = 0; i < committees.length; i++) {
                const nonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
                const commitment = ethers.keccak256(
                    ethers.solidityPacked(
                        ["address", "uint256", "uint256", "uint256"],
                        [committees[i].address, closureId, chainId, nonce]
                    )
                );
                await project.connect(committees[i]).commitClosureApproval(closureId, commitment);
                await ethers.provider.send("evm_increaseTime", [REVEAL_WINDOW + 1]);
                await ethers.provider.send("evm_mine");
                await project.connect(committees[i]).approveEmergencyClosure(closureId, nonce);
            }
            
            const approvers = await project.getClosureCommitteeApprovers(closureId);
            expect(approvers.length).to.equal(2);
            expect(approvers).to.include(committee1.address);
            expect(approvers).to.include(committee2.address);
        });

        it("Should check if has enough committee approvers", async function () {
            const { project, committee1, committee2, committee3, returnAddress } = await loadFixture(deployFixture);
            
            await project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "Emergency");
            const closureId = 0;
            
            // Initially should be false
            expect(await project.hasEnoughClosureCommitteeApprovers(closureId)).to.be.false;
            
            const REVEAL_WINDOW = 30 * 60;
            const chainId = await committee1.getChainId();
            
            // Add 3 approvers
            const committees = [committee1, committee2, committee3];
            for (let i = 0; i < committees.length; i++) {
                const nonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
                const commitment = ethers.keccak256(
                    ethers.solidityPacked(
                        ["address", "uint256", "uint256", "uint256"],
                        [committees[i].address, closureId, chainId, nonce]
                    )
                );
                await project.connect(committees[i]).commitClosureApproval(closureId, commitment);
                await ethers.provider.send("evm_increaseTime", [REVEAL_WINDOW + 1]);
                await ethers.provider.send("evm_mine");
                await project.connect(committees[i]).approveEmergencyClosure(closureId, nonce);
            }
            
            // Now should be true
            expect(await project.hasEnoughClosureCommitteeApprovers(closureId)).to.be.true;
        });
    });

    describe("Integration with Existing System", function () {
        it("Should not interfere with regular reimbursement requests", async function () {
            const { project, committee1, requester, recipient, returnAddress } = await loadFixture(deployFixture);
            
            // Create a regular reimbursement request
            const SECRETARY_ROLE = await project.SECRETARY_ROLE();
            const FINANCE_ROLE = await project.FINANCE_ROLE();
            await project.grantRole(SECRETARY_ROLE, committee1.address);
            await project.grantRole(FINANCE_ROLE, committee1.address);
            
            await project.connect(requester).createRequest(
                recipient.address,
                ethers.parseEther("100"),
                "Test reimbursement",
                "ipfs://test"
            );
            
            // Initiate emergency closure
            await project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "Emergency");
            
            // Regular request should still be accessible
            const request = await project.getRequest(0);
            expect(request.requester).to.equal(requester.address);
        });

        it("Should pause all operations after closure execution", async function () {
            const { project, committee1, committee2, committee3, director, requester, recipient, returnAddress } = await loadFixture(deployFixture);
            
            // Execute emergency closure
            await project.connect(committee1).initiateEmergencyClosure(returnAddress.address, "Emergency");
            const closureId = 0;
            
            const REVEAL_WINDOW = 30 * 60;
            const chainId = await committee1.getChainId();
            
            // Get all approvals and execute
            const approvers = [committee1, committee2, committee3, director];
            for (let i = 0; i < approvers.length; i++) {
                const nonce = BigInt("0x" + Buffer.from(ethers.randomBytes(32)).toString('hex'));
                const commitment = ethers.keccak256(
                    ethers.solidityPacked(
                        ["address", "uint256", "uint256", "uint256"],
                        [approvers[i].address, closureId, chainId, nonce]
                    )
                );
                await project.connect(approvers[i]).commitClosureApproval(closureId, commitment);
                await ethers.provider.send("evm_increaseTime", [REVEAL_WINDOW + 1]);
                await ethers.provider.send("evm_mine");
                await project.connect(approvers[i]).approveEmergencyClosure(closureId, nonce);
            }
            
            // Try to create a new request - should fail
            await expect(
                project.connect(requester).createRequest(
                    recipient.address,
                    ethers.parseEther("100"),
                    "Test",
                    "ipfs://test"
                )
            ).to.be.revertedWith("Pausable: paused");
        });
    });
});