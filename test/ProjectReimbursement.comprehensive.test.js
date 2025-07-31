const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ProjectReimbursement - Comprehensive Test Suite", function () {
  // Constants matching contract
  const SECRETARY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SECRETARY_ROLE"));
  const COMMITTEE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMMITTEE_ROLE"));
  const FINANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FINANCE_ROLE"));
  const DIRECTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DIRECTOR_ROLE"));
  const REQUESTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REQUESTER_ROLE"));
  
  const MIN_REIMBURSEMENT_AMOUNT = ethers.parseEther("100");
  const MAX_REIMBURSEMENT_AMOUNT = ethers.parseEther("1000000");
  const REVEAL_WINDOW = 30 * 60; // 30 minutes
  const PAYMENT_DEADLINE_DURATION = 7 * 24 * 60 * 60; // 7 days

  async function deployFixture() {
    const [
      admin, 
      requester, 
      recipient,
      secretary, 
      committee1, 
      committee2, 
      finance, 
      director,
      attacker,
      user1,
      user2
    ] = await ethers.getSigners();

    // Deploy OMTHB Token
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const omthbToken = await upgrades.deployProxy(OMTHBToken, [admin.address], {
      initializer: 'initialize',
      kind: 'uups'
    });

    // Deploy implementation
    const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
    const implementation = await ProjectReimbursement.deploy();

    // Deploy factory
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const factory = await ProjectFactory.deploy(
      implementation.target,
      omthbToken.target,
      ethers.ZeroAddress, // Meta tx forwarder - not needed for these tests
      admin.address
    );

    // Grant factory the project creator role
    await factory.connect(admin).grantRole(
      await factory.PROJECT_CREATOR_ROLE(),
      admin.address
    );

    // Create a project
    const projectId = "TEST-PROJECT-001";
    const projectBudget = ethers.parseEther("100000"); // 100k OMTHB
    
    const tx = await factory.connect(admin).createProject(
      projectId,
      projectBudget,
      admin.address
    );
    
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.eventName === "ProjectCreated");
    const projectAddress = event.args.projectContract;
    
    const project = await ethers.getContractAt("ProjectReimbursement", projectAddress);

    // Setup roles
    await project.connect(admin).grantRole(SECRETARY_ROLE, secretary.address);
    await project.connect(admin).grantRole(COMMITTEE_ROLE, committee1.address);
    await project.connect(admin).grantRole(COMMITTEE_ROLE, committee2.address);
    await project.connect(admin).grantRole(FINANCE_ROLE, finance.address);
    await project.connect(admin).grantRole(DIRECTOR_ROLE, director.address);
    await project.connect(admin).grantRole(REQUESTER_ROLE, requester.address);

    // Mint tokens to project for distributions
    const MINTER_ROLE = await omthbToken.MINTER_ROLE();
    await omthbToken.connect(admin).grantRole(MINTER_ROLE, admin.address);
    await omthbToken.connect(admin).mint(project.target, projectBudget);

    return {
      project,
      omthbToken,
      factory,
      projectId,
      projectBudget,
      admin,
      requester,
      recipient,
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

  describe("1. Request Creation Tests", function () {
    describe("1.1 Valid Request Creation", function () {
      it("Should create request with valid parameters", async function () {
        const { project, requester, recipient } = await loadFixture(deployFixture);
        
        const amount = ethers.parseEther("1000");
        const description = "Office supplies for Q1 2024";
        const documentHash = "QmXxxXxxXxxXxxXxxXxxXxxXxxXxxXxxXxxXxxXxxXxx";

        await expect(
          project.connect(requester).createRequest(
            recipient.address,
            amount,
            description,
            documentHash
          )
        ).to.emit(project, "RequestCreated")
          .withArgs(0, requester.address, recipient.address, amount, description);

        const request = await project.getRequest(0);
        expect(request.requester).to.equal(requester.address);
        expect(request.recipient).to.equal(recipient.address);
        expect(request.amount).to.equal(amount);
        expect(request.description).to.equal(description);
        expect(request.documentHash).to.equal(documentHash);
        expect(request.status).to.equal(0); // Pending
      });

      it("Should increment request IDs correctly", async function () {
        const { project, requester, recipient } = await loadFixture(deployFixture);
        
        const amount = ethers.parseEther("500");
        
        // Create 3 requests
        for (let i = 0; i < 3; i++) {
          await expect(
            project.connect(requester).createRequest(
              recipient.address,
              amount,
              `Request ${i}`,
              `Hash${i}`
            )
          ).to.emit(project, "RequestCreated")
            .withArgs(i, requester.address, recipient.address, amount, `Request ${i}`);
        }

        // Verify all requests exist
        for (let i = 0; i < 3; i++) {
          const request = await project.getRequest(i);
          expect(request.id).to.equal(i);
          expect(request.description).to.equal(`Request ${i}`);
        }
      });
    });

    describe("1.2 Budget Validation", function () {
      it("Should prevent requests exceeding project budget", async function () {
        const { project, requester, recipient, projectBudget } = await loadFixture(deployFixture);
        
        const amount = projectBudget + ethers.parseEther("1"); // 1 OMTHB over budget
        
        await expect(
          project.connect(requester).createRequest(
            recipient.address,
            amount,
            "Over budget request",
            "Hash"
          )
        ).to.be.revertedWithCustomError(project, "InsufficientBudget");
      });

      it("Should track cumulative budget usage", async function () {
        const { project, requester, recipient, projectBudget } = await loadFixture(deployFixture);
        
        const amount1 = ethers.parseEther("40000");
        const amount2 = ethers.parseEther("50000");
        const amount3 = ethers.parseEther("20000"); // Total would be 110k, budget is 100k
        
        // First two should succeed
        await project.connect(requester).createRequest(
          recipient.address,
          amount1,
          "Request 1",
          "Hash1"
        );
        
        await project.connect(requester).createRequest(
          recipient.address,
          amount2,
          "Request 2",
          "Hash2"
        );
        
        // Third should fail
        await expect(
          project.connect(requester).createRequest(
            recipient.address,
            amount3,
            "Request 3",
            "Hash3"
          )
        ).to.be.revertedWithCustomError(project, "InsufficientBudget");
      });
    });

    describe("1.3 Input Validation", function () {
      it("Should reject zero amount", async function () {
        const { project, requester, recipient } = await loadFixture(deployFixture);
        
        await expect(
          project.connect(requester).createRequest(
            recipient.address,
            0,
            "Zero amount",
            "Hash"
          )
        ).to.be.revertedWithCustomError(project, "InvalidAmount");
      });

      it("Should reject amount below minimum", async function () {
        const { project, requester, recipient } = await loadFixture(deployFixture);
        
        const amount = MIN_REIMBURSEMENT_AMOUNT - 1n;
        
        await expect(
          project.connect(requester).createRequest(
            recipient.address,
            amount,
            "Below minimum",
            "Hash"
          )
        ).to.be.revertedWithCustomError(project, "AmountTooLow");
      });

      it("Should reject amount above maximum", async function () {
        const { project, requester, recipient } = await loadFixture(deployFixture);
        
        const amount = MAX_REIMBURSEMENT_AMOUNT + 1n;
        
        await expect(
          project.connect(requester).createRequest(
            recipient.address,
            amount,
            "Above maximum",
            "Hash"
          )
        ).to.be.revertedWithCustomError(project, "AmountTooHigh");
      });

      it("Should reject zero recipient address", async function () {
        const { project, requester } = await loadFixture(deployFixture);
        
        await expect(
          project.connect(requester).createRequest(
            ethers.ZeroAddress,
            ethers.parseEther("1000"),
            "Zero recipient",
            "Hash"
          )
        ).to.be.revertedWithCustomError(project, "ZeroAddress");
      });

      it("Should reject empty description", async function () {
        const { project, requester, recipient } = await loadFixture(deployFixture);
        
        await expect(
          project.connect(requester).createRequest(
            recipient.address,
            ethers.parseEther("1000"),
            "",
            "Hash"
          )
        ).to.be.revertedWithCustomError(project, "InvalidDescription");
      });

      it("Should reject description over 1000 characters", async function () {
        const { project, requester, recipient } = await loadFixture(deployFixture);
        
        const longDescription = "x".repeat(1001);
        
        await expect(
          project.connect(requester).createRequest(
            recipient.address,
            ethers.parseEther("1000"),
            longDescription,
            "Hash"
          )
        ).to.be.revertedWithCustomError(project, "InvalidDescription");
      });

      it("Should reject empty document hash", async function () {
        const { project, requester, recipient } = await loadFixture(deployFixture);
        
        await expect(
          project.connect(requester).createRequest(
            recipient.address,
            ethers.parseEther("1000"),
            "Valid description",
            ""
          )
        ).to.be.revertedWithCustomError(project, "InvalidDocumentHash");
      });
    });

    describe("1.4 Access Control", function () {
      it("Should only allow requesters to create requests", async function () {
        const { project, user1, recipient } = await loadFixture(deployFixture);
        
        await expect(
          project.connect(user1).createRequest(
            recipient.address,
            ethers.parseEther("1000"),
            "Unauthorized request",
            "Hash"
          )
        ).to.be.reverted;
      });
    });
  });

  describe("2. Approval Flow Tests", function () {
    describe("2.1 Secretary Approval (Level 1)", function () {
      it("Should complete commit-reveal flow for secretary", async function () {
        const { project, requester, recipient, secretary } = await loadFixture(deployFixture);
        
        // Create request
        await project.connect(requester).createRequest(
          recipient.address,
          ethers.parseEther("1000"),
          "Test request",
          "Hash"
        );
        
        const requestId = 0;
        const nonce = 12345;
        const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
        
        // Create commitment
        const commitment = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "uint256", "uint256"],
            [secretary.address, requestId, chainId, nonce]
          )
        );
        
        // Commit
        await expect(
          project.connect(secretary).commitApproval(requestId, commitment)
        ).to.emit(project, "ApprovalCommitted")
          .withArgs(requestId, secretary.address, await time.latest() + 1, chainId);
        
        // Try to reveal too early
        await expect(
          project.connect(secretary).approveBySecretary(requestId, nonce)
        ).to.be.revertedWithCustomError(project, "RevealTooEarly");
        
        // Wait for reveal window
        await time.increase(REVEAL_WINDOW);
        
        // Reveal
        await expect(
          project.connect(secretary).approveBySecretary(requestId, nonce)
        ).to.emit(project, "ApprovalRevealed")
          .withArgs(requestId, secretary.address, 1); // Status.SecretaryApproved
        
        // Verify status update
        const request = await project.getRequest(requestId);
        expect(request.status).to.equal(1); // SecretaryApproved
        expect(request.secretaryApprover).to.equal(secretary.address);
      });

      it("Should prevent double approval by same secretary", async function () {
        const { project, requester, recipient, secretary } = await loadFixture(deployFixture);
        
        // Create and approve request
        await project.connect(requester).createRequest(
          recipient.address,
          ethers.parseEther("1000"),
          "Test request",
          "Hash"
        );
        
        const requestId = 0;
        const nonce = 12345;
        const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
        
        const commitment = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "uint256", "uint256"],
            [secretary.address, requestId, chainId, nonce]
          )
        );
        
        await project.connect(secretary).commitApproval(requestId, commitment);
        await time.increase(REVEAL_WINDOW);
        await project.connect(secretary).approveBySecretary(requestId, nonce);
        
        // Try to approve again
        const newCommitment = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "uint256", "uint256"],
            [secretary.address, requestId, chainId, nonce + 1]
          )
        );
        
        await project.connect(secretary).commitApproval(requestId, newCommitment);
        await time.increase(REVEAL_WINDOW);
        
        await expect(
          project.connect(secretary).approveBySecretary(requestId, nonce + 1)
        ).to.be.revertedWithCustomError(project, "InvalidStatus");
      });

      it("Should reject invalid commitment", async function () {
        const { project, requester, recipient, secretary } = await loadFixture(deployFixture);
        
        // Create request
        await project.connect(requester).createRequest(
          recipient.address,
          ethers.parseEther("1000"),
          "Test request",
          "Hash"
        );
        
        const requestId = 0;
        const correctNonce = 12345;
        const wrongNonce = 54321;
        const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
        
        // Commit with one nonce
        const commitment = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "uint256", "uint256"],
            [secretary.address, requestId, chainId, correctNonce]
          )
        );
        
        await project.connect(secretary).commitApproval(requestId, commitment);
        await time.increase(REVEAL_WINDOW);
        
        // Try to reveal with different nonce
        await expect(
          project.connect(secretary).approveBySecretary(requestId, wrongNonce)
        ).to.be.revertedWithCustomError(project, "InvalidCommitment");
      });
    });

    describe("2.2 Complete 5-Level Approval Flow", function () {
      it("Should complete full approval flow and auto-distribute", async function () {
        const { 
          project, 
          omthbToken,
          requester, 
          recipient, 
          secretary, 
          committee1, 
          committee2,
          finance, 
          director 
        } = await loadFixture(deployFixture);
        
        const amount = ethers.parseEther("5000");
        
        // Create request
        await project.connect(requester).createRequest(
          recipient.address,
          amount,
          "Full flow test",
          "Hash"
        );
        
        const requestId = 0;
        const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
        
        // Helper function for commit-reveal
        async function commitAndReveal(signer, approvalFunction) {
          const nonce = Math.floor(Math.random() * 1000000);
          const commitment = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ["address", "uint256", "uint256", "uint256"],
              [signer.address, requestId, chainId, nonce]
            )
          );
          
          await project.connect(signer).commitApproval(requestId, commitment);
          await time.increase(REVEAL_WINDOW);
          await project.connect(signer)[approvalFunction](requestId, nonce);
        }
        
        // Record initial balance
        const initialBalance = await omthbToken.balanceOf(recipient.address);
        
        // Level 1: Secretary
        await commitAndReveal(secretary, "approveBySecretary");
        
        // Level 2: Committee
        await commitAndReveal(committee1, "approveByCommittee");
        
        // Level 3: Finance
        await commitAndReveal(finance, "approveByFinance");
        
        // Level 4: Additional Committee
        await commitAndReveal(committee2, "approveByCommitteeAdditional");
        
        // Level 5: Director (triggers auto-distribution)
        await expect(
          commitAndReveal(director, "approveByDirector")
        ).to.emit(project, "FundsDistributed")
          .withArgs(requestId, recipient.address, amount);
        
        // Verify final state
        const request = await project.getRequest(requestId);
        expect(request.status).to.equal(5); // Distributed
        
        // Verify funds transferred
        const finalBalance = await omthbToken.balanceOf(recipient.address);
        expect(finalBalance - initialBalance).to.equal(amount);
        
        // Verify totalDistributed updated
        const totalDistributed = await project.totalDistributed();
        expect(totalDistributed).to.equal(amount);
      });
    });
  });

  describe("3. Request Cancellation Tests", function () {
    it("Should allow requester to cancel own request", async function () {
      const { project, requester, recipient } = await loadFixture(deployFixture);
      
      // Create request
      await project.connect(requester).createRequest(
        recipient.address,
        ethers.parseEther("1000"),
        "To be cancelled",
        "Hash"
      );
      
      const requestId = 0;
      
      await expect(
        project.connect(requester).cancelRequest(requestId)
      ).to.emit(project, "RequestCancelled")
        .withArgs(requestId, requester.address);
      
      const request = await project.getRequest(requestId);
      expect(request.status).to.equal(6); // Cancelled
    });

    it("Should allow admin to cancel any request", async function () {
      const { project, admin, requester, recipient } = await loadFixture(deployFixture);
      
      // Create request
      await project.connect(requester).createRequest(
        recipient.address,
        ethers.parseEther("1000"),
        "Admin will cancel",
        "Hash"
      );
      
      const requestId = 0;
      
      await expect(
        project.connect(admin).cancelRequest(requestId)
      ).to.emit(project, "RequestCancelled")
        .withArgs(requestId, admin.address);
    });

    it("Should not allow cancelling distributed request", async function () {
      const { 
        project, 
        requester, 
        recipient, 
        secretary, 
        committee1, 
        committee2,
        finance, 
        director 
      } = await loadFixture(deployFixture);
      
      // Create and fully approve request
      await project.connect(requester).createRequest(
        recipient.address,
        ethers.parseEther("1000"),
        "Will be distributed",
        "Hash"
      );
      
      const requestId = 0;
      const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
      
      // Complete approval flow (simplified for test)
      async function quickApprove(signer, method) {
        const nonce = 1;
        const commitment = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "uint256", "uint256"],
            [signer.address, requestId, chainId, nonce]
          )
        );
        await project.connect(signer).commitApproval(requestId, commitment);
        await time.increase(REVEAL_WINDOW);
        await project.connect(signer)[method](requestId, nonce);
      }
      
      await quickApprove(secretary, "approveBySecretary");
      await quickApprove(committee1, "approveByCommittee");
      await quickApprove(finance, "approveByFinance");
      await quickApprove(committee2, "approveByCommitteeAdditional");
      await quickApprove(director, "approveByDirector");
      
      // Try to cancel distributed request
      await expect(
        project.connect(requester).cancelRequest(requestId)
      ).to.be.revertedWithCustomError(project, "InvalidStatus");
    });
  });

  describe("4. Emergency Functions Tests", function () {
    it("Should pause and unpause contract", async function () {
      const { project, admin, requester, recipient } = await loadFixture(deployFixture);
      
      // Pause
      await expect(
        project.connect(admin).pause()
      ).to.emit(project, "EmergencyPause")
        .withArgs(admin.address, await time.latest() + 1);
      
      // Try to create request while paused
      await expect(
        project.connect(requester).createRequest(
          recipient.address,
          ethers.parseEther("1000"),
          "During pause",
          "Hash"
        )
      ).to.be.revertedWithCustomError(project, "EnforcedPause");
      
      // Unpause (would require timelock in production)
      await project.connect(admin).unpause();
      
      // Should work again
      await expect(
        project.connect(requester).createRequest(
          recipient.address,
          ethers.parseEther("1000"),
          "After unpause",
          "Hash"
        )
      ).to.emit(project, "RequestCreated");
    });

    it("Should activate emergency stop", async function () {
      const { project, admin, requester, recipient } = await loadFixture(deployFixture);
      
      await expect(
        project.connect(admin).activateEmergencyStop()
      ).to.emit(project, "EmergencyPause")
        .withArgs(admin.address, await time.latest() + 1);
      
      // Verify emergency stop is active
      expect(await project.emergencyStop()).to.be.true;
      
      // Operations should fail
      await expect(
        project.connect(requester).createRequest(
          recipient.address,
          ethers.parseEther("1000"),
          "During emergency",
          "Hash"
        )
      ).to.be.revertedWithCustomError(project, "EmergencyStopActive");
    });
  });

  describe("5. Gas DoS Protection Tests", function () {
    it("Should limit active requests to prevent gas DoS", async function () {
      const { project, admin, requester, recipient } = await loadFixture(deployFixture);
      
      const MAX_BATCH_SIZE = 100;
      const amount = ethers.parseEther("100"); // Minimum amount
      
      // Grant requester role to admin for faster testing
      await project.connect(admin).grantRole(REQUESTER_ROLE, admin.address);
      
      // Create maximum allowed requests
      for (let i = 0; i < MAX_BATCH_SIZE; i++) {
        await project.connect(admin).createRequest(
          recipient.address,
          amount,
          `Request ${i}`,
          `Hash${i}`
        );
      }
      
      // Next one should fail
      await expect(
        project.connect(admin).createRequest(
          recipient.address,
          amount,
          "One too many",
          "HashX"
        )
      ).to.be.revertedWithCustomError(project, "TooManyActiveRequests");
    });

    it("Should cleanup old requests automatically", async function () {
      const { project, requester, recipient, admin } = await loadFixture(deployFixture);
      
      const MAX_ARRAY_LENGTH = 50;
      const amount = ethers.parseEther("100");
      
      // Create many requests
      for (let i = 0; i < MAX_ARRAY_LENGTH + 5; i++) {
        await project.connect(requester).createRequest(
          recipient.address,
          amount,
          `Request ${i}`,
          `Hash${i}`
        );
        
        // Cancel some to trigger cleanup
        if (i % 10 === 0 && i > 0) {
          await project.connect(requester).cancelRequest(i - 5);
        }
      }
      
      // Should have triggered cleanup
      const userRequests = await project.getUserActiveRequests(requester.address);
      expect(userRequests.length).to.be.lessThanOrEqual(MAX_ARRAY_LENGTH);
    });
  });

  describe("6. Reentrancy Protection Tests", function () {
    it("Should prevent reentrancy during fund distribution", async function () {
      const { 
        project, 
        omthbToken,
        admin,
        requester, 
        secretary, 
        committee1, 
        committee2,
        finance, 
        director 
      } = await loadFixture(deployFixture);
      
      // Deploy malicious recipient
      const MaliciousRecipient = await ethers.getContractFactory("ReentrancyAttacker");
      const maliciousRecipient = await MaliciousRecipient.deploy(project.target);
      
      // Create request to malicious contract
      await project.connect(requester).createRequest(
        maliciousRecipient.target,
        ethers.parseEther("1000"),
        "Reentrancy test",
        "Hash"
      );
      
      const requestId = 0;
      const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
      
      // Complete approval flow
      async function quickApprove(signer, method) {
        const nonce = 1;
        const commitment = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "uint256", "uint256"],
            [signer.address, requestId, chainId, nonce]
          )
        );
        await project.connect(signer).commitApproval(requestId, commitment);
        await time.increase(REVEAL_WINDOW);
        await project.connect(signer)[method](requestId, nonce);
      }
      
      await quickApprove(secretary, "approveBySecretary");
      await quickApprove(committee1, "approveByCommittee");
      await quickApprove(finance, "approveByFinance");
      await quickApprove(committee2, "approveByCommitteeAdditional");
      
      // Final approval should succeed despite reentrancy attempt
      await expect(
        quickApprove(director, "approveByDirector")
      ).to.not.be.reverted;
      
      // Verify only one transfer occurred
      const balance = await omthbToken.balanceOf(maliciousRecipient.target);
      expect(balance).to.equal(ethers.parseEther("1000"));
    });
  });

  describe("7. Role Management Tests", function () {
    it("Should enforce role separation", async function () {
      const { project, secretary, committee1, finance, director, user1 } = await loadFixture(deployFixture);
      
      // Secretary cannot approve as committee
      await expect(
        project.connect(secretary).approveByCommittee(0, 1)
      ).to.be.reverted;
      
      // Committee cannot approve as finance
      await expect(
        project.connect(committee1).approveByFinance(0, 1)
      ).to.be.reverted;
      
      // User without role cannot approve
      await expect(
        project.connect(user1).approveBySecretary(0, 1)
      ).to.be.reverted;
    });

    it("Should handle role grant and revoke", async function () {
      const { project, admin, user1 } = await loadFixture(deployFixture);
      
      // Grant requester role
      await expect(
        project.connect(admin).grantRole(REQUESTER_ROLE, user1.address)
      ).to.emit(project, "RoleGranted")
        .withArgs(REQUESTER_ROLE, user1.address, admin.address);
      
      // User can now create requests
      await project.connect(user1).createRequest(
        user1.address,
        ethers.parseEther("100"),
        "New requester",
        "Hash"
      );
      
      // Revoke role
      await expect(
        project.connect(admin).revokeRole(REQUESTER_ROLE, user1.address)
      ).to.emit(project, "RoleRevoked")
        .withArgs(REQUESTER_ROLE, user1.address, admin.address);
      
      // User cannot create requests anymore
      await expect(
        project.connect(user1).createRequest(
          user1.address,
          ethers.parseEther("100"),
          "After revoke",
          "Hash"
        )
      ).to.be.reverted;
    });
  });

  describe("8. Edge Cases and Boundary Tests", function () {
    it("Should handle minimum reimbursement amount exactly", async function () {
      const { project, requester, recipient } = await loadFixture(deployFixture);
      
      await expect(
        project.connect(requester).createRequest(
          recipient.address,
          MIN_REIMBURSEMENT_AMOUNT,
          "Minimum amount",
          "Hash"
        )
      ).to.emit(project, "RequestCreated");
    });

    it("Should handle maximum reimbursement amount exactly", async function () {
      const { project, requester, recipient } = await loadFixture(deployFixture);
      
      await expect(
        project.connect(requester).createRequest(
          recipient.address,
          MAX_REIMBURSEMENT_AMOUNT,
          "Maximum amount",
          "Hash"
        )
      ).to.emit(project, "RequestCreated");
    });

    it("Should handle description at maximum length", async function () {
      const { project, requester, recipient } = await loadFixture(deployFixture);
      
      const maxDescription = "x".repeat(1000);
      
      await expect(
        project.connect(requester).createRequest(
          recipient.address,
          ethers.parseEther("1000"),
          maxDescription,
          "Hash"
        )
      ).to.emit(project, "RequestCreated");
    });

    it("Should handle document hash at maximum length", async function () {
      const { project, requester, recipient } = await loadFixture(deployFixture);
      
      const maxHash = "x".repeat(100);
      
      await expect(
        project.connect(requester).createRequest(
          recipient.address,
          ethers.parseEther("1000"),
          "Description",
          maxHash
        )
      ).to.emit(project, "RequestCreated");
    });
  });

  describe("9. Payment Deadline Tests", function () {
    it("Should enforce payment deadline after director approval", async function () {
      const { 
        project,
        requester, 
        recipient, 
        secretary, 
        committee1, 
        committee2,
        finance, 
        director 
      } = await loadFixture(deployFixture);
      
      // Create request
      await project.connect(requester).createRequest(
        recipient.address,
        ethers.parseEther("1000"),
        "Deadline test",
        "Hash"
      );
      
      const requestId = 0;
      const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
      
      // Complete approval flow
      async function quickApprove(signer, method) {
        const nonce = 1;
        const commitment = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "uint256", "uint256"],
            [signer.address, requestId, chainId, nonce]
          )
        );
        await project.connect(signer).commitApproval(requestId, commitment);
        await time.increase(REVEAL_WINDOW);
        await project.connect(signer)[method](requestId, nonce);
      }
      
      // Approve up to finance level
      await quickApprove(secretary, "approveBySecretary");
      await quickApprove(committee1, "approveByCommittee");
      await quickApprove(finance, "approveByFinance");
      await quickApprove(committee2, "approveByCommitteeAdditional");
      
      // Simulate delay before director approval
      await time.increase(PAYMENT_DEADLINE_DURATION + 1);
      
      // Director approval should still work and set deadline
      await quickApprove(director, "approveByDirector");
      
      // Verify payment deadline was set
      const request = await project.getRequest(requestId);
      expect(request.paymentDeadline).to.be.gt(0);
    });
  });

  describe("10. State Consistency Tests", function () {
    it("Should maintain consistent state across operations", async function () {
      const { project, requester, recipient, admin } = await loadFixture(deployFixture);
      
      const amounts = [
        ethers.parseEther("1000"),
        ethers.parseEther("2000"),
        ethers.parseEther("3000")
      ];
      
      // Create multiple requests
      for (let i = 0; i < amounts.length; i++) {
        await project.connect(requester).createRequest(
          recipient.address,
          amounts[i],
          `Request ${i}`,
          `Hash${i}`
        );
      }
      
      // Cancel one
      await project.connect(requester).cancelRequest(1);
      
      // Verify active requests
      const activeRequests = await project.getActiveRequests();
      expect(activeRequests.length).to.equal(3); // Still includes cancelled
      
      // Verify user's active requests
      const userRequests = await project.getUserActiveRequests(requester.address);
      expect(userRequests.length).to.equal(3);
      
      // Verify each request state
      const request0 = await project.getRequest(0);
      expect(request0.status).to.equal(0); // Pending
      
      const request1 = await project.getRequest(1);
      expect(request1.status).to.equal(6); // Cancelled
      
      const request2 = await project.getRequest(2);
      expect(request2.status).to.equal(0); // Pending
    });
  });
});