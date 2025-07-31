const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Gas Optimization Comprehensive Test Suite", function () {
  // Constants
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const SECRETARY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SECRETARY_ROLE"));
  const COMMITTEE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMMITTEE_ROLE"));
  const FINANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FINANCE_ROLE"));
  const DIRECTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DIRECTOR_ROLE"));
  const REQUESTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REQUESTER_ROLE"));

  // Gas limits for different operations
  const GAS_LIMITS = {
    mint: 85000,
    transfer: 65000,
    approve: 50000, // Target from report
    burn: 50000,
    createRequest: 200000,
    approval: 80000,
    distribution: 300000
  };

  async function deployFixture() {
    const [owner, minter, user1, user2, user3] = await ethers.getSigners();

    // Deploy contracts
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const token = await upgrades.deployProxy(OMTHBToken, [owner.address], {
      initializer: 'initialize',
      kind: 'uups'
    });

    const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
    const auditAnchor = await AuditAnchor.deploy();

    // Deploy Project Implementation
    const ProjectReimbursementImpl = await ethers.getContractFactory("ProjectReimbursement");
    const projectImpl = await ProjectReimbursementImpl.deploy();

    // Deploy MetaTxForwarder
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const metaTxForwarder = await MetaTxForwarder.deploy();

    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const projectFactory = await ProjectFactory.deploy(
      await projectImpl.getAddress(),
      await token.getAddress(),
      await metaTxForwarder.getAddress(),
      owner.address
    );

    // Setup roles
    await token.connect(owner).grantRole(MINTER_ROLE, minter.address);
    await token.connect(owner).grantRole(MINTER_ROLE, await projectFactory.getAddress());

    return {
      token,
      auditAnchor,
      projectFactory,
      owner,
      minter,
      user1,
      user2,
      user3
    };
  }

  describe("1. Token Operation Gas Optimization", function () {
    describe("1.1 Mint Operation", function () {
      it("Should optimize gas for single mint", async function () {
        const { token, minter, user1 } = await loadFixture(deployFixture);
        
        const tx = await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
        const receipt = await tx.wait();
        
        console.log(`Mint gas used: ${receipt.gasUsed}`);
        expect(receipt.gasUsed).to.be.lt(GAS_LIMITS.mint);
      });

      it("Should measure gas for different mint amounts", async function () {
        const { token, minter, user1, user2, user3 } = await loadFixture(deployFixture);
        
        const amounts = [
          ethers.parseEther("1"),
          ethers.parseEther("1000"),
          ethers.parseEther("1000000")
        ];
        const users = [user1, user2, user3];
        
        for (let i = 0; i < amounts.length; i++) {
          const tx = await token.connect(minter).mint(users[i].address, amounts[i]);
          const receipt = await tx.wait();
          console.log(`Mint ${ethers.formatEther(amounts[i])} tokens - Gas: ${receipt.gasUsed}`);
        }
      });
    });

    describe("1.2 Transfer Operation", function () {
      it("Should optimize gas for transfers", async function () {
        const { token, minter, user1, user2 } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(user1.address, ethers.parseEther("10000"));
        
        const tx = await token.connect(user1).transfer(user2.address, ethers.parseEther("100"));
        const receipt = await tx.wait();
        
        console.log(`Transfer gas used: ${receipt.gasUsed}`);
        expect(receipt.gasUsed).to.be.lt(GAS_LIMITS.transfer);
      });

      it("Should optimize transferFrom gas usage", async function () {
        const { token, minter, user1, user2, user3 } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(user1.address, ethers.parseEther("10000"));
        await token.connect(user1).approve(user2.address, ethers.parseEther("5000"));
        
        const tx = await token.connect(user2).transferFrom(
          user1.address,
          user3.address,
          ethers.parseEther("100")
        );
        const receipt = await tx.wait();
        
        console.log(`TransferFrom gas used: ${receipt.gasUsed}`);
        expect(receipt.gasUsed).to.be.lt(GAS_LIMITS.transfer + 10000); // Slightly higher than transfer
      });
    });

    describe("1.3 Approve Operation - Critical Optimization", function () {
      it("Should optimize approve gas usage below 50k", async function () {
        const { token, minter, user1, user2 } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
        
        // First approval (storage slot from 0 to non-zero)
        const tx1 = await token.connect(user1).approve(user2.address, ethers.parseEther("100"));
        const receipt1 = await tx1.wait();
        console.log(`First approve gas (0 -> non-zero): ${receipt1.gasUsed}`);
        
        // Update approval (non-zero to non-zero)
        const tx2 = await token.connect(user1).approve(user2.address, ethers.parseEther("200"));
        const receipt2 = await tx2.wait();
        console.log(`Update approve gas (non-zero -> non-zero): ${receipt2.gasUsed}`);
        
        // Reset approval (non-zero to zero)
        const tx3 = await token.connect(user1).approve(user2.address, 0);
        const receipt3 = await tx3.wait();
        console.log(`Reset approve gas (non-zero -> 0): ${receipt3.gasUsed}`);
        
        // The update approval should be optimized
        expect(receipt2.gasUsed).to.be.lt(GAS_LIMITS.approve);
      });

      it("Should test infinite approval pattern", async function () {
        const { token, minter, user1, user2 } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(user1.address, ethers.parseEther("10000"));
        
        // Set infinite approval
        const tx = await token.connect(user1).approve(user2.address, ethers.MaxUint256);
        const receipt = await tx.wait();
        console.log(`Infinite approve gas: ${receipt.gasUsed}`);
        
        // Multiple transfers should not affect allowance
        for (let i = 0; i < 3; i++) {
          const transferTx = await token.connect(user2).transferFrom(
            user1.address,
            user2.address,
            ethers.parseEther("100")
          );
          const transferReceipt = await transferTx.wait();
          console.log(`Transfer ${i + 1} with infinite approval - Gas: ${transferReceipt.gasUsed}`);
        }
      });
    });

    describe("1.4 Burn Operation", function () {
      it("Should optimize burn gas usage", async function () {
        const { token, minter, user1 } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
        
        const tx = await token.connect(user1).burn(ethers.parseEther("100"));
        const receipt = await tx.wait();
        
        console.log(`Burn gas used: ${receipt.gasUsed}`);
        expect(receipt.gasUsed).to.be.lt(GAS_LIMITS.burn);
      });
    });
  });

  describe("2. Project Operations Gas Optimization", function () {
    async function deployProjectFixture() {
      const base = await loadFixture(deployFixture);
      const { projectFactory, owner } = base;
      
      // Create project
      const tx = await projectFactory.connect(owner).createProject("GAS-001", ethers.parseEther("10000"));
      const receipt = await tx.wait();
      console.log(`Project creation gas: ${receipt.gasUsed}`);
      
      const projectAddress = receipt.logs.find(log => log.eventName === "ProjectCreated").args.projectAddress;
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);
      
      return { ...base, project };
    }

    describe("2.1 Request Creation", function () {
      it("Should optimize gas for single receiver request", async function () {
        const { project, owner, user1 } = await deployProjectFixture();
        
        await project.connect(owner).grantRole(REQUESTER_ROLE, owner.address);
        
        const tx = await project.connect(owner).createReimbursementRequest(
          [user1.address],
          [ethers.parseEther("100")],
          "Single receiver",
          "QmSingle"
        );
        const receipt = await tx.wait();
        
        console.log(`Single receiver request gas: ${receipt.gasUsed}`);
        expect(receipt.gasUsed).to.be.lt(GAS_LIMITS.createRequest);
      });

      it("Should measure gas scaling with multiple receivers", async function () {
        const { project, owner } = await deployProjectFixture();
        
        await project.connect(owner).grantRole(REQUESTER_ROLE, owner.address);
        
        const receiverCounts = [1, 5, 10, 25, 50];
        
        for (const count of receiverCounts) {
          const receivers = [];
          const amounts = [];
          
          for (let i = 0; i < count; i++) {
            receivers.push(ethers.Wallet.createRandom().address);
            amounts.push(ethers.parseEther("10"));
          }
          
          const tx = await project.connect(owner).createReimbursementRequest(
            receivers,
            amounts,
            `${count} receivers`,
            `Qm${count}`
          );
          const receipt = await tx.wait();
          
          console.log(`Request with ${count} receivers - Gas: ${receipt.gasUsed}`);
          console.log(`Gas per receiver: ${receipt.gasUsed / BigInt(count)}`);
        }
      });
    });

    describe("2.2 Approval Flow", function () {
      it("Should optimize gas for each approval level", async function () {
        const { project, owner, user1, user2, user3 } = await deployProjectFixture();
        
        const signers = await ethers.getSigners();
        const [secretary, committee, finance, director] = signers.slice(5, 9);
        
        // Setup roles
        await project.connect(owner).grantRole(REQUESTER_ROLE, owner.address);
        await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee.address);
        await project.connect(owner).grantRole(FINANCE_ROLE, finance.address);
        await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);
        
        // Create request
        await project.connect(owner).createReimbursementRequest(
          [user1.address],
          [ethers.parseEther("100")],
          "Approval gas test",
          "QmApproval"
        );
        
        // Measure each approval
        const approvals = [
          { name: "Secretary", signer: secretary, method: "approveAsSecretary" },
          { name: "Committee", signer: committee, method: "approveAsCommittee" },
          { name: "Finance", signer: finance, method: "approveAsFinance" },
          { name: "Director", signer: director, method: "approveAsDirector" }
        ];
        
        for (const approval of approvals) {
          const tx = await project.connect(approval.signer)[approval.method](1);
          const receipt = await tx.wait();
          console.log(`${approval.name} approval gas: ${receipt.gasUsed}`);
          expect(receipt.gasUsed).to.be.lt(GAS_LIMITS.approval);
        }
      });
    });

    describe("2.3 Payment Distribution", function () {
      it("Should optimize gas for payment distribution", async function () {
        const { project, token, owner, minter, user1, user2 } = await deployProjectFixture();
        
        const signers = await ethers.getSigners();
        const [secretary, committee, finance, director] = signers.slice(5, 9);
        
        // Setup
        await token.connect(minter).mint(await project.getAddress(), ethers.parseEther("10000"));
        await project.connect(owner).grantRole(REQUESTER_ROLE, owner.address);
        await project.connect(owner).grantRole(SECRETARY_ROLE, secretary.address);
        await project.connect(owner).grantRole(COMMITTEE_ROLE, committee.address);
        await project.connect(owner).grantRole(FINANCE_ROLE, finance.address);
        await project.connect(owner).grantRole(DIRECTOR_ROLE, director.address);
        
        // Test different receiver counts
        const tests = [
          { receivers: 1, amount: "100" },
          { receivers: 5, amount: "20" },
          { receivers: 10, amount: "10" }
        ];
        
        for (let i = 0; i < tests.length; i++) {
          const test = tests[i];
          const receivers = [];
          const amounts = [];
          
          for (let j = 0; j < test.receivers; j++) {
            receivers.push(ethers.Wallet.createRandom().address);
            amounts.push(ethers.parseEther(test.amount));
          }
          
          // Create and approve request
          await project.connect(owner).createReimbursementRequest(
            receivers,
            amounts,
            `${test.receivers} receivers`,
            `Qm${test.receivers}`
          );
          
          const requestId = i + 1;
          await project.connect(secretary).approveAsSecretary(requestId);
          await project.connect(committee).approveAsCommittee(requestId);
          await project.connect(finance).approveAsFinance(requestId);
          await project.connect(director).approveAsDirector(requestId);
          
          // Measure distribution gas
          const tx = await project.connect(finance).distributePayment(requestId);
          const receipt = await tx.wait();
          
          console.log(`Distribution to ${test.receivers} receivers - Gas: ${receipt.gasUsed}`);
          console.log(`Gas per receiver: ${receipt.gasUsed / BigInt(test.receivers)}`);
        }
      });
    });
  });

  describe("3. Batch Operations Optimization", function () {
    it("Should optimize batch minting if implemented", async function () {
      const { token, minter } = await loadFixture(deployFixture);
      
      const recipients = [];
      const amounts = [];
      
      for (let i = 0; i < 10; i++) {
        recipients.push(ethers.Wallet.createRandom().address);
        amounts.push(ethers.parseEther("100"));
      }
      
      // Individual mints for comparison
      let totalIndividualGas = 0n;
      for (let i = 0; i < 3; i++) {
        const tx = await token.connect(minter).mint(recipients[i], amounts[i]);
        const receipt = await tx.wait();
        totalIndividualGas += receipt.gasUsed;
      }
      
      console.log(`3 individual mints total gas: ${totalIndividualGas}`);
      console.log(`Average gas per mint: ${totalIndividualGas / 3n}`);
      
      // Note: If batch minting is implemented, compare here
    });
  });

  describe("4. Storage Optimization", function () {
    it("Should optimize storage slot usage", async function () {
      const { project, owner } = await deployProjectFixture();
      
      await project.connect(owner).grantRole(REQUESTER_ROLE, owner.address);
      
      // Create request with minimal data
      const tx1 = await project.connect(owner).createReimbursementRequest(
        [owner.address],
        [ethers.parseEther("100")],
        "A", // Short description
        "QmX" // Short hash
      );
      const receipt1 = await tx1.wait();
      
      // Create request with maximum data
      const longDesc = "A".repeat(500);
      const longHash = "Qm" + "X".repeat(44);
      
      const tx2 = await project.connect(owner).createReimbursementRequest(
        [owner.address],
        [ethers.parseEther("100")],
        longDesc,
        longHash
      );
      const receipt2 = await tx2.wait();
      
      console.log(`Minimal data request gas: ${receipt1.gasUsed}`);
      console.log(`Maximum data request gas: ${receipt2.gasUsed}`);
      console.log(`Gas difference: ${receipt2.gasUsed - receipt1.gasUsed}`);
    });
  });

  describe("5. Event Emission Optimization", function () {
    it("Should measure gas cost of events", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      
      // Deploy a version without events for comparison (theoretical)
      // For now, just measure current event costs
      
      const tx = await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      const receipt = await tx.wait();
      
      // Count events
      const transferEvents = receipt.logs.filter(log => 
        log.topics[0] === token.interface.getEvent("Transfer").topicHash
      );
      const mintedEvents = receipt.logs.filter(log => 
        log.topics[0] === token.interface.getEvent("Minted").topicHash
      );
      
      console.log(`Transfer events: ${transferEvents.length}`);
      console.log(`Minted events: ${mintedEvents.length}`);
      console.log(`Total events: ${receipt.logs.length}`);
      
      // Estimate event gas (rough approximation)
      const baseGas = 21000; // Base transaction cost
      const eventGas = receipt.gasUsed - baseGas;
      console.log(`Estimated event gas: ${eventGas}`);
    });
  });

  describe("6. Access Control Optimization", function () {
    it("Should optimize role checking gas", async function () {
      const { project, owner, user1 } = await deployProjectFixture();
      
      // Grant role
      const grantTx = await project.connect(owner).grantRole(REQUESTER_ROLE, user1.address);
      const grantReceipt = await grantTx.wait();
      console.log(`Grant role gas: ${grantReceipt.gasUsed}`);
      
      // First request (cold storage)
      const tx1 = await project.connect(user1).createReimbursementRequest(
        [owner.address],
        [ethers.parseEther("100")],
        "First request",
        "QmFirst"
      );
      const receipt1 = await tx1.wait();
      
      // Second request (warm storage)
      const tx2 = await project.connect(user1).createReimbursementRequest(
        [owner.address],
        [ethers.parseEther("100")],
        "Second request",
        "QmSecond"
      );
      const receipt2 = await tx2.wait();
      
      console.log(`First request (cold access) gas: ${receipt1.gasUsed}`);
      console.log(`Second request (warm access) gas: ${receipt2.gasUsed}`);
      console.log(`Gas saved: ${receipt1.gasUsed - receipt2.gasUsed}`);
    });
  });

  describe("7. Gas Limit Stress Testing", function () {
    it("Should handle operations near block gas limit", async function () {
      const { project, token, owner, minter } = await deployProjectFixture();
      
      await token.connect(minter).mint(await project.getAddress(), ethers.parseEther("100000"));
      await project.connect(owner).grantRole(REQUESTER_ROLE, owner.address);
      
      // Create request with maximum receivers (50)
      const receivers = [];
      const amounts = [];
      
      for (let i = 0; i < 50; i++) {
        receivers.push(ethers.Wallet.createRandom().address);
        amounts.push(ethers.parseEther("10"));
      }
      
      const tx = await project.connect(owner).createReimbursementRequest(
        receivers,
        amounts,
        "Max receivers stress test",
        "QmMaxStress"
      );
      const receipt = await tx.wait();
      
      const blockGasLimit = 30000000; // Hardhat default
      const gasUsedPercent = (Number(receipt.gasUsed) / blockGasLimit) * 100;
      
      console.log(`Gas used: ${receipt.gasUsed}`);
      console.log(`Block gas limit: ${blockGasLimit}`);
      console.log(`Percentage of block gas used: ${gasUsedPercent.toFixed(2)}%`);
      
      expect(receipt.gasUsed).to.be.lt(blockGasLimit / 10); // Should use less than 10% of block
    });
  });

  describe("8. Optimization Recommendations", function () {
    it("Should provide gas optimization summary", async function () {
      const { token, projectFactory, owner, minter, user1, user2 } = await loadFixture(deployFixture);
      
      // Collect gas metrics
      const metrics = {
        deployment: {},
        token: {},
        project: {}
      };
      
      // Token deployment
      const tokenAddress = await token.getAddress();
      console.log("\n=== Gas Optimization Summary ===\n");
      console.log("Token Address:", tokenAddress);
      
      // Token operations
      await token.connect(minter).mint(user1.address, ethers.parseEther("10000"));
      
      const transferTx = await token.connect(user1).transfer(user2.address, ethers.parseEther("100"));
      const transferReceipt = await transferTx.wait();
      metrics.token.transfer = transferReceipt.gasUsed;
      
      const approveTx = await token.connect(user1).approve(user2.address, ethers.parseEther("100"));
      const approveReceipt = await approveTx.wait();
      metrics.token.approve = approveReceipt.gasUsed;
      
      // Print summary
      console.log("\nToken Operations:");
      console.log(`- Transfer: ${metrics.token.transfer} gas`);
      console.log(`- Approve: ${metrics.token.approve} gas ${metrics.token.approve > 50000n ? "⚠️ NEEDS OPTIMIZATION" : "✅"}`);
      
      console.log("\nOptimization Recommendations:");
      if (metrics.token.approve > 50000n) {
        console.log("1. CRITICAL: Optimize approve() function to use less than 50,000 gas");
        console.log("   - Consider using assembly for storage operations");
        console.log("   - Optimize event data");
        console.log("   - Review modifier usage");
      }
      
      console.log("2. Consider implementing batch operations for gas efficiency");
      console.log("3. Use infinite approvals pattern where appropriate");
      console.log("4. Pack struct data efficiently to minimize storage slots");
      console.log("5. Consider implementing EIP-2612 permit for gasless approvals");
    });
  });
});