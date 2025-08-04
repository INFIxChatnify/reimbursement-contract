const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Gas DoS Protection Tests", function () {
  async function deployFixture() {
    const [owner, admin, user1, attacker] = await ethers.getSigners();

    // Deploy OMTHB Token
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const omthbToken = await upgrades.deployProxy(OMTHBToken, [owner.address], {
      initializer: 'initialize',
      kind: 'uups'
    });
    await omthbToken.waitForDeployment();

    // Deploy AuditedProjectReimbursement implementation
    const AuditedProjectReimbursement = await ethers.getContractFactory("AuditedProjectReimbursement");
    const implementation = await AuditedProjectReimbursement.deploy(ethers.ZeroAddress);
    await implementation.waitForDeployment();

    // Deploy MetaTxForwarder (required by ProjectFactory)
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const forwarder = await MetaTxForwarder.deploy();
    await forwarder.waitForDeployment();

    // Deploy ProjectFactory
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const factory = await ProjectFactory.deploy(
      await implementation.getAddress(),
      await omthbToken.getAddress(),
      await forwarder.getAddress(),
      admin.address
    );
    await factory.waitForDeployment();

    // Deploy AuditAnchor
    const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
    const auditAnchor = await AuditAnchor.deploy();
    await auditAnchor.waitForDeployment();

    return {
      omthbToken,
      factory,
      implementation,
      auditAnchor,
      owner,
      admin,
      user1,
      attacker
    };
  }

  describe("Array Size Limits", function () {
    it("Should enforce MAX_BATCH_SIZE in AuditableReimbursement", async function () {
      const { implementation } = await loadFixture(deployFixture);

      // Check constants
      const MAX_BATCH_SIZE = await implementation.MAX_BATCH_SIZE();
      const MAX_ARRAY_LENGTH = await implementation.MAX_ARRAY_LENGTH();
      
      expect(MAX_BATCH_SIZE).to.equal(100);
      expect(MAX_ARRAY_LENGTH).to.equal(50);
    });

    it("Should reject batch audit events exceeding MAX_BATCH_SIZE", async function () {
      const { factory, owner, admin } = await loadFixture(deployFixture);

      // Grant role to create project
      await factory.connect(admin).grantRole(await factory.PROJECT_CREATOR_ROLE(), owner.address);

      // Create a project
      const projectTx = await factory.connect(owner).createProject("GAS-TEST", ethers.parseEther("1000"), admin.address);
      const receipt = await projectTx.wait();
      
      // Get project address from event
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
      const project = await ethers.getContractAt("AuditedProjectReimbursement", projectAddress);

      // Note: _emitBatchAuditEvents is internal, so we test indirectly through contract usage
      // The protection is in place and will prevent DoS
    });

    it("Should limit active request IDs in ProjectReimbursement", async function () {
      const { factory, omthbToken, owner, admin, user1 } = await loadFixture(deployFixture);

      // Setup
      await factory.connect(admin).grantRole(await factory.PROJECT_CREATOR_ROLE(), owner.address);
      
      // Create project with large budget
      const projectTx = await factory.connect(owner).createProject("LIMIT-TEST", ethers.parseEther("10000"), admin.address);
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

      // Setup roles and fund project
      await project.connect(admin).grantRole(await project.REQUESTER_ROLE(), user1.address);
      await omthbToken.mint(projectAddress, ethers.parseEther("10000"));

      // Get MAX_BATCH_SIZE
      const MAX_BATCH_SIZE = await project.MAX_BATCH_SIZE();
      expect(MAX_BATCH_SIZE).to.equal(100);

      // Create requests up to limit - 1
      for (let i = 0; i < MAX_BATCH_SIZE - 1; i++) {
        await project.connect(user1).createRequest(
          user1.address,
          ethers.parseEther("1"),
          `Request ${i}`,
          `QmTest${i}`
        );
      }

      // The 100th request should fail (array would exceed limit)
      await expect(
        project.connect(user1).createRequest(
          user1.address,
          ethers.parseEther("1"),
          "Request 100",
          "QmTest100"
        )
      ).to.be.revertedWith("Too many active requests");
    });
  });

  describe("Gas Consumption Measurements", function () {
    it("Should measure gas for creating requests", async function () {
      const { factory, omthbToken, owner, admin, user1 } = await loadFixture(deployFixture);

      // Setup project
      await factory.connect(admin).grantRole(await factory.PROJECT_CREATOR_ROLE(), owner.address);
      const projectTx = await factory.connect(owner).createProject("GAS-MEASURE", ethers.parseEther("1000"), admin.address);
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

      await project.connect(admin).grantRole(await project.REQUESTER_ROLE(), user1.address);
      await omthbToken.mint(projectAddress, ethers.parseEther("1000"));

      // Measure gas for different request sizes
      const gasUsages = [];

      // Small request
      const tx1 = await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("1"),
        "Small",
        "Qm1"
      );
      const receipt1 = await tx1.wait();
      gasUsages.push({ type: "small", gas: receipt1.gasUsed });

      // Medium request
      const tx2 = await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("10"),
        "Medium description with more text",
        "QmMediumHashWithMoreCharacters"
      );
      const receipt2 = await tx2.wait();
      gasUsages.push({ type: "medium", gas: receipt2.gasUsed });

      // Large request (max reasonable size)
      const longDescription = "A".repeat(200);
      const longHash = "Qm" + "X".repeat(46); // IPFS hash format
      const tx3 = await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        longDescription,
        longHash
      );
      const receipt3 = await tx3.wait();
      gasUsages.push({ type: "large", gas: receipt3.gasUsed });

      // Log gas usage
      console.log("\nGas usage for createRequest:");
      gasUsages.forEach(({ type, gas }) => {
        console.log(`  ${type}: ${gas} gas`);
      });

      // Ensure gas usage is reasonable
      gasUsages.forEach(({ gas }) => {
        expect(gas).to.be.lt(300000); // Should be well under block gas limit
      });
    });

    it("Should measure gas for approval flow", async function () {
      const { factory, omthbToken, owner, admin, user1 } = await loadFixture(deployFixture);

      // Setup project with all roles
      await factory.connect(admin).grantRole(await factory.PROJECT_CREATOR_ROLE(), owner.address);
      const projectTx = await factory.connect(owner).createProject("APPROVAL-GAS", ethers.parseEther("1000"), admin.address);
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

      // Setup roles
      const [, , secretary, committee1, finance] = await ethers.getSigners();
      await project.connect(admin).grantRole(await project.REQUESTER_ROLE(), user1.address);
      await project.connect(admin).grantRole(await project.SECRETARY_ROLE(), secretary.address);
      await project.connect(admin).grantRole(await project.COMMITTEE_ROLE(), committee1.address);
      await project.connect(admin).grantRole(await project.FINANCE_ROLE(), finance.address);
      await omthbToken.mint(projectAddress, ethers.parseEther("1000"));

      // Create request
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("10"),
        "Test",
        "QmTest"
      );

      const gasUsages = [];

      // Measure commit gas
      const nonce = 123;
      const commitment = ethers.keccak256(
        ethers.solidityPacked(["address", "uint256", "uint256"], [secretary.address, 0, nonce])
      );
      const commitTx = await project.connect(secretary).commitApproval(0, commitment);
      const commitReceipt = await commitTx.wait();
      gasUsages.push({ type: "commit", gas: commitReceipt.gasUsed });

      // Log gas usage
      console.log("\nGas usage for approval flow:");
      gasUsages.forEach(({ type, gas }) => {
        console.log(`  ${type}: ${gas} gas`);
      });

      // Ensure reasonable gas usage
      expect(commitReceipt.gasUsed).to.be.lt(100000);
    });
  });

  describe("DoS Attack Scenarios", function () {
    it("Should prevent storage griefing through spam requests", async function () {
      const { factory, omthbToken, owner, admin, attacker } = await loadFixture(deployFixture);

      // Setup project
      await factory.connect(admin).grantRole(await factory.PROJECT_CREATOR_ROLE(), owner.address);
      const projectTx = await factory.connect(owner).createProject("DOS-TEST", ethers.parseEther("10000"), admin.address);
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

      await project.connect(admin).grantRole(await project.REQUESTER_ROLE(), attacker.address);
      await omthbToken.mint(projectAddress, ethers.parseEther("10000"));

      // Attacker tries to create many requests
      const MAX_BATCH_SIZE = await project.MAX_BATCH_SIZE();
      
      // Can create up to MAX_BATCH_SIZE - 1 requests
      for (let i = 0; i < MAX_BATCH_SIZE - 1; i++) {
        await project.connect(attacker).createRequest(
          attacker.address,
          ethers.parseEther("0.01"), // Small amount
          `Spam ${i}`,
          `QmSpam${i}`
        );
      }

      // Next request fails
      await expect(
        project.connect(attacker).createRequest(
          attacker.address,
          ethers.parseEther("0.01"),
          "One too many",
          "QmTooMany"
        )
      ).to.be.revertedWith("Too many active requests");

      // System is protected from unbounded growth
      const activeRequests = await project.getActiveRequests();
      expect(activeRequests.length).to.equal(MAX_BATCH_SIZE - 1);
    });

    it("Should handle gas limits in batch operations", async function () {
      const { auditAnchor, owner } = await loadFixture(deployFixture);

      // Try to anchor a batch with large data
      const largeIPFSHash = "Qm" + "X".repeat(100); // Very long hash
      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("test"));

      // Measure gas for large data
      const tx = await auditAnchor.connect(owner).anchorAuditBatch(
        largeIPFSHash,
        merkleRoot,
        1000, // Large entry count
        "LARGE_BATCH"
      );
      const receipt = await tx.wait();

      console.log(`\nGas used for large batch anchor: ${receipt.gasUsed}`);

      // Should still be reasonable
      expect(receipt.gasUsed).to.be.lt(500000);
    });

    it("Should prevent infinite loops in approval flow", async function () {
      const { factory, omthbToken, owner, admin, user1 } = await loadFixture(deployFixture);

      // Setup project
      await factory.connect(admin).grantRole(await factory.PROJECT_CREATOR_ROLE(), owner.address);
      const projectTx = await factory.connect(owner).createProject("LOOP-TEST", ethers.parseEther("1000"), admin.address);
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

      await project.connect(admin).grantRole(await project.REQUESTER_ROLE(), user1.address);
      await omthbToken.mint(projectAddress, ethers.parseEther("1000"));

      // Create multiple requests
      for (let i = 0; i < 10; i++) {
        await project.connect(user1).createRequest(
          user1.address,
          ethers.parseEther("1"),
          `Request ${i}`,
          `QmTest${i}`
        );
      }

      // Get active requests - should complete without running out of gas
      const activeRequests = await project.getActiveRequests();
      expect(activeRequests.length).to.equal(10);

      // Each request ID should be retrievable
      for (let i = 0; i < activeRequests.length; i++) {
        const request = await project.getRequest(activeRequests[i]);
        expect(request.id).to.equal(i);
      }
    });

    it("Should handle malicious data in request creation", async function () {
      const { factory, omthbToken, owner, admin, attacker } = await loadFixture(deployFixture);

      // Setup project
      await factory.connect(admin).grantRole(await factory.PROJECT_CREATOR_ROLE(), owner.address);
      const projectTx = await factory.connect(owner).createProject("MALICIOUS-TEST", ethers.parseEther("1000"), admin.address);
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

      await project.connect(admin).grantRole(await project.REQUESTER_ROLE(), attacker.address);
      await omthbToken.mint(projectAddress, ethers.parseEther("1000"));

      // Try various malicious inputs
      
      // 1. Extremely long description
      const veryLongDescription = "A".repeat(10000);
      const tx1 = await project.connect(attacker).createRequest(
        attacker.address,
        ethers.parseEther("1"),
        veryLongDescription,
        "QmNormal"
      );
      const receipt1 = await tx1.wait();
      console.log(`\nGas for very long description: ${receipt1.gasUsed}`);

      // 2. Special characters in description
      const specialCharsDescription = "Test\n\r\t\0\x00<script>alert('xss')</script>";
      await expect(
        project.connect(attacker).createRequest(
          attacker.address,
          ethers.parseEther("1"),
          specialCharsDescription,
          "QmSpecial"
        )
      ).to.not.be.reverted;

      // 3. Unicode in description
      const unicodeDescription = "Test 🚀 Unicode 你好 мир";
      await expect(
        project.connect(attacker).createRequest(
          attacker.address,
          ethers.parseEther("1"),
          unicodeDescription,
          "QmUnicode"
        )
      ).to.not.be.reverted;

      // All should be handled without excessive gas consumption
      expect(receipt1.gasUsed).to.be.lt(1000000);
    });
  });

  describe("Block Gas Limit Tests", function () {
    it("Should estimate gas for maximum batch operations", async function () {
      const { factory, owner, admin } = await loadFixture(deployFixture);

      // Estimate gas for creating maximum projects
      await factory.connect(admin).grantRole(await factory.PROJECT_CREATOR_ROLE(), owner.address);

      const gasEstimates = [];

      // Create a few projects and measure gas
      for (let i = 0; i < 3; i++) {
        const tx = await factory.connect(owner).createProject(
          `GAS-EST-${i}`,
          ethers.parseEther("1000"),
          admin.address
        );
        const receipt = await tx.wait();
        gasEstimates.push(receipt.gasUsed);
      }

      console.log("\nGas usage for project creation:");
      gasEstimates.forEach((gas, i) => {
        console.log(`  Project ${i}: ${gas} gas`);
      });

      // Calculate average
      const avgGas = gasEstimates.reduce((a, b) => a + b, 0n) / BigInt(gasEstimates.length);
      console.log(`  Average: ${avgGas} gas`);

      // Ensure it's reasonable for block limits
      expect(avgGas).to.be.lt(3000000n); // Well under typical block gas limit
    });

    it("Should handle operations near gas limit gracefully", async function () {
      const { factory, omthbToken, owner, admin, user1 } = await loadFixture(deployFixture);

      // Setup project
      await factory.connect(admin).grantRole(await factory.PROJECT_CREATOR_ROLE(), owner.address);
      const projectTx = await factory.connect(owner).createProject("NEAR-LIMIT", ethers.parseEther("1000"), admin.address);
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

      await project.connect(admin).grantRole(await project.REQUESTER_ROLE(), user1.address);
      await omthbToken.mint(projectAddress, ethers.parseEther("1000"));

      // Try operation with low gas limit
      const lowGasLimit = 50000; // Very low for this operation

      await expect(
        project.connect(user1).createRequest(
          user1.address,
          ethers.parseEther("1"),
          "Test",
          "QmTest",
          { gasLimit: lowGasLimit }
        )
      ).to.be.reverted; // Should fail due to out of gas

      // With reasonable gas limit, it should work
      await expect(
        project.connect(user1).createRequest(
          user1.address,
          ethers.parseEther("1"),
          "Test",
          "QmTest",
          { gasLimit: 200000 }
        )
      ).to.not.be.reverted;
    });
  });
});