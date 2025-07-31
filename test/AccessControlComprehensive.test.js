const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Access Control Comprehensive Test Suite", function () {
  // Role constants
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  const BLACKLISTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BLACKLISTER_ROLE"));
  const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));
  const SECRETARY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SECRETARY_ROLE"));
  const COMMITTEE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMMITTEE_ROLE"));
  const FINANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FINANCE_ROLE"));
  const DIRECTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DIRECTOR_ROLE"));
  const REQUESTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REQUESTER_ROLE"));

  async function deployFixture() {
    const signers = await ethers.getSigners();
    const [
      owner,
      admin2,
      minter,
      pauser,
      blacklister,
      upgrader,
      secretary,
      committee1,
      committee2,
      committee3,
      finance,
      director,
      requester,
      unauthorized,
      receiver
    ] = signers;

    // Deploy OMTHB Token
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const token = await upgrades.deployProxy(OMTHBToken, [owner.address], {
      initializer: 'initialize',
      kind: 'uups'
    });

    // Deploy Audit Anchor
    const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
    const auditAnchor = await AuditAnchor.deploy();

    // Deploy Project Factory
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const projectFactory = await ProjectFactory.deploy(
      await token.getAddress(),
      await auditAnchor.getAddress()
    );

    // Grant minter role to project factory
    await token.connect(owner).grantRole(MINTER_ROLE, await projectFactory.getAddress());

    return {
      token,
      auditAnchor,
      projectFactory,
      owner,
      admin2,
      minter,
      pauser,
      blacklister,
      upgrader,
      secretary,
      committee1,
      committee2,
      committee3,
      finance,
      director,
      requester,
      unauthorized,
      receiver,
      signers
    };
  }

  describe("1. Token Access Control Tests", function () {
    describe("1.1 Role Assignment", function () {
      it("Should correctly assign roles to addresses", async function () {
        const { token, owner, minter, pauser, blacklister, upgrader } = await loadFixture(deployFixture);
        
        // Grant roles
        await expect(token.connect(owner).grantRole(MINTER_ROLE, minter.address))
          .to.emit(token, "RoleGranted")
          .withArgs(MINTER_ROLE, minter.address, owner.address);
        
        await expect(token.connect(owner).grantRole(PAUSER_ROLE, pauser.address))
          .to.emit(token, "RoleGranted")
          .withArgs(PAUSER_ROLE, pauser.address, owner.address);
        
        await expect(token.connect(owner).grantRole(BLACKLISTER_ROLE, blacklister.address))
          .to.emit(token, "RoleGranted")
          .withArgs(BLACKLISTER_ROLE, blacklister.address, owner.address);
        
        await expect(token.connect(owner).grantRole(UPGRADER_ROLE, upgrader.address))
          .to.emit(token, "RoleGranted")
          .withArgs(UPGRADER_ROLE, upgrader.address, owner.address);
        
        // Verify roles
        expect(await token.hasRole(MINTER_ROLE, minter.address)).to.be.true;
        expect(await token.hasRole(PAUSER_ROLE, pauser.address)).to.be.true;
        expect(await token.hasRole(BLACKLISTER_ROLE, blacklister.address)).to.be.true;
        expect(await token.hasRole(UPGRADER_ROLE, upgrader.address)).to.be.true;
      });

      it("Should prevent unauthorized role assignment", async function () {
        const { token, unauthorized, minter } = await loadFixture(deployFixture);
        
        await expect(
          token.connect(unauthorized).grantRole(MINTER_ROLE, minter.address)
        ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
          .withArgs(unauthorized.address, DEFAULT_ADMIN_ROLE);
      });

      it("Should handle role revocation correctly", async function () {
        const { token, owner, minter } = await loadFixture(deployFixture);
        
        // Grant role
        await token.connect(owner).grantRole(MINTER_ROLE, minter.address);
        expect(await token.hasRole(MINTER_ROLE, minter.address)).to.be.true;
        
        // Revoke role
        await expect(token.connect(owner).revokeRole(MINTER_ROLE, minter.address))
          .to.emit(token, "RoleRevoked")
          .withArgs(MINTER_ROLE, minter.address, owner.address);
        
        expect(await token.hasRole(MINTER_ROLE, minter.address)).to.be.false;
      });

      it("Should support role renunciation", async function () {
        const { token, owner, minter } = await loadFixture(deployFixture);
        
        // Grant role
        await token.connect(owner).grantRole(MINTER_ROLE, minter.address);
        
        // Renounce role
        await expect(token.connect(minter).renounceRole(MINTER_ROLE, minter.address))
          .to.emit(token, "RoleRevoked")
          .withArgs(MINTER_ROLE, minter.address, minter.address);
        
        expect(await token.hasRole(MINTER_ROLE, minter.address)).to.be.false;
      });
    });

    describe("1.2 Role-Based Function Access", function () {
      it("Should enforce MINTER_ROLE for minting", async function () {
        const { token, owner, minter, unauthorized, receiver } = await loadFixture(deployFixture);
        
        await token.connect(owner).grantRole(MINTER_ROLE, minter.address);
        
        // Authorized minting
        await expect(token.connect(minter).mint(receiver.address, ethers.parseEther("100")))
          .to.not.be.reverted;
        
        // Unauthorized minting
        await expect(token.connect(unauthorized).mint(receiver.address, ethers.parseEther("100")))
          .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
          .withArgs(unauthorized.address, MINTER_ROLE);
      });

      it("Should enforce PAUSER_ROLE for pausing", async function () {
        const { token, owner, pauser, unauthorized } = await loadFixture(deployFixture);
        
        await token.connect(owner).grantRole(PAUSER_ROLE, pauser.address);
        
        // Authorized pausing
        await expect(token.connect(pauser).pause())
          .to.emit(token, "Paused");
        
        // Unauthorized pausing
        await expect(token.connect(unauthorized).unpause())
          .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
          .withArgs(unauthorized.address, PAUSER_ROLE);
      });

      it("Should enforce BLACKLISTER_ROLE for blacklisting", async function () {
        const { token, owner, blacklister, unauthorized, receiver } = await loadFixture(deployFixture);
        
        await token.connect(owner).grantRole(BLACKLISTER_ROLE, blacklister.address);
        
        // Authorized blacklisting
        await expect(token.connect(blacklister).blacklist(receiver.address))
          .to.emit(token, "Blacklisted");
        
        // Unauthorized blacklisting
        await expect(token.connect(unauthorized).blacklist(receiver.address))
          .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
          .withArgs(unauthorized.address, BLACKLISTER_ROLE);
      });
    });

    describe("1.3 Admin Role Management", function () {
      it("Should handle multiple admins correctly", async function () {
        const { token, owner, admin2 } = await loadFixture(deployFixture);
        
        // Grant admin role to second admin
        await expect(token.connect(owner).grantRole(DEFAULT_ADMIN_ROLE, admin2.address))
          .to.emit(token, "RoleGranted")
          .withArgs(DEFAULT_ADMIN_ROLE, admin2.address, owner.address);
        
        // Both admins should be able to grant roles
        await expect(token.connect(admin2).grantRole(MINTER_ROLE, admin2.address))
          .to.not.be.reverted;
        
        expect(await token.hasRole(DEFAULT_ADMIN_ROLE, admin2.address)).to.be.true;
      });

      it("Should prevent last admin from renouncing", async function () {
        const { token, owner } = await loadFixture(deployFixture);
        
        // Get admin role count
        const adminCount = await token.getRoleMemberCount(DEFAULT_ADMIN_ROLE);
        expect(adminCount).to.equal(1);
        
        // Should still allow renouncing (OpenZeppelin doesn't prevent this)
        await token.connect(owner).renounceRole(DEFAULT_ADMIN_ROLE, owner.address);
        
        // Verify admin was removed (this could lock the contract)
        expect(await token.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.false;
      });
    });
  });

  describe("2. Project Access Control Tests", function () {
    async function deployProjectFixture() {
      const base = await loadFixture(deployFixture);
      const { token, projectFactory, owner, minter } = base;
      
      // Grant minter role
      await token.connect(owner).grantRole(MINTER_ROLE, minter.address);
      
      // Create project
      const tx = await projectFactory.connect(owner).createProject("TEST-001", ethers.parseEther("10000"));
      const receipt = await tx.wait();
      const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);
      
      // Mint tokens to project
      await token.connect(minter).mint(projectAddress, ethers.parseEther("10000"));
      
      return { ...base, project };
    }

    describe("2.1 Project Role Assignment", function () {
      it("Should correctly assign all project roles", async function () {
        const { project, owner, secretary, committee1, committee2, committee3, finance, director, requester } = await deployProjectFixture();
        
        // Assign all roles
        await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee1.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee2.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee3.address);
        await project.connect(owner).grantRole(FINANCE_ROLE, finance.address);
        await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);
        await project.connect(owner).grantRole(REQUESTER_ROLE, requester.address);
        
        // Verify all roles
        expect(await project.hasRole(SECRETARY_ROLE, secretary.address)).to.be.true;
        expect(await project.hasRole(COMMITTEE_ROLE, committee1.address)).to.be.true;
        expect(await project.hasRole(COMMITTEE_ROLE, committee2.address)).to.be.true;
        expect(await project.hasRole(COMMITTEE_ROLE, committee3.address)).to.be.true;
        expect(await project.hasRole(FINANCE_ROLE, finance.address)).to.be.true;
        expect(await project.hasRole(DIRECTOR_ROLE, director.address)).to.be.true;
        expect(await project.hasRole(REQUESTER_ROLE, requester.address)).to.be.true;
      });

      it("Should handle multiple users with same role", async function () {
        const { project, owner, committee1, committee2, committee3 } = await deployProjectFixture();
        
        // Assign committee role to multiple users
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee1.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee2.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee3.address);
        
        // Verify role member count
        const memberCount = await project.getRoleMemberCount(COMMITTEE_ROLE);
        expect(memberCount).to.equal(3);
        
        // Verify each member
        expect(await project.getRoleMember(COMMITTEE_ROLE, 0)).to.be.oneOf([committee1.address, committee2.address, committee3.address]);
        expect(await project.getRoleMember(COMMITTEE_ROLE, 1)).to.be.oneOf([committee1.address, committee2.address, committee3.address]);
        expect(await project.getRoleMember(COMMITTEE_ROLE, 2)).to.be.oneOf([committee1.address, committee2.address, committee3.address]);
      });
    });

    describe("2.2 Approval Flow Access Control", function () {
      it("Should enforce correct approval sequence", async function () {
        const { project, owner, secretary, committee1, finance, director, requester, receiver } = await deployProjectFixture();
        
        // Setup roles
        await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee1.address);
        await project.connect(owner).grantRole(FINANCE_ROLE, finance.address);
        await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);
        await project.connect(owner).grantRole(REQUESTER_ROLE, requester.address);
        
        // Create request
        await project.connect(requester).createReimbursementRequest(
          [receiver.address],
          [ethers.parseEther("100")],
          "Test request",
          "QmTest"
        );
        
        // Try to approve out of order - should fail
        await expect(project.connect(committee1).approveAsCommittee(1))
          .to.be.revertedWith("Invalid approval sequence");
        
        // Correct sequence
        await expect(project.connect(secretary).approveAsSecretary(1))
          .to.emit(project, "RequestApproved");
        
        await expect(project.connect(committee1).approveAsCommittee(1))
          .to.emit(project, "RequestApproved");
        
        await expect(project.connect(finance).approveAsFinance(1))
          .to.emit(project, "RequestApproved");
        
        await expect(project.connect(director).approveAsDirector(1))
          .to.emit(project, "RequestApproved");
      });

      it("Should prevent unauthorized approvals", async function () {
        const { project, owner, secretary, committee1, finance, director, requester, unauthorized, receiver } = await deployProjectFixture();
        
        // Setup roles
        await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
        await project.connect(owner).grantRole(REQUESTER_ROLE, requester.address);
        
        // Create request
        await project.connect(requester).createReimbursementRequest(
          [receiver.address],
          [ethers.parseEther("100")],
          "Test request",
          "QmTest"
        );
        
        // Unauthorized secretary approval
        await expect(project.connect(unauthorized).approveAsSecretary(1))
          .to.be.revertedWithCustomError(project, "AccessControlUnauthorizedAccount")
          .withArgs(unauthorized.address, SECRETARY_ROLE);
        
        // Approve as secretary
        await project.connect(secretary).approveAsSecretary(1);
        
        // Unauthorized committee approval
        await expect(project.connect(unauthorized).approveAsCommittee(1))
          .to.be.revertedWithCustomError(project, "AccessControlUnauthorizedAccount")
          .withArgs(unauthorized.address, COMMITTEE_ROLE);
      });

      it("Should prevent double approvals from same role", async function () {
        const { project, owner, secretary, requester, receiver } = await deployProjectFixture();
        
        // Setup roles
        await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
        await project.connect(owner).grantRole(REQUESTER_ROLE, requester.address);
        
        // Create request
        await project.connect(requester).createReimbursementRequest(
          [receiver.address],
          [ethers.parseEther("100")],
          "Test request",
          "QmTest"
        );
        
        // First approval
        await project.connect(secretary).approveAsSecretary(1);
        
        // Second approval should fail
        await expect(project.connect(secretary).approveAsSecretary(1))
          .to.be.revertedWith("Invalid approval sequence");
      });
    });

    describe("2.3 Request Creation Access Control", function () {
      it("Should only allow REQUESTER_ROLE to create requests", async function () {
        const { project, owner, requester, unauthorized, receiver } = await deployProjectFixture();
        
        await project.connect(owner).grantRole(REQUESTER_ROLE, requester.address);
        
        // Authorized request
        await expect(project.connect(requester).createReimbursementRequest(
          [receiver.address],
          [ethers.parseEther("100")],
          "Test",
          "QmTest"
        )).to.emit(project, "ReimbursementRequested");
        
        // Unauthorized request
        await expect(project.connect(unauthorized).createReimbursementRequest(
          [receiver.address],
          [ethers.parseEther("100")],
          "Test",
          "QmTest"
        )).to.be.revertedWithCustomError(project, "AccessControlUnauthorizedAccount")
          .withArgs(unauthorized.address, REQUESTER_ROLE);
      });
    });

    describe("2.4 Emergency Closure Access Control", function () {
      it("Should only allow DIRECTOR_ROLE to initiate emergency closure", async function () {
        const { project, owner, director, unauthorized } = await deployProjectFixture();
        
        await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);
        
        // Authorized initiation
        await expect(project.connect(director).initiateEmergencyClosure(
          director.address,
          "Emergency test"
        )).to.emit(project, "EmergencyClosureInitiated");
        
        // Unauthorized initiation
        await expect(project.connect(unauthorized).initiateEmergencyClosure(
          unauthorized.address,
          "Emergency test"
        )).to.be.revertedWithCustomError(project, "AccessControlUnauthorizedAccount")
          .withArgs(unauthorized.address, DIRECTOR_ROLE);
      });

      it("Should require 3 unique committee approvals", async function () {
        const { project, owner, director, committee1, committee2, committee3 } = await deployProjectFixture();
        
        // Setup roles
        await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee1.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee2.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee3.address);
        
        // Initiate closure
        await project.connect(director).initiateEmergencyClosure(director.address, "Test");
        
        // First approval
        await expect(project.connect(committee1).approveEmergencyClosure(1))
          .to.emit(project, "EmergencyClosureApproved");
        
        // Same member trying again should fail
        await expect(project.connect(committee1).approveEmergencyClosure(1))
          .to.be.revertedWith("Already approved by this member");
        
        // Second and third approvals
        await project.connect(committee2).approveEmergencyClosure(1);
        await project.connect(committee3).approveEmergencyClosure(1);
        
        // Verify status changed to PartiallyApproved
        const closure = await project.emergencyClosures(1);
        expect(closure.status).to.equal(2); // PartiallyApproved
      });
    });
  });

  describe("3. Cross-Contract Access Control", function () {
    it("Should enforce access control across contract boundaries", async function () {
      const { token, projectFactory, owner, minter, unauthorized } = await loadFixture(deployFixture);
      
      // Project factory needs minter role to mint tokens
      await token.connect(owner).grantRole(MINTER_ROLE, await projectFactory.getAddress());
      
      // Create project successfully
      await expect(projectFactory.connect(owner).createProject("TEST-001", ethers.parseEther("1000")))
        .to.not.be.reverted;
      
      // Remove minter role from factory
      await token.connect(owner).revokeRole(MINTER_ROLE, await projectFactory.getAddress());
      
      // Creating project should now fail during minting
      await expect(projectFactory.connect(owner).createProject("TEST-002", ethers.parseEther("1000")))
        .to.be.reverted;
    });
  });

  describe("4. Role Admin Management", function () {
    it("Should correctly set and use role admins", async function () {
      const { token, owner, admin2, minter } = await loadFixture(deployFixture);
      
      // Create a new role with custom admin
      const CUSTOM_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CUSTOM_ROLE"));
      const CUSTOM_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CUSTOM_ADMIN_ROLE"));
      
      // Set custom admin for the role
      await token.connect(owner).setRoleAdmin(CUSTOM_ROLE, CUSTOM_ADMIN_ROLE);
      
      // Grant custom admin role to admin2
      await token.connect(owner).grantRole(CUSTOM_ADMIN_ROLE, admin2.address);
      
      // admin2 should now be able to grant CUSTOM_ROLE
      await expect(token.connect(admin2).grantRole(CUSTOM_ROLE, minter.address))
        .to.emit(token, "RoleGranted")
        .withArgs(CUSTOM_ROLE, minter.address, admin2.address);
      
      // Owner should not be able to grant CUSTOM_ROLE directly anymore
      await expect(token.connect(owner).grantRole(CUSTOM_ROLE, owner.address))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
        .withArgs(owner.address, CUSTOM_ADMIN_ROLE);
    });
  });

  describe("5. Edge Cases and Security", function () {
    it("Should handle zero address operations", async function () {
      const { token, owner } = await loadFixture(deployFixture);
      
      // Should not allow granting roles to zero address
      await expect(token.connect(owner).grantRole(MINTER_ROLE, ethers.ZeroAddress))
        .to.not.be.reverted; // OpenZeppelin allows this, but it's effectively useless
      
      // Verify zero address doesn't actually have the role functionally
      const TokenMock = await ethers.getContractFactory("OMTHBToken");
      const tokenFromZero = TokenMock.attach(await token.getAddress()).connect(ethers.provider);
      
      // Operations from zero address should fail
      await expect(tokenFromZero.mint(owner.address, 100))
        .to.be.reverted;
    });

    it("Should handle role enumeration correctly", async function () {
      const { project, owner, committee1, committee2, committee3 } = await deployProjectFixture();
      
      // Add multiple committee members
      await project.connect(owner).grantRole(COMMITTEE_ROLE, committee1.address);
      await project.connect(owner).grantRole(COMMITTEE_ROLE, committee2.address);
      await project.connect(owner).grantRole(COMMITTEE_ROLE, committee3.address);
      
      // Enumerate members
      const count = await project.getRoleMemberCount(COMMITTEE_ROLE);
      expect(count).to.equal(3);
      
      const members = [];
      for (let i = 0; i < count; i++) {
        members.push(await project.getRoleMember(COMMITTEE_ROLE, i));
      }
      
      expect(members).to.include.members([committee1.address, committee2.address, committee3.address]);
      
      // Remove one member
      await project.connect(owner).revokeRole(COMMITTEE_ROLE, committee2.address);
      
      // Re-check enumeration
      const newCount = await project.getRoleMemberCount(COMMITTEE_ROLE);
      expect(newCount).to.equal(2);
    });

    it("Should maintain access control during paused state", async function () {
      const { token, owner, pauser, minter, receiver } = await loadFixture(deployFixture);
      
      await token.connect(owner).grantRole(PAUSER_ROLE, pauser.address);
      await token.connect(owner).grantRole(MINTER_ROLE, minter.address);
      
      // Pause contract
      await token.connect(pauser).pause();
      
      // Most operations should fail when paused
      await expect(token.connect(minter).mint(receiver.address, 100))
        .to.be.revertedWithCustomError(token, "EnforcedPause");
      
      // But role management should still work
      await expect(token.connect(owner).grantRole(MINTER_ROLE, receiver.address))
        .to.not.be.reverted;
      
      // Unpause
      await token.connect(pauser).unpause();
      
      // Operations should work again
      await expect(token.connect(minter).mint(receiver.address, 100))
        .to.not.be.reverted;
    });

    it("Should handle concurrent role modifications", async function () {
      const { project, owner, signers } = await deployProjectFixture();
      
      // Grant committee role to many addresses concurrently
      const promises = [];
      for (let i = 5; i < 15; i++) {
        promises.push(
          project.connect(owner).grantRole(COMMITTEE_ROLE, signers[i].address)
        );
      }
      
      await Promise.all(promises);
      
      // Verify all were added
      const count = await project.getRoleMemberCount(COMMITTEE_ROLE);
      expect(count).to.equal(10);
      
      // Revoke some concurrently
      const revokePromises = [];
      for (let i = 5; i < 10; i++) {
        revokePromises.push(
          project.connect(owner).revokeRole(COMMITTEE_ROLE, signers[i].address)
        );
      }
      
      await Promise.all(revokePromises);
      
      // Verify correct count
      const finalCount = await project.getRoleMemberCount(COMMITTEE_ROLE);
      expect(finalCount).to.equal(5);
    });
  });
});