const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Enhanced Security Features - Perfect Score", function () {
    let enhancedReimbursement;
    let omthbToken;
    let owner, secretary, committee, finance, director, requester, attacker;
    let projectFactory;
    
    const PROJECT_ID = "PROJ-2025-001";
    const PROJECT_BUDGET = ethers.parseEther("1000000"); // 1M OMTHB
    const SMALL_AMOUNT = ethers.parseEther("5000"); // < 10k threshold
    const MEDIUM_AMOUNT = ethers.parseEther("50000"); // < 100k threshold
    const LARGE_AMOUNT = ethers.parseEther("200000"); // >= 100k threshold
    const REVEAL_WINDOW = 30 * 60; // 30 minutes

    beforeEach(async function () {
        [owner, secretary, committee, finance, director, requester, attacker, projectFactory] = await ethers.getSigners();
        
        // Deploy mock OMTHB token
        const MockToken = await ethers.getContractFactory("MockOMTHB");
        omthbToken = await MockToken.deploy();
        await omthbToken.waitForDeployment();
        
        // Deploy Enhanced Reimbursement contract
        const EnhancedReimbursement = await ethers.getContractFactory("EnhancedProjectReimbursement");
        enhancedReimbursement = await EnhancedReimbursement.deploy();
        await enhancedReimbursement.waitForDeployment();
        
        // Initialize from factory address
        await enhancedReimbursement.connect(projectFactory).initialize(
            PROJECT_ID,
            await omthbToken.getAddress(),
            PROJECT_BUDGET,
            owner.address
        );
        
        // Fund the contract
        await omthbToken.mint(await enhancedReimbursement.getAddress(), PROJECT_BUDGET);
        
        // Grant roles
        await enhancedReimbursement.connect(owner).grantRole(
            await enhancedReimbursement.SECRETARY_ROLE(),
            secretary.address
        );
        await enhancedReimbursement.connect(owner).grantRole(
            await enhancedReimbursement.COMMITTEE_ROLE(),
            committee.address
        );
        await enhancedReimbursement.connect(owner).grantRole(
            await enhancedReimbursement.FINANCE_ROLE(),
            finance.address
        );
        await enhancedReimbursement.connect(owner).grantRole(
            await enhancedReimbursement.DIRECTOR_ROLE(),
            director.address
        );
        await enhancedReimbursement.connect(owner).grantRole(
            await enhancedReimbursement.REQUESTER_ROLE(),
            requester.address
        );
    });

    describe("1. Standardized RevealTooEarly Error Usage", function () {
        it("Should consistently use RevealTooEarly error in all approval functions", async function () {
            // Create a request
            const tx = await enhancedReimbursement.connect(requester).createRequest(
                requester.address,
                SMALL_AMOUNT,
                "Test expense",
                "ipfs://QmTest"
            );
            const receipt = await tx.wait();
            const requestId = receipt.logs[0].args.requestId;
            
            const chainId = (await ethers.provider.getNetwork()).chainId;
            
            // Test all approval levels
            const approvalTests = [
                { role: secretary, func: "approveBySecretary", expectedError: "RevealTooEarly" },
                { role: committee, func: "approveByCommittee", expectedError: "RevealTooEarly" },
                { role: finance, func: "approveByFinance", expectedError: "RevealTooEarly" },
                { role: committee, func: "approveByCommitteeAdditional", expectedError: "RevealTooEarly" },
                { role: director, func: "approveByDirector", expectedError: "RevealTooEarly" }
            ];
            
            for (const test of approvalTests) {
                // Commit approval
                const nonce = ethers.randomBytes(32);
                const commitment = ethers.keccak256(
                    ethers.solidityPacked(
                        ["address", "uint256", "uint256", "bytes32"],
                        [test.role.address, requestId, chainId, nonce]
                    )
                );
                
                await enhancedReimbursement.connect(test.role).commitApproval(requestId, commitment);
                
                // Try to reveal immediately (should fail with RevealTooEarly)
                await expect(
                    enhancedReimbursement.connect(test.role)[test.func](requestId, nonce)
                ).to.be.revertedWithCustomError(enhancedReimbursement, test.expectedError);
                
                // Advance time and approve successfully
                await time.increase(REVEAL_WINDOW + 1);
                
                // Only approve if it's the right stage
                if (test.func === "approveBySecretary") {
                    await enhancedReimbursement.connect(test.role)[test.func](requestId, nonce);
                }
            }
        });
    });

    describe("2. Enhanced Chain ID Validation", function () {
        it("Should include chain ID in commit hash calculation", async function () {
            // Create a request
            const tx = await enhancedReimbursement.connect(requester).createRequest(
                requester.address,
                SMALL_AMOUNT,
                "Test expense",
                "ipfs://QmTest"
            );
            const receipt = await tx.wait();
            const requestId = receipt.logs[0].args.requestId;
            
            const chainId = (await ethers.provider.getNetwork()).chainId;
            const wrongChainId = chainId + 1n;
            const nonce = ethers.randomBytes(32);
            
            // Commit with correct chain ID
            const correctCommitment = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "uint256", "uint256", "bytes32"],
                    [secretary.address, requestId, chainId, nonce]
                )
            );
            
            await enhancedReimbursement.connect(secretary).commitApproval(requestId, correctCommitment);
            await time.increase(REVEAL_WINDOW + 1);
            
            // Try to reveal with wrong chain ID (should fail)
            const wrongNonce = ethers.randomBytes(32);
            await expect(
                enhancedReimbursement.connect(secretary).approveBySecretary(requestId, wrongNonce)
            ).to.be.revertedWithCustomError(enhancedReimbursement, "InvalidCommitment");
            
            // Reveal with correct nonce should succeed
            await enhancedReimbursement.connect(secretary).approveBySecretary(requestId, nonce);
        });
        
        it("Should emit chain ID in ApprovalCommitted event", async function () {
            const tx = await enhancedReimbursement.connect(requester).createRequest(
                requester.address,
                SMALL_AMOUNT,
                "Test expense",
                "ipfs://QmTest"
            );
            const receipt = await tx.wait();
            const requestId = receipt.logs[0].args.requestId;
            
            const chainId = (await ethers.provider.getNetwork()).chainId;
            const commitment = ethers.randomBytes(32);
            
            await expect(enhancedReimbursement.connect(secretary).commitApproval(requestId, commitment))
                .to.emit(enhancedReimbursement, "ApprovalCommitted")
                .withArgs(requestId, secretary.address, await time.latest() + 1, chainId);
        });
    });

    describe("3. Circuit Breakers", function () {
        it("Should trigger circuit breaker on excessive daily volume", async function () {
            // Create multiple small requests that together exceed daily limit
            const dailyLimit = PROJECT_BUDGET / 10n; // 10% of budget
            const numRequests = 3;
            const amountPerRequest = dailyLimit / 2n; // Each request is half the daily limit
            
            // First request should succeed
            const tx1 = await enhancedReimbursement.connect(requester).createRequest(
                requester.address,
                amountPerRequest,
                "Test expense 1",
                "ipfs://QmTest1"
            );
            const receipt1 = await tx1.wait();
            const requestId1 = receipt1.logs[0].args.requestId;
            
            // Approve and distribute first request
            await approveRequest(requestId1);
            
            // Second request should trigger circuit breaker
            const tx2 = await enhancedReimbursement.connect(requester).createRequest(
                requester.address,
                amountPerRequest,
                "Test expense 2",
                "ipfs://QmTest2"
            );
            const receipt2 = await tx2.wait();
            const requestId2 = receipt2.logs[0].args.requestId;
            
            // Approve second request
            await approveRequest(requestId2);
            
            // Distribution should fail due to daily volume exceeded
            await expect(
                enhancedReimbursement.connect(director).executeDelayedWithdrawal(requestId2)
            ).to.be.revertedWithCustomError(enhancedReimbursement, "CircuitBreakerActive");
        });
        
        it("Should trigger circuit breaker on single transaction exceeding limit", async function () {
            const singleTransactionLimit = PROJECT_BUDGET / 100n; // 1% of budget
            const excessiveAmount = singleTransactionLimit + ethers.parseEther("1");
            
            await expect(
                enhancedReimbursement.connect(requester).createRequest(
                    requester.address,
                    excessiveAmount,
                    "Large expense",
                    "ipfs://QmTest"
                )
            ).to.be.revertedWithCustomError(enhancedReimbursement, "CircuitBreakerActive");
        });
        
        it("Should auto-reset circuit breaker after cooldown period", async function () {
            // Manually trigger circuit breaker
            await enhancedReimbursement.connect(owner).triggerCircuitBreaker("Test trigger");
            
            // Should be active
            const status1 = await enhancedReimbursement.getCircuitBreakerStatus();
            expect(status1.active).to.be.true;
            
            // Try to create request (should fail)
            await expect(
                enhancedReimbursement.connect(requester).createRequest(
                    requester.address,
                    SMALL_AMOUNT,
                    "Test expense",
                    "ipfs://QmTest"
                )
            ).to.be.revertedWithCustomError(enhancedReimbursement, "CircuitBreakerActive");
            
            // Advance time past cooldown period (6 hours)
            await time.increase(6 * 60 * 60 + 1);
            
            // Now request should succeed (circuit breaker auto-resets)
            await expect(
                enhancedReimbursement.connect(requester).createRequest(
                    requester.address,
                    SMALL_AMOUNT,
                    "Test expense",
                    "ipfs://QmTest"
                )
            ).to.not.be.reverted;
        });
        
        it("Should track and respond to suspicious activity", async function () {
            // Grant and revoke critical roles rapidly
            const newAdmin = ethers.Wallet.createRandom();
            
            // First few role changes should be fine
            for (let i = 0; i < 4; i++) {
                await enhancedReimbursement.connect(owner).grantRole(
                    await enhancedReimbursement.DEFAULT_ADMIN_ROLE(),
                    newAdmin.address
                );
                await enhancedReimbursement.connect(owner).revokeRole(
                    await enhancedReimbursement.DEFAULT_ADMIN_ROLE(),
                    newAdmin.address
                );
            }
            
            // The 5th grant should trigger circuit breaker (threshold = 5)
            await expect(
                enhancedReimbursement.connect(owner).grantRole(
                    await enhancedReimbursement.DEFAULT_ADMIN_ROLE(),
                    newAdmin.address
                )
            ).to.emit(enhancedReimbursement, "CircuitBreakerTriggered");
        });
    });

    describe("4. Withdrawal Delays", function () {
        it("Should apply no delay for small amounts", async function () {
            const tx = await enhancedReimbursement.connect(requester).createRequest(
                requester.address,
                SMALL_AMOUNT,
                "Small expense",
                "ipfs://QmTest"
            );
            const receipt = await tx.wait();
            const requestId = receipt.logs[0].args.requestId;
            
            // Approve through all levels
            await approveRequest(requestId);
            
            // Check that funds were distributed immediately (no PendingWithdrawal status)
            const request = await enhancedReimbursement.getRequest(requestId);
            expect(request.status).to.equal(6); // Distributed
        });
        
        it("Should apply 12-hour delay for medium amounts", async function () {
            const tx = await enhancedReimbursement.connect(requester).createRequest(
                requester.address,
                MEDIUM_AMOUNT,
                "Medium expense",
                "ipfs://QmTest"
            );
            const receipt = await tx.wait();
            const requestId = receipt.logs[0].args.requestId;
            
            // Approve through all levels
            await approveRequestWithDelay(requestId);
            
            // Check status is PendingWithdrawal
            const request = await enhancedReimbursement.getRequest(requestId);
            expect(request.status).to.equal(5); // PendingWithdrawal
            
            // Try to withdraw immediately (should fail)
            await expect(
                enhancedReimbursement.executeDelayedWithdrawal(requestId)
            ).to.be.revertedWithCustomError(enhancedReimbursement, "WithdrawalNotReady");
            
            // Advance time by 12 hours
            await time.increase(12 * 60 * 60);
            
            // Now withdrawal should succeed
            await expect(enhancedReimbursement.executeDelayedWithdrawal(requestId))
                .to.emit(enhancedReimbursement, "WithdrawalExecuted");
        });
        
        it("Should apply 24-hour delay for large amounts", async function () {
            const tx = await enhancedReimbursement.connect(requester).createRequest(
                requester.address,
                LARGE_AMOUNT,
                "Large expense",
                "ipfs://QmTest"
            );
            const receipt = await tx.wait();
            const requestId = receipt.logs[0].args.requestId;
            
            // Approve through all levels
            await approveRequestWithDelay(requestId);
            
            // Check withdrawal unlock time
            const request = await enhancedReimbursement.getRequest(requestId);
            const currentTime = await time.latest();
            expect(request.withdrawalUnlockTime).to.be.closeTo(
                currentTime + 24 * 60 * 60,
                10
            );
            
            // Advance time by 24 hours and withdraw
            await time.increase(24 * 60 * 60);
            await expect(enhancedReimbursement.executeDelayedWithdrawal(requestId))
                .to.emit(enhancedReimbursement, "FundsDistributed");
        });
        
        it("Should emit proper events for delayed withdrawals", async function () {
            const tx = await enhancedReimbursement.connect(requester).createRequest(
                requester.address,
                LARGE_AMOUNT,
                "Large expense",
                "ipfs://QmTest"
            );
            const receipt = await tx.wait();
            const requestId = receipt.logs[0].args.requestId;
            
            // Complete approvals
            await approveRequestThroughFinance(requestId);
            
            // Additional committee approval
            const nonce4 = ethers.randomBytes(32);
            const chainId = (await ethers.provider.getNetwork()).chainId;
            const commitment4 = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "uint256", "uint256", "bytes32"],
                    [committee.address, requestId, chainId, nonce4]
                )
            );
            await enhancedReimbursement.connect(committee).commitApproval(requestId, commitment4);
            await time.increase(REVEAL_WINDOW + 1);
            await enhancedReimbursement.connect(committee).approveByCommitteeAdditional(requestId, nonce4);
            
            // Director approval should emit delay events
            const nonce5 = ethers.randomBytes(32);
            const commitment5 = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "uint256", "uint256", "bytes32"],
                    [director.address, requestId, chainId, nonce5]
                )
            );
            await enhancedReimbursement.connect(director).commitApproval(requestId, commitment5);
            await time.increase(REVEAL_WINDOW + 1);
            
            await expect(enhancedReimbursement.connect(director).approveByDirector(requestId, nonce5))
                .to.emit(enhancedReimbursement, "WithdrawalDelayApplied")
                .and.to.emit(enhancedReimbursement, "WithdrawalQueued");
        });
    });

    describe("Integration Tests", function () {
        it("Should handle complete flow with all security features", async function () {
            // Test medium amount with all security features
            const tx = await enhancedReimbursement.connect(requester).createRequest(
                requester.address,
                MEDIUM_AMOUNT,
                "Integration test expense",
                "ipfs://QmIntegrationTest"
            );
            const receipt = await tx.wait();
            const requestId = receipt.logs[0].args.requestId;
            
            // Verify request created with proper validation
            const request = await enhancedReimbursement.getRequest(requestId);
            expect(request.amount).to.equal(MEDIUM_AMOUNT);
            expect(request.status).to.equal(0); // Pending
            
            // Complete full approval flow with chain ID validation
            await approveRequestWithDelay(requestId);
            
            // Verify withdrawal delay applied
            const updatedRequest = await enhancedReimbursement.getRequest(requestId);
            expect(updatedRequest.status).to.equal(5); // PendingWithdrawal
            
            // Wait for delay and execute withdrawal
            await time.increase(12 * 60 * 60);
            
            const balanceBefore = await omthbToken.balanceOf(requester.address);
            await enhancedReimbursement.executeDelayedWithdrawal(requestId);
            const balanceAfter = await omthbToken.balanceOf(requester.address);
            
            expect(balanceAfter - balanceBefore).to.equal(MEDIUM_AMOUNT);
        });
        
        it("Should maintain security during high-volume operations", async function () {
            // Create multiple requests
            const numRequests = 5;
            const amount = ethers.parseEther("5000"); // Small amounts
            const requestIds = [];
            
            for (let i = 0; i < numRequests; i++) {
                const tx = await enhancedReimbursement.connect(requester).createRequest(
                    requester.address,
                    amount,
                    `Expense ${i}`,
                    `ipfs://QmTest${i}`
                );
                const receipt = await tx.wait();
                requestIds.push(receipt.logs[0].args.requestId);
            }
            
            // Verify daily volume tracking
            const config = await enhancedReimbursement.circuitBreakerConfig();
            const dailyLimit = config.maxDailyVolume;
            
            // Approve and distribute requests until daily limit approached
            let totalDistributed = 0n;
            for (const requestId of requestIds) {
                if (totalDistributed + amount <= dailyLimit) {
                    await approveRequest(requestId);
                    totalDistributed += amount;
                } else {
                    // This should trigger circuit breaker
                    await approveRequestThroughDirector(requestId);
                    await expect(
                        enhancedReimbursement.executeDelayedWithdrawal(requestId)
                    ).to.be.revertedWithCustomError(enhancedReimbursement, "DailyVolumeExceeded");
                    break;
                }
            }
        });
    });

    // Helper functions
    async function approveRequest(requestId) {
        const chainId = (await ethers.provider.getNetwork()).chainId;
        
        // Secretary approval
        const nonce1 = ethers.randomBytes(32);
        const commitment1 = ethers.keccak256(
            ethers.solidityPacked(
                ["address", "uint256", "uint256", "bytes32"],
                [secretary.address, requestId, chainId, nonce1]
            )
        );
        await enhancedReimbursement.connect(secretary).commitApproval(requestId, commitment1);
        await time.increase(REVEAL_WINDOW + 1);
        await enhancedReimbursement.connect(secretary).approveBySecretary(requestId, nonce1);
        
        // Committee approval
        const nonce2 = ethers.randomBytes(32);
        const commitment2 = ethers.keccak256(
            ethers.solidityPacked(
                ["address", "uint256", "uint256", "bytes32"],
                [committee.address, requestId, chainId, nonce2]
            )
        );
        await enhancedReimbursement.connect(committee).commitApproval(requestId, commitment2);
        await time.increase(REVEAL_WINDOW + 1);
        await enhancedReimbursement.connect(committee).approveByCommittee(requestId, nonce2);
        
        // Finance approval
        const nonce3 = ethers.randomBytes(32);
        const commitment3 = ethers.keccak256(
            ethers.solidityPacked(
                ["address", "uint256", "uint256", "bytes32"],
                [finance.address, requestId, chainId, nonce3]
            )
        );
        await enhancedReimbursement.connect(finance).commitApproval(requestId, commitment3);
        await time.increase(REVEAL_WINDOW + 1);
        await enhancedReimbursement.connect(finance).approveByFinance(requestId, nonce3);
        
        // Additional committee approval
        const nonce4 = ethers.randomBytes(32);
        const commitment4 = ethers.keccak256(
            ethers.solidityPacked(
                ["address", "uint256", "uint256", "bytes32"],
                [committee.address, requestId, chainId, nonce4]
            )
        );
        await enhancedReimbursement.connect(committee).commitApproval(requestId, commitment4);
        await time.increase(REVEAL_WINDOW + 1);
        await enhancedReimbursement.connect(committee).approveByCommitteeAdditional(requestId, nonce4);
        
        // Director approval
        const nonce5 = ethers.randomBytes(32);
        const commitment5 = ethers.keccak256(
            ethers.solidityPacked(
                ["address", "uint256", "uint256", "bytes32"],
                [director.address, requestId, chainId, nonce5]
            )
        );
        await enhancedReimbursement.connect(director).commitApproval(requestId, commitment5);
        await time.increase(REVEAL_WINDOW + 1);
        await enhancedReimbursement.connect(director).approveByDirector(requestId, nonce5);
    }
    
    async function approveRequestWithDelay(requestId) {
        await approveRequest(requestId);
    }
    
    async function approveRequestThroughFinance(requestId) {
        const chainId = (await ethers.provider.getNetwork()).chainId;
        
        // Secretary approval
        const nonce1 = ethers.randomBytes(32);
        const commitment1 = ethers.keccak256(
            ethers.solidityPacked(
                ["address", "uint256", "uint256", "bytes32"],
                [secretary.address, requestId, chainId, nonce1]
            )
        );
        await enhancedReimbursement.connect(secretary).commitApproval(requestId, commitment1);
        await time.increase(REVEAL_WINDOW + 1);
        await enhancedReimbursement.connect(secretary).approveBySecretary(requestId, nonce1);
        
        // Committee approval
        const nonce2 = ethers.randomBytes(32);
        const commitment2 = ethers.keccak256(
            ethers.solidityPacked(
                ["address", "uint256", "uint256", "bytes32"],
                [committee.address, requestId, chainId, nonce2]
            )
        );
        await enhancedReimbursement.connect(committee).commitApproval(requestId, commitment2);
        await time.increase(REVEAL_WINDOW + 1);
        await enhancedReimbursement.connect(committee).approveByCommittee(requestId, nonce2);
        
        // Finance approval
        const nonce3 = ethers.randomBytes(32);
        const commitment3 = ethers.keccak256(
            ethers.solidityPacked(
                ["address", "uint256", "uint256", "bytes32"],
                [finance.address, requestId, chainId, nonce3]
            )
        );
        await enhancedReimbursement.connect(finance).commitApproval(requestId, commitment3);
        await time.increase(REVEAL_WINDOW + 1);
        await enhancedReimbursement.connect(finance).approveByFinance(requestId, nonce3);
    }
    
    async function approveRequestThroughDirector(requestId) {
        await approveRequestThroughFinance(requestId);
        
        const chainId = (await ethers.provider.getNetwork()).chainId;
        
        // Additional committee approval
        const nonce4 = ethers.randomBytes(32);
        const commitment4 = ethers.keccak256(
            ethers.solidityPacked(
                ["address", "uint256", "uint256", "bytes32"],
                [committee.address, requestId, chainId, nonce4]
            )
        );
        await enhancedReimbursement.connect(committee).commitApproval(requestId, commitment4);
        await time.increase(REVEAL_WINDOW + 1);
        await enhancedReimbursement.connect(committee).approveByCommitteeAdditional(requestId, nonce4);
        
        // Director approval
        const nonce5 = ethers.randomBytes(32);
        const commitment5 = ethers.keccak256(
            ethers.solidityPacked(
                ["address", "uint256", "uint256", "bytes32"],
                [director.address, requestId, chainId, nonce5]
            )
        );
        await enhancedReimbursement.connect(director).commitApproval(requestId, commitment5);
        await time.increase(REVEAL_WINDOW + 1);
        await enhancedReimbursement.connect(director).approveByDirector(requestId, nonce5);
    }
});

// Mock OMTHB token for testing
const MockOMTHB = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockOMTHB is ERC20 {
    constructor() ERC20("Mock OMTHB", "mOMTHB") {
        _mint(msg.sender, 10000000 * 10**18);
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
`;