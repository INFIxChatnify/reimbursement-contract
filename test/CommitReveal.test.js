const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Commit-Reveal Mechanism Tests", function () {
  async function deployFixture() {
    const [owner, admin, secretary, committee1, committee2, finance, director, attacker, user1] = await ethers.getSigners();

    // Deploy OMTHB Token
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const omthbToken = await upgrades.deployProxy(OMTHBToken, [owner.address], {
      initializer: 'initialize',
      kind: 'uups'
    });
    await omthbToken.waitForDeployment();

    // Mint tokens
    await omthbToken.mint(owner.address, ethers.parseEther("1000000"));

    // Deploy ProjectReimbursement implementation
    const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
    const projectImplementation = await ProjectReimbursement.deploy();
    await projectImplementation.waitForDeployment();

    // Deploy MetaTxForwarder (required by ProjectFactory)
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const forwarder = await MetaTxForwarder.deploy();
    await forwarder.waitForDeployment();

    // Deploy ProjectFactory
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const factory = await ProjectFactory.deploy(
      await projectImplementation.getAddress(),
      await omthbToken.getAddress(),
      await forwarder.getAddress(),
      admin.address
    );
    await factory.waitForDeployment();

    // Setup roles
    await factory.connect(admin).grantRole(await factory.PROJECT_CREATOR_ROLE(), owner.address);

    // Create a test project
    const projectTx = await factory.connect(owner).createProject("TEST-001", ethers.parseEther("10000"), admin.address);
    const receipt = await projectTx.wait();
    const projectCreatedEvent = receipt.logs.find(log => {
      try {
        const parsed = factory.interface.parseLog(log);
        return parsed.name === "ProjectCreated";
      } catch (e) {
        return false;
      }
    });
    const parsedEvent = factory.interface.parseLog(projectCreatedEvent);
    const projectAddress = parsedEvent.args.projectContract;
    const project = await ethers.getContractAt("ProjectReimbursement", projectAddress);

    // Setup project roles
    await project.connect(admin).grantRole(await project.SECRETARY_ROLE(), secretary.address);
    await project.connect(admin).grantRole(await project.COMMITTEE_ROLE(), committee1.address);
    await project.connect(admin).grantRole(await project.COMMITTEE_ROLE(), committee2.address);
    await project.connect(admin).grantRole(await project.FINANCE_ROLE(), finance.address);
    await project.connect(admin).grantRole(await project.DIRECTOR_ROLE(), director.address);
    await project.connect(admin).grantRole(await project.REQUESTER_ROLE(), user1.address);

    // Transfer tokens to project
    await omthbToken.transfer(projectAddress, ethers.parseEther("10000"));

    return {
      omthbToken,
      factory,
      project,
      owner,
      admin,
      secretary,
      committee1,
      committee2,
      finance,
      director,
      attacker,
      user1
    };
  }

  describe("Commit Phase", function () {
    it("Should allow valid commitment from authorized approver", async function () {
      const { project, user1, secretary } = await loadFixture(deployFixture);

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Test request",
        "QmTest"
      );

      // Secretary commits approval
      const nonce = 123;
      const commitment = ethers.keccak256(
        ethers.solidityPacked(
          ["address", "uint256", "uint256"],
          [secretary.address, 0, nonce]
        )
      );

      await expect(project.connect(secretary).commitApproval(0, commitment))
        .to.emit(project, "ApprovalCommitted")
        .withArgs(0, secretary.address, await time.latest() + 1);

      // Verify commitment is stored
      expect(await project.approvalCommitments(0, secretary.address)).to.equal(commitment);
    });

    it("Should reject commitment from unauthorized approver", async function () {
      const { project, user1, attacker } = await loadFixture(deployFixture);

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Test request",
        "QmTest"
      );

      // Attacker tries to commit
      const commitment = ethers.keccak256(
        ethers.solidityPacked(
          ["address", "uint256", "uint256"],
          [attacker.address, 0, 1]
        )
      );

      await expect(project.connect(attacker).commitApproval(0, commitment))
        .to.be.revertedWithCustomError(project, "UnauthorizedApprover");
    });

    it("Should reject commitment for non-existent request", async function () {
      const { project, secretary } = await loadFixture(deployFixture);

      const commitment = ethers.keccak256(
        ethers.solidityPacked(
          ["address", "uint256", "uint256"],
          [secretary.address, 999, 1]
        )
      );

      await expect(project.connect(secretary).commitApproval(999, commitment))
        .to.be.revertedWithCustomError(project, "RequestNotFound");
    });

    it("Should allow multiple commitments for different requests", async function () {
      const { project, user1, secretary } = await loadFixture(deployFixture);

      // Create multiple requests
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Request 1",
        "QmTest1"
      );
      
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("200"),
        "Request 2",
        "QmTest2"
      );

      // Commit to both
      const commitment1 = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, 1])
      );
      const commitment2 = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 1, 2])
      );

      await project.connect(secretary).commitApproval(0, commitment1);
      await project.connect(secretary).commitApproval(1, commitment2);

      expect(await project.approvalCommitments(0, secretary.address)).to.equal(commitment1);
      expect(await project.approvalCommitments(1, secretary.address)).to.equal(commitment2);
    });

    it("Should update commitment timestamp on recommit", async function () {
      const { project, user1, secretary } = await loadFixture(deployFixture);

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Test request",
        "QmTest"
      );

      // First commitment
      const commitment1 = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, 1])
      );
      await project.connect(secretary).commitApproval(0, commitment1);
      const timestamp1 = await project.commitTimestamps(0, secretary.address);

      // Wait and recommit with different nonce
      await time.increase(60);
      const commitment2 = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, 2])
      );
      await project.connect(secretary).commitApproval(0, commitment2);
      const timestamp2 = await project.commitTimestamps(0, secretary.address);

      expect(timestamp2).to.be.gt(timestamp1);
      expect(await project.approvalCommitments(0, secretary.address)).to.equal(commitment2);
    });
  });

  describe("Reveal Phase", function () {
    it("Should require waiting for reveal window", async function () {
      const { project, user1, secretary } = await loadFixture(deployFixture);

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Test request",
        "QmTest"
      );

      // Commit
      const nonce = 123;
      const commitment = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, nonce])
      );
      await project.connect(secretary).commitApproval(0, commitment);

      // Try to reveal immediately
      await expect(project.connect(secretary).approveBySecretary(0, nonce))
        .to.be.revertedWithCustomError(project, "InvalidStatus");

      // Wait for reveal window (15 minutes)
      await time.increase(15 * 60 + 1);

      // Now reveal should work
      await expect(project.connect(secretary).approveBySecretary(0, nonce))
        .to.emit(project, "ApprovalRevealed")
        .withArgs(0, secretary.address, 1); // Status.SecretaryApproved = 1
    });

    it("Should reject reveal with wrong nonce", async function () {
      const { project, user1, secretary } = await loadFixture(deployFixture);

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Test request",
        "QmTest"
      );

      // Commit with nonce 123
      const correctNonce = 123;
      const commitment = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, correctNonce])
      );
      await project.connect(secretary).commitApproval(0, commitment);

      // Wait for reveal window
      await time.increase(15 * 60 + 1);

      // Try to reveal with wrong nonce
      const wrongNonce = 456;
      await expect(project.connect(secretary).approveBySecretary(0, wrongNonce))
        .to.be.revertedWithCustomError(project, "UnauthorizedApprover");
    });

    it("Should clear commitment after successful reveal", async function () {
      const { project, user1, secretary } = await loadFixture(deployFixture);

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Test request",
        "QmTest"
      );

      // Commit and reveal
      const nonce = 123;
      const commitment = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, nonce])
      );
      await project.connect(secretary).commitApproval(0, commitment);
      await time.increase(15 * 60 + 1);
      await project.connect(secretary).approveBySecretary(0, nonce);

      // Commitment should be cleared
      expect(await project.approvalCommitments(0, secretary.address)).to.equal(ethers.ZeroHash);
      expect(await project.commitTimestamps(0, secretary.address)).to.equal(0);
    });

    it("Should prevent double reveal", async function () {
      const { project, user1, secretary } = await loadFixture(deployFixture);

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Test request",
        "QmTest"
      );

      // Commit and reveal
      const nonce = 123;
      const commitment = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, nonce])
      );
      await project.connect(secretary).commitApproval(0, commitment);
      await time.increase(15 * 60 + 1);
      await project.connect(secretary).approveBySecretary(0, nonce);

      // Try to reveal again
      await expect(project.connect(secretary).approveBySecretary(0, nonce))
        .to.be.revertedWithCustomError(project, "InvalidStatus");
    });
  });

  describe("Full Approval Flow", function () {
    it("Should complete full approval flow with commit-reveal", async function () {
      const { project, user1, secretary, committee1, finance, committee2, director, omthbToken } = await loadFixture(deployFixture);

      // Create request
      const amount = ethers.parseEther("100");
      await project.connect(user1).createRequest(
        user1.address,
        amount,
        "Full flow test",
        "QmTest"
      );

      // Secretary approval
      const secNonce = 1;
      const secCommit = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, secNonce])
      );
      await project.connect(secretary).commitApproval(0, secCommit);
      await time.increase(15 * 60 + 1);
      await project.connect(secretary).approveBySecretary(0, secNonce);

      // Committee approval
      const com1Nonce = 2;
      const com1Commit = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [committee1.address, 0, com1Nonce])
      );
      await project.connect(committee1).commitApproval(0, com1Commit);
      await time.increase(15 * 60 + 1);
      await project.connect(committee1).approveByCommittee(0, com1Nonce);

      // Finance approval
      const finNonce = 3;
      const finCommit = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [finance.address, 0, finNonce])
      );
      await project.connect(finance).commitApproval(0, finCommit);
      await time.increase(15 * 60 + 1);
      await project.connect(finance).approveByFinance(0, finNonce);

      // Committee additional approval
      const com2Nonce = 4;
      const com2Commit = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [committee2.address, 0, com2Nonce])
      );
      await project.connect(committee2).commitApproval(0, com2Commit);
      await time.increase(15 * 60 + 1);
      await project.connect(committee2).approveByCommitteeAdditional(0, com2Nonce);

      // Director approval (auto-distributes)
      const dirNonce = 5;
      const dirCommit = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [director.address, 0, dirNonce])
      );
      await project.connect(director).commitApproval(0, dirCommit);
      await time.increase(15 * 60 + 1);
      
      const balanceBefore = await omthbToken.balanceOf(user1.address);
      await project.connect(director).approveByDirector(0, dirNonce);
      const balanceAfter = await omthbToken.balanceOf(user1.address);

      // Verify distribution
      expect(balanceAfter - balanceBefore).to.equal(amount);
      
      // Verify final status
      const request = await project.getRequest(0);
      expect(request.status).to.equal(5); // Distributed
    });

    it("Should prevent approval without proper role sequence", async function () {
      const { project, user1, secretary, committee1, finance } = await loadFixture(deployFixture);

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Test",
        "QmTest"
      );

      // Try to skip secretary and go directly to committee
      const com1Nonce = 1;
      const com1Commit = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [committee1.address, 0, com1Nonce])
      );
      await expect(project.connect(committee1).commitApproval(0, com1Commit))
        .to.be.revertedWithCustomError(project, "UnauthorizedApprover");

      // Secretary approves first
      const secNonce = 2;
      const secCommit = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, secNonce])
      );
      await project.connect(secretary).commitApproval(0, secCommit);
      await time.increase(15 * 60 + 1);
      await project.connect(secretary).approveBySecretary(0, secNonce);

      // Now committee can approve
      await project.connect(committee1).commitApproval(0, com1Commit);
      await time.increase(15 * 60 + 1);
      await project.connect(committee1).approveByCommittee(0, com1Nonce);

      // Try to skip finance and go to director - should fail
      const finNonce = 3;
      const finCommit = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [finance.address, 0, finNonce])
      );
      await expect(project.connect(finance).commitApproval(0, finCommit))
        .to.not.be.reverted;
    });
  });

  describe("Security Tests", function () {
    it("Should prevent front-running attack", async function () {
      const { project, user1, secretary, attacker } = await loadFixture(deployFixture);

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Front-run test",
        "QmTest"
      );

      // Secretary prepares approval
      const nonce = 123;
      const commitment = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, nonce])
      );

      // Attacker sees the commitment transaction in mempool
      // But cannot use it because commitment is tied to secretary's address
      await expect(project.connect(attacker).commitApproval(0, commitment))
        .to.be.revertedWithCustomError(project, "UnauthorizedApprover");

      // Secretary commits
      await project.connect(secretary).commitApproval(0, commitment);
      await time.increase(15 * 60 + 1);

      // Attacker tries to reveal with known nonce - fails because they're not the secretary
      await expect(project.connect(attacker).approveBySecretary(0, nonce))
        .to.be.revertedWithCustomError(project, "UnauthorizedApprover");

      // Only secretary can reveal
      await project.connect(secretary).approveBySecretary(0, nonce);
    });

    it("Should prevent commitment reuse across requests", async function () {
      const { project, user1, secretary } = await loadFixture(deployFixture);

      // Create two requests
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Request 1",
        "QmTest1"
      );
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("200"),
        "Request 2",
        "QmTest2"
      );

      // Use same nonce for both (simulating reuse attempt)
      const nonce = 123;
      const commitment1 = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, nonce])
      );
      const commitment2 = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 1, nonce])
      );

      // Commitments are different due to requestId
      expect(commitment1).to.not.equal(commitment2);

      // Commit and reveal for request 0
      await project.connect(secretary).commitApproval(0, commitment1);
      await time.increase(15 * 60 + 1);
      await project.connect(secretary).approveBySecretary(0, nonce);

      // Cannot reuse same commitment for request 1
      await project.connect(secretary).commitApproval(1, commitment1);
      await time.increase(15 * 60 + 1);
      await expect(project.connect(secretary).approveBySecretary(1, nonce))
        .to.be.revertedWithCustomError(project, "UnauthorizedApprover");
    });

    it("Should handle concurrent commitments from different approvers", async function () {
      const { project, user1, secretary, committee1, finance } = await loadFixture(deployFixture);

      // Create request and get secretary approval first
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Concurrent test",
        "QmTest"
      );

      // Secretary approves
      const secNonce = 1;
      const secCommit = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, secNonce])
      );
      await project.connect(secretary).commitApproval(0, secCommit);
      await time.increase(15 * 60 + 1);
      await project.connect(secretary).approveBySecretary(0, secNonce);

      // Committee and finance both prepare commitments while status is SecretaryApproved
      const com1Nonce = 2;
      const com1Commit = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [committee1.address, 0, com1Nonce])
      );
      
      const finNonce = 3;
      const finCommit = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [finance.address, 0, finNonce])
      );

      // Committee commits first
      await project.connect(committee1).commitApproval(0, com1Commit);
      
      // Finance tries to commit but should fail (wrong status)
      await expect(project.connect(finance).commitApproval(0, finCommit))
        .to.be.revertedWithCustomError(project, "UnauthorizedApprover");

      // Committee reveals
      await time.increase(15 * 60 + 1);
      await project.connect(committee1).approveByCommittee(0, com1Nonce);

      // Now finance can commit
      await project.connect(finance).commitApproval(0, finCommit);
      await time.increase(15 * 60 + 1);
      await project.connect(finance).approveByFinance(0, finNonce);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle commitment expiry gracefully", async function () {
      const { project, user1, secretary } = await loadFixture(deployFixture);

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Expiry test",
        "QmTest"
      );

      // Commit
      const nonce = 123;
      const commitment = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, nonce])
      );
      await project.connect(secretary).commitApproval(0, commitment);

      // Wait for a very long time (simulate abandoned commitment)
      await time.increase(7 * 24 * 60 * 60); // 1 week

      // Should still be able to reveal if commitment matches
      await project.connect(secretary).approveBySecretary(0, nonce);
    });

    it("Should handle request cancellation with pending commitments", async function () {
      const { project, user1, secretary } = await loadFixture(deployFixture);

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Cancel test",
        "QmTest"
      );

      // Secretary commits
      const nonce = 123;
      const commitment = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, nonce])
      );
      await project.connect(secretary).commitApproval(0, commitment);

      // Requester cancels
      await project.connect(user1).cancelRequest(0);

      // Secretary tries to reveal after cancellation
      await time.increase(15 * 60 + 1);
      await expect(project.connect(secretary).approveBySecretary(0, nonce))
        .to.be.revertedWithCustomError(project, "RequestNotFound");
    });

    it("Should handle pause/unpause during commit-reveal", async function () {
      const { project, user1, secretary, admin } = await loadFixture(deployFixture);

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Pause test",
        "QmTest"
      );

      // Secretary commits
      const nonce = 123;
      const commitment = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, nonce])
      );
      await project.connect(secretary).commitApproval(0, commitment);

      // Admin pauses contract
      await project.connect(admin).pause();

      // Cannot reveal while paused
      await time.increase(15 * 60 + 1);
      await expect(project.connect(secretary).approveBySecretary(0, nonce))
        .to.be.revertedWith("Pausable: paused");

      // Unpause and reveal
      await project.connect(admin).unpause();
      await project.connect(secretary).approveBySecretary(0, nonce);
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should measure gas costs for commit-reveal vs direct approval", async function () {
      const { project, user1, secretary } = await loadFixture(deployFixture);

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "Gas test",
        "QmTest"
      );

      // Measure commit gas
      const nonce = 123;
      const commitment = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, nonce])
      );
      const commitTx = await project.connect(secretary).commitApproval(0, commitment);
      const commitReceipt = await commitTx.wait();
      const commitGas = commitReceipt.gasUsed;

      // Measure reveal gas
      await time.increase(15 * 60 + 1);
      const revealTx = await project.connect(secretary).approveBySecretary(0, nonce);
      const revealReceipt = await revealTx.wait();
      const revealGas = revealReceipt.gasUsed;

      console.log(`Commit gas: ${commitGas}`);
      console.log(`Reveal gas: ${revealGas}`);
      console.log(`Total gas: ${commitGas + revealGas}`);

      // Ensure gas usage is reasonable
      expect(commitGas).to.be.lt(100000);
      expect(revealGas).to.be.lt(150000);
    });
  });
});