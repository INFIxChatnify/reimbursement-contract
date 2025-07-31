const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Integration Workflow Comprehensive Test Suite", function () {
  // Role constants
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  const BLACKLISTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BLACKLISTER_ROLE"));
  const SECRETARY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SECRETARY_ROLE"));
  const COMMITTEE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMMITTEE_ROLE"));
  const FINANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FINANCE_ROLE"));
  const DIRECTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DIRECTOR_ROLE"));
  const REQUESTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REQUESTER_ROLE"));

  async function deployFullSystemFixture() {
    const [
      owner,
      minter,
      pauser,
      blacklister,
      secretary,
      committee1,
      committee2,
      committee3,
      finance,
      director,
      requester1,
      requester2,
      receiver1,
      receiver2,
      receiver3,
      auditor
    ] = await ethers.getSigners();

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

    // Deploy Meta Transaction Forwarder
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const forwarder = await MetaTxForwarder.deploy();
    await forwarder.initialize(owner.address);

    // Setup token roles
    await token.connect(owner).grantRole(MINTER_ROLE, minter.address);
    await token.connect(owner).grantRole(MINTER_ROLE, await projectFactory.getAddress());
    await token.connect(owner).grantRole(PAUSER_ROLE, pauser.address);
    await token.connect(owner).grantRole(BLACKLISTER_ROLE, blacklister.address);

    return {
      token,
      auditAnchor,
      projectFactory,
      forwarder,
      owner,
      minter,
      pauser,
      blacklister,
      secretary,
      committee1,
      committee2,
      committee3,
      finance,
      director,
      requester1,
      requester2,
      receiver1,
      receiver2,
      receiver3,
      auditor
    };
  }

  describe("1. Complete Reimbursement Workflow", function () {
    it("Should execute full reimbursement cycle from request to payment", async function () {
      const {
        token,
        projectFactory,
        owner,
        secretary,
        committee1,
        finance,
        director,
        requester1,
        receiver1,
        receiver2
      } = await loadFixture(deployFullSystemFixture);

      // Step 1: Create project
      const projectBudget = ethers.parseEther("10000");
      const createTx = await projectFactory.connect(owner).createProject("INTEG-001", projectBudget);
      const receipt = await createTx.wait();
      const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);

      // Step 2: Setup roles
      await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
      await project.connect(owner).grantRole(COMMITTEE_ROLE, committee1.address);
      await project.connect(owner).grantRole(FINANCE_ROLE, finance.address);
      await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);
      await project.connect(owner).grantRole(REQUESTER_ROLE, requester1.address);

      // Step 3: Verify initial state
      expect(await project.projectBudget()).to.equal(projectBudget);
      expect(await token.balanceOf(projectAddress)).to.equal(projectBudget);

      // Step 4: Create reimbursement request
      const receivers = [receiver1.address, receiver2.address];
      const amounts = [ethers.parseEther("500"), ethers.parseEther("300")];
      const totalAmount = amounts[0] + amounts[1];

      await expect(project.connect(requester1).createReimbursementRequest(
        receivers,
        amounts,
        "Integration test reimbursement",
        "QmIntegrationTestHash123"
      )).to.emit(project, "ReimbursementRequested")
        .withArgs(1, requester1.address, totalAmount, 2);

      // Step 5: Verify request details
      const request = await project.requests(1);
      expect(request.requester).to.equal(requester1.address);
      expect(request.status).to.equal(0); // Pending

      // Step 6: Secretary approval
      await expect(project.connect(secretary).approveAsSecretary(1))
        .to.emit(project, "RequestApproved")
        .withArgs(1, 1, secretary.address); // Status 1 = SecretaryApproved

      // Step 7: Committee approval
      await expect(project.connect(committee1).approveAsCommittee(1))
        .to.emit(project, "RequestApproved")
        .withArgs(1, 2, committee1.address); // Status 2 = CommitteeApproved

      // Step 8: Finance approval
      await expect(project.connect(finance).approveAsFinance(1))
        .to.emit(project, "RequestApproved")
        .withArgs(1, 3, finance.address); // Status 3 = FinanceApproved

      // Step 9: Director approval
      await expect(project.connect(director).approveAsDirector(1))
        .to.emit(project, "RequestApproved")
        .withArgs(1, 4, director.address); // Status 4 = DirectorApproved

      // Step 10: Distribute payment
      await expect(project.connect(finance).distributePayment(1))
        .to.emit(project, "PaymentDistributed")
        .withArgs(1, totalAmount);

      // Step 11: Verify final state
      const finalRequest = await project.requests(1);
      expect(finalRequest.status).to.equal(5); // Distributed

      expect(await token.balanceOf(receiver1.address)).to.equal(amounts[0]);
      expect(await token.balanceOf(receiver2.address)).to.equal(amounts[1]);
      expect(await token.balanceOf(projectAddress)).to.equal(projectBudget - totalAmount);
      expect(await project.totalDistributed()).to.equal(totalAmount);
    });

    it("Should handle multiple concurrent requests", async function () {
      const {
        token,
        projectFactory,
        owner,
        secretary,
        committee1,
        finance,
        director,
        requester1,
        requester2,
        receiver1,
        receiver2,
        receiver3
      } = await loadFixture(deployFullSystemFixture);

      // Create project
      const projectBudget = ethers.parseEther("20000");
      const createTx = await projectFactory.connect(owner).createProject("MULTI-001", projectBudget);
      const receipt = await createTx.wait();
      const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);

      // Setup roles
      await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
      await project.connect(owner).grantRole(COMMITTEE_ROLE, committee1.address);
      await project.connect(owner).grantRole(FINANCE_ROLE, finance.address);
      await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);
      await project.connect(owner).grantRole(REQUESTER_ROLE, requester1.address);
      await project.connect(owner).grantRole(REQUESTER_ROLE, requester2.address);

      // Create multiple requests
      await project.connect(requester1).createReimbursementRequest(
        [receiver1.address],
        [ethers.parseEther("1000")],
        "Request 1",
        "QmRequest1"
      );

      await project.connect(requester2).createReimbursementRequest(
        [receiver2.address, receiver3.address],
        [ethers.parseEther("500"), ethers.parseEther("500")],
        "Request 2",
        "QmRequest2"
      );

      await project.connect(requester1).createReimbursementRequest(
        [receiver1.address, receiver2.address, receiver3.address],
        [ethers.parseEther("300"), ethers.parseEther("300"), ethers.parseEther("400")],
        "Request 3",
        "QmRequest3"
      );

      // Process requests in different order
      // Request 2 first
      await project.connect(secretary).approveAsSecretary(2);
      await project.connect(committee1).approveAsCommittee(2);
      await project.connect(finance).approveAsFinance(2);
      await project.connect(director).approveAsDirector(2);
      await project.connect(finance).distributePayment(2);

      // Request 1
      await project.connect(secretary).approveAsSecretary(1);
      await project.connect(committee1).approveAsCommittee(1);
      await project.connect(finance).approveAsFinance(1);
      await project.connect(director).approveAsDirector(1);
      await project.connect(finance).distributePayment(1);

      // Verify intermediate state
      expect(await project.totalDistributed()).to.equal(ethers.parseEther("2000"));
      expect(await token.balanceOf(receiver1.address)).to.equal(ethers.parseEther("1000"));
      expect(await token.balanceOf(receiver2.address)).to.equal(ethers.parseEther("500"));
      expect(await token.balanceOf(receiver3.address)).to.equal(ethers.parseEther("500"));

      // Request 3
      await project.connect(secretary).approveAsSecretary(3);
      await project.connect(committee1).approveAsCommittee(3);
      await project.connect(finance).approveAsFinance(3);
      await project.connect(director).approveAsDirector(3);
      await project.connect(finance).distributePayment(3);

      // Verify final state
      expect(await project.totalDistributed()).to.equal(ethers.parseEther("3000"));
      expect(await token.balanceOf(receiver1.address)).to.equal(ethers.parseEther("1300"));
      expect(await token.balanceOf(receiver2.address)).to.equal(ethers.parseEther("800"));
      expect(await token.balanceOf(receiver3.address)).to.equal(ethers.parseEther("900"));
    });
  });

  describe("2. Multi-Project Integration", function () {
    it("Should manage multiple projects independently", async function () {
      const {
        token,
        projectFactory,
        owner,
        secretary,
        committee1,
        finance,
        director,
        requester1,
        receiver1
      } = await loadFixture(deployFullSystemFixture);

      // Create multiple projects
      const projects = [];
      const budgets = [
        ethers.parseEther("5000"),
        ethers.parseEther("10000"),
        ethers.parseEther("7500")
      ];

      for (let i = 0; i < 3; i++) {
        const tx = await projectFactory.connect(owner).createProject(`PROJ-${i}`, budgets[i]);
        const receipt = await tx.wait();
        const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
        
        const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
        const project = ProjectReimbursement.attach(projectAddress);
        
        // Setup roles for each project
        await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee1.address);
        await project.connect(owner).grantRole(FINANCE_ROLE, finance.address);
        await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);
        await project.connect(owner).grantRole(REQUESTER_ROLE, requester1.address);
        
        projects.push(project);
      }

      // Verify each project has correct budget
      for (let i = 0; i < 3; i++) {
        expect(await token.balanceOf(await projects[i].getAddress())).to.equal(budgets[i]);
      }

      // Create requests in each project
      for (let i = 0; i < 3; i++) {
        await projects[i].connect(requester1).createReimbursementRequest(
          [receiver1.address],
          [ethers.parseEther("100")],
          `Request for project ${i}`,
          `QmProject${i}`
        );
      }

      // Approve and distribute from project 1
      await projects[1].connect(secretary).approveAsSecretary(1);
      await projects[1].connect(committee1).approveAsCommittee(1);
      await projects[1].connect(finance).approveAsFinance(1);
      await projects[1].connect(director).approveAsDirector(1);
      await projects[1].connect(finance).distributePayment(1);

      // Verify only project 1 distributed funds
      expect(await projects[0].totalDistributed()).to.equal(0);
      expect(await projects[1].totalDistributed()).to.equal(ethers.parseEther("100"));
      expect(await projects[2].totalDistributed()).to.equal(0);
    });
  });

  describe("3. Emergency Closure Integration", function () {
    it("Should execute complete emergency closure workflow", async function () {
      const {
        token,
        projectFactory,
        owner,
        secretary,
        committee1,
        committee2,
        committee3,
        finance,
        director,
        requester1,
        receiver1
      } = await loadFixture(deployFullSystemFixture);

      // Create and setup project
      const projectBudget = ethers.parseEther("15000");
      const createTx = await projectFactory.connect(owner).createProject("EMRG-001", projectBudget);
      const receipt = await createTx.wait();
      const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);

      // Setup all roles
      await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
      await project.connect(owner).grantRole(COMMITTEE_ROLE, committee1.address);
      await project.connect(owner).grantRole(COMMITTEE_ROLE, committee2.address);
      await project.connect(owner).grantRole(COMMITTEE_ROLE, committee3.address);
      await project.connect(owner).grantRole(FINANCE_ROLE, finance.address);
      await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);
      await project.connect(owner).grantRole(REQUESTER_ROLE, requester1.address);

      // Create and partially process a request
      await project.connect(requester1).createReimbursementRequest(
        [receiver1.address],
        [ethers.parseEther("1000")],
        "Pending request",
        "QmPending"
      );

      await project.connect(secretary).approveAsSecretary(1);
      await project.connect(committee1).approveAsCommittee(1);

      // Initiate emergency closure
      const returnAddress = owner.address;
      await expect(project.connect(director).initiateEmergencyClosure(
        returnAddress,
        "Critical security issue detected"
      )).to.emit(project, "EmergencyClosureInitiated")
        .withArgs(1, director.address, returnAddress);

      // Get initial balance
      const initialReturnBalance = await token.balanceOf(returnAddress);

      // Committee approvals (need 3)
      await expect(project.connect(committee1).approveEmergencyClosure(1))
        .to.emit(project, "EmergencyClosureApproved")
        .withArgs(1, committee1.address, 1);

      await expect(project.connect(committee2).approveEmergencyClosure(1))
        .to.emit(project, "EmergencyClosureApproved")
        .withArgs(1, committee2.address, 2);

      await expect(project.connect(committee3).approveEmergencyClosure(1))
        .to.emit(project, "EmergencyClosureApproved")
        .withArgs(1, committee3.address, 3);

      // Director final approval
      await expect(project.connect(director).approveEmergencyClosureAsDirector(1))
        .to.emit(project, "EmergencyClosureFullyApproved")
        .withArgs(1, director.address);

      // Execute closure
      await expect(project.connect(director).executeEmergencyClosure(1))
        .to.emit(project, "EmergencyClosureExecuted")
        .withArgs(1, projectBudget);

      // Verify final state
      expect(await token.balanceOf(projectAddress)).to.equal(0);
      expect(await token.balanceOf(returnAddress)).to.equal(initialReturnBalance + projectBudget);
      
      // Verify project is paused
      await expect(project.connect(requester1).createReimbursementRequest(
        [receiver1.address],
        [ethers.parseEther("100")],
        "Should fail",
        "QmFail"
      )).to.be.revertedWithCustomError(project, "EnforcedPause");
    });
  });

  describe("4. Audit Trail Integration", function () {
    it("Should maintain complete audit trail across workflow", async function () {
      const {
        token,
        auditAnchor,
        projectFactory,
        owner,
        secretary,
        committee1,
        finance,
        director,
        requester1,
        receiver1
      } = await loadFixture(deployFullSystemFixture);

      // Create audited project (if AuditedProjectReimbursement is available)
      const projectBudget = ethers.parseEther("5000");
      const createTx = await projectFactory.connect(owner).createProject("AUDIT-001", projectBudget);
      const receipt = await createTx.wait();
      const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);

      // Setup roles
      await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
      await project.connect(owner).grantRole(COMMITTEE_ROLE, committee1.address);
      await project.connect(owner).grantRole(FINANCE_ROLE, finance.address);
      await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);
      await project.connect(owner).grantRole(REQUESTER_ROLE, requester1.address);

      // Create request and track events
      const requestTx = await project.connect(requester1).createReimbursementRequest(
        [receiver1.address],
        [ethers.parseEther("500")],
        "Audited request",
        "QmAuditHash"
      );
      await requestTx.wait();

      // Process through all approvals
      const approvalTxs = [
        await project.connect(secretary).approveAsSecretary(1),
        await project.connect(committee1).approveAsCommittee(1),
        await project.connect(finance).approveAsFinance(1),
        await project.connect(director).approveAsDirector(1)
      ];

      // Distribute payment
      const distributeTx = await project.connect(finance).distributePayment(1);
      await distributeTx.wait();

      // Verify audit anchor received all events
      const auditHash = await auditAnchor.generateAuditHash(
        await project.getAddress(),
        "PaymentDistributed",
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "uint256"],
          [1, ethers.parseEther("500")]
        )
      );

      // Check if audit was recorded
      const auditRecord = await auditAnchor.getAuditRecord(auditHash);
      expect(auditRecord.timestamp).to.be.gt(0);
    });
  });

  describe("5. Gas Usage Integration", function () {
    it("Should track gas usage across complete workflow", async function () {
      const {
        token,
        projectFactory,
        owner,
        secretary,
        committee1,
        finance,
        director,
        requester1,
        receiver1,
        receiver2,
        receiver3
      } = await loadFixture(deployFullSystemFixture);

      // Create project
      const createTx = await projectFactory.connect(owner).createProject("GAS-001", ethers.parseEther("10000"));
      const createReceipt = await createTx.wait();
      console.log(`Project creation gas: ${createReceipt.gasUsed}`);
      
      const projectAddress = createReceipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);

      // Setup roles (batch if possible)
      const roleSetupGas = [];
      const roles = [
        { role: SECRETARY_ROLE, account: secretary.address },
        { role: COMMITTEE_ROLE, account: committee1.address },
        { role: FINANCE_ROLE, account: finance.address },
        { role: DIRECTOR_ROLE, account: director.address },
        { role: REQUESTER_ROLE, account: requester1.address }
      ];

      for (const { role, account } of roles) {
        const tx = await project.connect(owner).grantRole(role, account);
        const receipt = await tx.wait();
        roleSetupGas.push(receipt.gasUsed);
      }
      console.log(`Total role setup gas: ${roleSetupGas.reduce((a, b) => a + b, 0n)}`);

      // Create request with multiple receivers
      const requestTx = await project.connect(requester1).createReimbursementRequest(
        [receiver1.address, receiver2.address, receiver3.address],
        [ethers.parseEther("100"), ethers.parseEther("200"), ethers.parseEther("300")],
        "Gas test request",
        "QmGasTest"
      );
      const requestReceipt = await requestTx.wait();
      console.log(`Request creation gas (3 receivers): ${requestReceipt.gasUsed}`);

      // Approval workflow gas
      const approvalGas = [];
      const approvals = [
        { fn: "approveAsSecretary", signer: secretary },
        { fn: "approveAsCommittee", signer: committee1 },
        { fn: "approveAsFinance", signer: finance },
        { fn: "approveAsDirector", signer: director }
      ];

      for (const { fn, signer } of approvals) {
        const tx = await project.connect(signer)[fn](1);
        const receipt = await tx.wait();
        approvalGas.push(receipt.gasUsed);
        console.log(`${fn} gas: ${receipt.gasUsed}`);
      }

      // Distribution gas
      const distributeTx = await project.connect(finance).distributePayment(1);
      const distributeReceipt = await distributeTx.wait();
      console.log(`Distribution gas (3 receivers): ${distributeReceipt.gasUsed}`);

      // Total workflow gas
      const totalGas = createReceipt.gasUsed + 
        roleSetupGas.reduce((a, b) => a + b, 0n) +
        requestReceipt.gasUsed +
        approvalGas.reduce((a, b) => a + b, 0n) +
        distributeReceipt.gasUsed;
      
      console.log(`Total workflow gas: ${totalGas}`);
      
      // Verify gas is within reasonable limits
      expect(totalGas).to.be.lt(ethers.parseUnits("2000000", "wei")); // 2M gas total
    });
  });

  describe("6. Error Recovery Integration", function () {
    it("Should handle and recover from various error conditions", async function () {
      const {
        token,
        projectFactory,
        owner,
        pauser,
        blacklister,
        secretary,
        committee1,
        finance,
        director,
        requester1,
        receiver1
      } = await loadFixture(deployFullSystemFixture);

      // Create project
      const createTx = await projectFactory.connect(owner).createProject("ERROR-001", ethers.parseEther("5000"));
      const receipt = await createTx.wait();
      const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);

      // Setup roles
      await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
      await project.connect(owner).grantRole(COMMITTEE_ROLE, committee1.address);
      await project.connect(owner).grantRole(FINANCE_ROLE, finance.address);
      await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);
      await project.connect(owner).grantRole(REQUESTER_ROLE, requester1.address);

      // Test 1: Blacklisted receiver
      await token.connect(blacklister).blacklist(receiver1.address);
      
      await expect(project.connect(requester1).createReimbursementRequest(
        [receiver1.address],
        [ethers.parseEther("100")],
        "Blacklisted receiver",
        "QmBlacklisted"
      )).to.be.revertedWith("Recipient is blacklisted");

      // Remove from blacklist
      await token.connect(blacklister).unblacklist(receiver1.address);

      // Should work now
      await expect(project.connect(requester1).createReimbursementRequest(
        [receiver1.address],
        [ethers.parseEther("100")],
        "Recovered request",
        "QmRecovered"
      )).to.not.be.reverted;

      // Test 2: Paused token during distribution
      await project.connect(secretary).approveAsSecretary(1);
      await project.connect(committee1).approveAsCommittee(1);
      await project.connect(finance).approveAsFinance(1);
      await project.connect(director).approveAsDirector(1);

      // Pause token
      await token.connect(pauser).pause();

      // Distribution should fail
      await expect(project.connect(finance).distributePayment(1))
        .to.be.revertedWithCustomError(token, "EnforcedPause");

      // Unpause and retry
      await token.connect(pauser).unpause();
      
      await expect(project.connect(finance).distributePayment(1))
        .to.emit(project, "PaymentDistributed");

      // Test 3: Cancel request workflow
      await project.connect(requester1).createReimbursementRequest(
        [receiver1.address],
        [ethers.parseEther("200")],
        "To be cancelled",
        "QmCancel"
      );

      await project.connect(secretary).approveAsSecretary(2);
      
      // Cancel request
      await expect(project.connect(requester1).cancelRequest(2))
        .to.emit(project, "RequestCancelled")
        .withArgs(2, requester1.address);

      // Further approvals should fail
      await expect(project.connect(committee1).approveAsCommittee(2))
        .to.be.revertedWith("Request is not active");
    });
  });

  describe("7. Meta-Transaction Integration", function () {
    it("Should process requests via meta-transactions", async function () {
      const {
        token,
        projectFactory,
        forwarder,
        owner,
        secretary,
        committee1,
        finance,
        director,
        requester1,
        receiver1
      } = await loadFixture(deployFullSystemFixture);

      // Create project
      const createTx = await projectFactory.connect(owner).createProject("META-001", ethers.parseEther("5000"));
      const receipt = await createTx.wait();
      const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);

      // Setup roles
      await project.connect(owner).grantRole(REQUESTER_ROLE, requester1.address);
      await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
      await project.connect(owner).grantRole(COMMITTEE_ROLE, committee1.address);
      await project.connect(owner).grantRole(FINANCE_ROLE, finance.address);
      await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);

      // Whitelist project in forwarder
      await forwarder.connect(owner).updateWhitelist(projectAddress, true);

      // Create meta-transaction for request creation
      const requestData = project.interface.encodeFunctionData("createReimbursementRequest", [
        [receiver1.address],
        [ethers.parseEther("100")],
        "Meta-tx request",
        "QmMetaTx"
      ]);

      // Sign meta-transaction
      const domain = {
        name: "MetaTxForwarder",
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await forwarder.getAddress()
      };

      const types = {
        ForwardRequest: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "gas", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "data", type: "bytes" }
        ]
      };

      const nonce = await forwarder.nonces(requester1.address);
      const forwardRequest = {
        from: requester1.address,
        to: projectAddress,
        value: 0,
        gas: 300000,
        nonce: nonce,
        data: requestData
      };

      const signature = await requester1.signTypedData(domain, types, forwardRequest);

      // Execute meta-transaction
      await expect(forwarder.connect(owner).execute(forwardRequest, signature))
        .to.emit(project, "ReimbursementRequested");

      // Verify request was created
      const request = await project.requests(1);
      expect(request.requester).to.equal(requester1.address);
    });
  });

  describe("8. Complex Scenario Integration", function () {
    it("Should handle complex multi-step scenario with all features", async function () {
      const {
        token,
        auditAnchor,
        projectFactory,
        forwarder,
        owner,
        minter,
        pauser,
        blacklister,
        secretary,
        committee1,
        committee2,
        committee3,
        finance,
        director,
        requester1,
        requester2,
        receiver1,
        receiver2,
        receiver3,
        auditor
      } = await loadFixture(deployFullSystemFixture);

      // Create multiple projects
      const projects = [];
      const projectIds = ["COMPLEX-001", "COMPLEX-002", "COMPLEX-003"];
      const budgets = [ethers.parseEther("20000"), ethers.parseEther("15000"), ethers.parseEther("10000")];

      for (let i = 0; i < 3; i++) {
        const tx = await projectFactory.connect(owner).createProject(projectIds[i], budgets[i]);
        const receipt = await tx.wait();
        const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
        
        const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
        const project = ProjectReimbursement.attach(projectAddress);
        
        // Setup comprehensive roles
        await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee1.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee2.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee3.address);
        await project.connect(owner).grantRole(FINANCE_ROLE, finance.address);
        await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);
        await project.connect(owner).grantRole(REQUESTER_ROLE, requester1.address);
        await project.connect(owner).grantRole(REQUESTER_ROLE, requester2.address);
        
        projects.push(project);
      }

      // Scenario 1: Normal workflow in Project 1
      await projects[0].connect(requester1).createReimbursementRequest(
        [receiver1.address, receiver2.address],
        [ethers.parseEther("1000"), ethers.parseEther("2000")],
        "Normal payment",
        "QmNormal"
      );

      // Scenario 2: Emergency closure initiated in Project 2
      await projects[1].connect(director).initiateEmergencyClosure(
        director.address,
        "Budget reallocation needed"
      );

      // Scenario 3: Multiple requests in Project 3
      for (let i = 0; i < 3; i++) {
        await projects[2].connect(requester1).createReimbursementRequest(
          [receiver1.address],
          [ethers.parseEther("500")],
          `Batch request ${i + 1}`,
          `QmBatch${i + 1}`
        );
      }

      // Process Project 1 request
      await projects[0].connect(secretary).approveAsSecretary(1);
      await projects[0].connect(committee1).approveAsCommittee(1);
      await projects[0].connect(finance).approveAsFinance(1);
      await projects[0].connect(director).approveAsDirector(1);
      await projects[0].connect(finance).distributePayment(1);

      // Process emergency closure in Project 2
      await projects[1].connect(committee1).approveEmergencyClosure(1);
      await projects[1].connect(committee2).approveEmergencyClosure(1);
      await projects[1].connect(committee3).approveEmergencyClosure(1);
      await projects[1].connect(director).approveEmergencyClosureAsDirector(1);
      await projects[1].connect(director).executeEmergencyClosure(1);

      // Blacklist receiver3 during Project 3 processing
      await token.connect(blacklister).blacklist(receiver3.address);

      // Try to create request with blacklisted receiver
      await expect(projects[2].connect(requester2).createReimbursementRequest(
        [receiver3.address],
        [ethers.parseEther("1000")],
        "Should fail",
        "QmFail"
      )).to.be.revertedWith("Recipient is blacklisted");

      // Process one request from Project 3
      await projects[2].connect(secretary).approveAsSecretary(1);
      await projects[2].connect(committee1).approveAsCommittee(1);
      await projects[2].connect(finance).approveAsFinance(1);
      await projects[2].connect(director).approveAsDirector(1);

      // Pause token before distribution
      await token.connect(pauser).pause();
      
      await expect(projects[2].connect(finance).distributePayment(1))
        .to.be.revertedWithCustomError(token, "EnforcedPause");

      // Unpause and complete
      await token.connect(pauser).unpause();
      await projects[2].connect(finance).distributePayment(1);

      // Final verification
      expect(await projects[0].totalDistributed()).to.equal(ethers.parseEther("3000"));
      expect(await projects[1].totalDistributed()).to.equal(0); // Emergency closed
      expect(await projects[2].totalDistributed()).to.equal(ethers.parseEther("500"));

      // Verify token balances
      expect(await token.balanceOf(receiver1.address)).to.equal(ethers.parseEther("1500"));
      expect(await token.balanceOf(receiver2.address)).to.equal(ethers.parseEther("2000"));
      expect(await token.balanceOf(director.address)).to.equal(budgets[1]); // Emergency return

      // Verify projects state
      const project2Paused = await projects[1].paused();
      expect(project2Paused).to.be.true;
    });
  });
});