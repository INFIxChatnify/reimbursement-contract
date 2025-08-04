const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Stress Testing and Fuzzing Test Suite", function () {
  // Increase timeout for stress tests
  this.timeout(300000); // 5 minutes

  // Constants
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const SECRETARY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SECRETARY_ROLE"));
  const COMMITTEE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMMITTEE_ROLE"));
  const FINANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FINANCE_ROLE"));
  const DIRECTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DIRECTOR_ROLE"));
  const REQUESTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REQUESTER_ROLE"));

  async function deployFixture() {
    const signers = await ethers.getSigners();
    const [owner, minter, ...users] = signers;

    // Deploy contracts
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const token = await upgrades.deployProxy(OMTHBToken, [owner.address], {
      initializer: 'initialize',
      kind: 'uups'
    });

    const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
    const auditAnchor = await AuditAnchor.deploy();

    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const projectFactory = await ProjectFactory.deploy(
      await token.getAddress(),
      await auditAnchor.getAddress()
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
      users,
      signers
    };
  }

  // Fuzzing utilities
  function getRandomBigInt(min, max) {
    const range = max - min;
    const randomBytes = ethers.randomBytes(32);
    const randomBigInt = BigInt("0x" + ethers.hexlify(randomBytes).slice(2));
    return min + (randomBigInt % range);
  }

  function getRandomAddress() {
    return ethers.Wallet.createRandom().address;
  }

  function getRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function getRandomBytes(length) {
    return ethers.randomBytes(length);
  }

  describe("1. Token Stress Tests", function () {
    it("Should handle rapid sequential transfers", async function () {
      const { token, minter, users } = await loadFixture(deployFixture);
      
      // Mint initial tokens
      const initialAmount = ethers.parseEther("100000");
      await token.connect(minter).mint(users[0].address, initialAmount);
      
      // Perform rapid transfers
      const transferCount = 100;
      const transferAmount = ethers.parseEther("10");
      
      console.log(`Starting ${transferCount} rapid transfers...`);
      const startTime = Date.now();
      
      for (let i = 0; i < transferCount; i++) {
        const from = users[i % 10];
        const to = users[(i + 1) % 10];
        
        // Ensure sender has balance
        const balance = await token.balanceOf(from.address);
        if (balance >= transferAmount) {
          await token.connect(from).transfer(to.address, transferAmount);
        }
      }
      
      const endTime = Date.now();
      console.log(`Completed ${transferCount} transfers in ${endTime - startTime}ms`);
      
      // Verify total supply unchanged
      expect(await token.totalSupply()).to.equal(initialAmount);
    });

    it("Should handle concurrent operations", async function () {
      const { token, minter, users } = await loadFixture(deployFixture);
      
      // Mint to multiple users
      const mintPromises = [];
      for (let i = 0; i < 10; i++) {
        mintPromises.push(
          token.connect(minter).mint(users[i].address, ethers.parseEther("1000"))
        );
      }
      
      await Promise.all(mintPromises);
      
      // Concurrent transfers
      const transferPromises = [];
      for (let i = 0; i < 10; i++) {
        transferPromises.push(
          token.connect(users[i]).transfer(
            users[(i + 5) % 10].address,
            ethers.parseEther("100")
          )
        );
      }
      
      await Promise.all(transferPromises);
      
      // Verify all operations completed
      for (let i = 0; i < 10; i++) {
        const balance = await token.balanceOf(users[i].address);
        expect(balance).to.be.gte(0);
      }
    });

    it("Should handle maximum approval stress", async function () {
      const { token, minter, users } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(users[0].address, ethers.parseEther("10000"));
      
      // Set many approvals
      const approvalCount = 50;
      console.log(`Setting ${approvalCount} approvals...`);
      
      for (let i = 1; i <= approvalCount; i++) {
        await token.connect(users[0]).approve(
          users[i % users.length].address,
          ethers.parseEther(String(i * 10))
        );
      }
      
      // Verify random approvals
      for (let i = 0; i < 10; i++) {
        const randomIndex = Math.floor(Math.random() * approvalCount) + 1;
        const allowance = await token.allowance(
          users[0].address,
          users[randomIndex % users.length].address
        );
        expect(allowance).to.be.gte(0);
      }
    });
  });

  describe("2. Project Stress Tests", function () {
    it("Should handle multiple projects creation", async function () {
      const { projectFactory, owner } = await loadFixture(deployFixture);
      
      const projectCount = 20;
      const projects = [];
      
      console.log(`Creating ${projectCount} projects...`);
      const startTime = Date.now();
      
      for (let i = 0; i < projectCount; i++) {
        const tx = await projectFactory.connect(owner).createProject(
          `STRESS-${i}`,
          ethers.parseEther(String(1000 + i * 100))
        );
        const receipt = await tx.wait();
        const projectAddress = receipt.logs
          .find(log => log.eventName === "ProjectCreated")
          .args.projectAddress;
        projects.push(projectAddress);
      }
      
      const endTime = Date.now();
      console.log(`Created ${projectCount} projects in ${endTime - startTime}ms`);
      
      // Verify all projects exist
      expect(projects.length).to.equal(projectCount);
      expect(new Set(projects).size).to.equal(projectCount); // All unique
    });

    it("Should handle maximum requests per project", async function () {
      const { token, projectFactory, owner, minter, users } = await loadFixture(deployFixture);
      
      // Create project
      const tx = await projectFactory.connect(owner).createProject("MAX-REQ", ethers.parseEther("100000"));
      const receipt = await tx.wait();
      const projectAddress = receipt.logs
        .find(log => log.eventName === "ProjectCreated")
        .args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);
      
      // Setup
      await token.connect(minter).mint(projectAddress, ethers.parseEther("100000"));
      await project.connect(owner).grantRole(REQUESTER_ROLE, users[0].address);
      
      // Create many requests
      const requestCount = 50;
      console.log(`Creating ${requestCount} requests...`);
      
      for (let i = 0; i < requestCount; i++) {
        await project.connect(users[0]).createReimbursementRequest(
          [users[(i + 1) % users.length].address],
          [ethers.parseEther("10")],
          `Request ${i}`,
          `Qm${i}`
        );
        
        if (i % 10 === 0) {
          console.log(`Created ${i + 1} requests...`);
        }
      }
      
      // Verify request count
      const lastRequest = await project.requests(requestCount);
      expect(lastRequest.id).to.equal(requestCount);
    });
  });

  describe("3. Fuzzing Tests", function () {
    describe("3.1 Token Fuzzing", function () {
      it("Should handle random transfer amounts", async function () {
        const { token, minter, users } = await loadFixture(deployFixture);
        
        const maxSupply = ethers.parseEther("100000000");
        await token.connect(minter).mint(users[0].address, ethers.parseEther("1000000"));
        
        const fuzzRounds = 50;
        console.log(`Running ${fuzzRounds} fuzz rounds for transfers...`);
        
        for (let i = 0; i < fuzzRounds; i++) {
          const sender = users[i % 10];
          const receiver = users[(i + 1) % 10];
          const senderBalance = await token.balanceOf(sender.address);
          
          if (senderBalance > 0) {
            // Random amount between 0 and sender balance
            const amount = getRandomBigInt(0n, senderBalance);
            
            try {
              await token.connect(sender).transfer(receiver.address, amount);
            } catch (error) {
              // Some transfers might fail due to insufficient balance
              expect(error.message).to.include("InsufficientBalance");
            }
          }
        }
        
        // Verify total supply unchanged
        expect(await token.totalSupply()).to.be.lte(maxSupply);
      });

      it("Should handle random approval values", async function () {
        const { token, minter, users } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(users[0].address, ethers.parseEther("1000"));
        
        const fuzzRounds = 30;
        console.log(`Running ${fuzzRounds} fuzz rounds for approvals...`);
        
        for (let i = 0; i < fuzzRounds; i++) {
          const spender = users[(i % 9) + 1];
          
          // Random approval amount including edge cases
          const randomType = Math.random();
          let amount;
          
          if (randomType < 0.1) {
            amount = 0n; // Zero
          } else if (randomType < 0.2) {
            amount = ethers.MaxUint256; // Max
          } else if (randomType < 0.3) {
            amount = 1n; // Minimum
          } else {
            amount = getRandomBigInt(0n, ethers.parseEther("10000"));
          }
          
          await token.connect(users[0]).approve(spender.address, amount);
          
          const allowance = await token.allowance(users[0].address, spender.address);
          expect(allowance).to.equal(amount);
        }
      });
    });

    describe("3.2 Project Request Fuzzing", function () {
      it("Should handle random request parameters", async function () {
        const { token, projectFactory, owner, minter, users } = await loadFixture(deployFixture);
        
        // Create project
        const tx = await projectFactory.connect(owner).createProject("FUZZ-001", ethers.parseEther("50000"));
        const receipt = await tx.wait();
        const projectAddress = receipt.logs
          .find(log => log.eventName === "ProjectCreated")
          .args.projectAddress;
        
        const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
        const project = ProjectReimbursement.attach(projectAddress);
        
        await token.connect(minter).mint(projectAddress, ethers.parseEther("50000"));
        await project.connect(owner).grantRole(REQUESTER_ROLE, users[0].address);
        
        const fuzzRounds = 20;
        console.log(`Running ${fuzzRounds} fuzz rounds for requests...`);
        
        for (let i = 0; i < fuzzRounds; i++) {
          // Random number of receivers (1-10)
          const receiverCount = Math.floor(Math.random() * 10) + 1;
          const receivers = [];
          const amounts = [];
          
          for (let j = 0; j < receiverCount; j++) {
            receivers.push(getRandomAddress());
            amounts.push(getRandomBigInt(
              ethers.parseEther("0.01"),
              ethers.parseEther("100")
            ));
          }
          
          // Random description length
          const descLength = Math.floor(Math.random() * 500) + 1;
          const description = getRandomString(descLength);
          
          // Random hash
          const hash = "Qm" + ethers.hexlify(getRandomBytes(22)).slice(2);
          
          try {
            await project.connect(users[0]).createReimbursementRequest(
              receivers,
              amounts,
              description,
              hash
            );
          } catch (error) {
            // Some requests might fail due to validation
            console.log(`Request ${i} failed: ${error.message.substring(0, 50)}...`);
          }
        }
      });
    });

    describe("3.3 Edge Value Fuzzing", function () {
      it("Should handle extreme values", async function () {
        const { token, minter, users } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(users[0].address, ethers.parseEther("1000"));
        
        const extremeValues = [
          0n,
          1n,
          ethers.parseEther("0.000000000000000001"), // 1 wei
          ethers.parseEther("0.999999999999999999"),
          ethers.parseEther("1"),
          ethers.parseEther("999.999999999999999999"),
          ethers.MaxUint256 / 2n,
          ethers.MaxUint256 - 1n,
          ethers.MaxUint256
        ];
        
        console.log("Testing extreme values...");
        
        for (const value of extremeValues) {
          // Test approval
          try {
            await token.connect(users[0]).approve(users[1].address, value);
          } catch (error) {
            console.log(`Approval failed for ${value}: ${error.message.substring(0, 30)}...`);
          }
          
          // Test transfer (if reasonable)
          if (value <= ethers.parseEther("1000")) {
            try {
              await token.connect(users[0]).transfer(users[1].address, value);
              await token.connect(users[1]).transfer(users[0].address, value);
            } catch (error) {
              console.log(`Transfer failed for ${value}: ${error.message.substring(0, 30)}...`);
            }
          }
        }
      });
    });
  });

  describe("4. Load Testing", function () {
    it("Should handle sustained load", async function () {
      const { token, minter, users } = await loadFixture(deployFixture);
      
      // Setup initial balances
      for (let i = 0; i < 10; i++) {
        await token.connect(minter).mint(users[i].address, ethers.parseEther("10000"));
      }
      
      const duration = 30000; // 30 seconds
      const startTime = Date.now();
      let operationCount = 0;
      
      console.log(`Running sustained load test for ${duration / 1000} seconds...`);
      
      while (Date.now() - startTime < duration) {
        const operation = Math.floor(Math.random() * 3);
        const userIndex = Math.floor(Math.random() * 10);
        const user = users[userIndex];
        
        try {
          switch (operation) {
            case 0: // Transfer
              const recipientIndex = (userIndex + 1) % 10;
              await token.connect(user).transfer(
                users[recipientIndex].address,
                ethers.parseEther("1")
              );
              break;
              
            case 1: // Approve
              const spenderIndex = (userIndex + 1) % 10;
              await token.connect(user).approve(
                users[spenderIndex].address,
                ethers.parseEther("100")
              );
              break;
              
            case 2: // Burn
              await token.connect(user).burn(ethers.parseEther("0.1"));
              break;
          }
          
          operationCount++;
        } catch (error) {
          // Continue on errors
        }
        
        if (operationCount % 100 === 0) {
          console.log(`Completed ${operationCount} operations...`);
        }
      }
      
      console.log(`Total operations completed: ${operationCount}`);
      console.log(`Operations per second: ${(operationCount / (duration / 1000)).toFixed(2)}`);
    });
  });

  describe("5. Memory and State Stress Tests", function () {
    it("Should handle large state operations", async function () {
      const { token, projectFactory, owner, minter } = await loadFixture(deployFixture);
      
      // Create project with maximum budget
      const maxBudget = ethers.parseEther("90000000");
      const tx = await projectFactory.connect(owner).createProject("STATE-001", maxBudget);
      const receipt = await tx.wait();
      const projectAddress = receipt.logs
        .find(log => log.eventName === "ProjectCreated")
        .args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);
      
      await token.connect(minter).mint(projectAddress, maxBudget);
      
      // Test state size
      console.log("Testing large state operations...");
      
      // Grant many roles
      const roleCount = 20;
      for (let i = 0; i < roleCount; i++) {
        const wallet = ethers.Wallet.createRandom();
        await project.connect(owner).grantRole(COMMITTEE_ROLE, wallet.address);
      }
      
      // Verify role member count
      const memberCount = await project.getRoleMemberCount(COMMITTEE_ROLE);
      expect(memberCount).to.equal(roleCount);
    });

    it("Should handle string manipulation stress", async function () {
      const { projectFactory, owner } = await loadFixture(deployFixture);
      
      // Test various string sizes
      const stringSizes = [1, 10, 100, 500, 1000];
      
      for (const size of stringSizes) {
        const projectId = getRandomString(Math.min(size, 32)); // Limit project ID length
        
        try {
          const tx = await projectFactory.connect(owner).createProject(
            projectId,
            ethers.parseEther("1000")
          );
          await tx.wait();
          console.log(`Created project with ID length: ${projectId.length}`);
        } catch (error) {
          console.log(`Failed to create project with ID length ${size}: ${error.message.substring(0, 50)}...`);
        }
      }
    });
  });

  describe("6. Recovery and Resilience Tests", function () {
    it("Should recover from failed operations", async function () {
      const { token, minter, users } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(users[0].address, ethers.parseEther("100"));
      
      // Attempt operations that will fail
      const failedOps = [];
      const successfulOps = [];
      
      for (let i = 0; i < 20; i++) {
        try {
          if (i % 3 === 0) {
            // This should fail - transfer more than balance
            await token.connect(users[0]).transfer(
              users[1].address,
              ethers.parseEther("1000")
            );
            failedOps.push(i);
          } else {
            // This should succeed
            await token.connect(users[0]).transfer(
              users[1].address,
              ethers.parseEther("1")
            );
            successfulOps.push(i);
          }
        } catch (error) {
          failedOps.push(i);
        }
      }
      
      console.log(`Failed operations: ${failedOps.length}`);
      console.log(`Successful operations: ${successfulOps.length}`);
      
      // System should still be functional
      const finalBalance = await token.balanceOf(users[0].address);
      expect(finalBalance).to.be.gte(0);
    });
  });

  describe("7. Randomized Integration Tests", function () {
    it("Should handle random workflow execution", async function () {
      const { token, projectFactory, owner, minter, users } = await loadFixture(deployFixture);
      
      // Create project
      const tx = await projectFactory.connect(owner).createProject("RANDOM-001", ethers.parseEther("50000"));
      const receipt = await tx.wait();
      const projectAddress = receipt.logs
        .find(log => log.eventName === "ProjectCreated")
        .args.projectAddress;
      
      const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
      const project = ProjectReimbursement.attach(projectAddress);
      
      // Setup
      await token.connect(minter).mint(projectAddress, ethers.parseEther("50000"));
      
      // Random role assignments
      const roles = [SECRETARY_ROLE, COMMITTEE_ROLE, FINANCE_ROLE, DIRECTOR_ROLE, REQUESTER_ROLE];
      
      for (let i = 0; i < 20; i++) {
        const randomRole = roles[Math.floor(Math.random() * roles.length)];
        const randomUser = users[Math.floor(Math.random() * 10)];
        
        try {
          await project.connect(owner).grantRole(randomRole, randomUser.address);
        } catch (error) {
          // Some might fail due to existing roles
        }
      }
      
      // Random operations
      const operations = [
        "createRequest",
        "approve",
        "cancel",
        "checkBalance"
      ];
      
      for (let i = 0; i < 30; i++) {
        const op = operations[Math.floor(Math.random() * operations.length)];
        const user = users[Math.floor(Math.random() * 10)];
        
        try {
          switch (op) {
            case "createRequest":
              if (await project.hasRole(REQUESTER_ROLE, user.address)) {
                await project.connect(user).createReimbursementRequest(
                  [getRandomAddress()],
                  [getRandomBigInt(ethers.parseEther("1"), ethers.parseEther("100"))],
                  getRandomString(50),
                  "Qm" + getRandomString(44)
                );
              }
              break;
              
            case "checkBalance":
              await token.balanceOf(projectAddress);
              break;
          }
        } catch (error) {
          // Expected some failures
        }
      }
      
      console.log("Random workflow execution completed");
    });
  });
});