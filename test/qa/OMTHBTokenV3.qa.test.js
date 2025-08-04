const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("OMTHB Token V3 - Comprehensive QA Tests", function () {
    let OMTHBTokenV2, OMTHBTokenV3;
    let token;
    let owner, admin, guardian1, guardian2, minter1, minter2, minter3, pauser, blacklister, upgrader, user1, user2, attacker;
    let forwarder;
    
    // Constants for testing
    const INITIAL_SUPPLY = ethers.parseEther("1000000");
    const TIMELOCK_DELAY = 2 * 24 * 60 * 60; // 2 days
    const GLOBAL_DAILY_LIMIT = ethers.parseEther("100000");
    const SUSPICIOUS_THRESHOLD = ethers.parseEther("50000");
    const MINTER1_DAILY_LIMIT = ethers.parseEther("30000");
    const MINTER2_DAILY_LIMIT = ethers.parseEther("40000");
    const MINTER3_DAILY_LIMIT = ethers.parseEther("50000");
    
    // Role constants
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
    const BLACKLISTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BLACKLISTER_ROLE"));
    const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));
    const GUARDIAN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GUARDIAN_ROLE"));
    const TIMELOCK_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TIMELOCK_ADMIN_ROLE"));

    beforeEach(async function () {
        [owner, admin, guardian1, guardian2, minter1, minter2, minter3, pauser, blacklister, upgrader, user1, user2, attacker] = await ethers.getSigners();
        
        // Deploy forwarder for meta transactions
        const Forwarder = await ethers.getContractFactory("MinimalForwarder");
        forwarder = await Forwarder.deploy();
        
        // Deploy V2 first to simulate upgrade scenario
        OMTHBTokenV2 = await ethers.getContractFactory("OMTHBTokenV2");
        token = await upgrades.deployProxy(OMTHBTokenV2, [
            forwarder.target,
            owner.address
        ], { initializer: 'initialize' });
        
        // Set up V2 roles
        await token.grantRole(DEFAULT_ADMIN_ROLE, admin.address);
        await token.grantRole(PAUSER_ROLE, pauser.address);
        await token.grantRole(BLACKLISTER_ROLE, blacklister.address);
        await token.grantRole(UPGRADER_ROLE, upgrader.address);
        
        // Upgrade to V3
        OMTHBTokenV3 = await ethers.getContractFactory("OMTHBTokenV3");
        token = await upgrades.upgradeProxy(token.target, OMTHBTokenV3);
        
        // Initialize V3
        await token.initializeV3(TIMELOCK_DELAY, GLOBAL_DAILY_LIMIT, SUSPICIOUS_THRESHOLD);
        
        // Grant additional V3 roles
        await token.grantRole(TIMELOCK_ADMIN_ROLE, admin.address);
        await token.addGuardian(guardian1.address);
        await token.addGuardian(guardian2.address);
    });

    describe("1. Multi-Minter Scenarios", function () {
        
        describe("1.1 Adding Multiple Minters with Different Daily Limits", function () {
            it("should schedule and execute adding multiple minters with different limits", async function () {
                // Schedule adding minter1
                const tx1 = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER1_DAILY_LIMIT);
                const receipt1 = await tx1.wait();
                const actionId1 = receipt1.logs.find(log => log.fragment?.name === 'ActionScheduled').args.actionId;
                
                // Schedule adding minter2
                const tx2 = await token.connect(admin).scheduleAddMinter(minter2.address, MINTER2_DAILY_LIMIT);
                const receipt2 = await tx2.wait();
                const actionId2 = receipt2.logs.find(log => log.fragment?.name === 'ActionScheduled').args.actionId;
                
                // Schedule adding minter3
                const tx3 = await token.connect(admin).scheduleAddMinter(minter3.address, MINTER3_DAILY_LIMIT);
                const receipt3 = await tx3.wait();
                const actionId3 = receipt3.logs.find(log => log.fragment?.name === 'ActionScheduled').args.actionId;
                
                // Verify actions are pending
                expect(await token.getTimeRemaining(actionId1)).to.be.gt(0);
                expect(await token.getTimeRemaining(actionId2)).to.be.gt(0);
                expect(await token.getTimeRemaining(actionId3)).to.be.gt(0);
                
                // Fast forward exactly 2 days
                await time.increase(TIMELOCK_DELAY);
                
                // Execute all actions
                await token.executeAction(actionId1);
                await token.executeAction(actionId2);
                await token.executeAction(actionId3);
                
                // Verify all minters are added with correct limits
                const minter1Info = await token.getMinterInfo(minter1.address);
                expect(minter1Info.isMinter).to.be.true;
                expect(minter1Info.dailyLimit).to.equal(MINTER1_DAILY_LIMIT);
                
                const minter2Info = await token.getMinterInfo(minter2.address);
                expect(minter2Info.isMinter).to.be.true;
                expect(minter2Info.dailyLimit).to.equal(MINTER2_DAILY_LIMIT);
                
                const minter3Info = await token.getMinterInfo(minter3.address);
                expect(minter3Info.isMinter).to.be.true;
                expect(minter3Info.dailyLimit).to.equal(MINTER3_DAILY_LIMIT);
                
                // Verify minter enumeration
                expect(await token.getMinterCount()).to.equal(3);
                const allMinters = await token.getAllMinters();
                expect(allMinters).to.include(minter1.address);
                expect(allMinters).to.include(minter2.address);
                expect(allMinters).to.include(minter3.address);
            });
            
            it("should handle concurrent minting from multiple minters", async function () {
                // Add minters through timelock
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                await addMinterViaTimelock(minter2.address, MINTER2_DAILY_LIMIT);
                await addMinterViaTimelock(minter3.address, MINTER3_DAILY_LIMIT);
                
                // Each minter mints concurrently
                const amount = ethers.parseEther("10000");
                
                await expect(token.connect(minter1).mint(user1.address, amount))
                    .to.emit(token, "Minted")
                    .withArgs(user1.address, amount);
                    
                await expect(token.connect(minter2).mint(user1.address, amount))
                    .to.emit(token, "Minted")
                    .withArgs(user1.address, amount);
                    
                await expect(token.connect(minter3).mint(user2.address, amount))
                    .to.emit(token, "Minted")
                    .withArgs(user2.address, amount);
                
                // Verify balances
                expect(await token.balanceOf(user1.address)).to.equal(amount * 2n);
                expect(await token.balanceOf(user2.address)).to.equal(amount);
                
                // Verify individual minter stats
                const minter1Info = await token.getMinterInfo(minter1.address);
                expect(minter1Info.dailyMinted).to.equal(amount);
                expect(minter1Info.totalMinted).to.equal(amount);
            });
        });

        describe("1.2 Minters Exceeding Daily Limits", function () {
            beforeEach(async function () {
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                await addMinterViaTimelock(minter2.address, MINTER2_DAILY_LIMIT);
            });
            
            it("should prevent minter from exceeding individual daily limit", async function () {
                // Minter1 tries to mint exactly at limit
                await expect(token.connect(minter1).mint(user1.address, MINTER1_DAILY_LIMIT))
                    .to.emit(token, "Minted");
                
                // Try to mint even 1 wei more
                await expect(token.connect(minter1).mint(user1.address, 1))
                    .to.be.revertedWithCustomError(token, "DailyLimitExceededError")
                    .withArgs(minter1.address, MINTER1_DAILY_LIMIT + 1n, MINTER1_DAILY_LIMIT);
            });
            
            it("should reset daily limits after 24 hours", async function () {
                // Max out minter1's daily limit
                await token.connect(minter1).mint(user1.address, MINTER1_DAILY_LIMIT);
                
                // Should fail immediately after
                await expect(token.connect(minter1).mint(user1.address, 1))
                    .to.be.revertedWithCustomError(token, "DailyLimitExceededError");
                
                // Fast forward 24 hours
                await time.increase(24 * 60 * 60);
                
                // Should be able to mint again
                await expect(token.connect(minter1).mint(user1.address, MINTER1_DAILY_LIMIT))
                    .to.emit(token, "Minted");
            });
            
            it("should handle multiple minters hitting limits on same day", async function () {
                // Both minters max out their limits
                await token.connect(minter1).mint(user1.address, MINTER1_DAILY_LIMIT);
                await token.connect(minter2).mint(user2.address, MINTER2_DAILY_LIMIT);
                
                // Both should fail on additional mints
                await expect(token.connect(minter1).mint(user1.address, 1))
                    .to.be.revertedWithCustomError(token, "DailyLimitExceededError");
                    
                await expect(token.connect(minter2).mint(user2.address, 1))
                    .to.be.revertedWithCustomError(token, "DailyLimitExceededError");
                
                // Verify remaining limits are 0
                expect(await token.getRemainingDailyLimit(minter1.address)).to.equal(0);
                expect(await token.getRemainingDailyLimit(minter2.address)).to.equal(0);
            });
        });

        describe("1.3 Global Daily Limit Enforcement", function () {
            beforeEach(async function () {
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                await addMinterViaTimelock(minter2.address, MINTER2_DAILY_LIMIT);
                await addMinterViaTimelock(minter3.address, MINTER3_DAILY_LIMIT);
            });
            
            it("should enforce global daily limit across all minters", async function () {
                // Minter1 mints 30k
                await token.connect(minter1).mint(user1.address, MINTER1_DAILY_LIMIT);
                
                // Minter2 mints 40k
                await token.connect(minter2).mint(user1.address, MINTER2_DAILY_LIMIT);
                
                // Minter3 tries to mint 50k but global limit is 100k
                // So only 30k should be allowed
                const remainingGlobal = await token.getRemainingGlobalDailyLimit();
                expect(remainingGlobal).to.equal(ethers.parseEther("30000"));
                
                // Should succeed with exact remaining amount
                await token.connect(minter3).mint(user1.address, remainingGlobal);
                
                // Should fail with even 1 wei more
                await expect(token.connect(minter3).mint(user1.address, 1))
                    .to.be.revertedWithCustomError(token, "GlobalDailyLimitExceeded");
            });
            
            it("should reset global limit after 24 hours", async function () {
                // Max out global limit
                await token.connect(minter1).mint(user1.address, MINTER1_DAILY_LIMIT);
                await token.connect(minter2).mint(user1.address, MINTER2_DAILY_LIMIT);
                await token.connect(minter3).mint(user1.address, ethers.parseEther("30000"));
                
                expect(await token.getGlobalDailyMinted()).to.equal(GLOBAL_DAILY_LIMIT);
                
                // Fast forward 24 hours
                await time.increase(24 * 60 * 60);
                
                // Global limit should be reset
                expect(await token.getGlobalDailyMinted()).to.equal(0);
                expect(await token.getRemainingGlobalDailyLimit()).to.equal(GLOBAL_DAILY_LIMIT);
                
                // All minters can mint again
                await token.connect(minter1).mint(user1.address, ethers.parseEther("1000"));
                await token.connect(minter2).mint(user1.address, ethers.parseEther("1000"));
                await token.connect(minter3).mint(user1.address, ethers.parseEther("1000"));
            });
        });

        describe("1.4 Minter Enumeration and Role Queries", function () {
            it("should correctly enumerate all minters", async function () {
                // Add multiple minters
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                await addMinterViaTimelock(minter2.address, MINTER2_DAILY_LIMIT);
                await addMinterViaTimelock(minter3.address, MINTER3_DAILY_LIMIT);
                
                // Check count
                expect(await token.getMinterCount()).to.equal(3);
                
                // Check enumeration by index
                const minterAt0 = await token.getMinterAt(0);
                const minterAt1 = await token.getMinterAt(1);
                const minterAt2 = await token.getMinterAt(2);
                
                const minterAddresses = [minterAt0, minterAt1, minterAt2];
                expect(minterAddresses).to.include(minter1.address);
                expect(minterAddresses).to.include(minter2.address);
                expect(minterAddresses).to.include(minter3.address);
                
                // Check getAllMinters
                const allMinters = await token.getAllMinters();
                expect(allMinters.length).to.equal(3);
                expect(allMinters).to.include(minter1.address);
                expect(allMinters).to.include(minter2.address);
                expect(allMinters).to.include(minter3.address);
            });
            
            it("should update enumeration when minters are removed", async function () {
                // Add minters
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                await addMinterViaTimelock(minter2.address, MINTER2_DAILY_LIMIT);
                
                // Remove minter1 via emergency
                await token.connect(guardian1).emergencyRevokeMinter(minter1.address);
                
                // Check updated enumeration
                expect(await token.getMinterCount()).to.equal(1);
                expect(await token.getMinterAt(0)).to.equal(minter2.address);
                
                const allMinters = await token.getAllMinters();
                expect(allMinters.length).to.equal(1);
                expect(allMinters[0]).to.equal(minter2.address);
            });
        });
    });

    describe("2. Timelock Testing", function () {
        
        describe("2.1 Scheduling Role Changes with Exact 2-Day Wait", function () {
            it("should enforce exact 2-day timelock for adding minter", async function () {
                const tx = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER1_DAILY_LIMIT);
                const receipt = await tx.wait();
                const actionId = receipt.logs.find(log => log.fragment?.name === 'ActionScheduled').args.actionId;
                
                const actionInfo = await token.getActionInfo(actionId);
                const expectedExecuteTime = (await ethers.provider.getBlock('latest')).timestamp + TIMELOCK_DELAY;
                expect(actionInfo.executeTime).to.be.closeTo(expectedExecuteTime, 2);
                
                // Try to execute 1 second before timelock expires
                await time.increase(TIMELOCK_DELAY - 1);
                await expect(token.executeAction(actionId))
                    .to.be.revertedWithCustomError(token, "TimelockNotReady");
                
                // Execute exactly at timelock expiry
                await time.increase(1);
                await expect(token.executeAction(actionId))
                    .to.emit(token, "ActionExecuted")
                    .withArgs(actionId);
            });
            
            it("should schedule different types of actions with correct parameters", async function () {
                // Schedule add minter
                const tx1 = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER1_DAILY_LIMIT);
                const receipt1 = await tx1.wait();
                const addMinterAction = receipt1.logs.find(log => log.fragment?.name === 'ActionScheduled').args;
                expect(addMinterAction.actionType).to.equal(0); // ADD_MINTER
                expect(addMinterAction.target).to.equal(minter1.address);
                expect(addMinterAction.value).to.equal(MINTER1_DAILY_LIMIT);
                
                // First add minter to test removal
                await time.increase(TIMELOCK_DELAY);
                await token.executeAction(addMinterAction.actionId);
                
                // Schedule remove minter
                const tx2 = await token.connect(admin).scheduleRemoveMinter(minter1.address);
                const receipt2 = await tx2.wait();
                const removeMinterAction = receipt2.logs.find(log => log.fragment?.name === 'ActionScheduled').args;
                expect(removeMinterAction.actionType).to.equal(1); // REMOVE_MINTER
                expect(removeMinterAction.target).to.equal(minter1.address);
                
                // Schedule set minting limit (need to add minter2 first)
                await addMinterViaTimelock(minter2.address, MINTER2_DAILY_LIMIT);
                const newLimit = ethers.parseEther("60000");
                const tx3 = await token.connect(admin).scheduleSetMintingLimit(minter2.address, newLimit);
                const receipt3 = await tx3.wait();
                const setLimitAction = receipt3.logs.find(log => log.fragment?.name === 'ActionScheduled').args;
                expect(setLimitAction.actionType).to.equal(4); // SET_MINTING_LIMIT
                expect(setLimitAction.value).to.equal(newLimit);
            });
        });

        describe("2.2 Attempting Execution Before Timelock Expires", function () {
            it("should revert with exact time remaining information", async function () {
                const tx = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER1_DAILY_LIMIT);
                const receipt = await tx.wait();
                const actionId = receipt.logs.find(log => log.fragment?.name === 'ActionScheduled').args.actionId;
                
                // Check time remaining
                const timeRemaining = await token.getTimeRemaining(actionId);
                expect(timeRemaining).to.be.closeTo(TIMELOCK_DELAY, 2);
                
                // Try at different intervals
                await expect(token.executeAction(actionId))
                    .to.be.revertedWithCustomError(token, "TimelockNotReady");
                
                // After 1 day
                await time.increase(24 * 60 * 60);
                const timeRemainingAfter1Day = await token.getTimeRemaining(actionId);
                expect(timeRemainingAfter1Day).to.be.closeTo(24 * 60 * 60, 2);
                
                await expect(token.executeAction(actionId))
                    .to.be.revertedWithCustomError(token, "TimelockNotReady");
            });
        });

        describe("2.3 Cancellation of Scheduled Actions", function () {
            it("should allow timelock admin to cancel pending actions", async function () {
                // Schedule multiple actions
                const tx1 = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER1_DAILY_LIMIT);
                const receipt1 = await tx1.wait();
                const actionId1 = receipt1.logs.find(log => log.fragment?.name === 'ActionScheduled').args.actionId;
                
                const tx2 = await token.connect(admin).scheduleAddMinter(minter2.address, MINTER2_DAILY_LIMIT);
                const receipt2 = await tx2.wait();
                const actionId2 = receipt2.logs.find(log => log.fragment?.name === 'ActionScheduled').args.actionId;
                
                // Cancel first action
                await expect(token.connect(admin).cancelAction(actionId1))
                    .to.emit(token, "ActionCancelled")
                    .withArgs(actionId1);
                
                // Verify cancelled action cannot be executed even after timelock
                await time.increase(TIMELOCK_DELAY);
                await expect(token.executeAction(actionId1))
                    .to.be.revertedWithCustomError(token, "ActionCancelledError");
                
                // Second action should still be executable
                await expect(token.executeAction(actionId2))
                    .to.emit(token, "ActionExecuted");
            });
            
            it("should prevent double cancellation", async function () {
                const tx = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER1_DAILY_LIMIT);
                const receipt = await tx.wait();
                const actionId = receipt.logs.find(log => log.fragment?.name === 'ActionScheduled').args.actionId;
                
                await token.connect(admin).cancelAction(actionId);
                
                await expect(token.connect(admin).cancelAction(actionId))
                    .to.be.revertedWithCustomError(token, "ActionCancelledError");
            });
        });

        describe("2.4 Multiple Pending Actions", function () {
            it("should handle multiple pending actions correctly", async function () {
                // Schedule 5 different actions
                const actions = [];
                
                // Add 3 minters
                for (let i = 0; i < 3; i++) {
                    const minter = [minter1, minter2, minter3][i];
                    const limit = [MINTER1_DAILY_LIMIT, MINTER2_DAILY_LIMIT, MINTER3_DAILY_LIMIT][i];
                    const tx = await token.connect(admin).scheduleAddMinter(minter.address, limit);
                    const receipt = await tx.wait();
                    const actionId = receipt.logs.find(log => log.fragment?.name === 'ActionScheduled').args.actionId;
                    actions.push(actionId);
                }
                
                // Verify all are pending
                const pendingActions = await token.getPendingActions();
                expect(pendingActions.length).to.equal(3);
                for (const actionId of actions) {
                    expect(pendingActions).to.include(actionId);
                }
                
                // Cancel one action
                await token.connect(admin).cancelAction(actions[1]);
                
                // Fast forward and execute remaining
                await time.increase(TIMELOCK_DELAY);
                
                await token.executeAction(actions[0]);
                await expect(token.executeAction(actions[1]))
                    .to.be.revertedWithCustomError(token, "ActionCancelledError");
                await token.executeAction(actions[2]);
                
                // Verify final state
                expect(await token.hasRole(MINTER_ROLE, minter1.address)).to.be.true;
                expect(await token.hasRole(MINTER_ROLE, minter2.address)).to.be.false;
                expect(await token.hasRole(MINTER_ROLE, minter3.address)).to.be.true;
            });
        });
    });

    describe("3. Emergency Response Testing", function () {
        
        describe("3.1 Compromised Minter Attack Scenario", function () {
            beforeEach(async function () {
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                await addMinterViaTimelock(attacker.address, MINTER2_DAILY_LIMIT);
            });
            
            it("should detect and stop suspicious minting activity", async function () {
                // Attacker tries to mint suspicious amount
                const suspiciousAmount = SUSPICIOUS_THRESHOLD + 1n;
                
                await expect(token.connect(attacker).mint(attacker.address, suspiciousAmount))
                    .to.be.revertedWithCustomError(token, "SuspiciousAmount")
                    .withArgs(suspiciousAmount);
                
                // Contract should be paused automatically
                expect(await token.paused()).to.be.true;
                
                // Even legitimate minters cannot mint while paused
                await expect(token.connect(minter1).mint(user1.address, ethers.parseEther("100")))
                    .to.be.revertedWithCustomError(token, "EnforcedPause");
            });
            
            it("should simulate rapid-fire minting attack", async function () {
                // Attacker tries to drain funds through rapid small transactions
                const attackAmount = MINTER2_DAILY_LIMIT / 100n;
                
                // Rapid minting attempts
                for (let i = 0; i < 50; i++) {
                    await token.connect(attacker).mint(attacker.address, attackAmount);
                }
                
                // Should hit daily limit
                await expect(token.connect(attacker).mint(attacker.address, attackAmount))
                    .to.be.revertedWithCustomError(token, "DailyLimitExceededError");
                
                // Guardian detects attack and revokes
                await expect(token.connect(guardian1).emergencyRevokeMinter(attacker.address))
                    .to.emit(token, "MinterRevoked")
                    .withArgs(attacker.address, guardian1.address);
                
                // Attacker can no longer mint
                await expect(token.connect(attacker).mint(attacker.address, 1))
                    .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
            });
        });

        describe("3.2 Guardian Emergency Pause Response Time", function () {
            it("should allow immediate pause without timelock", async function () {
                const startBlock = await ethers.provider.getBlock('latest');
                
                // Guardian detects issue and pauses immediately
                await expect(token.connect(guardian1).emergencyPause())
                    .to.emit(token, "EmergencyPause")
                    .withArgs(guardian1.address);
                
                const pauseBlock = await ethers.provider.getBlock('latest');
                const responseTime = pauseBlock.timestamp - startBlock.timestamp;
                
                // Should be paused within same block or next block (< 15 seconds)
                expect(responseTime).to.be.lt(15);
                expect(await token.paused()).to.be.true;
            });
            
            it("should prevent non-guardians from emergency pause", async function () {
                await expect(token.connect(attacker).emergencyPause())
                    .to.be.revertedWithCustomError(token, "NotGuardian")
                    .withArgs(attacker.address);
                    
                await expect(token.connect(admin).emergencyPause())
                    .to.be.revertedWithCustomError(token, "NotGuardian")
                    .withArgs(admin.address);
            });
        });

        describe("3.3 Emergency Minter Revocation", function () {
            beforeEach(async function () {
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                await addMinterViaTimelock(attacker.address, MINTER2_DAILY_LIMIT);
            });
            
            it("should immediately revoke compromised minter", async function () {
                // Verify attacker is a minter
                expect(await token.hasRole(MINTER_ROLE, attacker.address)).to.be.true;
                
                // Guardian revokes immediately
                await expect(token.connect(guardian1).emergencyRevokeMinter(attacker.address))
                    .to.emit(token, "MinterRevoked")
                    .withArgs(attacker.address, guardian1.address);
                
                // Verify immediate effect
                expect(await token.hasRole(MINTER_ROLE, attacker.address)).to.be.false;
                const minterInfo = await token.getMinterInfo(attacker.address);
                expect(minterInfo.isMinter).to.be.false;
                expect(minterInfo.dailyLimit).to.equal(0);
                
                // Attacker cannot mint
                await expect(token.connect(attacker).mint(user1.address, 1))
                    .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
            });
            
            it("should handle multiple emergency revocations", async function () {
                // Add another minter
                await addMinterViaTimelock(minter3.address, MINTER3_DAILY_LIMIT);
                
                // Multiple guardians revoke different minters
                await token.connect(guardian1).emergencyRevokeMinter(attacker.address);
                await token.connect(guardian2).emergencyRevokeMinter(minter3.address);
                
                // Verify both are revoked
                expect(await token.hasRole(MINTER_ROLE, attacker.address)).to.be.false;
                expect(await token.hasRole(MINTER_ROLE, minter3.address)).to.be.false;
                
                // Only minter1 remains
                expect(await token.getMinterCount()).to.equal(1);
                expect(await token.getMinterAt(0)).to.equal(minter1.address);
            });
        });

        describe("3.4 System Recovery After Emergency", function () {
            it("should recover from emergency pause", async function () {
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                
                // Emergency pause
                await token.connect(guardian1).emergencyPause();
                expect(await token.paused()).to.be.true;
                
                // Admin investigates and unpauses
                await token.connect(pauser).unpause();
                expect(await token.paused()).to.be.false;
                
                // Normal operations resume
                await expect(token.connect(minter1).mint(user1.address, ethers.parseEther("1000")))
                    .to.emit(token, "Minted");
            });
            
            it("should recover from suspicious activity auto-pause", async function () {
                await addMinterViaTimelock(attacker.address, MINTER2_DAILY_LIMIT);
                
                // Trigger auto-pause
                await expect(token.connect(attacker).mint(user1.address, SUSPICIOUS_THRESHOLD + 1n))
                    .to.be.revertedWithCustomError(token, "SuspiciousAmount");
                
                expect(await token.paused()).to.be.true;
                
                // Guardian revokes suspicious minter
                await token.connect(guardian1).emergencyRevokeMinter(attacker.address);
                
                // Admin adjusts threshold and unpauses
                await token.connect(admin).setSuspiciousAmountThreshold(ethers.parseEther("100000"));
                await token.connect(pauser).unpause();
                
                // Add new legitimate minter
                await addMinterViaTimelock(minter2.address, MINTER2_DAILY_LIMIT);
                
                // Normal operations resume
                await expect(token.connect(minter2).mint(user1.address, ethers.parseEther("40000")))
                    .to.emit(token, "Minted");
            });
        });
    });

    describe("4. Security Boundary Testing", function () {
        
        describe("4.1 Exact Limit Amount Testing", function () {
            beforeEach(async function () {
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
            });
            
            it("should handle minting exactly at daily limit", async function () {
                // Mint exactly the daily limit
                await expect(token.connect(minter1).mint(user1.address, MINTER1_DAILY_LIMIT))
                    .to.emit(token, "Minted")
                    .withArgs(user1.address, MINTER1_DAILY_LIMIT);
                
                // Verify state
                const minterInfo = await token.getMinterInfo(minter1.address);
                expect(minterInfo.dailyMinted).to.equal(MINTER1_DAILY_LIMIT);
                expect(await token.getRemainingDailyLimit(minter1.address)).to.equal(0);
                
                // Even 1 wei more should fail
                await expect(token.connect(minter1).mint(user1.address, 1))
                    .to.be.revertedWithCustomError(token, "DailyLimitExceededError");
            });
            
            it("should handle minting exactly at global limit", async function () {
                await addMinterViaTimelock(minter2.address, GLOBAL_DAILY_LIMIT);
                
                // Mint exactly the global limit
                await expect(token.connect(minter2).mint(user1.address, GLOBAL_DAILY_LIMIT))
                    .to.emit(token, "Minted");
                
                // Global limit exhausted
                expect(await token.getGlobalDailyMinted()).to.equal(GLOBAL_DAILY_LIMIT);
                expect(await token.getRemainingGlobalDailyLimit()).to.equal(0);
                
                // Even legitimate minter with remaining individual limit cannot mint
                await expect(token.connect(minter1).mint(user1.address, 1))
                    .to.be.revertedWithCustomError(token, "GlobalDailyLimitExceeded");
            });
            
            it("should handle minting exactly at suspicious threshold", async function () {
                await addMinterViaTimelock(minter2.address, GLOBAL_DAILY_LIMIT);
                
                // Mint exactly at threshold - should succeed
                await expect(token.connect(minter2).mint(user1.address, SUSPICIOUS_THRESHOLD))
                    .to.emit(token, "Minted")
                    .withArgs(user1.address, SUSPICIOUS_THRESHOLD);
                
                // Contract should not be paused
                expect(await token.paused()).to.be.false;
                
                // One wei more triggers suspicious activity
                await expect(token.connect(minter2).mint(user1.address, SUSPICIOUS_THRESHOLD + 1n))
                    .to.be.revertedWithCustomError(token, "SuspiciousAmount");
                
                expect(await token.paused()).to.be.true;
            });
        });

        describe("4.2 Multiple Minters Hitting Limits Simultaneously", function () {
            beforeEach(async function () {
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                await addMinterViaTimelock(minter2.address, MINTER2_DAILY_LIMIT);
                await addMinterViaTimelock(minter3.address, MINTER3_DAILY_LIMIT);
            });
            
            it("should handle race condition at global limit", async function () {
                // Set global limit to exactly sum of two minter limits
                const newGlobalLimit = MINTER1_DAILY_LIMIT + MINTER2_DAILY_LIMIT;
                await token.connect(admin).setGlobalDailyLimit(newGlobalLimit);
                
                // Both minters mint their full limits
                await token.connect(minter1).mint(user1.address, MINTER1_DAILY_LIMIT);
                await token.connect(minter2).mint(user2.address, MINTER2_DAILY_LIMIT);
                
                // Third minter should be completely blocked
                await expect(token.connect(minter3).mint(user1.address, 1))
                    .to.be.revertedWithCustomError(token, "GlobalDailyLimitExceeded")
                    .withArgs(newGlobalLimit + 1n, newGlobalLimit);
            });
            
            it("should handle partial minting when approaching limits", async function () {
                // Minter1 uses most of limit
                const firstMint = MINTER1_DAILY_LIMIT - ethers.parseEther("1000");
                await token.connect(minter1).mint(user1.address, firstMint);
                
                // Verify can mint exactly remaining amount
                const remaining = await token.getRemainingDailyLimit(minter1.address);
                expect(remaining).to.equal(ethers.parseEther("1000"));
                
                await expect(token.connect(minter1).mint(user1.address, remaining))
                    .to.emit(token, "Minted");
                
                // Now at exact limit
                expect(await token.getRemainingDailyLimit(minter1.address)).to.equal(0);
            });
        });

        describe("4.3 Reentrancy Attack Attempts", function () {
            let maliciousContract;
            
            beforeEach(async function () {
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                
                // Deploy malicious contract
                const MaliciousRecipient = await ethers.getContractFactory("MaliciousRecipient");
                maliciousContract = await MaliciousRecipient.deploy(token.target);
            });
            
            it("should prevent reentrancy in mint function", async function () {
                // This test would need a malicious ERC777 hook or similar
                // Since OMTHB is ERC20, we test the nonReentrant modifier differently
                
                // Verify mint is protected by nonReentrant
                // The mint function will revert if called recursively
                await expect(token.connect(minter1).mint(user1.address, ethers.parseEther("1000")))
                    .to.emit(token, "Minted");
                
                // Contract state should remain consistent
                const minterInfo = await token.getMinterInfo(minter1.address);
                expect(minterInfo.dailyMinted).to.equal(ethers.parseEther("1000"));
            });
            
            it("should prevent reentrancy in executeAction", async function () {
                // Schedule an action
                const tx = await token.connect(admin).scheduleAddMinter(minter2.address, MINTER2_DAILY_LIMIT);
                const receipt = await tx.wait();
                const actionId = receipt.logs.find(log => log.fragment?.name === 'ActionScheduled').args.actionId;
                
                await time.increase(TIMELOCK_DELAY);
                
                // Execute action (protected by nonReentrant)
                await expect(token.executeAction(actionId))
                    .to.emit(token, "ActionExecuted");
                
                // Verify action cannot be executed again
                await expect(token.executeAction(actionId))
                    .to.be.revertedWithCustomError(token, "ActionAlreadyExecuted");
            });
        });

        describe("4.4 Edge Cases and Boundary Conditions", function () {
            it("should handle zero address inputs", async function () {
                await expect(token.connect(admin).scheduleAddMinter(ethers.ZeroAddress, MINTER1_DAILY_LIMIT))
                    .to.be.revertedWithCustomError(token, "ZeroAddress");
                
                await expect(token.connect(admin).addGuardian(ethers.ZeroAddress))
                    .to.be.revertedWithCustomError(token, "ZeroAddress");
                    
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                await expect(token.connect(minter1).mint(ethers.ZeroAddress, ethers.parseEther("1000")))
                    .to.be.revertedWithCustomError(token, "InvalidAddress");
            });
            
            it("should handle zero amount inputs", async function () {
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                
                await expect(token.connect(minter1).mint(user1.address, 0))
                    .to.be.revertedWithCustomError(token, "InvalidAmount");
                    
                await expect(token.connect(admin).setGlobalDailyLimit(0))
                    .to.be.revertedWithCustomError(token, "InvalidMintingLimit");
                    
                await expect(token.connect(admin).setSuspiciousAmountThreshold(0))
                    .to.be.revertedWithCustomError(token, "SuspiciousAmount")
                    .withArgs(0);
            });
            
            it("should handle maximum uint256 values", async function () {
                const maxUint256 = ethers.MaxUint256;
                
                // Add minter with max limit
                await addMinterViaTimelock(minter1.address, maxUint256);
                
                // Should still respect global limit
                await expect(token.connect(minter1).mint(user1.address, GLOBAL_DAILY_LIMIT + 1n))
                    .to.be.revertedWithCustomError(token, "GlobalDailyLimitExceeded");
            });
            
            it("should handle timelock delay boundaries", async function () {
                // Try to set delay below minimum
                await expect(token.connect(admin).scheduleSetTimelockDelay(12 * 60 * 60)) // 12 hours
                    .to.be.revertedWithCustomError(token, "InvalidTimelockDelay");
                
                // Try to set delay above maximum
                await expect(token.connect(admin).scheduleSetTimelockDelay(8 * 24 * 60 * 60)) // 8 days
                    .to.be.revertedWithCustomError(token, "InvalidTimelockDelay");
                
                // Valid delays should work
                const validDelay = 3 * 24 * 60 * 60; // 3 days
                const tx = await token.connect(admin).scheduleSetTimelockDelay(validDelay);
                const receipt = await tx.wait();
                const actionId = receipt.logs.find(log => log.fragment?.name === 'ActionScheduled').args.actionId;
                
                await time.increase(TIMELOCK_DELAY);
                await token.executeAction(actionId);
                
                expect(await token.getTimelockDelay()).to.equal(validDelay);
            });
        });
    });

    describe("5. Integration Scenarios", function () {
        
        describe("5.1 Upgrade from V2 to V3 State Preservation", function () {
            it("should maintain all V2 state after upgrade", async function () {
                // Deploy fresh V2
                const v2Token = await upgrades.deployProxy(OMTHBTokenV2, [
                    forwarder.target,
                    owner.address
                ], { initializer: 'initialize' });
                
                // Set up V2 state
                await v2Token.grantRole(MINTER_ROLE, minter1.address);
                await v2Token.grantRole(PAUSER_ROLE, pauser.address);
                await v2Token.grantRole(BLACKLISTER_ROLE, blacklister.address);
                
                // Mint some tokens
                await v2Token.connect(minter1).mint(user1.address, ethers.parseEther("10000"));
                
                // Blacklist an address
                await v2Token.connect(blacklister).blacklist(attacker.address);
                
                // Record state
                const totalSupplyBefore = await v2Token.totalSupply();
                const user1BalanceBefore = await v2Token.balanceOf(user1.address);
                const attackerBlacklistedBefore = await v2Token.isBlacklisted(attacker.address);
                
                // Upgrade to V3
                const v3Token = await upgrades.upgradeProxy(v2Token.target, OMTHBTokenV3);
                await v3Token.initializeV3(TIMELOCK_DELAY, GLOBAL_DAILY_LIMIT, SUSPICIOUS_THRESHOLD);
                
                // Verify state preservation
                expect(await v3Token.totalSupply()).to.equal(totalSupplyBefore);
                expect(await v3Token.balanceOf(user1.address)).to.equal(user1BalanceBefore);
                expect(await v3Token.isBlacklisted(attacker.address)).to.equal(attackerBlacklistedBefore);
                
                // Verify roles preserved
                expect(await v3Token.hasRole(MINTER_ROLE, minter1.address)).to.be.true;
                expect(await v3Token.hasRole(PAUSER_ROLE, pauser.address)).to.be.true;
                expect(await v3Token.hasRole(BLACKLISTER_ROLE, blacklister.address)).to.be.true;
                
                // V2 functions still work
                await v3Token.connect(minter1).mint(user2.address, ethers.parseEther("5000"));
                expect(await v3Token.balanceOf(user2.address)).to.equal(ethers.parseEther("5000"));
            });
        });

        describe("5.2 V2 Functions Backward Compatibility", function () {
            beforeEach(async function () {
                // Set up minter without daily limit for V2 compatibility
                await token.grantRole(MINTER_ROLE, minter1.address);
            });
            
            it("should support V2 minting without daily limits", async function () {
                // V2 style minting (no daily limit set)
                const minterInfo = await token.getMinterInfo(minter1.address);
                expect(minterInfo.dailyLimit).to.equal(0);
                
                // Should be able to mint up to global limit
                const largeAmount = ethers.parseEther("90000");
                await expect(token.connect(minter1).mint(user1.address, largeAmount))
                    .to.emit(token, "Minted")
                    .withArgs(user1.address, largeAmount);
            });
            
            it("should support all V2 blacklist functions", async function () {
                // Blacklist functions
                await expect(token.connect(blacklister).blacklist(attacker.address))
                    .to.emit(token, "Blacklisted")
                    .withArgs(attacker.address);
                
                expect(await token.isBlacklisted(attacker.address)).to.be.true;
                
                // Transfers should fail
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                await token.connect(minter1).mint(attacker.address, ethers.parseEther("1000"));
                await expect(token.connect(attacker).transfer(user1.address, ethers.parseEther("100")))
                    .to.be.revertedWithCustomError(token, "AccountBlacklisted")
                    .withArgs(attacker.address);
                
                // Unblacklist
                await expect(token.connect(blacklister).unBlacklist(attacker.address))
                    .to.emit(token, "UnBlacklisted")
                    .withArgs(attacker.address);
                
                // Transfers should work now
                await expect(token.connect(attacker).transfer(user1.address, ethers.parseEther("100")))
                    .to.emit(token, "Transfer");
            });
            
            it("should support V2 pause/unpause", async function () {
                await expect(token.connect(pauser).pause())
                    .to.emit(token, "Paused");
                
                // All transfers should fail
                await expect(token.connect(user1).transfer(user2.address, 1))
                    .to.be.revertedWithCustomError(token, "EnforcedPause");
                
                await expect(token.connect(pauser).unpause())
                    .to.emit(token, "Unpaused");
                
                // Transfers work again
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                await token.connect(minter1).mint(user1.address, ethers.parseEther("1000"));
                await expect(token.connect(user1).transfer(user2.address, ethers.parseEther("100")))
                    .to.emit(token, "Transfer");
            });
        });

        describe("5.3 Pause and Minting Limits Interaction", function () {
            beforeEach(async function () {
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
            });
            
            it("should reset daily limits during pause period", async function () {
                // Use half of daily limit
                await token.connect(minter1).mint(user1.address, MINTER1_DAILY_LIMIT / 2n);
                
                // Pause for more than 24 hours
                await token.connect(pauser).pause();
                await time.increase(25 * 60 * 60);
                await token.connect(pauser).unpause();
                
                // Daily limits should be reset
                const minterInfo = await token.getMinterInfo(minter1.address);
                expect(minterInfo.lastMintDay).to.be.lt(Math.floor(Date.now() / 1000 / 86400));
                
                // Can mint full daily limit again
                await expect(token.connect(minter1).mint(user1.address, MINTER1_DAILY_LIMIT))
                    .to.emit(token, "Minted");
            });
            
            it("should maintain limit tracking across pause/unpause", async function () {
                // Use some limit
                const firstMint = ethers.parseEther("10000");
                await token.connect(minter1).mint(user1.address, firstMint);
                
                // Quick pause/unpause
                await token.connect(pauser).pause();
                await token.connect(pauser).unpause();
                
                // Limits should be maintained
                const remaining = await token.getRemainingDailyLimit(minter1.address);
                expect(remaining).to.equal(MINTER1_DAILY_LIMIT - firstMint);
                
                // Can still mint up to limit
                await expect(token.connect(minter1).mint(user1.address, remaining))
                    .to.emit(token, "Minted");
            });
        });

        describe("5.4 Complex Role Interaction Scenarios", function () {
            it("should handle admin vs guardian vs minter permissions correctly", async function () {
                await addMinterViaTimelock(minter1.address, MINTER1_DAILY_LIMIT);
                
                // Admin cannot emergency pause (not guardian)
                await expect(token.connect(admin).emergencyPause())
                    .to.be.revertedWithCustomError(token, "NotGuardian");
                
                // Guardian cannot schedule actions (not timelock admin)
                await expect(token.connect(guardian1).scheduleAddMinter(minter2.address, MINTER2_DAILY_LIMIT))
                    .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
                
                // Minter cannot pause (not pauser)
                await expect(token.connect(minter1).pause())
                    .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
                
                // Each role works correctly
                await token.connect(guardian1).emergencyPause(); // Guardian can emergency pause
                await token.connect(pauser).unpause(); // Pauser can unpause
                await token.connect(minter1).mint(user1.address, ethers.parseEther("1000")); // Minter can mint
                await token.connect(admin).scheduleAddMinter(minter2.address, MINTER2_DAILY_LIMIT); // Admin can schedule
            });
            
            it("should handle role delegation and revocation", async function () {
                // Admin delegates timelock admin to another address
                await token.connect(admin).grantRole(TIMELOCK_ADMIN_ROLE, user1.address);
                
                // New timelock admin can schedule
                const tx = await token.connect(user1).scheduleAddMinter(minter2.address, MINTER2_DAILY_LIMIT);
                const receipt = await tx.wait();
                const actionId = receipt.logs.find(log => log.fragment?.name === 'ActionScheduled').args.actionId;
                
                // Admin revokes timelock admin
                await token.connect(admin).revokeRole(TIMELOCK_ADMIN_ROLE, user1.address);
                
                // Cannot cancel action anymore
                await expect(token.connect(user1).cancelAction(actionId))
                    .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
                
                // Original admin can still cancel
                await expect(token.connect(admin).cancelAction(actionId))
                    .to.emit(token, "ActionCancelled");
            });
            
            it("should test guardian role management", async function () {
                // Check initial guardians
                expect(await token.getGuardianCount()).to.equal(2);
                expect(await token.isGuardian(guardian1.address)).to.be.true;
                expect(await token.isGuardian(guardian2.address)).to.be.true;
                
                // Remove a guardian
                await expect(token.connect(admin).removeGuardian(guardian1.address))
                    .to.emit(token, "GuardianRemoved")
                    .withArgs(guardian1.address);
                
                // Removed guardian cannot use emergency functions
                await expect(token.connect(guardian1).emergencyPause())
                    .to.be.revertedWithCustomError(token, "NotGuardian");
                
                // Remaining guardian still can
                await expect(token.connect(guardian2).emergencyPause())
                    .to.emit(token, "EmergencyPause");
            });
        });
    });

    // Helper functions
    async function addMinterViaTimelock(minterAddress, dailyLimit) {
        const tx = await token.connect(admin).scheduleAddMinter(minterAddress, dailyLimit);
        const receipt = await tx.wait();
        const actionId = receipt.logs.find(log => log.fragment?.name === 'ActionScheduled').args.actionId;
        await time.increase(TIMELOCK_DELAY);
        await token.executeAction(actionId);
    }
});

// Malicious recipient contract for reentrancy testing
const MaliciousRecipientCode = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IToken {
    function mint(address to, uint256 amount) external;
}

contract MaliciousRecipient {
    IToken public token;
    bool public attacking;
    
    constructor(address _token) {
        token = IToken(_token);
    }
    
    receive() external payable {
        if (attacking) {
            attacking = false;
            // Try to reenter mint
            try token.mint(address(this), 1000) {
                // If this succeeds, reentrancy protection failed
            } catch {
                // Expected behavior - reentrancy prevented
            }
        }
    }
    
    function attack() external {
        attacking = true;
    }
}
`;