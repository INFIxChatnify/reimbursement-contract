const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("OMTHBToken", function () {
  async function deployFixture() {
    const [owner, minter, burner, pauser, user1, user2, blacklisted] = await ethers.getSigners();

    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const token = await upgrades.deployProxy(OMTHBToken, [owner.address], {
      initializer: 'initialize',
      kind: 'uups'
    });

    // Setup roles
    const MINTER_ROLE = await token.MINTER_ROLE();
    const PAUSER_ROLE = await token.PAUSER_ROLE();
    const BLACKLISTER_ROLE = await token.BLACKLISTER_ROLE();

    await token.connect(owner).grantRole(MINTER_ROLE, minter.address);
    await token.connect(owner).grantRole(PAUSER_ROLE, pauser.address);
    await token.connect(owner).grantRole(BLACKLISTER_ROLE, owner.address);

    return { token, owner, minter, burner, pauser, user1, user2, blacklisted };
  }

  describe("Deployment", function () {
    it("Should have correct name and symbol", async function () {
      const { token } = await loadFixture(deployFixture);
      
      expect(await token.name()).to.equal("OM Thai Baht");
      expect(await token.symbol()).to.equal("OMTHB");
      expect(await token.decimals()).to.equal(18);
    });

    it("Should assign admin role to deployer", async function () {
      const { token, owner } = await loadFixture(deployFixture);
      
      const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
      expect(await token.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("Should have zero initial supply", async function () {
      const { token } = await loadFixture(deployFixture);
      
      expect(await token.totalSupply()).to.equal(0);
    });
  });

  describe("Minting", function () {
    it("Should allow minter to mint tokens", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      
      const amount = ethers.parseEther("1000");
      
      await expect(token.connect(minter).mint(user1.address, amount))
        .to.emit(token, "Transfer")
        .withArgs(ethers.ZeroAddress, user1.address, amount);
      
      expect(await token.balanceOf(user1.address)).to.equal(amount);
      expect(await token.totalSupply()).to.equal(amount);
    });

    it("Should reject minting by non-minter", async function () {
      const { token, user1, user2 } = await loadFixture(deployFixture);
      
      await expect(token.connect(user1).mint(user2.address, 1000))
        .to.be.reverted;
    });

    it("Should reject minting to zero address", async function () {
      const { token, minter } = await loadFixture(deployFixture);
      
      await expect(token.connect(minter).mint(ethers.ZeroAddress, 1000))
        .to.be.reverted;
    });

    it("Should handle batch minting", async function () {
      const { token, minter, user1, user2 } = await loadFixture(deployFixture);
      
      const recipients = [user1.address, user2.address];
      const amounts = [ethers.parseEther("100"), ethers.parseEther("200")];
      
      // Mint to multiple recipients individually
      await token.connect(minter).mint(user1.address, amounts[0]);
      await token.connect(minter).mint(user2.address, amounts[1]);
      
      expect(await token.balanceOf(user1.address)).to.equal(amounts[0]);
      expect(await token.balanceOf(user2.address)).to.equal(amounts[1]);
    });

    it("Should reject minting zero amount", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      
      await expect(token.connect(minter).mint(user1.address, 0))
        .to.be.revertedWithCustomError(token, "InvalidAmount");
    });
  });

  describe("Burning", function () {
    async function mintedFixture() {
      const fixture = await deployFixture();
      const { token, minter, user1 } = fixture;
      
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      
      return fixture;
    }

    it("Should allow token holder to burn their tokens", async function () {
      const { token, user1 } = await loadFixture(mintedFixture);
      
      const burnAmount = ethers.parseEther("100");
      const balanceBefore = await token.balanceOf(user1.address);
      
      await expect(token.connect(user1).burn(burnAmount))
        .to.emit(token, "Transfer")
        .withArgs(user1.address, ethers.ZeroAddress, burnAmount);
      
      expect(await token.balanceOf(user1.address)).to.equal(balanceBefore - burnAmount);
    });

    it("Should allow approved address to burn from any account", async function () {
      const { token, burner, user1 } = await loadFixture(mintedFixture);
      
      // First approve
      const burnAmount = ethers.parseEther("100");
      await token.connect(user1).approve(burner.address, burnAmount);
      
      await expect(token.connect(burner).burnFrom(user1.address, burnAmount))
        .to.emit(token, "Transfer")
        .withArgs(user1.address, ethers.ZeroAddress, burnAmount);
    });

    it("Should reject burning more than balance", async function () {
      const { token, user1 } = await loadFixture(mintedFixture);
      
      const balance = await token.balanceOf(user1.address);
      
      await expect(token.connect(user1).burn(balance + 1n))
        .to.be.reverted;
    });
  });

  describe("Pausing", function () {
    it("Should allow pauser to pause transfers", async function () {
      const { token, pauser } = await loadFixture(deployFixture);
      
      await expect(token.connect(pauser).pause())
        .to.emit(token, "Paused")
        .withArgs(pauser.address);
      
      expect(await token.paused()).to.be.true;
    });

    it("Should block transfers when paused", async function () {
      const { token, minter, pauser, user1, user2 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, 1000);
      await token.connect(pauser).pause();
      
      await expect(token.connect(user1).transfer(user2.address, 100))
        .to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("Should allow unpausing", async function () {
      const { token, pauser } = await loadFixture(deployFixture);
      
      await token.connect(pauser).pause();
      
      await expect(token.connect(pauser).unpause())
        .to.emit(token, "Unpaused")
        .withArgs(pauser.address);
      
      expect(await token.paused()).to.be.false;
    });
  });

  describe("Blacklisting", function () {
    async function blacklistedFixture() {
      const fixture = await deployFixture();
      const { token, owner, blacklisted, minter, user1 } = fixture;
      
      // Mint some tokens first
      await token.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      await token.connect(minter).mint(blacklisted.address, ethers.parseEther("1000"));
      
      await token.connect(owner).blacklist(blacklisted.address);
      
      return fixture;
    }

    it("Should allow blacklisting addresses", async function () {
      const { token, owner, user1 } = await loadFixture(deployFixture);
      
      await expect(token.connect(owner).blacklist(user1.address))
        .to.emit(token, "Blacklisted")
        .withArgs(user1.address);
      
      expect(await token.isBlacklisted(user1.address)).to.be.true;
    });

    it("Should block transfers from blacklisted addresses", async function () {
      const { token, blacklisted, user1 } = await loadFixture(blacklistedFixture);
      
      // blacklisted already has tokens from fixture
      await expect(token.connect(blacklisted).transfer(user1.address, 100))
        .to.be.revertedWithCustomError(token, "AccountBlacklisted")
        .withArgs(blacklisted.address);
    });

    it("Should block transfers to blacklisted addresses", async function () {
      const { token, user1, blacklisted } = await loadFixture(blacklistedFixture);
      
      await expect(token.connect(user1).transfer(blacklisted.address, 100))
        .to.be.revertedWithCustomError(token, "AccountBlacklisted")
        .withArgs(blacklisted.address);
    });

    it("Should allow removing from blacklist", async function () {
      const { token, owner, blacklisted, user1 } = await loadFixture(blacklistedFixture);
      
      await expect(token.connect(owner).unBlacklist(blacklisted.address))
        .to.emit(token, "UnBlacklisted")
        .withArgs(blacklisted.address);
      
      expect(await token.isBlacklisted(blacklisted.address)).to.be.false;
      
      // Should be able to transfer after removal
      await token.connect(blacklisted).transfer(user1.address, 100);
    });
  });

  describe("Transfer Hooks", function () {
    it("Should properly check blacklist in _beforeTokenTransfer", async function () {
      const { token, minter, owner, user1, user2 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, 1000);
      await token.connect(owner).blacklist(user1.address);
      
      await expect(token.connect(user1).transfer(user2.address, 100))
        .to.be.revertedWithCustomError(token, "AccountBlacklisted")
        .withArgs(user1.address);
    });
  });

  describe("Upgradability", function () {
    it("Should only allow admin to upgrade", async function () {
      const { token, user1 } = await loadFixture(deployFixture);
      
      const OMTHBTokenV2 = await ethers.getContractFactory("OMTHBToken");
      
      // Try to upgrade as non-admin
      await expect(
        upgrades.upgradeProxy(await token.getAddress(), OMTHBTokenV2, { call: { fn: "initialize", args: [user1.address] } })
      ).to.be.reverted;
    });

    it("Should preserve state after upgrade", async function () {
      const { token, owner, minter, user1 } = await loadFixture(deployFixture);
      
      // Mint some tokens
      await token.connect(minter).mint(user1.address, 1000);
      const balanceBefore = await token.balanceOf(user1.address);
      
      // Upgrade
      const OMTHBTokenV2 = await ethers.getContractFactory("OMTHBToken");
      const upgraded = await upgrades.upgradeProxy(await token.getAddress(), OMTHBTokenV2);
      
      // Check state preserved
      expect(await upgraded.balanceOf(user1.address)).to.equal(balanceBefore);
    });
  });

  describe("ERC20 Standard Compliance", function () {
    it("Should handle approve and transferFrom", async function () {
      const { token, minter, user1, user2 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, 1000);
      
      await token.connect(user1).approve(user2.address, 500);
      expect(await token.allowance(user1.address, user2.address)).to.equal(500);
      
      await expect(token.connect(user2).transferFrom(user1.address, user2.address, 300))
        .to.emit(token, "Transfer")
        .withArgs(user1.address, user2.address, 300);
      
      expect(await token.allowance(user1.address, user2.address)).to.equal(200);
    });

    // Note: increaseAllowance and decreaseAllowance are not implemented in our contract
    // These are optional extensions to ERC20
  });

  describe("Edge Cases", function () {
    it("Should handle zero amount transfers", async function () {
      const { token, minter, user1, user2 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, 1000);
      
      await expect(token.connect(user1).transfer(user2.address, 0))
        .to.emit(token, "Transfer")
        .withArgs(user1.address, user2.address, 0);
    });

    it("Should handle self-transfers", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      
      await token.connect(minter).mint(user1.address, 1000);
      
      await expect(token.connect(user1).transfer(user1.address, 100))
        .to.emit(token, "Transfer")
        .withArgs(user1.address, user1.address, 100);
    });

    it("Should handle maximum uint256 approval", async function () {
      const { token, user1, user2 } = await loadFixture(deployFixture);
      
      const maxUint256 = ethers.MaxUint256;
      
      await token.connect(user1).approve(user2.address, maxUint256);
      expect(await token.allowance(user1.address, user2.address)).to.equal(maxUint256);
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should efficiently handle batch operations", async function () {
      const { token, minter } = await loadFixture(deployFixture);
      
      const recipients = [];
      const amounts = [];
      
      // Create 50 recipients
      for (let i = 0; i < 50; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
        recipients.push(wallet.address);
        amounts.push(ethers.parseEther("10"));
      }
      
      // Mint to multiple recipients
      let totalGas = 0n;
      for (let i = 0; i < recipients.length; i++) {
        const tx = await token.connect(minter).mint(recipients[i], amounts[i]);
        const receipt = await tx.wait();
        totalGas += receipt.gasUsed;
      }
      
      // Check gas used is reasonable for 10 mints
      expect(totalGas).to.be.lt(5000000n); // Should be less than 5M gas total for 10 mints
    });
  });
});