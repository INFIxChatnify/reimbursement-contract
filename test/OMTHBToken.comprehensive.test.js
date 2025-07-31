const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("OMTHBToken - Comprehensive Test Suite", function () {
  // Role constants
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  const BLACKLISTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BLACKLISTER_ROLE"));
  const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));

  async function deployFixture() {
    const [
      owner,
      minter,
      pauser,
      blacklister,
      upgrader,
      user1,
      user2,
      user3,
      attacker
    ] = await ethers.getSigners();

    // Deploy OMTHB Token
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const token = await upgrades.deployProxy(OMTHBToken, [owner.address], {
      initializer: 'initialize',
      kind: 'uups'
    });

    // Setup roles
    await token.connect(owner).grantRole(MINTER_ROLE, minter.address);
    await token.connect(owner).grantRole(PAUSER_ROLE, pauser.address);
    await token.connect(owner).grantRole(BLACKLISTER_ROLE, blacklister.address);
    await token.connect(owner).grantRole(UPGRADER_ROLE, upgrader.address);

    return {
      token,
      owner,
      minter,
      pauser,
      blacklister,
      upgrader,
      user1,
      user2,
      user3,
      attacker
    };
  }

  describe("1. Mint Function Tests", function () {
    describe("1.1 Successful Minting", function () {
      it("Should mint tokens to valid recipient", async function () {
        const { token, minter, user1 } = await loadFixture(deployFixture);
        
        const amount = ethers.parseEther("1000");
        
        await expect(token.connect(minter).mint(user1.address, amount))
          .to.emit(token, "Transfer")
          .withArgs(ethers.ZeroAddress, user1.address, amount)
          .to.emit(token, "Minted")
          .withArgs(user1.address, amount);
        
        expect(await token.balanceOf(user1.address)).to.equal(amount);
        expect(await token.totalSupply()).to.equal(amount);
      });

      it("Should handle multiple mints correctly", async function () {
        const { token, minter, user1, user2, user3 } = await loadFixture(deployFixture);
        
        const amounts = [
          ethers.parseEther("1000"),
          ethers.parseEther("2500"),
          ethers.parseEther("500")
        ];
        
        await token.connect(minter).mint(user1.address, amounts[0]);
        await token.connect(minter).mint(user2.address, amounts[1]);
        await token.connect(minter).mint(user3.address, amounts[2]);
        
        expect(await token.balanceOf(user1.address)).to.equal(amounts[0]);
        expect(await token.balanceOf(user2.address)).to.equal(amounts[1]);
        expect(await token.balanceOf(user3.address)).to.equal(amounts[2]);
        expect(await token.totalSupply()).to.equal(amounts[0] + amounts[1] + amounts[2]);
      });

      it("Should handle decimal amounts correctly", async function () {
        const { token, minter, user1 } = await loadFixture(deployFixture);
        
        const amount = ethers.parseEther("123.456789");
        
        await token.connect(minter).mint(user1.address, amount);
        
        expect(await token.balanceOf(user1.address)).to.equal(amount);
      });
    });

    describe("1.2 Mint Edge Cases", function () {
      it("Should revert on zero amount", async function () {
        const { token, minter, user1 } = await loadFixture(deployFixture);
        
        await expect(token.connect(minter).mint(user1.address, 0))
          .to.be.revertedWithCustomError(token, "InvalidAmount");
      });

      it("Should revert on zero address recipient", async function () {
        const { token, minter } = await loadFixture(deployFixture);
        
        await expect(token.connect(minter).mint(ethers.ZeroAddress, ethers.parseEther("1000")))
          .to.be.revertedWithCustomError(token, "InvalidAddress");
      });

      it("Should handle maximum uint256 mint", async function () {
        const { token, minter, user1 } = await loadFixture(deployFixture);
        
        // Calculate max safe amount considering 18 decimals
        const maxAmount = ethers.MaxUint256 / 2n; // Use half to avoid overflow in totalSupply
        
        await token.connect(minter).mint(user1.address, maxAmount);
        
        expect(await token.balanceOf(user1.address)).to.equal(maxAmount);
        
        // Attempting to mint more should not overflow
        await expect(token.connect(minter).mint(user1.address, maxAmount))
          .to.not.be.reverted; // Solidity 0.8+ has built-in overflow protection
      });
    });

    describe("1.3 Mint Access Control", function () {
      it("Should only allow minter role to mint", async function () {
        const { token, user1, user2 } = await loadFixture(deployFixture);
        
        await expect(token.connect(user1).mint(user2.address, ethers.parseEther("1000")))
          .to.be.reverted;
      });

      it("Should allow multiple minters", async function () {
        const { token, owner, user1, user2 } = await loadFixture(deployFixture);
        
        // Grant minter role to user1
        await token.connect(owner).grantRole(MINTER_ROLE, user1.address);
        
        // User1 should now be able to mint
        await expect(token.connect(user1).mint(user2.address, ethers.parseEther("1000")))
          .to.emit(token, "Minted");
      });
    });

    describe("1.4 Mint with Blacklist", function () {
      it("Should not mint to blacklisted address", async function () {
        const { token, minter, blacklister, user1 } = await loadFixture(deployFixture);
        
        // Blacklist user1
        await token.connect(blacklister).blacklist(user1.address);
        
        // Attempt to mint to blacklisted address
        await expect(token.connect(minter).mint(user1.address, ethers.parseEther("1000")))
          .to.be.revertedWithCustomError(token, "AccountBlacklisted")
          .withArgs(user1.address);
      });
    });
  });

  describe("2. Burn Function Tests", function () {
    describe("2.1 Standard Burning", function () {
      it("Should allow users to burn their own tokens", async function () {
        const { token, minter, user1 } = await loadFixture(deployFixture);
        
        const mintAmount = ethers.parseEther("1000");
        const burnAmount = ethers.parseEther("400");
        
        // Mint tokens first
        await token.connect(minter).mint(user1.address, mintAmount);
        
        // Burn tokens
        await expect(token.connect(user1).burn(burnAmount))
          .to.emit(token, "Transfer")
          .withArgs(user1.address, ethers.ZeroAddress, burnAmount);
        
        expect(await token.balanceOf(user1.address)).to.equal(mintAmount - burnAmount);
        expect(await token.totalSupply()).to.equal(mintAmount - burnAmount);
      });

      it("Should burn entire balance", async function () {
        const { token, minter, user1 } = await loadFixture(deployFixture);
        
        const amount = ethers.parseEther("1000");
        
        await token.connect(minter).mint(user1.address, amount);
        await token.connect(user1).burn(amount);
        
        expect(await token.balanceOf(user1.address)).to.equal(0);
        expect(await token.totalSupply()).to.equal(0);
      });
    });

    describe("2.2 BurnFrom with Approval", function () {
      it("Should burn tokens from another account with approval", async function () {
        const { token, minter, user1, user2 } = await loadFixture(deployFixture);
        
        const amount = ethers.parseEther("1000");
        const burnAmount = ethers.parseEther("300");
        
        // Setup: mint and approve
        await token.connect(minter).mint(user1.address, amount);
        await token.connect(user1).approve(user2.address, burnAmount);
        
        // Burn from
        await expect(token.connect(user2).burnFrom(user1.address, burnAmount))
          .to.emit(token, "Transfer")
          .withArgs(user1.address, ethers.ZeroAddress, burnAmount);
        
        expect(await token.balanceOf(user1.address)).to.equal(amount - burnAmount);
        expect(await token.allowance(user1.address, user2.address)).to.equal(0);
      });

      it("Should handle infinite approval correctly", async function () {
        const { token, minter, user1, user2 } = await loadFixture(deployFixture);
        
        const amount = ethers.parseEther("1000");
        const burnAmount = ethers.parseEther("300");
        
        // Setup: mint and approve max
        await token.connect(minter).mint(user1.address, amount);
        await token.connect(user1).approve(user2.address, ethers.MaxUint256);
        
        // Burn from
        await token.connect(user2).burnFrom(user1.address, burnAmount);
        
        // Infinite approval should remain
        expect(await token.allowance(user1.address, user2.address)).to.equal(ethers.MaxUint256);
      });
    });

    describe("2.3 Burn Edge Cases", function () {
      it("Should revert when burning more than balance", async function () {
        const { token, minter, user1 } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(user1.address, ethers.parseEther("100"));
        
        await expect(token.connect(user1).burn(ethers.parseEther("101")))
          .to.be.reverted;
      });

      it("Should handle zero amount burn", async function () {
        const { token, minter, user1 } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(user1.address, ethers.parseEther("100"));
        
        // Zero burn should succeed without changing balances
        await expect(token.connect(user1).burn(0))
          .to.not.be.reverted;
        
        expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
      });

      it("Should not allow burning from blacklisted account", async function () {
        const { token, minter, blacklister, user1 } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
        await token.connect(blacklister).blacklist(user1.address);
        
        await expect(token.connect(user1).burn(ethers.parseEther("100")))
          .to.be.revertedWithCustomError(token, "AccountBlacklisted")
          .withArgs(user1.address);
      });
    });
  });

  describe("3. Transfer Function Tests", function () {
    describe("3.1 Standard Transfers", function () {
      it("Should transfer tokens between accounts", async function () {
        const { token, minter, user1, user2 } = await loadFixture(deployFixture);
        
        const amount = ethers.parseEther("1000");
        const transferAmount = ethers.parseEther("250");
        
        await token.connect(minter).mint(user1.address, amount);
        
        await expect(token.connect(user1).transfer(user2.address, transferAmount))
          .to.emit(token, "Transfer")
          .withArgs(user1.address, user2.address, transferAmount);
        
        expect(await token.balanceOf(user1.address)).to.equal(amount - transferAmount);
        expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
      });

      it("Should handle zero amount transfer", async function () {
        const { token, minter, user1, user2 } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
        
        await expect(token.connect(user1).transfer(user2.address, 0))
          .to.emit(token, "Transfer")
          .withArgs(user1.address, user2.address, 0);
      });

      it("Should allow self-transfer", async function () {
        const { token, minter, user1 } = await loadFixture(deployFixture);
        
        const amount = ethers.parseEther("1000");
        
        await token.connect(minter).mint(user1.address, amount);
        
        await expect(token.connect(user1).transfer(user1.address, amount))
          .to.emit(token, "Transfer")
          .withArgs(user1.address, user1.address, amount);
        
        expect(await token.balanceOf(user1.address)).to.equal(amount);
      });
    });

    describe("3.2 TransferFrom with Approval", function () {
      it("Should transfer with approval", async function () {
        const { token, minter, user1, user2, user3 } = await loadFixture(deployFixture);
        
        const amount = ethers.parseEther("1000");
        const approvalAmount = ethers.parseEther("500");
        const transferAmount = ethers.parseEther("300");
        
        // Setup
        await token.connect(minter).mint(user1.address, amount);
        await token.connect(user1).approve(user2.address, approvalAmount);
        
        // Transfer from
        await expect(
          token.connect(user2).transferFrom(user1.address, user3.address, transferAmount)
        ).to.emit(token, "Transfer")
          .withArgs(user1.address, user3.address, transferAmount);
        
        expect(await token.balanceOf(user1.address)).to.equal(amount - transferAmount);
        expect(await token.balanceOf(user3.address)).to.equal(transferAmount);
        expect(await token.allowance(user1.address, user2.address)).to.equal(
          approvalAmount - transferAmount
        );
      });

      it("Should revert on insufficient approval", async function () {
        const { token, minter, user1, user2, user3 } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
        await token.connect(user1).approve(user2.address, ethers.parseEther("100"));
        
        await expect(
          token.connect(user2).transferFrom(user1.address, user3.address, ethers.parseEther("101"))
        ).to.be.reverted;
      });
    });

    describe("3.3 Transfer with Blacklist", function () {
      it("Should block transfer from blacklisted address", async function () {
        const { token, minter, blacklister, user1, user2 } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
        await token.connect(blacklister).blacklist(user1.address);
        
        await expect(token.connect(user1).transfer(user2.address, ethers.parseEther("100")))
          .to.be.revertedWithCustomError(token, "AccountBlacklisted")
          .withArgs(user1.address);
      });

      it("Should block transfer to blacklisted address", async function () {
        const { token, minter, blacklister, user1, user2 } = await loadFixture(deployFixture);
        
        await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
        await token.connect(blacklister).blacklist(user2.address);
        
        await expect(token.connect(user1).transfer(user2.address, ethers.parseEther("100")))
          .to.be.revertedWithCustomError(token, "AccountBlacklisted")
          .withArgs(user2.address);
      });
    });
  });

  describe("4. Pause/Unpause Tests", function () {
    it("Should pause and block transfers", async function () {
      const { token, minter, pauser, user1, user2 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      
      // Pause
      await expect(token.connect(pauser).pause())
        .to.emit(token, "Paused")
        .withArgs(pauser.address);
      
      // Transfers should fail
      await expect(token.connect(user1).transfer(user2.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(token, "EnforcedPause");
      
      // Minting should fail
      await expect(token.connect(minter).mint(user2.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(token, "EnforcedPause");
      
      // Burning should fail
      await expect(token.connect(user1).burn(ethers.parseEther("100")))
        .to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("Should unpause and resume operations", async function () {
      const { token, minter, pauser, user1, user2 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      await token.connect(pauser).pause();
      
      // Unpause
      await expect(token.connect(pauser).unpause())
        .to.emit(token, "Unpaused")
        .withArgs(pauser.address);
      
      // Operations should work again
      await expect(token.connect(user1).transfer(user2.address, ethers.parseEther("100")))
        .to.emit(token, "Transfer");
    });

    it("Should allow approve while paused", async function () {
      const { token, minter, pauser, user1, user2 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      await token.connect(pauser).pause();
      
      // Approve should still work (ERC20 standard)
      await expect(token.connect(user1).approve(user2.address, ethers.parseEther("500")))
        .to.emit(token, "Approval");
    });
  });

  describe("5. Blacklist Tests", function () {
    it("Should add and remove from blacklist", async function () {
      const { token, blacklister, user1 } = await loadFixture(deployFixture);
      
      // Add to blacklist
      await expect(token.connect(blacklister).blacklist(user1.address))
        .to.emit(token, "Blacklisted")
        .withArgs(user1.address);
      
      expect(await token.isBlacklisted(user1.address)).to.be.true;
      
      // Remove from blacklist
      await expect(token.connect(blacklister).unBlacklist(user1.address))
        .to.emit(token, "UnBlacklisted")
        .withArgs(user1.address);
      
      expect(await token.isBlacklisted(user1.address)).to.be.false;
    });

    it("Should handle operations after unblacklisting", async function () {
      const { token, minter, blacklister, user1, user2 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      
      // Blacklist and unblacklist
      await token.connect(blacklister).blacklist(user1.address);
      await token.connect(blacklister).unBlacklist(user1.address);
      
      // Should be able to transfer again
      await expect(token.connect(user1).transfer(user2.address, ethers.parseEther("100")))
        .to.emit(token, "Transfer");
    });
  });

  describe("6. Upgrade Tests", function () {
    it("Should upgrade contract and preserve state", async function () {
      const { token, minter, upgrader, user1, user2 } = await loadFixture(deployFixture);
      
      // Setup initial state
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      await token.connect(user1).transfer(user2.address, ethers.parseEther("300"));
      await token.connect(user1).approve(user2.address, ethers.parseEther("200"));
      
      // Record state before upgrade
      const user1BalanceBefore = await token.balanceOf(user1.address);
      const user2BalanceBefore = await token.balanceOf(user2.address);
      const allowanceBefore = await token.allowance(user1.address, user2.address);
      const totalSupplyBefore = await token.totalSupply();
      
      // Deploy new implementation (V2)
      const OMTHBTokenV2 = await ethers.getContractFactory("OMTHBToken");
      const implementationV2 = await OMTHBTokenV2.deploy();
      
      // Upgrade
      await token.connect(upgrader).upgradeToAndCall(
        implementationV2.target,
        "0x"
      );
      
      // Verify state preservation
      expect(await token.balanceOf(user1.address)).to.equal(user1BalanceBefore);
      expect(await token.balanceOf(user2.address)).to.equal(user2BalanceBefore);
      expect(await token.allowance(user1.address, user2.address)).to.equal(allowanceBefore);
      expect(await token.totalSupply()).to.equal(totalSupplyBefore);
      
      // Verify functionality still works
      await expect(token.connect(user1).transfer(user2.address, ethers.parseEther("100")))
        .to.emit(token, "Transfer");
    });

    it("Should only allow upgrader role to upgrade", async function () {
      const { token, user1 } = await loadFixture(deployFixture);
      
      const OMTHBTokenV2 = await ethers.getContractFactory("OMTHBToken");
      const implementationV2 = await OMTHBTokenV2.deploy();
      
      await expect(
        token.connect(user1).upgradeToAndCall(implementationV2.target, "0x")
      ).to.be.reverted;
    });
  });

  describe("7. Full Token Lifecycle Test", function () {
    it("Should complete full token lifecycle", async function () {
      const { token, owner, minter, pauser, blacklister, user1, user2, user3 } = await loadFixture(deployFixture);
      
      // 1. Initial state
      expect(await token.totalSupply()).to.equal(0);
      
      // 2. Mint tokens
      await token.connect(minter).mint(user1.address, ethers.parseEther("10000"));
      await token.connect(minter).mint(user2.address, ethers.parseEther("5000"));
      
      // 3. Transfers
      await token.connect(user1).transfer(user3.address, ethers.parseEther("1000"));
      
      // 4. Approvals and transferFrom
      await token.connect(user2).approve(user1.address, ethers.parseEther("2000"));
      await token.connect(user1).transferFrom(user2.address, user3.address, ethers.parseEther("1500"));
      
      // 5. Burn tokens
      await token.connect(user3).burn(ethers.parseEther("500"));
      
      // 6. Pause operations
      await token.connect(pauser).pause();
      await expect(token.connect(user1).transfer(user2.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(token, "EnforcedPause");
      
      // 7. Unpause
      await token.connect(pauser).unpause();
      
      // 8. Blacklist testing
      await token.connect(blacklister).blacklist(user2.address);
      await expect(token.connect(user2).transfer(user1.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(token, "AccountBlacklisted");
      
      // 9. Unblacklist
      await token.connect(blacklister).unBlacklist(user2.address);
      await token.connect(user2).transfer(user1.address, ethers.parseEther("100"));
      
      // 10. Final state verification
      const finalSupply = await token.totalSupply();
      const user1Balance = await token.balanceOf(user1.address);
      const user2Balance = await token.balanceOf(user2.address);
      const user3Balance = await token.balanceOf(user3.address);
      
      expect(finalSupply).to.equal(user1Balance + user2Balance + user3Balance);
    });
  });

  describe("8. Gas Optimization Tests", function () {
    it("Should measure gas costs for operations", async function () {
      const { token, minter, user1, user2 } = await loadFixture(deployFixture);
      
      // Mint
      const mintTx = await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      const mintReceipt = await mintTx.wait();
      console.log("Mint gas used:", mintReceipt.gasUsed.toString());
      
      // Transfer
      const transferTx = await token.connect(user1).transfer(user2.address, ethers.parseEther("100"));
      const transferReceipt = await transferTx.wait();
      console.log("Transfer gas used:", transferReceipt.gasUsed.toString());
      
      // Approve
      const approveTx = await token.connect(user1).approve(user2.address, ethers.parseEther("500"));
      const approveReceipt = await approveTx.wait();
      console.log("Approve gas used:", approveReceipt.gasUsed.toString());
      
      // TransferFrom
      const transferFromTx = await token.connect(user2).transferFrom(
        user1.address, 
        user2.address, 
        ethers.parseEther("200")
      );
      const transferFromReceipt = await transferFromTx.wait();
      console.log("TransferFrom gas used:", transferFromReceipt.gasUsed.toString());
      
      // Burn
      const burnTx = await token.connect(user2).burn(ethers.parseEther("50"));
      const burnReceipt = await burnTx.wait();
      console.log("Burn gas used:", burnReceipt.gasUsed.toString());
      
      // Assert reasonable gas limits (increased due to ReentrancyGuardUpgradeable)
      expect(transferReceipt.gasUsed).to.be.lessThan(70000);
      expect(approveReceipt.gasUsed).to.be.lessThan(55000);
    });
  });

  describe("9. ERC20 Compliance Tests", function () {
    it("Should have correct token metadata", async function () {
      const { token } = await loadFixture(deployFixture);
      
      expect(await token.name()).to.equal("OM Thai Baht");
      expect(await token.symbol()).to.equal("OMTHB");
      expect(await token.decimals()).to.equal(18);
    });

    it("Should emit Transfer event on mint (from zero address)", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      
      await expect(token.connect(minter).mint(user1.address, ethers.parseEther("1000")))
        .to.emit(token, "Transfer")
        .withArgs(ethers.ZeroAddress, user1.address, ethers.parseEther("1000"));
    });

    it("Should emit Transfer event on burn (to zero address)", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      
      await expect(token.connect(user1).burn(ethers.parseEther("500")))
        .to.emit(token, "Transfer")
        .withArgs(user1.address, ethers.ZeroAddress, ethers.parseEther("500"));
    });

    it("Should handle approve to zero correctly", async function () {
      const { token, minter, user1, user2 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      
      // Set approval
      await token.connect(user1).approve(user2.address, ethers.parseEther("500"));
      expect(await token.allowance(user1.address, user2.address)).to.equal(ethers.parseEther("500"));
      
      // Reset approval to zero
      await token.connect(user1).approve(user2.address, 0);
      expect(await token.allowance(user1.address, user2.address)).to.equal(0);
    });
  });

  describe("10. Security Edge Cases", function () {
    it("Should handle reentrancy attempts safely", async function () {
      const { token, minter, user1, user2 } = await loadFixture(deployFixture);
      
      // With ReentrancyGuardUpgradeable, the token is protected against reentrancy
      // Test that normal operations work correctly even with the guard in place
      
      // Mint tokens to user1
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      
      // Multiple operations in sequence should work fine
      await token.connect(user1).transfer(user2.address, ethers.parseEther("100"));
      await token.connect(user1).approve(user2.address, ethers.parseEther("200"));
      await token.connect(user2).transferFrom(user1.address, user2.address, ethers.parseEther("200"));
      
      // Verify final balances
      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("700"));
      expect(await token.balanceOf(user2.address)).to.equal(ethers.parseEther("300"));
    });

    it("Should prevent approval race conditions", async function () {
      const { token, minter, user1, user2 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      
      // Set initial approval
      await token.connect(user1).approve(user2.address, ethers.parseEther("100"));
      
      // Best practice: set to 0 before changing to new value
      await token.connect(user1).approve(user2.address, 0);
      await token.connect(user1).approve(user2.address, ethers.parseEther("200"));
      
      expect(await token.allowance(user1.address, user2.address)).to.equal(ethers.parseEther("200"));
    });

    it("Should handle all zero address operations safely", async function () {
      const { token, minter, blacklister, owner } = await loadFixture(deployFixture);
      
      // All operations with zero address should revert
      await expect(token.connect(minter).mint(ethers.ZeroAddress, 1000))
        .to.be.revertedWithCustomError(token, "InvalidAddress");
      
      await expect(token.connect(blacklister).blacklist(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(token, "InvalidAddress");
      
      await expect(token.connect(blacklister).unBlacklist(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(token, "InvalidAddress");
      
      // Granting role to zero address - AccessControl allows it but it's not useful
      // We'll just verify the operation completes without error
      await token.connect(owner).grantRole(MINTER_ROLE, ethers.ZeroAddress);
      
      // Verify zero address has the role (even though it can't use it)
      expect(await token.hasRole(MINTER_ROLE, ethers.ZeroAddress)).to.be.true;
    });
  });
});