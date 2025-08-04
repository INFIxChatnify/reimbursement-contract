const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ProjectReimbursement Integration Tests", function () {
  // Constants
  const SECRETARY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SECRETARY_ROLE"));
  const COMMITTEE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMMITTEE_ROLE"));
  const FINANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FINANCE_ROLE"));
  const DIRECTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DIRECTOR_ROLE"));
  const REQUESTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REQUESTER_ROLE"));
  const PROJECT_CREATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROJECT_CREATOR_ROLE"));
  
  const REVEAL_WINDOW = 30 * 60; // 30 minutes
  const MIN_REIMBURSEMENT_AMOUNT = ethers.parseEther("100");
  const MAX_REIMBURSEMENT_AMOUNT = ethers.parseEther("1000000");
  
  // Comprehensive test fixture
  async function deployFullSystemFixture() {
    const signers = await ethers.getSigners();
    const [owner, factoryAdmin, projectCreator, projectAdmin, requester1, requester2, 
           secretary, committee1, committee2, committee3, committee4, finance, 
           director, depositor1, depositor2, recipient1, recipient2, recipient3] = signers;
    
    // Deploy OMTHB Token
    const OMTHBToken = await ethers.getContractFactory("OMTHBTokenV3");
    const omthbToken = await OMTHBToken.deploy(owner.address);
    await omthbToken.waitForDeployment();
    
    // Deploy ProjectReimbursement implementation
    const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
    const projectImplementation = await ProjectReimbursement.deploy();
    await projectImplementation.waitForDeployment();
    
    // Deploy both factory types
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const projectFactory = await ProjectFactory.deploy(
      await projectImplementation.getAddress(),
      await omthbToken.getAddress(),
      ethers.ZeroAddress,
      factoryAdmin.address
    );
    await projectFactory.waitForDeployment();
    
    const BeaconProjectFactory = await ethers.getContractFactory("BeaconProjectFactory");
    const beaconFactory = await BeaconProjectFactory.deploy(
      await projectImplementation.getAddress(),
      await omthbToken.getAddress(),
      ethers.ZeroAddress,
      factoryAdmin.address
    );
    await beaconFactory.waitForDeployment();
    
    // Setup factory roles
    await projectFactory.connect(factoryAdmin).grantRole(PROJECT_CREATOR_ROLE, projectCreator.address);
    await beaconFactory.connect(factoryAdmin).grantRole(PROJECT_CREATOR_ROLE, projectCreator.address);
    
    // Mint tokens to various users
    await omthbToken.mint(depositor1.address, ethers.parseEther("10000000"));
    await omthbToken.mint(depositor2.address, ethers.parseEther("5000000"));
    await omthbToken.mint(recipient1.address, ethers.parseEther("1000"));
    await omthbToken.mint(recipient2.address, ethers.parseEther("1000"));
    await omthbToken.mint(recipient3.address, ethers.parseEther("1000"));
    
    return {
      omthbToken,
      projectFactory,
      beaconFactory,
      owner,
      factoryAdmin,
      projectCreator,
      projectAdmin,
      requester1,
      requester2,
      secretary,
      committee1,
      committee2,
      committee3,
      committee4,
      finance,
      director,
      depositor1,
      depositor2,
      recipient1,
      recipient2,
      recipient3
    };
  }
  
  describe("End-to-End Project Lifecycle", function () {
    it("Should complete full project lifecycle from creation to closure", async function () {
      const { 
        projectFactory, omthbToken, projectCreator, projectAdmin, 
        requester1, secretary, committee1, committee2, committee3, committee4, 
        finance, director, depositor1, depositor2, recipient1, recipient2, factoryAdmin
      } = await loadFixture(deployFullSystemFixture);
      
      // Step 1: Create project with zero balance
      const projectId = "LIFECYCLE-TEST-001";
      const createTx = await projectFactory.connect(projectCreator).createProject(projectId, projectAdmin.address);
      const createReceipt = await createTx.wait();
      
      const projectCreatedEvent = createReceipt.logs.find(log => {
        try {
          const parsed = projectFactory.interface.parseLog(log);
          return parsed.name === "ProjectCreated";
        } catch (e) {
          return false;
        }
      });
      
      const projectAddress = projectCreatedEvent.args.projectContract;
      const project = await ethers.getContractAt("ProjectReimbursement", projectAddress);
      
      // Verify zero balance
      expect(await project.needsDeposit()).to.be.true;
      expect(await project.getTotalBalance()).to.equal(0);
      
      // Step 2: Setup roles
      await project.connect(projectAdmin).grantRoleDirect(REQUESTER_ROLE, requester1.address);
      await project.connect(projectAdmin).grantRoleDirect(SECRETARY_ROLE, secretary.address);
      await project.connect(projectAdmin).grantRoleDirect(COMMITTEE_ROLE, committee1.address);
      await project.connect(projectAdmin).grantRoleDirect(COMMITTEE_ROLE, committee2.address);
      await project.connect(projectAdmin).grantRoleDirect(COMMITTEE_ROLE, committee3.address);
      await project.connect(projectAdmin).grantRoleDirect(COMMITTEE_ROLE, committee4.address);
      await project.connect(projectAdmin).grantRoleDirect(FINANCE_ROLE, finance.address);
      await project.connect(projectAdmin).grantRoleDirect(DIRECTOR_ROLE, director.address);
      
      // Step 3: Multiple deposits
      const deposit1Amount = ethers.parseEther("50000");
      const deposit2Amount = ethers.parseEther("30000");
      
      await omthbToken.connect(depositor1).approve(projectAddress, deposit1Amount);
      await project.connect(depositor1).depositOMTHB(deposit1Amount);
      
      await omthbToken.connect(depositor2).approve(projectAddress, deposit2Amount);
      await project.connect(depositor2).depositOMTHB(deposit2Amount);
      
      const totalDeposited = deposit1Amount + deposit2Amount;
      expect(await project.getTotalBalance()).to.equal(totalDeposited);
      expect(await project.projectBudget()).to.equal(totalDeposited);
      expect(await project.needsDeposit()).to.be.false;
      
      // Step 4: Create and process multiple requests
      // Request 1: Single recipient
      const request1Amount = ethers.parseEther("5000");
      await project.connect(requester1).createRequest(
        recipient1.address,
        request1Amount,
        "Conference expenses",
        "QmConference123"
      );
      
      // Request 2: Multiple recipients
      const recipients = [recipient1.address, recipient2.address];
      const amounts = [ethers.parseEther("3000"), ethers.parseEther("2000")];
      await project.connect(requester1).createRequestMultiple(
        recipients,
        amounts,
        "Team workshop expenses",
        "QmWorkshop456",
        ethers.ZeroAddress
      );
      
      // Process Request 1 through full approval flow
      const requestId1 = 0;
      await processFullApprovalFlow(project, requestId1, {
        secretary, committee1, committee2, committee3, committee4, finance, director
      });
      
      // Check balance after first distribution
      const balanceAfterFirst = await project.getTotalBalance();
      expect(balanceAfterFirst).to.equal(totalDeposited - request1Amount);
      
      // Process Request 2
      const requestId2 = 1;
      await processFullApprovalFlow(project, requestId2, {
        secretary, committee1, committee2, committee3, committee4, finance, director
      });
      
      // Verify final state
      const finalBalance = await project.getTotalBalance();
      const totalRequest2 = amounts[0] + amounts[1];
      expect(finalBalance).to.equal(totalDeposited - request1Amount - totalRequest2);
      
      // Step 5: Project closure (multi-sig)
      // Add deputies for closure
      await projectFactory.connect(factoryAdmin).addDeputy(committee1.address);
      await projectFactory.connect(factoryAdmin).addDeputy(committee2.address);
      
      // Initiate closure
      await projectFactory.connect(committee1).initiateProjectClosure(projectId);
      await projectFactory.connect(committee2).signClosureRequest(projectId);
      await projectFactory.connect(director).signClosureRequest(projectId);
      
      // Verify project is closed
      const projectInfo = await projectFactory.projects(projectId);
      expect(projectInfo.isActive).to.be.false;
    });
  });
  
  describe("Multi-Factory Integration", function () {
    it("Should create projects in both factory types with same workflow", async function () {
      const { projectFactory, beaconFactory, omthbToken, projectCreator, projectAdmin, depositor1 } = await loadFixture(deployFullSystemFixture);
      
      // Create project in regular factory
      const regularProjectId = "REGULAR-001";
      const regularTx = await projectFactory.connect(projectCreator).createProject(regularProjectId, projectAdmin.address);
      const regularReceipt = await regularTx.wait();
      
      const regularEvent = regularReceipt.logs.find(log => {
        try {
          const parsed = projectFactory.interface.parseLog(log);
          return parsed.name === "ProjectCreated";
        } catch (e) {
          return false;
        }
      });
      
      const regularProjectAddress = regularEvent.args.projectContract;
      const regularProject = await ethers.getContractAt("ProjectReimbursement", regularProjectAddress);
      
      // Create project in beacon factory
      const beaconProjectId = "BEACON-001";
      const beaconTx = await beaconFactory.connect(projectCreator).createProject(beaconProjectId, projectAdmin.address);
      const beaconReceipt = await beaconTx.wait();
      
      const beaconEvent = beaconReceipt.logs.find(log => {
        try {
          const parsed = beaconFactory.interface.parseLog(log);
          return parsed.name === "ProjectCreated";
        } catch (e) {
          return false;
        }
      });
      
      const beaconProjectAddress = beaconEvent.args.projectContract;
      const beaconProject = await ethers.getContractAt("ProjectReimbursement", beaconProjectAddress);
      
      // Both should start with zero balance
      expect(await regularProject.needsDeposit()).to.be.true;
      expect(await beaconProject.needsDeposit()).to.be.true;
      
      // Deposit to both
      const depositAmount = ethers.parseEther("10000");
      
      await omthbToken.connect(depositor1).approve(regularProjectAddress, depositAmount);
      await regularProject.connect(depositor1).depositOMTHB(depositAmount);
      
      await omthbToken.connect(depositor1).approve(beaconProjectAddress, depositAmount);
      await beaconProject.connect(depositor1).depositOMTHB(depositAmount);
      
      // Both should have same balance
      expect(await regularProject.getTotalBalance()).to.equal(depositAmount);
      expect(await beaconProject.getTotalBalance()).to.equal(depositAmount);
    });
  });
  
  describe("Complex Multi-Recipient Scenarios", function () {
    it("Should handle request with maximum recipients", async function () {
      const { 
        projectFactory, omthbToken, projectCreator, projectAdmin, 
        requester1, secretary, committee1, committee2, committee3, committee4, 
        finance, director, depositor1
      } = await loadFixture(deployFullSystemFixture);
      
      // Create and setup project
      const projectId = "MAX-RECIPIENTS-001";
      const project = await createAndSetupProject(projectFactory, projectCreator, projectAdmin, projectId);
      
      // Setup roles
      await setupProjectRoles(project, projectAdmin, {
        requester1, secretary, committee1, committee2, committee3, committee4, finance, director
      });
      
      // Deposit funds
      const depositAmount = ethers.parseEther("200000");
      await omthbToken.connect(depositor1).approve(await project.getAddress(), depositAmount);
      await project.connect(depositor1).depositOMTHB(depositAmount);
      
      // Create request with 10 recipients (MAX_RECIPIENTS)
      const recipients = [];
      const amounts = [];
      for (let i = 0; i < 10; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
        recipients.push(wallet.address);
        amounts.push(ethers.parseEther("1000"));
      }
      
      await expect(
        project.connect(requester1).createRequestMultiple(
          recipients,
          amounts,
          "Maximum recipients test",
          "QmMaxRecipients",
          ethers.ZeroAddress
        )
      ).to.emit(project, "RequestCreated");
      
      // Try to create with 11 recipients (should fail)
      recipients.push(ethers.Wallet.createRandom().address);
      amounts.push(ethers.parseEther("1000"));
      
      await expect(
        project.connect(requester1).createRequestMultiple(
          recipients,
          amounts,
          "Too many recipients",
          "QmTooMany",
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(project, "TooManyRecipients");
    });
    
    it("Should correctly track funds with concurrent requests", async function () {
      const { 
        projectFactory, omthbToken, projectCreator, projectAdmin, 
        requester1, requester2, depositor1
      } = await loadFixture(deployFullSystemFixture);
      
      // Create and setup project
      const projectId = "CONCURRENT-001";
      const project = await createAndSetupProject(projectFactory, projectCreator, projectAdmin, projectId);
      
      // Setup basic roles
      await project.connect(projectAdmin).grantRoleDirect(REQUESTER_ROLE, requester1.address);
      await project.connect(projectAdmin).grantRoleDirect(REQUESTER_ROLE, requester2.address);
      
      // Deposit funds
      const depositAmount = ethers.parseEther("100000");
      await omthbToken.connect(depositor1).approve(await project.getAddress(), depositAmount);
      await project.connect(depositor1).depositOMTHB(depositAmount);
      
      // Create multiple concurrent requests
      const request1Amount = ethers.parseEther("20000");
      const request2Recipients = [requester1.address, requester2.address];
      const request2Amounts = [ethers.parseEther("15000"), ethers.parseEther("10000")];
      const request3Amount = ethers.parseEther("30000");
      
      // Create all requests
      await project.connect(requester1).createRequest(requester1.address, request1Amount, "Request 1", "Qm1");
      await project.connect(requester2).createRequestMultiple(request2Recipients, request2Amounts, "Request 2", "Qm2", ethers.ZeroAddress);
      await project.connect(requester1).createRequest(requester2.address, request3Amount, "Request 3", "Qm3");
      
      // Check available balance accounts for all pending requests
      const totalRequested = request1Amount + request2Amounts[0] + request2Amounts[1] + request3Amount;
      const availableBalance = await project.getAvailableBalance();
      
      // All funds should still be available (nothing locked yet)
      expect(availableBalance).to.equal(depositAmount);
      
      // No funds should be locked yet
      expect(await project.getLockedAmount()).to.equal(0);
    });
  });
  
  describe("Emergency Scenarios", function () {
    it("Should handle emergency closure with pending requests", async function () {
      const { 
        projectFactory, omthbToken, projectCreator, projectAdmin, 
        requester1, secretary, committee1, committee2, committee3, committee4, 
        finance, director, depositor1, recipient1
      } = await loadFixture(deployFullSystemFixture);
      
      // Create and setup project
      const projectId = "EMERGENCY-001";
      const project = await createAndSetupProject(projectFactory, projectCreator, projectAdmin, projectId);
      
      // Setup roles
      await setupProjectRoles(project, projectAdmin, {
        requester1, secretary, committee1, committee2, committee3, committee4, finance, director
      });
      
      // Deposit funds
      const depositAmount = ethers.parseEther("100000");
      await omthbToken.connect(depositor1).approve(await project.getAddress(), depositAmount);
      await project.connect(depositor1).depositOMTHB(depositAmount);
      
      // Create some pending requests
      await project.connect(requester1).createRequest(recipient1.address, ethers.parseEther("10000"), "Request 1", "Qm1");
      await project.connect(requester1).createRequest(recipient1.address, ethers.parseEther("20000"), "Request 2", "Qm2");
      
      // Partially approve first request
      const requestId = 0;
      const nonce = ethers.randomBytes(32);
      const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
      
      const commitment = ethers.keccak256(ethers.solidityPacked(
        ["address", "uint256", "uint256", "bytes32"],
        [secretary.address, requestId, chainId, nonce]
      ));
      await project.connect(secretary).commitApproval(requestId, commitment);
      await time.increase(REVEAL_WINDOW + 1);
      await project.connect(secretary).approveBySecretary(requestId, ethers.toBigInt(nonce));
      
      // Initiate emergency closure
      const returnAddress = depositor1.address;
      await project.connect(committee1).initiateEmergencyClosure(returnAddress, "System compromise detected");
      
      // Get closure ID
      const closureId = await project.activeClosureRequestId();
      
      // Complete emergency closure approval
      await completeEmergencyClosureApproval(project, closureId, {
        committee1, committee2, committee3, director
      });
      
      // Verify all funds returned
      const projectBalance = await omthbToken.balanceOf(await project.getAddress());
      expect(projectBalance).to.equal(0);
      
      // Verify project is paused
      expect(await project.paused()).to.be.true;
    });
    
    it("Should handle project pause and unpause", async function () {
      const { 
        projectFactory, omthbToken, projectCreator, projectAdmin, 
        requester1, depositor1
      } = await loadFixture(deployFullSystemFixture);
      
      // Create and setup project
      const projectId = "PAUSE-TEST-001";
      const project = await createAndSetupProject(projectFactory, projectCreator, projectAdmin, projectId);
      
      // Setup minimal roles
      await project.connect(projectAdmin).grantRoleDirect(REQUESTER_ROLE, requester1.address);
      
      // Deposit funds
      const depositAmount = ethers.parseEther("10000");
      await omthbToken.connect(depositor1).approve(await project.getAddress(), depositAmount);
      await project.connect(depositor1).depositOMTHB(depositAmount);
      
      // Pause the contract
      await project.connect(projectAdmin).pause();
      
      // Verify operations are blocked
      await expect(
        project.connect(requester1).createRequest(requester1.address, ethers.parseEther("100"), "Test", "Qm")
      ).to.be.revertedWithCustomError(project, "EnforcedPause");
      
      await expect(
        project.connect(depositor1).depositOMTHB(ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(project, "EnforcedPause");
      
      // Unpause
      await project.connect(projectAdmin).unpause();
      
      // Operations should work again
      await expect(
        project.connect(requester1).createRequest(requester1.address, ethers.parseEther("100"), "Test", "Qm")
      ).to.not.be.reverted;
    });
  });
  
  describe("Gas Optimization Verification", function () {
    it("Should efficiently handle batch operations", async function () {
      const { 
        projectFactory, omthbToken, projectCreator, projectAdmin, 
        requester1, depositor1
      } = await loadFixture(deployFullSystemFixture);
      
      // Create project
      const projectId = "GAS-TEST-001";
      const project = await createAndSetupProject(projectFactory, projectCreator, projectAdmin, projectId);
      await project.connect(projectAdmin).grantRoleDirect(REQUESTER_ROLE, requester1.address);
      
      // Deposit funds
      const depositAmount = ethers.parseEther("100000");
      await omthbToken.connect(depositor1).approve(await project.getAddress(), depositAmount);
      await project.connect(depositor1).depositOMTHB(depositAmount);
      
      // Create multiple requests and measure gas
      const gasUsed = [];
      
      for (let i = 0; i < 5; i++) {
        const tx = await project.connect(requester1).createRequest(
          requester1.address,
          ethers.parseEther("1000"),
          `Request ${i}`,
          `Qm${i}`
        );
        const receipt = await tx.wait();
        gasUsed.push(receipt.gasUsed);
      }
      
      // Gas usage should be relatively consistent
      const avgGas = gasUsed.reduce((a, b) => a + b, 0n) / BigInt(gasUsed.length);
      gasUsed.forEach(gas => {
        const diff = gas > avgGas ? gas - avgGas : avgGas - gas;
        const percentDiff = (diff * 100n) / avgGas;
        expect(percentDiff).to.be.lte(20n); // Within 20% variance
      });
    });
    
    it("Should optimize view function calls", async function () {
      const { 
        projectFactory, omthbToken, projectCreator, projectAdmin, 
        depositor1
      } = await loadFixture(deployFullSystemFixture);
      
      // Create project
      const projectId = "VIEW-GAS-001";
      const project = await createAndSetupProject(projectFactory, projectCreator, projectAdmin, projectId);
      
      // Deposit funds
      const depositAmount = ethers.parseEther("50000");
      await omthbToken.connect(depositor1).approve(await project.getAddress(), depositAmount);
      await project.connect(depositor1).depositOMTHB(depositAmount);
      
      // Batch view calls (should be gas efficient)
      const startTime = Date.now();
      
      const [
        totalBalance,
        availableBalance,
        lockedAmount,
        needsDeposit,
        remainingBudget,
        contractBalance
      ] = await Promise.all([
        project.getTotalBalance(),
        project.getAvailableBalance(),
        project.getLockedAmount(),
        project.needsDeposit(),
        project.getRemainingBudget(),
        project.getContractBalance()
      ]);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // All calls should complete quickly
      expect(duration).to.be.lte(1000); // Less than 1 second
      
      // Verify values are correct
      expect(totalBalance).to.equal(depositAmount);
      expect(availableBalance).to.equal(depositAmount);
      expect(lockedAmount).to.equal(0);
      expect(needsDeposit).to.be.false;
      expect(contractBalance).to.equal(depositAmount);
    });
  });
  
  describe("Edge Case Handling", function () {
    it("Should handle request cancellation with locked funds", async function () {
      const { 
        projectFactory, omthbToken, projectCreator, projectAdmin, 
        requester1, secretary, committee1, committee2, committee3, committee4, 
        finance, director, depositor1
      } = await loadFixture(deployFullSystemFixture);
      
      // Setup project with full roles
      const projectId = "CANCEL-LOCKED-001";
      const project = await createAndSetupProject(projectFactory, projectCreator, projectAdmin, projectId);
      await setupProjectRoles(project, projectAdmin, {
        requester1, secretary, committee1, committee2, committee3, committee4, finance, director
      });
      
      // Deposit and create request
      const depositAmount = ethers.parseEther("50000");
      await omthbToken.connect(depositor1).approve(await project.getAddress(), depositAmount);
      await project.connect(depositor1).depositOMTHB(depositAmount);
      
      const requestAmount = ethers.parseEther("10000");
      await project.connect(requester1).createRequest(requester1.address, requestAmount, "Test", "Qm");
      
      // Approve up to finance level
      const requestId = 0;
      await approveUpToFinance(project, requestId, { secretary, committee1, finance });
      
      // Cancel before director approval (no funds locked yet)
      await expect(project.connect(requester1).cancelRequest(requestId))
        .to.emit(project, "RequestCancelled")
        .withArgs(requestId, requester1.address);
      
      // Verify no funds were locked
      expect(await project.getLockedAmount()).to.equal(0);
      expect(await project.getAvailableBalance()).to.equal(depositAmount);
    });
    
    it("Should handle abandoned request cleanup", async function () {
      const { 
        projectFactory, omthbToken, projectCreator, projectAdmin, 
        requester1, depositor1
      } = await loadFixture(deployFullSystemFixture);
      
      // Setup project
      const projectId = "ABANDONED-001";
      const project = await createAndSetupProject(projectFactory, projectCreator, projectAdmin, projectId);
      await project.connect(projectAdmin).grantRoleDirect(REQUESTER_ROLE, requester1.address);
      
      // Deposit and create request
      const depositAmount = ethers.parseEther("10000");
      await omthbToken.connect(depositor1).approve(await project.getAddress(), depositAmount);
      await project.connect(depositor1).depositOMTHB(depositAmount);
      
      await project.connect(requester1).createRequest(requester1.address, ethers.parseEther("1000"), "Test", "Qm");
      
      const requestId = 0;
      
      // Fast forward 15 days
      await time.increase(15 * 24 * 60 * 60);
      
      // Anyone should be able to cancel abandoned request
      expect(await project.isRequestAbandoned(requestId)).to.be.true;
      
      await expect(project.connect(depositor1).cancelAbandonedRequest(requestId))
        .to.emit(project, "RequestCancelled")
        .withArgs(requestId, depositor1.address);
    });
  });
  
  // Helper functions
  async function createAndSetupProject(factory, creator, admin, projectId) {
    const tx = await factory.connect(creator).createProject(projectId, admin.address);
    const receipt = await tx.wait();
    
    const event = receipt.logs.find(log => {
      try {
        const parsed = factory.interface.parseLog(log);
        return parsed.name === "ProjectCreated";
      } catch (e) {
        return false;
      }
    });
    
    const projectAddress = event.args.projectContract;
    return await ethers.getContractAt("ProjectReimbursement", projectAddress);
  }
  
  async function setupProjectRoles(project, admin, roles) {
    const { requester1, secretary, committee1, committee2, committee3, committee4, finance, director } = roles;
    
    await project.connect(admin).grantRoleDirect(REQUESTER_ROLE, requester1.address);
    await project.connect(admin).grantRoleDirect(SECRETARY_ROLE, secretary.address);
    await project.connect(admin).grantRoleDirect(COMMITTEE_ROLE, committee1.address);
    await project.connect(admin).grantRoleDirect(COMMITTEE_ROLE, committee2.address);
    await project.connect(admin).grantRoleDirect(COMMITTEE_ROLE, committee3.address);
    await project.connect(admin).grantRoleDirect(COMMITTEE_ROLE, committee4.address);
    await project.connect(admin).grantRoleDirect(FINANCE_ROLE, finance.address);
    await project.connect(admin).grantRoleDirect(DIRECTOR_ROLE, director.address);
  }
  
  async function processFullApprovalFlow(project, requestId, approvers) {
    const { secretary, committee1, committee2, committee3, committee4, finance, director } = approvers;
    const nonce = ethers.randomBytes(32);
    const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
    
    // Secretary
    let commitment = ethers.keccak256(ethers.solidityPacked(
      ["address", "uint256", "uint256", "bytes32"],
      [secretary.address, requestId, chainId, nonce]
    ));
    await project.connect(secretary).commitApproval(requestId, commitment);
    await time.increase(REVEAL_WINDOW + 1);
    await project.connect(secretary).approveBySecretary(requestId, ethers.toBigInt(nonce));
    
    // Committee
    commitment = ethers.keccak256(ethers.solidityPacked(
      ["address", "uint256", "uint256", "bytes32"],
      [committee1.address, requestId, chainId, nonce]
    ));
    await project.connect(committee1).commitApproval(requestId, commitment);
    await time.increase(REVEAL_WINDOW + 1);
    await project.connect(committee1).approveByCommittee(requestId, ethers.toBigInt(nonce));
    
    // Finance
    commitment = ethers.keccak256(ethers.solidityPacked(
      ["address", "uint256", "uint256", "bytes32"],
      [finance.address, requestId, chainId, nonce]
    ));
    await project.connect(finance).commitApproval(requestId, commitment);
    await time.increase(REVEAL_WINDOW + 1);
    await project.connect(finance).approveByFinance(requestId, ethers.toBigInt(nonce));
    
    // Additional committee
    for (const committee of [committee2, committee3, committee4]) {
      commitment = ethers.keccak256(ethers.solidityPacked(
        ["address", "uint256", "uint256", "bytes32"],
        [committee.address, requestId, chainId, nonce]
      ));
      await project.connect(committee).commitApproval(requestId, commitment);
      await time.increase(REVEAL_WINDOW + 1);
      await project.connect(committee).approveByCommitteeAdditional(requestId, ethers.toBigInt(nonce));
    }
    
    // Director
    commitment = ethers.keccak256(ethers.solidityPacked(
      ["address", "uint256", "uint256", "bytes32"],
      [director.address, requestId, chainId, nonce]
    ));
    await project.connect(director).commitApproval(requestId, commitment);
    await time.increase(REVEAL_WINDOW + 1);
    await project.connect(director).approveByDirector(requestId, ethers.toBigInt(nonce));
  }
  
  async function approveUpToFinance(project, requestId, approvers) {
    const { secretary, committee1, finance } = approvers;
    const nonce = ethers.randomBytes(32);
    const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
    
    // Secretary
    let commitment = ethers.keccak256(ethers.solidityPacked(
      ["address", "uint256", "uint256", "bytes32"],
      [secretary.address, requestId, chainId, nonce]
    ));
    await project.connect(secretary).commitApproval(requestId, commitment);
    await time.increase(REVEAL_WINDOW + 1);
    await project.connect(secretary).approveBySecretary(requestId, ethers.toBigInt(nonce));
    
    // Committee
    commitment = ethers.keccak256(ethers.solidityPacked(
      ["address", "uint256", "uint256", "bytes32"],
      [committee1.address, requestId, chainId, nonce]
    ));
    await project.connect(committee1).commitApproval(requestId, commitment);
    await time.increase(REVEAL_WINDOW + 1);
    await project.connect(committee1).approveByCommittee(requestId, ethers.toBigInt(nonce));
    
    // Finance
    commitment = ethers.keccak256(ethers.solidityPacked(
      ["address", "uint256", "uint256", "bytes32"],
      [finance.address, requestId, chainId, nonce]
    ));
    await project.connect(finance).commitApproval(requestId, commitment);
    await time.increase(REVEAL_WINDOW + 1);
    await project.connect(finance).approveByFinance(requestId, ethers.toBigInt(nonce));
  }
  
  async function completeEmergencyClosureApproval(project, closureId, approvers) {
    const { committee1, committee2, committee3, director } = approvers;
    const nonce = ethers.randomBytes(32);
    const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
    
    // Committee approvals
    for (const committee of [committee2, committee3]) {
      const commitment = ethers.keccak256(ethers.solidityPacked(
        ["address", "uint256", "uint256", "bytes32"],
        [committee.address, closureId, chainId, nonce]
      ));
      await project.connect(committee).commitClosureApproval(closureId, commitment);
      await time.increase(REVEAL_WINDOW + 1);
      await project.connect(committee).approveEmergencyClosure(closureId, ethers.toBigInt(nonce));
    }
    
    // Director approval (triggers auto-execution)
    const directorCommitment = ethers.keccak256(ethers.solidityPacked(
      ["address", "uint256", "uint256", "bytes32"],
      [director.address, closureId, chainId, nonce]
    ));
    await project.connect(director).commitClosureApproval(closureId, directorCommitment);
    await time.increase(REVEAL_WINDOW + 1);
    await project.connect(director).approveEmergencyClosure(closureId, ethers.toBigInt(nonce));
  }
});