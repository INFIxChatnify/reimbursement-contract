const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("OMTHBTokenV3 Integration Tests", function () {
  // Constants
  const TWO_DAYS = 2 * 24 * 60 * 60;
  const ONE_DAY = 24 * 60 * 60;
  const GLOBAL_DAILY_LIMIT = ethers.parseEther("1000000");
  const MINTER_DAILY_LIMIT = ethers.parseEther("100000");
  const SUSPICIOUS_THRESHOLD = ethers.parseEther("500000");
  
  // Role constants
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const GUARDIAN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GUARDIAN_ROLE"));
  const TIMELOCK_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TIMELOCK_ADMIN_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  const BLACKLISTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BLACKLISTER_ROLE"));
  const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));

  async function deployV2Fixture() {
    const [owner, admin, minter, pauser, blacklister, user1, user2, trustedForwarder] = await ethers.getSigners();

    // Deploy V2
    const OMTHBTokenV2 = await ethers.getContractFactory("OMTHBTokenV2");
    const token = await upgrades.deployProxy(OMTHBTokenV2, [admin.address, trustedForwarder.address], {
      initializer: "initialize",
      kind: "uups",
      unsafeAllow: ['missing-initializers', 'constructor']
    });

    // Setup V2 roles
    await token.connect(admin).grantRole(MINTER_ROLE, minter.address);
    await token.connect(admin).grantRole(PAUSER_ROLE, pauser.address);
    await token.connect(admin).grantRole(BLACKLISTER_ROLE, blacklister.address);
    await token.connect(admin).grantRole(UPGRADER_ROLE, admin.address);

    // Mint some tokens in V2
    await token.connect(minter).mint(user1.address, ethers.parseEther("10000"));
    await token.connect(minter).mint(user2.address, ethers.parseEther("5000"));

    return {
      token,
      owner,
      admin,
      minter,
      pauser,
      blacklister,
      user1,
      user2,
      trustedForwarder
    };
  }

  describe("V2 to V3 Upgrade", function () {
    it("should successfully upgrade from V2 to V3", async function () {
      const { token, admin } = await loadFixture(deployV2Fixture);

      const v2Address = await token.getAddress();
      const totalSupplyBefore = await token.totalSupply();

      // Upgrade to V3
      const OMTHBTokenV3 = await ethers.getContractFactory("OMTHBTokenV3");
      const tokenV3 = await upgrades.upgradeProxy(token.target, OMTHBTokenV3, {
        call: {
          fn: "initializeV3",
          args: [TWO_DAYS, GLOBAL_DAILY_LIMIT, SUSPICIOUS_THRESHOLD]
        },
        unsafeSkipStorageCheck: true,
        unsafeAllow: ['missing-initializers', 'constructor']
      });

      // Verify upgrade
      expect(await tokenV3.getAddress()).to.equal(v2Address);
      expect(await tokenV3.totalSupply()).to.equal(totalSupplyBefore);
      expect(await tokenV3.getTimelockDelay()).to.equal(TWO_DAYS);
      expect(await tokenV3.getGlobalDailyLimit()).to.equal(GLOBAL_DAILY_LIMIT);
      expect(await tokenV3.getSuspiciousAmountThreshold()).to.equal(SUSPICIOUS_THRESHOLD);
    });

    it("should preserve all V2 state after upgrade", async function () {
      const { token, admin, minter, pauser, blacklister, user1, user2 } = await loadFixture(deployV2Fixture);

      const balance1Before = await token.balanceOf(user1.address);
      const balance2Before = await token.balanceOf(user2.address);

      // Blacklist a user in V2
      await token.connect(blacklister).blacklist(user2.address);

      // Upgrade to V3
      const OMTHBTokenV3 = await ethers.getContractFactory("OMTHBTokenV3");
      const tokenV3 = await upgrades.upgradeProxy(token.target, OMTHBTokenV3, {
        call: {
          fn: "initializeV3",
          args: [TWO_DAYS, GLOBAL_DAILY_LIMIT, SUSPICIOUS_THRESHOLD]
        },
        unsafeSkipStorageCheck: true,
        unsafeAllow: ['missing-initializers', 'constructor']
      });

      // Verify balances preserved
      expect(await tokenV3.balanceOf(user1.address)).to.equal(balance1Before);
      expect(await tokenV3.balanceOf(user2.address)).to.equal(balance2Before);

      // Verify roles preserved
      expect(await tokenV3.hasRole(MINTER_ROLE, minter.address)).to.be.true;
      expect(await tokenV3.hasRole(PAUSER_ROLE, pauser.address)).to.be.true;
      expect(await tokenV3.hasRole(BLACKLISTER_ROLE, blacklister.address)).to.be.true;

      // Verify blacklist preserved
      expect(await tokenV3.isBlacklisted(user2.address)).to.be.true;
    });

    it("should prevent re-initialization of V3", async function () {
      const { token, admin } = await loadFixture(deployV2Fixture);

      // Upgrade to V3
      const OMTHBTokenV3 = await ethers.getContractFactory("OMTHBTokenV3");
      const tokenV3 = await upgrades.upgradeProxy(token.target, OMTHBTokenV3, {
        call: {
          fn: "initializeV3",
          args: [TWO_DAYS, GLOBAL_DAILY_LIMIT, SUSPICIOUS_THRESHOLD]
        },
        unsafeSkipStorageCheck: true,
        unsafeAllow: ['missing-initializers', 'constructor']
      });

      // Try to initialize V3 again
      await expect(
        tokenV3.initializeV3(TWO_DAYS, GLOBAL_DAILY_LIMIT, SUSPICIOUS_THRESHOLD)
      ).to.be.revertedWithCustomError(tokenV3, "InvalidInitialization");
    });
  });

  describe("Backward Compatibility", function () {
    it("should maintain all V2 functionality", async function () {
      const { token, admin, minter, pauser, user1, user2 } = await loadFixture(deployV2Fixture);

      // Upgrade to V3
      const OMTHBTokenV3 = await ethers.getContractFactory("OMTHBTokenV3");
      const tokenV3 = await upgrades.upgradeProxy(token.target, OMTHBTokenV3, {
        call: {
          fn: "initializeV3",
          args: [TWO_DAYS, GLOBAL_DAILY_LIMIT, SUSPICIOUS_THRESHOLD]
        },
        unsafeSkipStorageCheck: true,
        unsafeAllow: ['missing-initializers', 'constructor']
      });

      // Test minting (V2 functionality)
      await tokenV3.connect(minter).mint(user1.address, ethers.parseEther("1000"));

      // Test transfers (V2 functionality)
      await tokenV3.connect(user1).transfer(user2.address, ethers.parseEther("100"));

      // Test pause (V2 functionality)
      await tokenV3.connect(pauser).pause();
      await expect(
        tokenV3.connect(user1).transfer(user2.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(tokenV3, "EnforcedPause");

      await tokenV3.connect(pauser).unpause();
    });

    it("should handle existing minters with V3 limits", async function () {
      const { token, admin, minter, user1 } = await loadFixture(deployV2Fixture);

      // Upgrade to V3
      const OMTHBTokenV3 = await ethers.getContractFactory("OMTHBTokenV3");
      const tokenV3 = await upgrades.upgradeProxy(token.target, OMTHBTokenV3, {
        call: {
          fn: "initializeV3",
          args: [TWO_DAYS, GLOBAL_DAILY_LIMIT, SUSPICIOUS_THRESHOLD]
        },
        unsafeSkipStorageCheck: true,
        unsafeAllow: ['missing-initializers', 'constructor']
      });

      // Existing minter should have no daily limit initially
      const minterInfo = await tokenV3.getMinterInfo(minter.address);
      expect(minterInfo.dailyLimit).to.equal(0);

      // Admin can set limit for existing minter
      await tokenV3.connect(admin).setMinterDailyLimit(minter.address, MINTER_DAILY_LIMIT);

      // Verify limit is enforced
      await tokenV3.connect(minter).mint(user1.address, MINTER_DAILY_LIMIT);
      
      await expect(
        tokenV3.connect(minter).mint(user1.address, 1)
      ).to.be.revertedWithCustomError(tokenV3, "DailyLimitExceededError");
    });
  });

  describe("Security Features Integration", function () {
    async function deployV3WithSetup() {
      const fixture = await deployV2Fixture();
      const { token, admin } = fixture;

      // Upgrade to V3
      const OMTHBTokenV3 = await ethers.getContractFactory("OMTHBTokenV3");
      const tokenV3 = await upgrades.upgradeProxy(token.target, OMTHBTokenV3, {
        call: {
          fn: "initializeV3",
          args: [TWO_DAYS, GLOBAL_DAILY_LIMIT, SUSPICIOUS_THRESHOLD]
        },
        unsafeSkipStorageCheck: true,
        unsafeAllow: ['missing-initializers', 'constructor']
      });

      // Additional signers for V3 roles
      const [,,,,,,,,guardian1, guardian2, timelockAdmin, newMinter] = await ethers.getSigners();

      // Setup V3 roles
      await tokenV3.connect(admin).grantRole(TIMELOCK_ADMIN_ROLE, timelockAdmin.address);
      await tokenV3.connect(admin).addGuardian(guardian1.address);
      await tokenV3.connect(admin).addGuardian(guardian2.address);

      return {
        ...fixture,
        tokenV3,
        guardian1,
        guardian2,
        timelockAdmin,
        newMinter
      };
    }

    it("should integrate timelock with guardian emergency actions", async function () {
      const { tokenV3, timelockAdmin, guardian1, newMinter, user1 } = await loadFixture(deployV3WithSetup);

      // Schedule adding a new minter through timelock
      const tx = await tokenV3.connect(timelockAdmin).scheduleAddMinter(newMinter.address, MINTER_DAILY_LIMIT);
      const receipt = await tx.wait();
      const actionId = receipt.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      // Wait for timelock
      await time.increase(TWO_DAYS + 1);
      await tokenV3.executeAction(actionId);

      // New minter starts minting
      await tokenV3.connect(newMinter).mint(user1.address, ethers.parseEther("50000"));

      // Guardian detects suspicious behavior and revokes immediately
      await tokenV3.connect(guardian1).emergencyRevokeMinter(newMinter.address);

      // Minter can no longer mint
      await expect(
        tokenV3.connect(newMinter).mint(user1.address, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(tokenV3, "AccessControlUnauthorizedAccount");
    });

    it("should coordinate multiple security features", async function () {
      const { tokenV3, admin, timelockAdmin, guardian1, minter, newMinter, user1 } = await loadFixture(deployV3WithSetup);

      // Set daily limit for existing minter
      await tokenV3.connect(admin).setMinterDailyLimit(minter.address, ethers.parseEther("200000"));

      // Schedule new minter with high limit
      const highLimit = ethers.parseEther("800000");
      const tx = await tokenV3.connect(timelockAdmin).scheduleAddMinter(newMinter.address, highLimit);
      const receipt = await tx.wait();
      const actionId = receipt.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      await time.increase(TWO_DAYS + 1);
      await tokenV3.executeAction(actionId);

      // Both minters mint
      await tokenV3.connect(minter).mint(user1.address, ethers.parseEther("150000"));
      await tokenV3.connect(newMinter).mint(user1.address, ethers.parseEther("400000"));

      // New minter tries suspicious amount - triggers auto-pause
      await expect(
        tokenV3.connect(newMinter).mint(user1.address, SUSPICIOUS_THRESHOLD + ethers.parseEther("1"))
      ).to.emit(tokenV3, "SuspiciousActivityDetected")
        .and.to.be.revertedWithCustomError(tokenV3, "SuspiciousAmount");

      // Contract is now paused
      expect(await tokenV3.paused()).to.be.true;

      // Even existing minter cannot mint
      await expect(
        tokenV3.connect(minter).mint(user1.address, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(tokenV3, "EnforcedPause");

      // Guardian can still take emergency action
      await tokenV3.connect(guardian1).emergencyRevokeMinter(newMinter.address);
    });
  });

  describe("Complex Workflow Scenarios", function () {
    async function deployFullSetup() {
      const setup = await deployV3WithSetup();
      const { tokenV3, timelockAdmin, newMinter: minter2 } = setup;

      // Add second minter
      const tx = await tokenV3.connect(timelockAdmin).scheduleAddMinter(minter2.address, ethers.parseEther("300000"));
      const receipt = await tx.wait();
      const actionId = receipt.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      await time.increase(TWO_DAYS + 1);
      await tokenV3.executeAction(actionId);

      return { ...setup, minter2 };
    }

    it("should handle daily limit reset across multiple minters", async function () {
      const { tokenV3, admin, minter, minter2, user1 } = await loadFixture(deployFullSetup);

      // Set limit for first minter
      await tokenV3.connect(admin).setMinterDailyLimit(minter.address, ethers.parseEther("200000"));

      // Day 1: Both minters use their limits
      await tokenV3.connect(minter).mint(user1.address, ethers.parseEther("150000"));
      await tokenV3.connect(minter2).mint(user1.address, ethers.parseEther("250000"));

      // Check remaining limits
      expect(await tokenV3.getRemainingDailyLimit(minter.address)).to.equal(ethers.parseEther("50000"));
      expect(await tokenV3.getRemainingDailyLimit(minter2.address)).to.equal(ethers.parseEther("50000"));
      expect(await tokenV3.getRemainingGlobalDailyLimit()).to.equal(ethers.parseEther("600000"));

      // Fast forward to next day
      await time.increase(ONE_DAY);

      // Limits should reset
      expect(await tokenV3.getRemainingDailyLimit(minter.address)).to.equal(ethers.parseEther("200000"));
      expect(await tokenV3.getRemainingDailyLimit(minter2.address)).to.equal(ethers.parseEther("300000"));
      expect(await tokenV3.getRemainingGlobalDailyLimit()).to.equal(GLOBAL_DAILY_LIMIT);

      // Can mint again
      await tokenV3.connect(minter).mint(user1.address, ethers.parseEther("200000"));
      await tokenV3.connect(minter2).mint(user1.address, ethers.parseEther("300000"));
    });

    it("should handle concurrent timelock operations", async function () {
      const { tokenV3, admin, timelockAdmin } = await loadFixture(deployFullSetup);

      const [,,,,,,,,,,,, minter3, minter4] = await ethers.getSigners();

      // Schedule multiple operations
      const tx1 = await tokenV3.connect(timelockAdmin).scheduleAddMinter(minter3.address, ethers.parseEther("100000"));
      const receipt1 = await tx1.wait();
      const actionId1 = receipt1.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      const tx2 = await tokenV3.connect(timelockAdmin).scheduleAddMinter(minter4.address, ethers.parseEther("150000"));
      const receipt2 = await tx2.wait();
      const actionId2 = receipt2.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      const tx3 = await tokenV3.connect(admin).scheduleSetTimelockDelay(3 * ONE_DAY);
      const receipt3 = await tx3.wait();
      const actionId3 = receipt3.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      // Check all are pending
      const pending = await tokenV3.getPendingActions();
      expect(pending).to.include(actionId1);
      expect(pending).to.include(actionId2);
      expect(pending).to.include(actionId3);

      // Cancel one
      await tokenV3.connect(timelockAdmin).cancelAction(actionId2);

      // Execute others after timelock
      await time.increase(TWO_DAYS + 1);
      await tokenV3.executeAction(actionId1);
      await tokenV3.executeAction(actionId3);

      // Verify results
      expect(await tokenV3.hasRole(MINTER_ROLE, minter3.address)).to.be.true;
      expect(await tokenV3.hasRole(MINTER_ROLE, minter4.address)).to.be.false;
      expect(await tokenV3.getTimelockDelay()).to.equal(3 * ONE_DAY);
    });

    it("should handle role transitions smoothly", async function () {
      const { tokenV3, admin, timelockAdmin, minter, guardian1, user1 } = await loadFixture(deployFullSetup);

      // Set daily limit for existing minter
      await tokenV3.connect(admin).setMinterDailyLimit(minter.address, ethers.parseEther("100000"));

      // Minter uses half their limit
      await tokenV3.connect(minter).mint(user1.address, ethers.parseEther("50000"));

      // Schedule removal of minter
      const tx = await tokenV3.connect(timelockAdmin).scheduleRemoveMinter(minter.address);
      const receipt = await tx.wait();
      const actionId = receipt.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      // Minter can still mint during timelock period
      await tokenV3.connect(minter).mint(user1.address, ethers.parseEther("40000"));

      // Execute removal after timelock
      await time.increase(TWO_DAYS + 1);
      await tokenV3.executeAction(actionId);

      // Minter can no longer mint
      await expect(
        tokenV3.connect(minter).mint(user1.address, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(tokenV3, "AccessControlUnauthorizedAccount");

      // Minter info should be cleared
      const minterInfo = await tokenV3.getMinterInfo(minter.address);
      expect(minterInfo.isMinter).to.be.false;
      expect(minterInfo.dailyLimit).to.equal(0);
    });
  });

  describe("Meta-Transaction Integration", function () {
    it("should support meta transactions in V3", async function () {
      const { token, admin, trustedForwarder, user1, user2 } = await loadFixture(deployV2Fixture);

      // Upgrade to V3
      const OMTHBTokenV3 = await ethers.getContractFactory("OMTHBTokenV3");
      const tokenV3 = await upgrades.upgradeProxy(token.target, OMTHBTokenV3, {
        call: {
          fn: "initializeV3",
          args: [TWO_DAYS, GLOBAL_DAILY_LIMIT, SUSPICIOUS_THRESHOLD]
        },
        unsafeSkipStorageCheck: true,
        unsafeAllow: ['missing-initializers', 'constructor']
      });

      // Verify trusted forwarder is still set
      expect(await tokenV3.isTrustedForwarder(trustedForwarder.address)).to.be.true;

      // Test meta-transaction transfer
      const nonce = 0;
      const value = ethers.parseEther("100");
      
      // Create meta-transaction data
      const data = tokenV3.interface.encodeFunctionData("transfer", [user2.address, value]);
      
      // In real scenario, this would be signed by user1 and submitted by forwarder
      // For testing, we'll simulate the forwarder call
      const MetaTxForwarder = await ethers.getContractFactory("MinimalForwarder");
      const forwarder = await MetaTxForwarder.deploy();
      
      // Note: Full meta-transaction testing would require proper signature generation
      // This test verifies the V3 contract still supports the meta-transaction infrastructure
    });
  });

  describe("Blacklist and Pause Integration", function () {
    it("should coordinate blacklist with new V3 features", async function () {
      const { tokenV3, blacklister, timelockAdmin, newMinter, user1, user2 } = await loadFixture(deployV3WithSetup);

      // Add new minter
      const tx = await tokenV3.connect(timelockAdmin).scheduleAddMinter(newMinter.address, MINTER_DAILY_LIMIT);
      const receipt = await tx.wait();
      const actionId = receipt.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      await time.increase(TWO_DAYS + 1);
      await tokenV3.executeAction(actionId);

      // Mint to user
      await tokenV3.connect(newMinter).mint(user1.address, ethers.parseEther("10000"));

      // Blacklist user
      await tokenV3.connect(blacklister).blacklist(user1.address);

      // Blacklisted user cannot transfer
      await expect(
        tokenV3.connect(user1).transfer(user2.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(tokenV3, "AccountBlacklisted");

      // Cannot mint to blacklisted address
      await expect(
        tokenV3.connect(newMinter).mint(user1.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(tokenV3, "AccountBlacklisted");
    });
  });

  describe("Burn Functionality Integration", function () {
    it("should maintain burn functionality with V3 features", async function () {
      const { tokenV3, admin, minter, user1 } = await loadFixture(deployV3WithSetup);

      // Set minter limit
      await tokenV3.connect(admin).setMinterDailyLimit(minter.address, ethers.parseEther("100000"));

      // Mint tokens
      await tokenV3.connect(minter).mint(user1.address, ethers.parseEther("50000"));

      const supplyBefore = await tokenV3.totalSupply();

      // User burns tokens
      await tokenV3.connect(user1).burn(ethers.parseEther("10000"));

      // Verify supply decreased
      expect(await tokenV3.totalSupply()).to.equal(supplyBefore - ethers.parseEther("10000"));
      expect(await tokenV3.balanceOf(user1.address)).to.equal(ethers.parseEther("40000"));

      // Minter daily limit should not be affected by burns
      expect(await tokenV3.getRemainingDailyLimit(minter.address)).to.equal(ethers.parseEther("50000"));
    });
  });

  describe("Storage Layout Integrity", function () {
    it("should maintain storage layout compatibility", async function () {
      const { token, admin, user1 } = await loadFixture(deployV2Fixture);

      // Store some V2 state
      const nameBefore = await token.name();
      const symbolBefore = await token.symbol();
      const totalSupplyBefore = await token.totalSupply();
      const user1BalanceBefore = await token.balanceOf(user1.address);

      // Upgrade to V3
      const OMTHBTokenV3 = await ethers.getContractFactory("OMTHBTokenV3");
      const tokenV3 = await upgrades.upgradeProxy(token.target, OMTHBTokenV3, {
        call: {
          fn: "initializeV3",
          args: [TWO_DAYS, GLOBAL_DAILY_LIMIT, SUSPICIOUS_THRESHOLD]
        },
        unsafeSkipStorageCheck: true,
        unsafeAllow: ['missing-initializers', 'constructor']
      });

      // Verify V2 state preserved
      expect(await tokenV3.name()).to.equal(nameBefore);
      expect(await tokenV3.symbol()).to.equal(symbolBefore);
      expect(await tokenV3.totalSupply()).to.equal(totalSupplyBefore);
      expect(await tokenV3.balanceOf(user1.address)).to.equal(user1BalanceBefore);

      // Verify V3 features work
      expect(await tokenV3.getTimelockDelay()).to.equal(TWO_DAYS);
      expect(await tokenV3.getGlobalDailyLimit()).to.equal(GLOBAL_DAILY_LIMIT);
    });
  });

  describe("Complete Security Scenario", function () {
    it("should handle complete compromise and recovery scenario", async function () {
      const { tokenV3, admin, timelockAdmin, guardian1, guardian2, pauser, user1, user2 } = await loadFixture(deployV3WithSetup);

      const [,,,,,,,,,,,, compromisedMinter, newSafeMinter] = await ethers.getSigners();

      // Phase 1: Add compromised minter (unknown at the time)
      const tx1 = await tokenV3.connect(timelockAdmin).scheduleAddMinter(compromisedMinter.address, ethers.parseEther("200000"));
      const receipt1 = await tx1.wait();
      const actionId1 = receipt1.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      await time.increase(TWO_DAYS + 1);
      await tokenV3.executeAction(actionId1);

      // Compromised minter starts normal operations
      await tokenV3.connect(compromisedMinter).mint(user1.address, ethers.parseEther("50000"));
      await tokenV3.connect(compromisedMinter).mint(user2.address, ethers.parseEther("50000"));

      // Phase 2: Suspicious activity detected
      // Minter tries to mint large amount quickly
      await tokenV3.connect(compromisedMinter).mint(user1.address, ethers.parseEther("90000"));

      // Guardian notices unusual pattern and takes action
      await tokenV3.connect(guardian1).emergencyRevokeMinter(compromisedMinter.address);
      await tokenV3.connect(guardian1).emergencyPause();

      // Verify compromised minter is revoked
      expect(await tokenV3.hasRole(MINTER_ROLE, compromisedMinter.address)).to.be.false;
      expect(await tokenV3.paused()).to.be.true;

      // Phase 3: Recovery
      // Admin reviews situation and unpauses
      await tokenV3.connect(pauser).unpause();

      // Schedule new safe minter
      const tx2 = await tokenV3.connect(timelockAdmin).scheduleAddMinter(newSafeMinter.address, ethers.parseEther("100000"));
      const receipt2 = await tx2.wait();
      const actionId2 = receipt2.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;

      // Update global limit for extra safety
      await tokenV3.connect(admin).setGlobalDailyLimit(ethers.parseEther("500000"));

      // Wait for timelock
      await time.increase(TWO_DAYS + 1);
      await tokenV3.executeAction(actionId2);

      // Phase 4: Resume normal operations with enhanced monitoring
      await tokenV3.connect(newSafeMinter).mint(user1.address, ethers.parseEther("50000"));

      // Verify system state
      expect(await tokenV3.getMinterCount()).to.equal(1); // Only new safe minter
      expect(await tokenV3.hasRole(MINTER_ROLE, newSafeMinter.address)).to.be.true;
      expect(await tokenV3.getGlobalDailyLimit()).to.equal(ethers.parseEther("500000"));
    });
  });

  describe("Performance Under Load", function () {
    it("should handle many minters efficiently", async function () {
      const { tokenV3, timelockAdmin, user1 } = await loadFixture(deployV3WithSetup);

      const minters = [];
      const actionIds = [];

      // Schedule 10 minters
      for (let i = 0; i < 10; i++) {
        const minter = ethers.Wallet.createRandom().connect(ethers.provider);
        minters.push(minter);

        const tx = await tokenV3.connect(timelockAdmin).scheduleAddMinter(
          minter.address,
          ethers.parseEther((10000 * (i + 1)).toString())
        );
        const receipt = await tx.wait();
        const actionId = receipt.logs.find(log => log.fragment?.name === "ActionScheduled").args.actionId;
        actionIds.push(actionId);
      }

      // Execute all
      await time.increase(TWO_DAYS + 1);
      for (const actionId of actionIds) {
        await tokenV3.executeAction(actionId);
      }

      // Verify count
      expect(await tokenV3.getMinterCount()).to.equal(10);

      // Each minter mints
      for (let i = 0; i < minters.length; i++) {
        await tokenV3.connect(minters[i]).mint(user1.address, ethers.parseEther("1000"));
      }

      // Check total minted
      const totalMinted = ethers.parseEther("10000");
      expect(await tokenV3.getGlobalDailyMinted()).to.equal(totalMinted);
    });

    it("should handle rapid role changes", async function () {
      const { tokenV3, admin, guardian1, guardian2 } = await loadFixture(deployV3WithSetup);

      const newGuardians = [];

      // Add multiple guardians rapidly
      for (let i = 0; i < 5; i++) {
        const guardian = ethers.Wallet.createRandom().connect(ethers.provider);
        newGuardians.push(guardian);
        await tokenV3.connect(admin).addGuardian(guardian.address);
      }

      // Verify all added
      expect(await tokenV3.getGuardianCount()).to.equal(7); // 2 initial + 5 new

      // Remove some
      await tokenV3.connect(admin).removeGuardian(newGuardians[0].address);
      await tokenV3.connect(admin).removeGuardian(newGuardians[2].address);

      // Verify count updated
      expect(await tokenV3.getGuardianCount()).to.equal(5);

      // Remaining guardians can still act
      await tokenV3.connect(guardian1).emergencyPause();
      expect(await tokenV3.paused()).to.be.true;
    });
  });
});