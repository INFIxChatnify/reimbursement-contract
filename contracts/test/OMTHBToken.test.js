const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("OMTHBToken", function () {
    let omthbToken;
    let owner;
    let minter;
    let user1;
    let user2;

    beforeEach(async function () {
        [owner, minter, user1, user2] = await ethers.getSigners();

        const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
        omthbToken = await upgrades.deployProxy(OMTHBToken, [owner.address], {
            initializer: 'initialize',
            kind: 'uups'
        });
        await omthbToken.deployed();
    });

    describe("Deployment", function () {
        it("Should set the correct name and symbol", async function () {
            expect(await omthbToken.name()).to.equal("OM Thai Baht");
            expect(await omthbToken.symbol()).to.equal("OMTHB");
        });

        it("Should set the deployer as admin with all roles", async function () {
            const DEFAULT_ADMIN_ROLE = await omthbToken.DEFAULT_ADMIN_ROLE();
            const MINTER_ROLE = await omthbToken.MINTER_ROLE();
            const PAUSER_ROLE = await omthbToken.PAUSER_ROLE();
            const BLACKLISTER_ROLE = await omthbToken.BLACKLISTER_ROLE();
            const UPGRADER_ROLE = await omthbToken.UPGRADER_ROLE();

            expect(await omthbToken.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
            expect(await omthbToken.hasRole(MINTER_ROLE, owner.address)).to.be.true;
            expect(await omthbToken.hasRole(PAUSER_ROLE, owner.address)).to.be.true;
            expect(await omthbToken.hasRole(BLACKLISTER_ROLE, owner.address)).to.be.true;
            expect(await omthbToken.hasRole(UPGRADER_ROLE, owner.address)).to.be.true;
        });

        it("Should have zero initial supply", async function () {
            expect(await omthbToken.totalSupply()).to.equal(0);
        });
    });

    describe("Minting", function () {
        it("Should allow minter to mint tokens", async function () {
            const amount = ethers.utils.parseEther("1000");
            await omthbToken.connect(owner).mint(user1.address, amount);
            
            expect(await omthbToken.balanceOf(user1.address)).to.equal(amount);
            expect(await omthbToken.totalSupply()).to.equal(amount);
        });

        it("Should emit Minted event", async function () {
            const amount = ethers.utils.parseEther("1000");
            await expect(omthbToken.connect(owner).mint(user1.address, amount))
                .to.emit(omthbToken, "Minted")
                .withArgs(user1.address, amount);
        });

        it("Should not allow non-minter to mint", async function () {
            const amount = ethers.utils.parseEther("1000");
            await expect(omthbToken.connect(user1).mint(user2.address, amount))
                .to.be.revertedWith(/AccessControl/);
        });

        it("Should not allow minting to zero address", async function () {
            const amount = ethers.utils.parseEther("1000");
            await expect(omthbToken.connect(owner).mint(ethers.constants.AddressZero, amount))
                .to.be.revertedWithCustomError(omthbToken, "InvalidAddress");
        });

        it("Should not allow minting zero amount", async function () {
            await expect(omthbToken.connect(owner).mint(user1.address, 0))
                .to.be.revertedWithCustomError(omthbToken, "InvalidAmount");
        });
    });

    describe("Burning", function () {
        beforeEach(async function () {
            const amount = ethers.utils.parseEther("1000");
            await omthbToken.connect(owner).mint(user1.address, amount);
        });

        it("Should allow users to burn their own tokens", async function () {
            const burnAmount = ethers.utils.parseEther("100");
            await omthbToken.connect(user1).burn(burnAmount);
            
            expect(await omthbToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("900"));
            expect(await omthbToken.totalSupply()).to.equal(ethers.utils.parseEther("900"));
        });

        it("Should allow approved addresses to burn tokens", async function () {
            const burnAmount = ethers.utils.parseEther("100");
            await omthbToken.connect(user1).approve(user2.address, burnAmount);
            await omthbToken.connect(user2).burnFrom(user1.address, burnAmount);
            
            expect(await omthbToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("900"));
        });
    });

    describe("Pausing", function () {
        beforeEach(async function () {
            const amount = ethers.utils.parseEther("1000");
            await omthbToken.connect(owner).mint(user1.address, amount);
        });

        it("Should allow pauser to pause transfers", async function () {
            await omthbToken.connect(owner).pause();
            expect(await omthbToken.paused()).to.be.true;
        });

        it("Should prevent transfers when paused", async function () {
            await omthbToken.connect(owner).pause();
            
            await expect(omthbToken.connect(user1).transfer(user2.address, ethers.utils.parseEther("100")))
                .to.be.revertedWith("Pausable: paused");
        });

        it("Should allow unpausing", async function () {
            await omthbToken.connect(owner).pause();
            await omthbToken.connect(owner).unpause();
            
            expect(await omthbToken.paused()).to.be.false;
            
            // Should allow transfers after unpausing
            await omthbToken.connect(user1).transfer(user2.address, ethers.utils.parseEther("100"));
            expect(await omthbToken.balanceOf(user2.address)).to.equal(ethers.utils.parseEther("100"));
        });
    });

    describe("Blacklisting", function () {
        beforeEach(async function () {
            const amount = ethers.utils.parseEther("1000");
            await omthbToken.connect(owner).mint(user1.address, amount);
        });

        it("Should allow blacklister to blacklist addresses", async function () {
            await omthbToken.connect(owner).blacklist(user1.address);
            expect(await omthbToken.isBlacklisted(user1.address)).to.be.true;
        });

        it("Should prevent blacklisted addresses from transferring", async function () {
            await omthbToken.connect(owner).blacklist(user1.address);
            
            await expect(omthbToken.connect(user1).transfer(user2.address, ethers.utils.parseEther("100")))
                .to.be.revertedWithCustomError(omthbToken, "AccountBlacklisted")
                .withArgs(user1.address);
        });

        it("Should prevent transfers to blacklisted addresses", async function () {
            await omthbToken.connect(owner).blacklist(user2.address);
            
            await expect(omthbToken.connect(user1).transfer(user2.address, ethers.utils.parseEther("100")))
                .to.be.revertedWithCustomError(omthbToken, "AccountBlacklisted")
                .withArgs(user2.address);
        });

        it("Should allow removing from blacklist", async function () {
            await omthbToken.connect(owner).blacklist(user1.address);
            await omthbToken.connect(owner).unBlacklist(user1.address);
            
            expect(await omthbToken.isBlacklisted(user1.address)).to.be.false;
            
            // Should allow transfers after unblacklisting
            await omthbToken.connect(user1).transfer(user2.address, ethers.utils.parseEther("100"));
            expect(await omthbToken.balanceOf(user2.address)).to.equal(ethers.utils.parseEther("100"));
        });
    });

    describe("Upgradeability", function () {
        it("Should allow upgrader to upgrade the contract", async function () {
            const OMTHBTokenV2 = await ethers.getContractFactory("OMTHBToken");
            const upgraded = await upgrades.upgradeProxy(omthbToken.address, OMTHBTokenV2);
            
            expect(upgraded.address).to.equal(omthbToken.address);
            expect(await upgraded.name()).to.equal("OM Thai Baht");
        });

        it("Should not allow non-upgrader to upgrade", async function () {
            const OMTHBTokenV2 = await ethers.getContractFactory("OMTHBToken");
            
            await expect(
                upgrades.upgradeProxy(omthbToken.address, OMTHBTokenV2.connect(user1))
            ).to.be.reverted;
        });
    });
});