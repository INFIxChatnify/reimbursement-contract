const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ProjectReimbursement Basic Test", function () {
  // Constants
  const SECRETARY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SECRETARY_ROLE"));
  const COMMITTEE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMMITTEE_ROLE"));
  const FINANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FINANCE_ROLE"));
  const DIRECTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DIRECTOR_ROLE"));
  const REQUESTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REQUESTER_ROLE"));
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  
  const MIN_REIMBURSEMENT_AMOUNT = ethers.parseEther("100");
  const MAX_REIMBURSEMENT_AMOUNT = ethers.parseEther("1000000");
  const REVEAL_WINDOW = 30 * 60; // 30 minutes
  
  async function deployFixture() {
    const [owner, admin, requester, secretary, committee1, committee2, committee3, committee4, finance, director] = await ethers.getSigners();
    
    // Deploy Mock OMTHB Token
    const MockOMTHB = await ethers.getContractFactory("MockOMTHB");
    const omthbToken = await MockOMTHB.deploy();
    await omthbToken.waitForDeployment();
    
    // Deploy ProjectReimbursement implementation
    const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursementOptimized");
    const projectImplementation = await ProjectReimbursement.deploy();
    await projectImplementation.waitForDeployment();
    
    // Deploy ProjectFactory
    const ProjectFactory = await ethers.getContractFactory("ProjectFactoryV3");
    const projectFactory = await ProjectFactory.deploy(
      await projectImplementation.getAddress(),
      await omthbToken.getAddress(),
      ethers.ZeroAddress, // Meta tx forwarder
      owner.address
    );
    await projectFactory.waitForDeployment();
    
    // Grant PROJECT_CREATOR_ROLE
    const PROJECT_CREATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROJECT_CREATOR_ROLE"));
    await projectFactory.grantRole(PROJECT_CREATOR_ROLE, owner.address);
    
    // Create a project
    const projectId = "TEST-PROJECT-001";
    const initialBudget = ethers.parseEther("100000");
    const tx = await projectFactory.createProject(projectId, admin.address);
    const receipt = await tx.wait();
    
    // Get project address from events
    const projectCreatedEvent = receipt.logs.find(log => {
      try {
        const parsed = projectFactory.interface.parseLog(log);
        return parsed.name === "ProjectCreated";
      } catch (e) {
        return false;
      }
    });
    
    const projectAddress = projectCreatedEvent.args.contractAddr;
    const project = await ethers.getContractAt("ProjectReimbursementOptimized", projectAddress);
    
    // Setup roles
    await project.connect(admin).grantRoleDirect(REQUESTER_ROLE, requester.address);
    await project.connect(admin).grantRoleDirect(SECRETARY_ROLE, secretary.address);
    await project.connect(admin).grantRoleDirect(COMMITTEE_ROLE, committee1.address);
    await project.connect(admin).grantRoleDirect(COMMITTEE_ROLE, committee2.address);
    await project.connect(admin).grantRoleDirect(COMMITTEE_ROLE, committee3.address);
    await project.connect(admin).grantRoleDirect(COMMITTEE_ROLE, committee4.address);
    await project.connect(admin).grantRoleDirect(FINANCE_ROLE, finance.address);
    await project.connect(admin).grantRoleDirect(DIRECTOR_ROLE, director.address);
    
    // Mint tokens and transfer to project
    await omthbToken.mint(owner.address, ethers.parseEther("1000000"));
    await omthbToken.transfer(projectAddress, initialBudget);
    
    // Update project budget
    await project.connect(admin).updateBudget(initialBudget);
    
    return {
      omthbToken,
      projectFactory,
      project,
      projectId,
      owner,
      admin,
      requester,
      secretary,
      committee1,
      committee2,
      committee3,
      committee4,
      finance,
      director
    };
  }
  
  describe("Basic Functionality", function () {
    it("Should create project successfully", async function () {
      const { project, projectId, omthbToken } = await loadFixture(deployFixture);
      
      expect(await project.projectId()).to.equal(projectId);
      expect(await project.projectBudget()).to.equal(ethers.parseEther("100000")); // Updated budget
      
      // Check contract has tokens
      const balance = await omthbToken.balanceOf(await project.getAddress());
      expect(balance).to.equal(ethers.parseEther("100000"));
    });
    
    it("Should create a reimbursement request", async function () {
      const { project, requester } = await loadFixture(deployFixture);
      
      const recipient = requester.address;
      const amount = ethers.parseEther("1000");
      const description = "Test reimbursement";
      const documentHash = "QmTest123";
      
      await expect(
        project.connect(requester).createRequest(
          recipient,
          amount,
          description,
          documentHash
        )
      ).to.emit(project, "RequestCreated")
        .withArgs(0, requester.address, [recipient], [amount], amount, description, ethers.ZeroAddress);
      
      // Check request was created
      const request = await project.getRequest(0);
      expect(request.requester).to.equal(requester.address);
      expect(request.totalAmount).to.equal(amount);
      expect(request.status).to.equal(0); // Pending
    });
    
    it("Should complete approval flow", async function () {
      const { project, requester, secretary, committee1, finance, committee2, committee3, committee4, director } = await loadFixture(deployFixture);
      
      // Create request
      const amount = ethers.parseEther("1000");
      await project.connect(requester).createRequest(
        requester.address,
        amount,
        "Test reimbursement",
        "QmTest"
      );
      
      const requestId = 0;
      const nonce = ethers.randomBytes(32);
      const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
      
      // Secretary approval
      let commitment = ethers.keccak256(ethers.solidityPacked(
        ["address", "uint256", "uint256", "bytes32"],
        [secretary.address, requestId, chainId, nonce]
      ));
      await project.connect(secretary).commitApproval(requestId, commitment);
      await time.increase(REVEAL_WINDOW + 1);
      await project.connect(secretary).approveBySecretary(requestId, ethers.toBigInt(nonce));
      
      // Committee approval
      commitment = ethers.keccak256(ethers.solidityPacked(
        ["address", "uint256", "uint256", "bytes32"],
        [committee1.address, requestId, chainId, nonce]
      ));
      await project.connect(committee1).commitApproval(requestId, commitment);
      await time.increase(REVEAL_WINDOW + 1);
      await project.connect(committee1).approveByCommittee(requestId, ethers.toBigInt(nonce));
      
      // Finance approval
      commitment = ethers.keccak256(ethers.solidityPacked(
        ["address", "uint256", "uint256", "bytes32"],
        [finance.address, requestId, chainId, nonce]
      ));
      await project.connect(finance).commitApproval(requestId, commitment);
      await time.increase(REVEAL_WINDOW + 1);
      await project.connect(finance).approveByFinance(requestId, ethers.toBigInt(nonce));
      
      // Additional committee approvals
      for (const committee of [committee2, committee3, committee4]) {
        commitment = ethers.keccak256(ethers.solidityPacked(
          ["address", "uint256", "uint256", "bytes32"],
          [committee.address, requestId, chainId, nonce]
        ));
        await project.connect(committee).commitApproval(requestId, commitment);
        await time.increase(REVEAL_WINDOW + 1);
        await project.connect(committee).approveByCommitteeAdditional(requestId, ethers.toBigInt(nonce));
      }
      
      // Director approval (auto-distributes)
      commitment = ethers.keccak256(ethers.solidityPacked(
        ["address", "uint256", "uint256", "bytes32"],
        [director.address, requestId, chainId, nonce]
      ));
      await project.connect(director).commitApproval(requestId, commitment);
      await time.increase(REVEAL_WINDOW + 1);
      
      await expect(project.connect(director).approveByDirector(requestId, ethers.toBigInt(nonce)))
        .to.emit(project, "FundsDistributed")
        .withArgs(requestId, [requester.address], [amount], amount, ethers.ZeroAddress);
      
      // Check request status
      const request = await project.getRequest(requestId);
      expect(request.status).to.equal(5); // Distributed
    });
  });
  
  describe("Security Features", function () {
    it("Should enforce role-based access control", async function () {
      const { project, requester, secretary } = await loadFixture(deployFixture);
      
      // Non-requester cannot create request
      await expect(
        project.connect(secretary).createRequest(
          secretary.address,
          ethers.parseEther("100"),
          "Test",
          "QmTest"
        )
      ).to.be.revertedWithCustomError(project, "AccessControlUnauthorizedAccount");
    });
    
    it("Should validate request inputs", async function () {
      const { project, requester } = await loadFixture(deployFixture);
      
      // Zero amount
      await expect(
        project.connect(requester).createRequest(
          requester.address,
          0,
          "Test",
          "QmTest"
        )
      ).to.be.revertedWithCustomError(project, "InvalidAmount");
      
      // Zero address
      await expect(
        project.connect(requester).createRequest(
          ethers.ZeroAddress,
          ethers.parseEther("100"),
          "Test",
          "QmTest"
        )
      ).to.be.revertedWithCustomError(project, "ZeroAddress");
      
      // Empty description
      await expect(
        project.connect(requester).createRequest(
          requester.address,
          ethers.parseEther("100"),
          "",
          "QmTest"
        )
      ).to.be.revertedWithCustomError(project, "InvalidDescription");
    });
    
    it("Should handle multi-recipient requests", async function () {
      const { project, requester, secretary } = await loadFixture(deployFixture);
      
      const recipients = [requester.address, secretary.address];
      const amounts = [ethers.parseEther("300"), ethers.parseEther("200")];
      const totalAmount = amounts[0] + amounts[1];
      
      await expect(
        project.connect(requester).createRequestMultiple(
          recipients,
          amounts,
          "Multi-recipient test",
          "QmMulti",
          ethers.ZeroAddress
        )
      ).to.emit(project, "RequestCreated")
        .withArgs(0, requester.address, recipients, amounts, totalAmount, "Multi-recipient test", ethers.ZeroAddress);
    });
  });
});
