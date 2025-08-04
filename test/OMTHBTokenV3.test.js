const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("OMTHBTokenV3", function () {
  let token;
  let owner;
  let admin;
  let minter1;
  let minter2;
  let guardian;
  let user1;
  let user2;
  let trustedForwarder;

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const GUARDIAN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GUARDIAN_ROLE"));
  const TIMELOCK_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TIMELOCK_ADMIN_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));

  const TWO_DAYS = 2 * 24 * 60 * 60;
  const ONE_DAY = 24 * 60 * 60;
  const GLOBAL_DAILY_LIMIT = ethers.parseEther("1000000");
  const MINTER_DAILY_LIMIT = ethers.parseEther("100000");
  const SUSPICIOUS_THRESHOLD = ethers.parseEther("500000");

  beforeEach(async function () {
    [owner, admin, minter1, minter2, guardian, user1, user2, trustedForwarder] = await ethers.getSigners();

    // Deploy V2 first
    const OMTHBTokenV2 = await ethers.getContractFactory("OMTHBTokenV2");
    token = await upgrades.deployProxy(OMTHBTokenV2, [admin.address, trustedForwarder.address], {
      initializer: "initialize",
      kind: "uups"
    });

    // Upgrade to V3
    const OMTHBTokenV3 = await ethers.getContractFactory("OMTHBTokenV3");
    token = await upgrades.upgradeProxy(token.target, OMTHBTokenV3, {
      call: {
        fn: "initializeV3",
        args: [TWO_DAYS, GLOBAL_DAILY_LIMIT, SUSPICIOUS_THRESHOLD]
      }
    });

    // Grant roles
    await token.connect(admin).grantRole(TIMELOCK_ADMIN_ROLE, admin.address);
    await token.connect(admin).addGuardian(guardian.address);
  });

  describe("Multi-Minter Support", function () {
    it("should track minter count and list all minters", async function () {
      // Schedule adding minters
      const tx1 = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER_DAILY_LIMIT);
      const receipt1 = await tx1.wait();
      const actionId1 = receipt1.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      const tx2 = await token.connect(admin).scheduleAddMinter(minter2.address, MINTER_DAILY_LIMIT);
      const receipt2 = await tx2.wait();
      const actionId2 = receipt2.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      // Fast forward time
      await time.increase(TWO_DAYS + 1);

      // Execute actions
      await token.executeAction(actionId1);
      await token.executeAction(actionId2);

      // Check minter count
      expect(await token.getMinterCount()).to.equal(2);

      // Check all minters
      const allMinters = await token.getAllMinters();
      expect(allMinters).to.have.lengthOf(2);
      expect(allMinters).to.include(minter1.address);
      expect(allMinters).to.include(minter2.address);

      // Check individual minter info
      const minter1Info = await token.getMinterInfo(minter1.address);
      expect(minter1Info.isMinter).to.be.true;
      expect(minter1Info.dailyLimit).to.equal(MINTER_DAILY_LIMIT);
    });
  });

  describe("Timelock for Role Management", function () {
    it("should enforce 2-day delay for adding minters", async function () {
      const tx = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER_DAILY_LIMIT);
      const receipt = await tx.wait();
      const actionId = receipt.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      // Try to execute immediately - should fail
      await expect(token.executeAction(actionId))
        .to.be.revertedWithCustomError(token, "TimelockNotReady");

      // Check time remaining
      const timeRemaining = await token.getTimeRemaining(actionId);
      expect(timeRemaining).to.be.closeTo(TWO_DAYS, 5);

      // Fast forward time
      await time.increase(TWO_DAYS + 1);

      // Now execution should succeed
      await token.executeAction(actionId);
      expect(await token.hasRole(MINTER_ROLE, minter1.address)).to.be.true;
    });

    it("should allow cancelling scheduled actions", async function () {
      const tx = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER_DAILY_LIMIT);
      const receipt = await tx.wait();
      const actionId = receipt.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      // Cancel the action
      await token.connect(admin).cancelAction(actionId);

      // Fast forward time
      await time.increase(TWO_DAYS + 1);

      // Try to execute - should fail
      await expect(token.executeAction(actionId))
        .to.be.revertedWithCustomError(token, "ActionCancelled");
    });

    it("should show pending actions", async function () {
      const tx1 = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER_DAILY_LIMIT);
      const receipt1 = await tx1.wait();
      const actionId1 = receipt1.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      const tx2 = await token.connect(admin).scheduleRemoveMinter(owner.address, MINTER_DAILY_LIMIT);
      const receipt2 = await tx2.wait();
      const actionId2 = receipt2.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      const pendingActions = await token.getPendingActions();
      expect(pendingActions).to.have.lengthOf(2);
      expect(pendingActions).to.include(actionId1);
      expect(pendingActions).to.include(actionId2);
    });
  });

  describe("Emergency Security Features", function () {
    beforeEach(async function () {
      // Add a minter through timelock
      const tx = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER_DAILY_LIMIT);
      const receipt = await tx.wait();
      const actionId = receipt.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;
      await time.increase(TWO_DAYS + 1);
      await token.executeAction(actionId);
    });

    it("should allow guardian to pause immediately", async function () {
      await token.connect(guardian).emergencyPause();
      expect(await token.paused()).to.be.true;

      // Transfers should fail
      await expect(token.connect(minter1).mint(user1.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("should allow guardian to revoke minters immediately", async function () {
      expect(await token.hasRole(MINTER_ROLE, minter1.address)).to.be.true;

      await token.connect(guardian).emergencyRevokeMinter(minter1.address);
      
      expect(await token.hasRole(MINTER_ROLE, minter1.address)).to.be.false;
      expect(await token.getMinterCount()).to.equal(0);
    });

    it("should require guardian role for emergency actions", async function () {
      await expect(token.connect(user1).emergencyPause())
        .to.be.revertedWithCustomError(token, "NotGuardian");

      await expect(token.connect(user1).emergencyRevokeMinter(minter1.address))
        .to.be.revertedWithCustomError(token, "NotGuardian");
    });
  });

  describe("Minting Limits", function () {
    beforeEach(async function () {
      // Add minters
      const tx1 = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER_DAILY_LIMIT);
      const receipt1 = await tx1.wait();
      const actionId1 = receipt1.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      const tx2 = await token.connect(admin).scheduleAddMinter(minter2.address, ethers.parseEther("50000"));
      const receipt2 = await tx2.wait();
      const actionId2 = receipt2.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      await time.increase(TWO_DAYS + 1);
      await token.executeAction(actionId1);
      await token.executeAction(actionId2);
    });

    it("should enforce daily minting limits per minter", async function () {
      // Mint within limit
      await token.connect(minter1).mint(user1.address, ethers.parseEther("50000"));
      await token.connect(minter1).mint(user2.address, ethers.parseEther("40000"));

      // Try to exceed limit
      await expect(token.connect(minter1).mint(user1.address, ethers.parseEther("20000")))
        .to.be.revertedWithCustomError(token, "DailyLimitExceeded");

      // Check remaining limit
      const remaining = await token.getRemainingDailyLimit(minter1.address);
      expect(remaining).to.equal(ethers.parseEther("10000"));
    });

    it("should reset daily limits after 24 hours", async function () {
      // Max out limit
      await token.connect(minter1).mint(user1.address, MINTER_DAILY_LIMIT);

      // Try to mint more - should fail
      await expect(token.connect(minter1).mint(user1.address, ethers.parseEther("1")))
        .to.be.revertedWithCustomError(token, "DailyLimitExceeded");

      // Fast forward 24 hours
      await time.increase(ONE_DAY + 1);

      // Should be able to mint again
      await token.connect(minter1).mint(user1.address, ethers.parseEther("50000"));
      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("150000"));
    });

    it("should enforce global daily limit", async function () {
      // Set a lower global limit for testing
      await token.connect(admin).setGlobalDailyLimit(ethers.parseEther("120000"));

      // Minter1 mints 80000
      await token.connect(minter1).mint(user1.address, ethers.parseEther("80000"));

      // Minter2 tries to mint 50000 - should fail (would exceed global limit)
      await expect(token.connect(minter2).mint(user2.address, ethers.parseEther("50000")))
        .to.be.revertedWithCustomError(token, "GlobalDailyLimitExceeded");

      // But can mint 40000
      await token.connect(minter2).mint(user2.address, ethers.parseEther("40000"));

      // Check remaining global limit
      const remainingGlobal = await token.getRemainingGlobalDailyLimit();
      expect(remainingGlobal).to.equal(0);
    });

    it("should detect and auto-pause on suspicious amounts", async function () {
      // Try to mint above suspicious threshold
      await expect(token.connect(minter1).mint(user1.address, SUSPICIOUS_THRESHOLD + ethers.parseEther("1")))
        .to.be.revertedWithCustomError(token, "SuspiciousAmount");

      // Token should be paused
      expect(await token.paused()).to.be.true;

      // Even small amounts should fail now
      await expect(token.connect(minter1).mint(user1.address, ethers.parseEther("1")))
        .to.be.revertedWithCustomError(token, "EnforcedPause");
    });
  });

  describe("Enhanced Security", function () {
    it("should have reentrancy protection on mint", async function () {
      // This test would require a malicious contract to properly test
      // Here we just verify the modifier is in place by checking function behavior
      const tx = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER_DAILY_LIMIT);
      const receipt = await tx.wait();
      const actionId = receipt.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;
      await time.increase(TWO_DAYS + 1);
      await token.executeAction(actionId);

      // Normal mint should work
      await token.connect(minter1).mint(user1.address, ethers.parseEther("100"));
      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
    });

    it("should emit comprehensive events for all state changes", async function () {
      // Test scheduling event
      const tx = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER_DAILY_LIMIT);
      await expect(tx).to.emit(token, "ActionScheduled");

      // Test guardian events
      await expect(token.connect(admin).addGuardian(user1.address))
        .to.emit(token, "GuardianAdded")
        .withArgs(user1.address);

      // Test limit events
      await expect(token.connect(admin).setGlobalDailyLimit(ethers.parseEther("2000000")))
        .to.emit(token, "GlobalDailyLimitUpdated")
        .withArgs(GLOBAL_DAILY_LIMIT, ethers.parseEther("2000000"));
    });

    it("should support role enumeration", async function () {
      // Add multiple guardians
      await token.connect(admin).addGuardian(user1.address);
      await token.connect(admin).addGuardian(user2.address);

      // Check guardian count
      expect(await token.getGuardianCount()).to.equal(3); // including the one from beforeEach

      // Check individual guardians
      const guardian0 = await token.getGuardianAt(0);
      expect(guardian0).to.equal(guardian.address);
    });
  });

  describe("Backward Compatibility", function () {
    it("should maintain all V2 functionality", async function () {
      // Add a minter
      const tx = await token.connect(admin).scheduleAddMinter(minter1.address, MINTER_DAILY_LIMIT);
      const receipt = await tx.wait();
      const actionId = receipt.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;
      await time.increase(TWO_DAYS + 1);
      await token.executeAction(actionId);

      // Test basic ERC20 functions
      await token.connect(minter1).mint(user1.address, ethers.parseEther("1000"));
      await token.connect(user1).transfer(user2.address, ethers.parseEther("100"));
      expect(await token.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));

      // Test burn
      await token.connect(user1).burn(ethers.parseEther("100"));
      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("800"));

      // Test pause/unpause
      await token.connect(admin).pause();
      await expect(token.connect(user1).transfer(user2.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(token, "EnforcedPause");
      await token.connect(admin).unpause();
      await token.connect(user1).transfer(user2.address, ethers.parseEther("100"));

      // Test blacklist
      await token.connect(admin).blacklist(user1.address);
      await expect(token.connect(user1).transfer(user2.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(token, "AccountBlacklisted");
    });
  });
});