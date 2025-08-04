const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Simplified Integration Tests", function () {
    async function deployFixture() {
        const [admin, user1, user2] = await ethers.getSigners();

        // Deploy mock OMTHB token
        const MockToken = await ethers.getContractFactory("MockOMTHB");
        const omthbToken = await MockToken.deploy();
        
        // Deploy MetaTxForwarder
        const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
        const metaTxForwarder = await MetaTxForwarder.deploy();
        
        // Deploy AuditAnchor
        const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
        const auditAnchor = await AuditAnchor.deploy();

        return { omthbToken, metaTxForwarder, auditAnchor, admin, user1, user2 };
    }

    describe("Basic Functionality", function () {
        it("Should deploy all contracts", async function () {
            const { omthbToken, metaTxForwarder, auditAnchor } = await loadFixture(deployFixture);
            
            expect(await omthbToken.name()).to.equal("Mock OMTHB");
            expect(await metaTxForwarder.owner()).to.not.equal(ethers.ZeroAddress);
            expect(await auditAnchor.owner()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should mint and transfer tokens", async function () {
            const { omthbToken, user1, user2 } = await loadFixture(deployFixture);
            
            await omthbToken.mint(user1.address, ethers.parseEther("1000"));
            expect(await omthbToken.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));
            
            await omthbToken.connect(user1).transfer(user2.address, ethers.parseEther("100"));
            expect(await omthbToken.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
        });

        it("Should handle audit batches", async function () {
            const { auditAnchor, admin } = await loadFixture(deployFixture);
            
            const ipfsHash = "QmTest123";
            const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("test"));
            const entryCount = 5;
            const batchType = "PAYMENT_REQUEST";
            
            await expect(auditAnchor.connect(admin).anchorAuditBatch(ipfsHash, merkleRoot, entryCount, batchType))
                .to.emit(auditAnchor, "BatchAnchored");
                
            const [batchesAnchored, isAuthorized] = await auditAnchor.getAnchorStatistics(admin.address);
            expect(batchesAnchored).to.equal(1);
            expect(isAuthorized).to.be.true;
        });
    });
});