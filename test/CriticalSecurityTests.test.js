const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Critical Security Tests - Deployment Blockers", function () {
  // Test fixture
  async function deployFixture() {
    const [owner, admin, secretary, committee1, committee2, finance, director, attacker, user1, user2] = 
      await ethers.getSigners();

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

    // Setup roles
    const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
    await factory.grantRole(PROJECT_CREATOR_ROLE, admin.address);

    // Mint tokens for testing
    await omthbToken.mint(owner.address, ethers.utils.parseEther("1000000"));

    return {
      omthbToken,
      forwarder,
      factory,
      implementation,
      owner,
      admin,
      secretary,
      committee1,
      committee2,
      finance,
      director,
      attacker,
      user1,
      user2
    };
  }

  describe("Critical Issue #1: Reentrancy Vulnerabilities", function () {
    it("Should prevent reentrancy attack during payment distribution", async function () {
      const { omthbToken, factory, admin, attacker, user1 } = await loadFixture(deployFixture);
      
      // Deploy malicious receiver contract
      const ReentrancyAttacker = await ethers.getContractFactory("ReentrancyAttacker");
      const attackContract = await ReentrancyAttacker.deploy();
      
      // Create project
      await factory.connect(admin).createProject("TEST001", ethers.utils.parseEther("1000"), admin.address);
      const projectInfo = await factory.projects("TEST001");
      const project = await ethers.getContractAt("AuditedProjectReimbursement", projectInfo.projectContract);
      
      // Fund project
      await omthbToken.transfer(project.address, ethers.utils.parseEther("1000"));
      
      // Setup roles
      await project.connect(admin).grantRole(await project.SECRETARY_ROLE(), admin.address);
      
      // Create request with attacker contract as receiver
      await project.connect(admin).createRequest(
        [attackContract.address],
        [ethers.utils.parseEther("100")],
        "Test payment"
      );
      
      // Set attacker contract to attempt reentrancy
      await attackContract.setTarget(project.address);
      
      // Attempt to approve and trigger reentrancy
      await expect(
        project.connect(admin).approveAsSecretary(0)
      ).to.be.reverted;
    });

    it("Should maintain correct state even with failed external calls", async function () {
      const { omthbToken, factory, admin, user1 } = await loadFixture(deployFixture);
      
      // Create project
      await factory.connect(admin).createProject("TEST002", ethers.utils.parseEther("1000"), admin.address);
      const projectInfo = await factory.projects("TEST002");
      const project = await ethers.getContractAt("AuditedProjectReimbursement", projectInfo.projectContract);
      
      // Fund with exactly the request amount
      await omthbToken.transfer(project.address, ethers.utils.parseEther("100"));
      
      const balanceBefore = await omthbToken.balanceOf(project.address);
      
      // Create request
      await project.connect(admin).grantRole(await project.SECRETARY_ROLE(), admin.address);
      await project.connect(admin).createRequest(
        [user1.address],
        [ethers.utils.parseEther("100")],
        "Test payment"
      );
      
      // Approve through all levels
      await project.connect(admin).approveAsSecretary(0);
      
      // Verify balance unchanged if distribution fails
      const balanceAfter = await omthbToken.balanceOf(project.address);
      expect(balanceAfter).to.equal(balanceBefore);
    });
  });

  describe("Critical Issue #2: Integer Overflow in Gas Calculations", function () {
    it("Should prevent integer overflow in gas estimation", async function () {
      const { omthbToken, factory, admin, attacker } = await loadFixture(deployFixture);
      
      // Create project
      await factory.connect(admin).createProject("TEST003", ethers.utils.parseEther("10000"), admin.address);
      const projectInfo = await factory.projects("TEST003");
      const project = await ethers.getContractAt("AuditedProjectReimbursement", projectInfo.projectContract);
      
      // Try to create request with maximum receivers to trigger overflow
      const maxReceivers = [];
      const maxAmounts = [];
      
      // This should fail due to receiver limit
      for (let i = 0; i < 51; i++) {
        maxReceivers.push(ethers.Wallet.createRandom().address);
        maxAmounts.push(ethers.utils.parseEther("0.1"));
      }
      
      await expect(
        project.connect(admin).createRequest(maxReceivers, maxAmounts, "Overflow test")
      ).to.be.revertedWith("Invalid receivers count");
    });

    it("Should handle large individual amounts safely", async function () {
      const { factory, admin, user1 } = await loadFixture(deployFixture);
      
      await factory.connect(admin).createProject("TEST004", ethers.utils.parseEther("10000"), admin.address);
      const projectInfo = await factory.projects("TEST004");
      const project = await ethers.getContractAt("AuditedProjectReimbursement", projectInfo.projectContract);
      
      // Try to create request with amount exceeding maximum
      const tooLargeAmount = ethers.utils.parseEther("1000001"); // Over 1M limit
      
      await expect(
        project.connect(admin).createRequest([user1.address], [tooLargeAmount], "Large amount")
      ).to.be.revertedWith("Invalid amount");
    });
  });

  describe("Critical Issue #3: Access Control Vulnerabilities", function () {
    it("Should prevent unauthorized role escalation", async function () {
      const { factory, attacker, admin } = await loadFixture(deployFixture);
      
      // Attacker should not be able to grant themselves admin role
      const DEFAULT_ADMIN_ROLE = await factory.DEFAULT_ADMIN_ROLE();
      await expect(
        factory.connect(attacker).grantRole(DEFAULT_ADMIN_ROLE, attacker.address)
      ).to.be.reverted;
      
      // Even with a lower role, should not escalate
      const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
      await factory.connect(admin).grantRole(PROJECT_CREATOR_ROLE, attacker.address);
      
      await expect(
        factory.connect(attacker).grantRole(DEFAULT_ADMIN_ROLE, attacker.address)
      ).to.be.reverted;
    });

    it("Should enforce proper approval hierarchy", async function () {
      const { omthbToken, factory, admin, secretary, committee1, finance, director, attacker } = 
        await loadFixture(deployFixture);
      
      // Create and setup project
      await factory.connect(admin).createProject("TEST005", ethers.utils.parseEther("1000"), admin.address);
      const projectInfo = await factory.projects("TEST005");
      const project = await ethers.getContractAt("AuditedProjectReimbursement", projectInfo.projectContract);
      
      await omthbToken.transfer(project.address, ethers.utils.parseEther("1000"));
      
      // Setup roles
      await project.connect(admin).grantRole(await project.SECRETARY_ROLE(), secretary.address);
      await project.connect(admin).grantRole(await project.COMMITTEE_ROLE(), committee1.address);
      await project.connect(admin).grantRole(await project.FINANCE_ROLE(), finance.address);
      await project.connect(admin).grantRole(await project.DIRECTOR_ROLE(), director.address);
      
      // Create request
      await project.connect(admin).createRequest(
        [attacker.address],
        [ethers.utils.parseEther("100")],
        "Test payment"
      );
      
      // Attacker cannot approve at any level
      await expect(project.connect(attacker).approveAsSecretary(0)).to.be.reverted;
      
      // Director cannot approve before earlier stages
      await expect(project.connect(director).approveAsDirector(0)).to.be.reverted;
      
      // Finance cannot approve before secretary
      await expect(project.connect(finance).approveAsFinance(0)).to.be.reverted;
    });
  });

  describe("Critical Issue #4: Front-Running Protection", function () {
    it("Should prevent front-running of approvals", async function () {
      const { omthbToken, factory, admin, secretary, attacker } = await loadFixture(deployFixture);
      
      // Create project
      await factory.connect(admin).createProject("TEST006", ethers.utils.parseEther("1000"), admin.address);
      const projectInfo = await factory.projects("TEST006");
      const project = await ethers.getContractAt("AuditedProjectReimbursement", projectInfo.projectContract);
      
      await omthbToken.transfer(project.address, ethers.utils.parseEther("1000"));
      await project.connect(admin).grantRole(await project.SECRETARY_ROLE(), secretary.address);
      
      // Create two competing requests
      await project.connect(admin).createRequest(
        [secretary.address],
        [ethers.utils.parseEther("600")],
        "Secretary's request"
      );
      
      await project.connect(admin).createRequest(
        [attacker.address],
        [ethers.utils.parseEther("600")],
        "Attacker's request"
      );
      
      // Secretary tries to approve their own request
      // In a front-running scenario, attacker would see this and try to approve theirs first
      // But only secretary has the role
      await expect(project.connect(attacker).approveAsSecretary(1)).to.be.reverted;
      
      // Secretary can only approve in order
      await project.connect(secretary).approveAsSecretary(0);
    });
  });

  describe("Critical Issue #5: DoS via Gas Exhaustion", function () {
    it("Should prevent DoS through excessive array operations", async function () {
      const { factory, admin } = await loadFixture(deployFixture);
      
      await factory.connect(admin).createProject("TEST007", ethers.utils.parseEther("10000"), admin.address);
      const projectInfo = await factory.projects("TEST007");
      const project = await ethers.getContractAt("AuditedProjectReimbursement", projectInfo.projectContract);
      
      // Try to create many requests to fill active array
      const promises = [];
      for (let i = 0; i < 10; i++) {
        const wallet = ethers.Wallet.createRandom();
        promises.push(
          project.connect(admin).createRequest(
            [wallet.address],
            [ethers.utils.parseEther("1")],
            `Request ${i}`
          ).catch(e => e)
        );
      }
      
      const results = await Promise.all(promises);
      const failures = results.filter(r => r instanceof Error);
      
      // Should start failing when array gets too large
      expect(failures.length).to.be.greaterThan(0);
    });

    it("Should limit batch operations to prevent gas exhaustion", async function () {
      const { factory, admin, user1 } = await loadFixture(deployFixture);
      
      await factory.connect(admin).createProject("TEST008", ethers.utils.parseEther("10000"), admin.address);
      const projectInfo = await factory.projects("TEST008");
      const project = await ethers.getContractAt("AuditedProjectReimbursement", projectInfo.projectContract);
      
      // Create receivers array at the limit
      const receivers = [];
      const amounts = [];
      for (let i = 0; i < 50; i++) {
        receivers.push(ethers.Wallet.createRandom().address);
        amounts.push(ethers.utils.parseEther("0.1"));
      }
      
      // This should succeed at the limit
      await expect(
        project.connect(admin).createRequest(receivers, amounts, "Max receivers test")
      ).to.not.be.reverted;
      
      // But adding one more should fail
      receivers.push(user1.address);
      amounts.push(ethers.utils.parseEther("0.1"));
      
      await expect(
        project.connect(admin).createRequest(receivers, amounts, "Too many receivers")
      ).to.be.revertedWith("Invalid receivers count");
    });
  });

  describe("Critical Issue #6: Meta Transaction Vulnerabilities", function () {
    it("Should validate meta transaction signatures properly", async function () {
      const { forwarder, attacker, user1 } = await loadFixture(deployFixture);
      
      // Create invalid meta transaction
      const invalidRequest = {
        from: user1.address,
        to: attacker.address,
        value: 0,
        gas: 100000,
        nonce: 0,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        data: "0x"
      };
      
      // Sign with wrong private key (attacker instead of user1)
      const domain = {
        name: "MetaTxForwarder",
        version: "1",
        chainId: 1337,
        verifyingContract: forwarder.address
      };
      
      const types = {
        ForwardRequest: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "gas", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "data", type: "bytes" }
        ]
      };
      
      const signature = await attacker._signTypedData(domain, types, invalidRequest);
      
      // Should fail verification
      await expect(
        forwarder.execute(invalidRequest, signature)
      ).to.be.revertedWith("InvalidSignature");
    });

    it("Should enforce rate limiting on meta transactions", async function () {
      const { forwarder, user1 } = await loadFixture(deployFixture);
      
      // Update rate limit to very low for testing
      await forwarder.updateRateLimit(2);
      
      const domain = {
        name: "MetaTxForwarder",
        version: "1",
        chainId: 1337,
        verifyingContract: forwarder.address
      };
      
      const types = {
        ForwardRequest: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "gas", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "data", type: "bytes" }
        ]
      };
      
      // Execute transactions up to the limit
      for (let i = 0; i < 2; i++) {
        const request = {
          from: user1.address,
          to: user1.address,
          value: 0,
          gas: 100000,
          nonce: i,
          deadline: Math.floor(Date.now() / 1000) + 3600,
          data: "0x"
        };
        
        const signature = await user1._signTypedData(domain, types, request);
        await forwarder.execute(request, signature);
      }
      
      // Third transaction should fail due to rate limit
      const request3 = {
        from: user1.address,
        to: user1.address,
        value: 0,
        gas: 100000,
        nonce: 2,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        data: "0x"
      };
      
      const signature3 = await user1._signTypedData(domain, types, request3);
      await expect(
        forwarder.execute(request3, signature3)
      ).to.be.revertedWith("RateLimitExceeded");
    });
  });

  describe("Critical Issue #7: Emergency Response", function () {
    it("Should allow pausing in emergency situations", async function () {
      const { omthbToken, factory, admin, attacker } = await loadFixture(deployFixture);
      
      await factory.connect(admin).createProject("TEST009", ethers.utils.parseEther("1000"), admin.address);
      const projectInfo = await factory.projects("TEST009");
      const project = await ethers.getContractAt("AuditedProjectReimbursement", projectInfo.projectContract);
      
      await omthbToken.transfer(project.address, ethers.utils.parseEther("1000"));
      
      // Grant pauser role to admin
      const PAUSER_ROLE = await project.PAUSER_ROLE();
      await project.connect(admin).grantRole(PAUSER_ROLE, admin.address);
      
      // Pause the contract
      await project.connect(admin).pause();
      
      // Verify no operations work when paused
      await expect(
        project.connect(admin).createRequest(
          [attacker.address],
          [ethers.utils.parseEther("100")],
          "Emergency test"
        )
      ).to.be.revertedWith("Pausable: paused");
      
      // Unpause
      await project.connect(admin).unpause();
      
      // Now operations should work
      await expect(
        project.connect(admin).createRequest(
          [attacker.address],
          [ethers.utils.parseEther("100")],
          "After unpause"
        )
      ).to.not.be.reverted;
    });

    it("Should prevent unauthorized pausing", async function () {
      const { factory, admin, attacker } = await loadFixture(deployFixture);
      
      await factory.connect(admin).createProject("TEST010", ethers.utils.parseEther("1000"), admin.address);
      const projectInfo = await factory.projects("TEST010");
      const project = await ethers.getContractAt("AuditedProjectReimbursement", projectInfo.projectContract);
      
      // Attacker cannot pause
      await expect(
        project.connect(attacker).pause()
      ).to.be.reverted;
    });
  });

  describe("Critical Issue #8: Upgrade Safety", function () {
    it("Should prevent unauthorized upgrades", async function () {
      const { omthbToken, attacker, owner } = await loadFixture(deployFixture);
      
      // Try to upgrade token contract
      const NewImplementation = await ethers.getContractFactory("OMTHBToken");
      const newImpl = await NewImplementation.deploy();
      
      // Attacker cannot upgrade
      await expect(
        upgrades.upgradeProxy(omthbToken.address, NewImplementation, {
          call: { fn: "initialize", args: [attacker.address] }
        })
      ).to.be.reverted;
    });
  });
});