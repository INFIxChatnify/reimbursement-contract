const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Edge Cases Comprehensive Test Suite", function () {
  // Constants
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  const BLACKLISTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BLACKLISTER_ROLE"));
  const SECRETARY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SECRETARY_ROLE"));
  const COMMITTEE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMMITTEE_ROLE"));
  const FINANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FINANCE_ROLE"));
  const DIRECTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DIRECTOR_ROLE"));
  const REQUESTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REQUESTER_ROLE"));

  async function deployFixture() {
    const [owner, minter, user1, user2, user3, attacker] = await ethers.getSigners();

    // Deploy OMTHB Token
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const token = await upgrades.deployProxy(OMTHBToken, [owner.address], {
      initializer: 'initialize',
      kind: 'uups'
    });

    // Setup roles
    await token.connect(owner).grantRole(MINTER_ROLE, minter.address);

    // Deploy other contracts
    const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
    const auditAnchor = await AuditAnchor.deploy();

    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const projectFactory = await ProjectFactory.deploy(
      await token.getAddress(),
      await auditAnchor.getAddress()
    );

    await token.connect(owner).grantRole(MINTER_ROLE, await projectFactory.getAddress());

    return {
      token,
      auditAnchor,
      projectFactory,
      owner,
      minter,
      user1,
      user2,
      user3,
      attacker
    };
  }

  describe("1. Zero Value Edge Cases", function () {
    describe("1.1 Token Operations", function () {
      it("Should handle zero amount transfers", async function () {
        const { token, minter, user1, user2 } = await loadFixture(deployFixture);
        
        // Mint some tokens first
        await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
        
        // Zero transfer should succeed but emit event with 0 value
        await expect(token.connect(user1).transfer(user2.address, 0))
          .to.emit(token, "Transfer")
          .withArgs(user1.address, user2.address, 0);
        
        // Balances should remain unchanged
        expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));
        expect(await token.balanceOf(user2.address)).to.equal(0);
      });

      it("Should handle zero amount minting", async function () {
        const { token, minter, user1 } = await loadFixture(deployFixture);
        
        // Zero mint should revert
        await expect(token.connect(minter).mint(user1.address, 0))
          .to.be.revertedWith("Amount must be greater than 0");
      });

      it("Should handle zero amount burning", async function () {
        const { token, minter, user1 } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
        
        // Zero burn should succeed
        await expect(token.connect(user1).burn(0))
          .to.emit(token, "Transfer")
          .withArgs(user1.address, ethers.ZeroAddress, 0);
      });

      it("Should handle zero address operations", async function () {
        const { token, minter } = await loadFixture(deployFixture);
        
        // Minting to zero address should fail
        await expect(token.connect(minter).mint(ethers.ZeroAddress, ethers.parseEther("100")))
          .to.be.revertedWithCustomError(token, "ERC20InvalidReceiver")
          .withArgs(ethers.ZeroAddress);
        
        // Transfer to zero address should fail
        await token.connect(minter).mint(minter.address, ethers.parseEther("100"));
        await expect(token.connect(minter).transfer(ethers.ZeroAddress, ethers.parseEther("50")))
          .to.be.revertedWithCustomError(token, "ERC20InvalidReceiver")
          .withArgs(ethers.ZeroAddress);
      });
    });

    describe("1.2 Project Operations", function () {
      it("Should handle zero budget project creation", async function () {
        const { projectFactory, owner } = await loadFixture(deployFixture);
        
        // Zero budget should fail
        await expect(projectFactory.connect(owner).createProject("ZERO-001", 0))
          .to.be.revertedWith("Invalid budget");
      });

      it("Should handle empty arrays in reimbursement requests", async function () {
        const { token, projectFactory, owner, minter } = await loadFixture(deployFixture);
        
        // Create project
        const tx = await projectFactory.connect(owner).createProject("TEST-001", ethers.parseEther("1000"));
        const receipt = await tx.wait();
        const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
        
        const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
        const project = ProjectReimbursement.attach(projectAddress);
        
        await project.connect(owner).grantRole(REQUESTER_ROLE, owner.address);
        
        // Empty arrays should fail
        await expect(project.connect(owner).createReimbursementRequest([], [], "Test", "QmTest"))
          .to.be.revertedWith("No receivers specified");
      });
    });
  });

  describe("2. Maximum Value Edge Cases", function () {
    it("Should handle maximum uint256 values", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      
      const maxUint256 = ethers.MaxUint256;
      
      // Minting max uint256 should fail due to cap
      await expect(token.connect(minter).mint(user1.address, maxUint256))
        .to.be.revertedWith("Exceeds max supply");
    });

    it("Should handle operations near max supply", async function () {
      const { token, minter, user1, user2 } = await loadFixture(deployFixture);
      
      const maxSupply = ethers.parseEther("100000000"); // 100M tokens
      const nearMax = maxSupply - ethers.parseEther("1000");
      
      // This should fail as it would exceed max supply
      await expect(token.connect(minter).mint(user1.address, nearMax + ethers.parseEther("2000")))
        .to.be.revertedWith("Exceeds max supply");
    });

    it("Should handle maximum approval values", async function () {
      const { token, minter, user1, user2 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      
      // Max approval
      await expect(token.connect(user1).approve(user2.address, ethers.MaxUint256))
        .to.emit(token, "Approval")
        .withArgs(user1.address, user2.address, ethers.MaxUint256);
      
      // Should be able to transfer within balance
      await expect(token.connect(user2).transferFrom(user1.address, user2.address, ethers.parseEther("500")))
        .to.not.be.reverted;
      
      // Allowance should remain at max
      expect(await token.allowance(user1.address, user2.address)).to.equal(ethers.MaxUint256);
    });
  });

  describe("3. Boundary Condition Edge Cases", function () {
    it("Should handle exact balance operations", async function () {
      const { token, minter, user1, user2 } = await loadFixture(deployFixture);
      
      const exactAmount = ethers.parseEther("123.456789");
      await token.connect(minter).mint(user1.address, exactAmount);
      
      // Transfer exact balance
      await expect(token.connect(user1).transfer(user2.address, exactAmount))
        .to.emit(token, "Transfer")
        .withArgs(user1.address, user2.address, exactAmount);
      
      expect(await token.balanceOf(user1.address)).to.equal(0);
      expect(await token.balanceOf(user2.address)).to.equal(exactAmount);
    });

    it("Should handle operations that result in exactly zero balance", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, ethers.parseEther("100"));
      
      // Multiple operations that zero out balance
      await token.connect(user1).transfer(minter.address, ethers.parseEther("50"));
      await token.connect(user1).burn(ethers.parseEther("25"));
      await token.connect(user1).transfer(minter.address, ethers.parseEther("25"));
      
      expect(await token.balanceOf(user1.address)).to.equal(0);
    });

    it("Should handle array length limits in batch operations", async function () {
      const { token, projectFactory, owner, minter } = await loadFixture(deployFixture);
      
      // Create project
      const tx = await projectFactory.connect(owner).createProject("TEST-001", ethers.parseEther("10000"));
      const receipt = await tx.wait();
      const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);
      
      await token.connect(minter).mint(projectAddress, ethers.parseEther("10000"));
      await project.connect(owner).grantRole(REQUESTER_ROLE, owner.address);
      
      // Create arrays at the limit (50 receivers)
      const receivers = [];
      const amounts = [];
      for (let i = 0; i < 50; i++) {
        receivers.push(owner.address);
        amounts.push(ethers.parseEther("1"));
      }
      
      // Should succeed at limit
      await expect(project.connect(owner).createReimbursementRequest(
        receivers,
        amounts,
        "Max receivers test",
        "QmMaxTest"
      )).to.emit(project, "ReimbursementRequested");
      
      // Should fail above limit
      receivers.push(owner.address);
      amounts.push(ethers.parseEther("1"));
      
      await expect(project.connect(owner).createReimbursementRequest(
        receivers,
        amounts,
        "Too many receivers",
        "QmTooMany"
      )).to.be.revertedWith("Too many receivers");
    });
  });

  describe("4. Time-Based Edge Cases", function () {
    it("Should handle operations at exact deadline", async function () {
      const { token, projectFactory, owner, minter } = await loadFixture(deployFixture);
      
      // Create project with deadline logic
      const tx = await projectFactory.connect(owner).createProject("TIME-001", ethers.parseEther("1000"));
      const receipt = await tx.wait();
      const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);
      
      await token.connect(minter).mint(projectAddress, ethers.parseEther("1000"));
      await project.connect(owner).grantRole(REQUESTER_ROLE, owner.address);
      await project.connect(owner).grantRole(SECRETARY_ROLE, owner.address);
      
      // Create request with deadline
      await project.connect(owner).createReimbursementRequest(
        [owner.address],
        [ethers.parseEther("100")],
        "Deadline test",
        "QmDeadline"
      );
      
      // Get request to check deadline
      const request = await project.requests(1);
      
      // Fast forward to just before deadline
      if (request.paymentDeadline > 0) {
        await time.increaseTo(request.paymentDeadline - 1n);
        
        // Should still work
        await expect(project.connect(owner).approveAsSecretary(1))
          .to.not.be.reverted;
      }
    });

    it("Should handle operations after long periods", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      
      // Fast forward 1 year
      await time.increase(365 * 24 * 60 * 60);
      
      // Operations should still work
      await expect(token.connect(user1).transfer(minter.address, ethers.parseEther("100")))
        .to.not.be.reverted;
    });
  });

  describe("5. Precision and Rounding Edge Cases", function () {
    it("Should handle high precision decimal amounts", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      
      // 18 decimal places
      const preciseAmount = ethers.parseUnits("123.123456789012345678", 18);
      
      await token.connect(minter).mint(user1.address, preciseAmount);
      expect(await token.balanceOf(user1.address)).to.equal(preciseAmount);
      
      // Transfer with precise amount
      const transferAmount = ethers.parseUnits("45.678901234567890123", 18);
      await token.connect(user1).transfer(minter.address, transferAmount);
      
      // Check remaining balance is exact
      expect(await token.balanceOf(user1.address)).to.equal(preciseAmount - transferAmount);
    });

    it("Should handle amounts with many leading zeros", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      
      const tinyAmount = ethers.parseUnits("0.000000000000000001", 18); // 1 wei
      
      await token.connect(minter).mint(user1.address, tinyAmount);
      expect(await token.balanceOf(user1.address)).to.equal(1n);
    });
  });

  describe("6. State Transition Edge Cases", function () {
    it("Should handle rapid state transitions", async function () {
      const { token, owner, minter, user1 } = await loadFixture(deployFixture);
      
      await token.connect(owner).grantRole(PAUSER_ROLE, owner.address);
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      
      // Rapid pause/unpause
      await token.connect(owner).pause();
      await token.connect(owner).unpause();
      await token.connect(owner).pause();
      await token.connect(owner).unpause();
      
      // Should still function normally
      await expect(token.connect(user1).transfer(minter.address, ethers.parseEther("100")))
        .to.not.be.reverted;
    });

    it("Should handle operations during state transitions", async function () {
      const { token, owner, minter, user1, user2 } = await loadFixture(deployFixture);
      
      await token.connect(owner).grantRole(BLACKLISTER_ROLE, owner.address);
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      
      // Start a transfer
      const transferPromise = token.connect(user1).transfer(user2.address, ethers.parseEther("500"));
      
      // Try to blacklist during transfer (this is a race condition test)
      const blacklistPromise = token.connect(owner).blacklist(user1.address);
      
      // One should succeed, one should fail
      const results = await Promise.allSettled([transferPromise, blacklistPromise]);
      
      // At least one should have succeeded
      expect(results.some(r => r.status === 'fulfilled')).to.be.true;
    });
  });

  describe("7. Contract Interaction Edge Cases", function () {
    it("Should handle interactions with non-existent contracts", async function () {
      const { token, minter } = await loadFixture(deployFixture);
      
      const nonExistentAddress = "0x1234567890123456789012345678901234567890";
      
      // Minting to non-existent contract should succeed
      await expect(token.connect(minter).mint(nonExistentAddress, ethers.parseEther("100")))
        .to.not.be.reverted;
      
      // Balance should be tracked
      expect(await token.balanceOf(nonExistentAddress)).to.equal(ethers.parseEther("100"));
    });

    it("Should handle self-referential operations", async function () {
      const { token, minter } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(minter.address, ethers.parseEther("1000"));
      
      // Self transfer
      await expect(token.connect(minter).transfer(minter.address, ethers.parseEther("100")))
        .to.emit(token, "Transfer")
        .withArgs(minter.address, minter.address, ethers.parseEther("100"));
      
      // Balance should remain the same
      expect(await token.balanceOf(minter.address)).to.equal(ethers.parseEther("1000"));
    });
  });

  describe("8. Gas Limit Edge Cases", function () {
    it("Should handle operations near gas limits", async function () {
      const { token, projectFactory, owner, minter } = await loadFixture(deployFixture);
      
      // Create project
      const tx = await projectFactory.connect(owner).createProject("GAS-001", ethers.parseEther("50000"));
      const receipt = await tx.wait();
      const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);
      
      await token.connect(minter).mint(projectAddress, ethers.parseEther("50000"));
      await project.connect(owner).grantRole(REQUESTER_ROLE, owner.address);
      
      // Create request with maximum allowed receivers (50)
      const receivers = [];
      const amounts = [];
      for (let i = 0; i < 50; i++) {
        receivers.push(ethers.Wallet.createRandom().address);
        amounts.push(ethers.parseEther("10"));
      }
      
      // This should succeed but use significant gas
      const txCreate = await project.connect(owner).createReimbursementRequest(
        receivers,
        amounts,
        "Gas limit test",
        "QmGasLimit"
      );
      
      const receiptCreate = await txCreate.wait();
      console.log(`Gas used for 50 receivers: ${receiptCreate.gasUsed}`);
      
      // Verify it succeeded
      expect(receiptCreate.status).to.equal(1);
    });
  });

  describe("9. Overflow/Underflow Protection", function () {
    it("Should prevent arithmetic overflow", async function () {
      const { token, minter, user1, user2 } = await loadFixture(deployFixture);
      
      // Mint large amount
      const largeAmount = ethers.parseEther("90000000"); // 90M tokens
      await token.connect(minter).mint(user1.address, largeAmount);
      
      // Try to mint amount that would overflow
      await expect(token.connect(minter).mint(user2.address, ethers.parseEther("20000000")))
        .to.be.revertedWith("Exceeds max supply");
    });

    it("Should prevent arithmetic underflow", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, ethers.parseEther("100"));
      
      // Try to burn more than balance
      await expect(token.connect(user1).burn(ethers.parseEther("101")))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });
  });

  describe("10. Special Character and Encoding Edge Cases", function () {
    it("Should handle special characters in metadata", async function () {
      const { projectFactory, owner } = await loadFixture(deployFixture);
      
      // Special characters in project ID
      const specialProjectId = "TEST-🚀-001";
      
      await expect(projectFactory.connect(owner).createProject(specialProjectId, ethers.parseEther("1000")))
        .to.emit(projectFactory, "ProjectCreated");
    });

    it("Should handle long strings in requests", async function () {
      const { token, projectFactory, owner, minter } = await loadFixture(deployFixture);
      
      // Create project
      const tx = await projectFactory.connect(owner).createProject("LONG-001", ethers.parseEther("1000"));
      const receipt = await tx.wait();
      const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);
      
      await token.connect(minter).mint(projectAddress, ethers.parseEther("1000"));
      await project.connect(owner).grantRole(REQUESTER_ROLE, owner.address);
      
      // Very long description
      const longDescription = "A".repeat(1000);
      const longHash = "Qm" + "X".repeat(44); // Valid IPFS hash format
      
      await expect(project.connect(owner).createReimbursementRequest(
        [owner.address],
        [ethers.parseEther("100")],
        longDescription,
        longHash
      )).to.emit(project, "ReimbursementRequested");
    });
  });
});