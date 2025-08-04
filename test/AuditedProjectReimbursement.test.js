const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("AuditedProjectReimbursement", function () {
  async function deployFixture() {
    const [owner, secretary, committee1, committee2, committee3, finance, director, user1, user2, attacker] = await ethers.getSigners();

    // Deploy OMTHB Token
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const omthbToken = await upgrades.deployProxy(OMTHBToken, [owner.address], {
      initializer: 'initialize',
      kind: 'uups'
    });

    // Deploy MetaTxForwarder
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const forwarder = await MetaTxForwarder.deploy();

    // Deploy Implementation
    const AuditedProjectReimbursement = await ethers.getContractFactory("AuditedProjectReimbursement");
    const implementation = await AuditedProjectReimbursement.deploy(forwarder.address);

    // Deploy ProjectFactory
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const factory = await ProjectFactory.deploy(
      implementation.address,
      omthbToken.address,
      forwarder.address,
      owner.address
    );

    // Grant roles
    const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
    await factory.grantRole(PROJECT_CREATOR_ROLE, owner.address);

    // Create a project
    const tx = await factory.createProject(
      "Test Project",
      [secretary.address],
      [committee1.address, committee2.address, committee3.address],
      [finance.address],
      [director.address],
      1000000 // 1M initial funding
    );

    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === 'ProjectCreated');
    const projectAddress = event.args.projectContract;

    const project = await ethers.getContractAt("AuditedProjectReimbursement", projectAddress);

    // Fund the project
    await omthbToken.mint(projectAddress, ethers.parseEther("1000000"));

    return {
      omthbToken,
      forwarder,
      factory,
      project,
      owner,
      secretary,
      committee1,
      committee2,
      committee3,
      finance,
      director,
      user1,
      user2,
      attacker
    };
  }

  describe("Deployment", function () {
    it("Should deploy with correct initial state", async function () {
      const { project, omthbToken, factory } = await loadFixture(deployFixture);
      
      expect(await project.omthbToken()).to.equal(omthbToken.address);
      expect(await project.factory()).to.equal(factory.address);
      expect(await project.requiredCommitteeApprovals()).to.equal(3);
    });

    it("Should assign roles correctly", async function () {
      const { project, secretary, committee1, finance, director } = await loadFixture(deployFixture);
      
      const SECRETARY_ROLE = await project.SECRETARY_ROLE();
      const COMMITTEE_ROLE = await project.COMMITTEE_ROLE();
      const FINANCE_ROLE = await project.FINANCE_ROLE();
      const DIRECTOR_ROLE = await project.DIRECTOR_ROLE();

      expect(await project.hasRole(SECRETARY_ROLE, secretary.address)).to.be.true;
      expect(await project.hasRole(COMMITTEE_ROLE, committee1.address)).to.be.true;
      expect(await project.hasRole(FINANCE_ROLE, finance.address)).to.be.true;
      expect(await project.hasRole(DIRECTOR_ROLE, director.address)).to.be.true;
    });
  });

  describe("Request Creation", function () {
    it("Should create a payment request", async function () {
      const { project, user1, user2 } = await loadFixture(deployFixture);
      
      const receivers = [user1.address, user2.address];
      const amounts = [ethers.parseEther("100"), ethers.parseEther("200")];
      
      await expect(project.createRequest(receivers, amounts, "Test payment"))
        .to.emit(project, "RequestCreatedAudit")
        .withArgs(0, project.signer.address, ethers.parseEther("300"), 2, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1), ethers.encodeBytes32String(""), "Test payment", "0x");
    });

    it("Should reject mismatched arrays", async function () {
      const { project, user1 } = await loadFixture(deployFixture);
      
      await expect(
        project.createRequest([user1.address], [100, 200], "Test")
      ).to.be.revertedWith("Length mismatch");
    });

    it("Should reject zero receivers", async function () {
      const { project } = await loadFixture(deployFixture);
      
      await expect(
        project.createRequest([], [], "Test")
      ).to.be.revertedWith("Invalid receivers count");
    });

    it("Should reject too many receivers", async function () {
      const { project } = await loadFixture(deployFixture);
      
      const receivers = new Array(101).fill(project.signer.address);
      const amounts = new Array(101).fill(100);
      
      await expect(
        project.createRequest(receivers, amounts, "Test")
      ).to.be.revertedWith("Invalid receivers count");
    });

    it("Should reject zero address receiver", async function () {
      const { project } = await loadFixture(deployFixture);
      
      await expect(
        project.createRequest([ethers.ZeroAddress], [100], "Test")
      ).to.be.revertedWith("Invalid receiver");
    });

    it("Should reject zero amount", async function () {
      const { project, user1 } = await loadFixture(deployFixture);
      
      await expect(
        project.createRequest([user1.address], [0], "Test")
      ).to.be.revertedWith("Invalid amount");
    });

    it("Should reject insufficient treasury", async function () {
      const { project, user1, omthbToken } = await loadFixture(deployFixture);
      
      // Drain treasury
      await omthbToken.connect(await ethers.getSigner(project.address)).transfer(user1.address, await omthbToken.balanceOf(project.address));
      
      await expect(
        project.createRequest([user1.address], [100], "Test")
      ).to.be.revertedWith("Insufficient treasury");
    });
  });

  describe("Approval Workflow", function () {
    async function createRequestFixture() {
      const fixture = await deployFixture();
      const { project, user1, user2 } = fixture;
      
      const receivers = [user1.address, user2.address];
      const amounts = [ethers.parseEther("100"), ethers.parseEther("200")];
      
      await project.createRequest(receivers, amounts, "Test payment");
      
      return { ...fixture, requestId: 0 };
    }

    describe("Secretary Approval", function () {
      it("Should allow secretary to approve", async function () {
        const { project, secretary, requestId } = await loadFixture(createRequestFixture);
        
        await expect(project.connect(secretary).approveAsSecretary(requestId))
          .to.emit(project, "ApprovalAudit")
          .withArgs(requestId, secretary.address, "SECRETARY", 1, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1), ethers.encodeBytes32String(""), ethers.encodeBytes32String(""), "0x");
      });

      it("Should reject non-secretary approval", async function () {
        const { project, user1, requestId } = await loadFixture(createRequestFixture);
        
        await expect(project.connect(user1).approveAsSecretary(requestId))
          .to.be.reverted;
      });

      it("Should reject duplicate approval", async function () {
        const { project, secretary, requestId } = await loadFixture(createRequestFixture);
        
        await project.connect(secretary).approveAsSecretary(requestId);
        
        await expect(project.connect(secretary).approveAsSecretary(requestId))
          .to.be.revertedWith("Already approved");
      });

      it("Should reject wrong status", async function () {
        const { project, secretary, committee1, requestId } = await loadFixture(createRequestFixture);
        
        // Advance status
        await project.connect(secretary).approveAsSecretary(requestId);
        await project.connect(committee1).approveAsFirstCommittee(requestId);
        
        // Try to approve as secretary again
        const SECRETARY_ROLE = await project.SECRETARY_ROLE();
        await project.grantRole(SECRETARY_ROLE, committee1.address);
        
        await expect(project.connect(committee1).approveAsSecretary(requestId))
          .to.be.revertedWith("Invalid status");
      });
    });

    describe("Committee Approvals", function () {
      async function secretaryApprovedFixture() {
        const fixture = await createRequestFixture();
        const { project, secretary, requestId } = fixture;
        
        await project.connect(secretary).approveAsSecretary(requestId);
        
        return fixture;
      }

      it("Should allow first committee approval", async function () {
        const { project, committee1, requestId } = await loadFixture(secretaryApprovedFixture);
        
        await expect(project.connect(committee1).approveAsFirstCommittee(requestId))
          .to.emit(project, "ApprovalAudit");
      });

      it("Should allow subsequent committee approvals", async function () {
        const { project, committee1, committee2, committee3, finance, requestId } = await loadFixture(secretaryApprovedFixture);
        
        await project.connect(committee1).approveAsFirstCommittee(requestId);
        await project.connect(finance).approveAsFinance(requestId);
        
        await expect(project.connect(committee2).approveAsCommittee(requestId))
          .to.emit(project, "ApprovalAudit");
          
        await expect(project.connect(committee3).approveAsCommittee(requestId))
          .to.emit(project, "ApprovalAudit");
      });

      it("Should advance to director approval after enough committees", async function () {
        const { project, committee1, committee2, committee3, finance, requestId } = await loadFixture(secretaryApprovedFixture);
        
        await project.connect(committee1).approveAsFirstCommittee(requestId);
        await project.connect(finance).approveAsFinance(requestId);
        await project.connect(committee2).approveAsCommittee(requestId);
        await project.connect(committee3).approveAsCommittee(requestId);
        
        const request = await project.requests(requestId);
        expect(request.status).to.equal(5); // AwaitingDirector
      });
    });

    describe("Director Approval and Distribution", function () {
      async function readyForDirectorFixture() {
        const fixture = await secretaryApprovedFixture();
        const { project, committee1, committee2, committee3, finance, requestId } = fixture;
        
        await project.connect(committee1).approveAsFirstCommittee(requestId);
        await project.connect(finance).approveAsFinance(requestId);
        await project.connect(committee2).approveAsCommittee(requestId);
        await project.connect(committee3).approveAsCommittee(requestId);
        
        return fixture;
      }

      it("Should distribute payments after director approval", async function () {
        const { project, director, user1, user2, omthbToken, requestId } = await loadFixture(readyForDirectorFixture);
        
        const user1BalanceBefore = await omthbToken.balanceOf(user1.address);
        const user2BalanceBefore = await omthbToken.balanceOf(user2.address);
        
        await expect(project.connect(director).approveAsDirector(requestId))
          .to.emit(project, "PaymentDistributedAudit");
        
        expect(await omthbToken.balanceOf(user1.address)).to.equal(user1BalanceBefore.add(ethers.parseEther("100")));
        expect(await omthbToken.balanceOf(user2.address)).to.equal(user2BalanceBefore.add(ethers.parseEther("200")));
        
        const request = await project.requests(requestId);
        expect(request.status).to.equal(7); // Distributed
      });
    });
  });

  describe("Cancellation", function () {
    it("Should allow owner to cancel request", async function () {
      const { project, user1 } = await loadFixture(deployFixture);
      
      await project.createRequest([user1.address], [100], "Test");
      
      await expect(project.cancelRequest(0))
        .to.emit(project, "RequestCancelledAudit");
    });

    it("Should reject cancellation by non-owner", async function () {
      const { project, user1, user2 } = await loadFixture(deployFixture);
      
      await project.connect(user1).createRequest([user2.address], [100], "Test");
      
      await expect(project.connect(user2).cancelRequest(0))
        .to.be.revertedWith("Unauthorized");
    });

    it("Should reject cancelling distributed request", async function () {
      const { project, secretary, committee1, committee2, committee3, finance, director, user1 } = await loadFixture(deployFixture);
      
      await project.createRequest([user1.address], [100], "Test");
      
      // Complete approval workflow
      await project.connect(secretary).approveAsSecretary(0);
      await project.connect(committee1).approveAsFirstCommittee(0);
      await project.connect(finance).approveAsFinance(0);
      await project.connect(committee2).approveAsCommittee(0);
      await project.connect(committee3).approveAsCommittee(0);
      await project.connect(director).approveAsDirector(0);
      
      await expect(project.cancelRequest(0))
        .to.be.revertedWith("Cannot cancel");
    });
  });

  describe("Meta-Transactions", function () {
    it("Should support meta-transactions", async function () {
      const { project, forwarder, user1 } = await loadFixture(deployFixture);
      
      // Test meta-tx support
      expect(await project.isTrustedForwarder(forwarder.address)).to.be.true;
    });
  });

  describe("Access Control", function () {
    it("Should enforce role-based access", async function () {
      const { project, user1 } = await loadFixture(deployFixture);
      
      const SECRETARY_ROLE = await project.SECRETARY_ROLE();
      
      await expect(project.connect(user1).approveAsSecretary(0))
        .to.be.reverted;
    });

    it("Should allow role management by admin", async function () {
      const { project, owner, user1 } = await loadFixture(deployFixture);
      
      const SECRETARY_ROLE = await project.SECRETARY_ROLE();
      
      await project.connect(owner).grantRole(SECRETARY_ROLE, user1.address);
      
      expect(await project.hasRole(SECRETARY_ROLE, user1.address)).to.be.true;
    });
  });

  describe("Treasury Management", function () {
    it("Should track treasury balance", async function () {
      const { project, omthbToken } = await loadFixture(deployFixture);
      
      const balance = await project.getTreasuryBalance();
      expect(balance).to.equal(await omthbToken.balanceOf(project.address));
    });
  });

  describe("Audit Trail", function () {
    it("Should maintain audit trail for requests", async function () {
      const { project, user1 } = await loadFixture(deployFixture);
      
      await project.createRequest([user1.address], [100], "Test");
      
      // Audit trail should have at least one entry
      const auditTrail = await project.requestAuditTrail(0, 0);
      expect(auditTrail).to.not.equal(ethers.constants.HashZero);
    });

    it("Should track user action counts", async function () {
      const { project, user1, owner } = await loadFixture(deployFixture);
      
      const countBefore = await project.userActionCount(owner.address);
      
      await project.createRequest([user1.address], [100], "Test");
      
      const countAfter = await project.userActionCount(owner.address);
      expect(countAfter).to.equal(countBefore.add(1));
    });
  });

  describe("Edge Cases", function () {
    it("Should handle maximum receivers", async function () {
      const { project } = await loadFixture(deployFixture);
      
      const receivers = new Array(100).fill(project.signer.address);
      const amounts = new Array(100).fill(1);
      
      await expect(project.createRequest(receivers, amounts, "Max receivers test"))
        .to.not.be.reverted;
    });

    it("Should handle very large amounts", async function () {
      const { project, user1, omthbToken } = await loadFixture(deployFixture);
      
      const largeAmount = ethers.parseEther("999999");
      
      await expect(project.createRequest([user1.address], [largeAmount], "Large amount"))
        .to.not.be.reverted;
    });
  });

  describe("Security", function () {
    it("Should prevent reentrancy attacks", async function () {
      const { project } = await loadFixture(deployFixture);
      
      // Deploy malicious contract
      const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
      const attacker = await Attacker.deploy(project.address);
      
      // Attempt attack
      await expect(attacker.attack()).to.be.reverted;
    });

    it("Should validate all inputs", async function () {
      const { project } = await loadFixture(deployFixture);
      
      // Test various invalid inputs
      await expect(project.createRequest([ethers.ZeroAddress], [100], "Test"))
        .to.be.revertedWith("Invalid receiver");
    });
  });
});