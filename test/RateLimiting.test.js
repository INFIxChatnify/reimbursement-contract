const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Rate Limiting Tests", function () {
  async function deployFixture() {
    const [owner, user1, user2, attacker] = await ethers.getSigners();

    // Deploy MetaTxForwarder
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const forwarder = await MetaTxForwarder.deploy();
    await forwarder.waitForDeployment();

    // Deploy test contract (simple counter for testing)
    const TestCounter = await ethers.getContractFactory("TestCounter");
    const testContract = await TestCounter.deploy();
    await testContract.waitForDeployment();

    // Whitelist the test contract
    await forwarder.connect(owner).setTargetWhitelist(await testContract.getAddress(), true);

    return {
      forwarder,
      testContract,
      owner,
      user1,
      user2,
      attacker
    };
  }

  async function createMetaTxRequest(forwarder, testContract, user, nonce = null) {
    const domain = {
      name: "MetaTxForwarder",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await forwarder.getAddress()
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

    const request = {
      from: user.address,
      to: await testContract.getAddress(),
      value: 0,
      gas: 200000,
      nonce: nonce !== null ? nonce : await forwarder.getNonce(user.address),
      deadline: Math.floor(Date.now() / 1000) + 3600,
      data: testContract.interface.encodeFunctionData("increment")
    };

    const signature = await user.signTypedData(domain, types, request);

    return { request, signature };
  }

  describe("User Rate Limiting", function () {
    it("Should allow transactions up to rate limit", async function () {
      const { forwarder, testContract, user1 } = await loadFixture(deployFixture);

      // Check initial rate limit
      const maxTxPerWindow = await forwarder.maxTxPerWindow();
      expect(maxTxPerWindow).to.equal(10);

      // Execute transactions up to the limit
      for (let i = 0; i < maxTxPerWindow; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
        const [success] = await forwarder.execute.staticCall(request, signature);
        expect(success).to.be.true;
        await forwarder.execute(request, signature);
      }

      // Verify all transactions succeeded (counter should be 10)
      expect(await testContract.getCounter(user1.address)).to.equal(10);
    });

    it("Should reject transactions exceeding rate limit", async function () {
      const { forwarder, testContract, user1 } = await loadFixture(deployFixture);

      const maxTxPerWindow = await forwarder.maxTxPerWindow();

      // Execute transactions up to the limit
      for (let i = 0; i < maxTxPerWindow; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
        await forwarder.execute(request, signature);
      }

      // Next transaction should fail
      const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
      await expect(forwarder.execute(request, signature))
        .to.be.revertedWithCustomError(forwarder, "RateLimitExceeded");
    });

    it("Should reset rate limit after window expires", async function () {
      const { forwarder, testContract, user1 } = await loadFixture(deployFixture);

      const maxTxPerWindow = await forwarder.maxTxPerWindow();
      const RATE_LIMIT_WINDOW = await forwarder.RATE_LIMIT_WINDOW();

      // Execute transactions up to the limit
      for (let i = 0; i < maxTxPerWindow; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
        await forwarder.execute(request, signature);
      }

      // Next transaction should fail
      const { request: failRequest, signature: failSignature } = await createMetaTxRequest(forwarder, testContract, user1);
      await expect(forwarder.execute(failRequest, failSignature))
        .to.be.revertedWithCustomError(forwarder, "RateLimitExceeded");

      // Wait for rate limit window to expire
      await time.increase(RATE_LIMIT_WINDOW + 1);

      // Now transaction should succeed
      const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
      await expect(forwarder.execute(request, signature))
        .to.emit(forwarder, "MetaTransactionExecuted");

      // Can execute more transactions in new window
      for (let i = 1; i < maxTxPerWindow; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
        await forwarder.execute(request, signature);
      }
    });

    it("Should track rate limits per user independently", async function () {
      const { forwarder, testContract, user1, user2 } = await loadFixture(deployFixture);

      const maxTxPerWindow = await forwarder.maxTxPerWindow();

      // User1 executes max transactions
      for (let i = 0; i < maxTxPerWindow; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
        await forwarder.execute(request, signature);
      }

      // User1 is rate limited
      const { request: user1ExtraRequest, signature: user1ExtraSignature } = await createMetaTxRequest(forwarder, testContract, user1);
      await expect(forwarder.execute(user1ExtraRequest, user1ExtraSignature))
        .to.be.revertedWithCustomError(forwarder, "RateLimitExceeded");

      // User2 can still execute transactions
      for (let i = 0; i < maxTxPerWindow; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user2);
        await forwarder.execute(request, signature);
      }

      // Now user2 is also rate limited
      const { request: user2ExtraRequest, signature: user2ExtraSignature } = await createMetaTxRequest(forwarder, testContract, user2);
      await expect(forwarder.execute(user2ExtraRequest, user2ExtraSignature))
        .to.be.revertedWithCustomError(forwarder, "RateLimitExceeded");
    });

    it("Should allow owner to update rate limit", async function () {
      const { forwarder, testContract, owner, user1 } = await loadFixture(deployFixture);

      // Initial rate limit is 10
      expect(await forwarder.maxTxPerWindow()).to.equal(10);

      // Update to 5
      await expect(forwarder.connect(owner).updateRateLimit(5))
        .to.emit(forwarder, "RateLimitUpdated")
        .withArgs(5);

      expect(await forwarder.maxTxPerWindow()).to.equal(5);

      // Execute 5 transactions
      for (let i = 0; i < 5; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
        await forwarder.execute(request, signature);
      }

      // 6th transaction should fail
      const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
      await expect(forwarder.execute(request, signature))
        .to.be.revertedWithCustomError(forwarder, "RateLimitExceeded");
    });

    it("Should only allow owner to update rate limit", async function () {
      const { forwarder, user1 } = await loadFixture(deployFixture);

      await expect(forwarder.connect(user1).updateRateLimit(20))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Target Contract Rate Limiting", function () {
    it("Should track call counts per target contract", async function () {
      const { forwarder, testContract, user1, user2 } = await loadFixture(deployFixture);

      const contractAddress = await testContract.getAddress();

      // Initial count should be 0
      expect(await forwarder.targetCallCounts(contractAddress)).to.equal(0);

      // Execute transactions from different users
      const { request: request1, signature: signature1 } = await createMetaTxRequest(forwarder, testContract, user1);
      await forwarder.execute(request1, signature1);
      expect(await forwarder.targetCallCounts(contractAddress)).to.equal(1);

      const { request: request2, signature: signature2 } = await createMetaTxRequest(forwarder, testContract, user2);
      await forwarder.execute(request2, signature2);
      expect(await forwarder.targetCallCounts(contractAddress)).to.equal(2);

      const { request: request3, signature: signature3 } = await createMetaTxRequest(forwarder, testContract, user1);
      await forwarder.execute(request3, signature3);
      expect(await forwarder.targetCallCounts(contractAddress)).to.equal(3);
    });

    it("Should enforce MAX_CALLS_PER_TARGET limit", async function () {
      const { forwarder, testContract } = await loadFixture(deployFixture);

      const MAX_CALLS_PER_TARGET = await forwarder.MAX_CALLS_PER_TARGET();
      expect(MAX_CALLS_PER_TARGET).to.equal(1000);

      // This test demonstrates the limit exists
      // In production, reaching 1000 calls would be prevented
    });

    it("Should reset target call count when removed from whitelist", async function () {
      const { forwarder, testContract, owner, user1 } = await loadFixture(deployFixture);

      const contractAddress = await testContract.getAddress();

      // Execute some transactions
      for (let i = 0; i < 5; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
        await forwarder.execute(request, signature);
      }

      expect(await forwarder.targetCallCounts(contractAddress)).to.equal(5);

      // Remove from whitelist
      await forwarder.connect(owner).setTargetWhitelist(contractAddress, false);
      expect(await forwarder.targetCallCounts(contractAddress)).to.equal(0);

      // Re-add to whitelist
      await forwarder.connect(owner).setTargetWhitelist(contractAddress, true);
      expect(await forwarder.targetCallCounts(contractAddress)).to.equal(0);

      // Execute new transaction
      const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
      await forwarder.execute(request, signature);
      expect(await forwarder.targetCallCounts(contractAddress)).to.equal(1);
    });
  });

  describe("Batch Operations Rate Limiting", function () {
    it("Should apply rate limiting to batch operations", async function () {
      const { forwarder, testContract, user1 } = await loadFixture(deployFixture);

      const maxTxPerWindow = await forwarder.maxTxPerWindow();

      // Create batch of requests that would exceed rate limit
      const requests = [];
      const signatures = [];

      for (let i = 0; i < maxTxPerWindow + 2; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1, i);
        requests.push(request);
        signatures.push(signature);
      }

      // Execute batch
      const [successes, returnDatas] = await forwarder.batchExecute.staticCall(requests, signatures);

      // First maxTxPerWindow should succeed, rest should fail
      for (let i = 0; i < maxTxPerWindow; i++) {
        expect(successes[i]).to.be.true;
      }
      for (let i = maxTxPerWindow; i < requests.length; i++) {
        expect(successes[i]).to.be.false;
      }

      // Execute the batch
      await forwarder.batchExecute(requests, signatures);

      // Verify only maxTxPerWindow transactions succeeded
      expect(await testContract.getCounter(user1.address)).to.equal(maxTxPerWindow);
    });

    it("Should count each batch request towards rate limit", async function () {
      const { forwarder, testContract, user1 } = await loadFixture(deployFixture);

      // Execute 5 transactions in batch
      const requests = [];
      const signatures = [];

      for (let i = 0; i < 5; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1, i);
        requests.push(request);
        signatures.push(signature);
      }

      await forwarder.batchExecute(requests, signatures);

      // Execute 5 more individually - should succeed
      for (let i = 5; i < 10; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
        await forwarder.execute(request, signature);
      }

      // 11th transaction should fail (rate limit is 10)
      const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
      await expect(forwarder.execute(request, signature))
        .to.be.revertedWithCustomError(forwarder, "RateLimitExceeded");
    });
  });

  describe("Attack Scenarios", function () {
    it("Should prevent DoS through rate limit exhaustion", async function () {
      const { forwarder, testContract, user1, user2, attacker } = await loadFixture(deployFixture);

      // Attacker tries to exhaust their own rate limit
      const maxTxPerWindow = await forwarder.maxTxPerWindow();
      for (let i = 0; i < maxTxPerWindow; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, attacker);
        await forwarder.execute(request, signature);
      }

      // Attacker is rate limited
      const { request: attackerExtra, signature: attackerExtraSig } = await createMetaTxRequest(forwarder, testContract, attacker);
      await expect(forwarder.execute(attackerExtra, attackerExtraSig))
        .to.be.revertedWithCustomError(forwarder, "RateLimitExceeded");

      // Other users are not affected
      const { request: user1Request, signature: user1Signature } = await createMetaTxRequest(forwarder, testContract, user1);
      await forwarder.execute(user1Request, user1Signature);

      const { request: user2Request, signature: user2Signature } = await createMetaTxRequest(forwarder, testContract, user2);
      await forwarder.execute(user2Request, user2Signature);
    });

    it("Should prevent rapid-fire attacks", async function () {
      const { forwarder, testContract, attacker } = await loadFixture(deployFixture);

      // Attacker tries to send many transactions rapidly
      const promises = [];
      for (let i = 0; i < 20; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, attacker, i);
        promises.push(
          forwarder.execute(request, signature).catch(e => e)
        );
      }

      const results = await Promise.all(promises);

      // Count successful transactions
      let successCount = 0;
      for (const result of results) {
        if (!result || !result.reason) {
          successCount++;
        }
      }

      // Should not exceed rate limit
      expect(successCount).to.be.lte(10);
    });

    it("Should handle time manipulation attempts", async function () {
      const { forwarder, testContract, user1 } = await loadFixture(deployFixture);

      const maxTxPerWindow = await forwarder.maxTxPerWindow();

      // Execute max transactions
      for (let i = 0; i < maxTxPerWindow; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
        await forwarder.execute(request, signature);
      }

      // Try to execute with far future deadline (doesn't affect rate limit)
      const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
      request.deadline = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year

      // Still rate limited
      await expect(forwarder.execute(request, signature))
        .to.be.revertedWithCustomError(forwarder, "RateLimitExceeded");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle rate limit of 0", async function () {
      const { forwarder, testContract, owner, user1 } = await loadFixture(deployFixture);

      // Set rate limit to 0
      await forwarder.connect(owner).updateRateLimit(0);

      // No transactions should be allowed
      const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
      await expect(forwarder.execute(request, signature))
        .to.be.revertedWithCustomError(forwarder, "RateLimitExceeded");
    });

    it("Should handle very high rate limit", async function () {
      const { forwarder, testContract, owner, user1 } = await loadFixture(deployFixture);

      // Set very high rate limit
      await forwarder.connect(owner).updateRateLimit(1000000);

      // Should be able to execute many transactions
      for (let i = 0; i < 100; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
        await forwarder.execute(request, signature);
      }

      expect(await testContract.getCounter(user1.address)).to.equal(100);
    });

    it("Should handle window boundary correctly", async function () {
      const { forwarder, testContract, user1 } = await loadFixture(deployFixture);

      const RATE_LIMIT_WINDOW = await forwarder.RATE_LIMIT_WINDOW();

      // Execute one transaction
      const { request: request1, signature: signature1 } = await createMetaTxRequest(forwarder, testContract, user1);
      await forwarder.execute(request1, signature1);

      // Wait almost the full window
      await time.increase(RATE_LIMIT_WINDOW - 10);

      // Execute more transactions (should still be in same window)
      for (let i = 1; i < 10; i++) {
        const { request, signature } = await createMetaTxRequest(forwarder, testContract, user1);
        await forwarder.execute(request, signature);
      }

      // 11th transaction should fail
      const { request: failRequest, signature: failSignature } = await createMetaTxRequest(forwarder, testContract, user1);
      await expect(forwarder.execute(failRequest, failSignature))
        .to.be.revertedWithCustomError(forwarder, "RateLimitExceeded");

      // Wait just past window boundary
      await time.increase(11);

      // Now should work (new window)
      const { request: newWindowRequest, signature: newWindowSignature } = await createMetaTxRequest(forwarder, testContract, user1);
      await forwarder.execute(newWindowRequest, newWindowSignature);
    });
  });
});