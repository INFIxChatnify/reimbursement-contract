const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Reimbursement Simulation Test", function () {
    let omthbToken;
    let factory;
    let project;
    let admin, secretary, committee1, committee2, finance, director, requester, recipient;
    
    const projectId = "TEST-PROJECT-001";
    const projectBudget = ethers.parseEther("100000");
    const requestAmount = ethers.parseEther("5000");
    
    beforeEach(async function () {
        [admin, secretary, committee1, committee2, finance, director, requester, recipient] = await ethers.getSigners();
        
        // Deploy OMTHB Token
        const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
        omthbToken = await upgrades.deployProxy(OMTHBToken, [admin.address]);
        await omthbToken.waitForDeployment();
        
        // Deploy implementation
        const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
        const implementation = await ProjectReimbursement.deploy();
        await implementation.waitForDeployment();
        
        // Deploy MetaTxForwarder
        const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
        const forwarder = await MetaTxForwarder.deploy();
        await forwarder.waitForDeployment();
        
        // Deploy factory
        const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
        factory = await ProjectFactory.deploy(
            await implementation.getAddress(),
            await omthbToken.getAddress(),
            await forwarder.getAddress(),
            admin.address
        );
        await factory.waitForDeployment();
        
        // Setup factory roles
        await factory.grantRole(await factory.PROJECT_CREATOR_ROLE(), admin.address);
        
        // Create project
        const tx = await factory.createProject(projectId, projectBudget, admin.address);
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => {
            try {
                const parsed = factory.interface.parseLog(log);
                return parsed && parsed.name === 'ProjectCreated';
            } catch (e) {
                return false;
            }
        });
        
        const projectAddress = event.args.projectContract;
        project = await ethers.getContractAt("ProjectReimbursement", projectAddress);
        
        // Mint and fund project
        await omthbToken.mint(admin.address, projectBudget);
        await omthbToken.transfer(projectAddress, projectBudget);
        
        // Setup project roles
        await project.grantRole(await project.SECRETARY_ROLE(), secretary.address);
        await project.grantRole(await project.COMMITTEE_ROLE(), committee1.address);
        await project.grantRole(await project.COMMITTEE_ROLE(), committee2.address);
        await project.grantRole(await project.FINANCE_ROLE(), finance.address);
        await project.grantRole(await project.DIRECTOR_ROLE(), director.address);
        await project.grantRole(await project.REQUESTER_ROLE(), requester.address);
    });
    
    describe("Complete Approval Flow", function () {
        it("Should complete 5-level approval and auto-distribute funds", async function () {
            // Create request
            await project.connect(requester).createRequest(
                recipient.address,
                requestAmount,
                "Test reimbursement",
                "QmTestHash123"
            );
            
            const requestId = 0;
            const chainId = (await ethers.provider.getNetwork()).chainId;
            
            // Helper function to generate commitment
            function generateCommitment(approver, requestId, chainId, nonce) {
                return ethers.keccak256(ethers.solidityPacked(
                    ["address", "uint256", "uint256", "uint256"],
                    [approver, requestId, chainId, nonce]
                ));
            }
            
            // Level 1: Secretary
            const secretaryNonce = 123456;
            const secretaryCommitment = generateCommitment(secretary.address, requestId, chainId, secretaryNonce);
            await project.connect(secretary).commitApproval(requestId, secretaryCommitment);
            
            // Wait a bit (in real scenario would be 30 minutes)
            await ethers.provider.send("evm_increaseTime", [1801]); // 30 minutes + 1 second
            await ethers.provider.send("evm_mine");
            
            await project.connect(secretary).approveBySecretary(requestId, secretaryNonce);
            
            let request = await project.getRequest(requestId);
            expect(request.status).to.equal(1); // SecretaryApproved
            
            // Level 2: Committee
            const committee1Nonce = 234567;
            const committee1Commitment = generateCommitment(committee1.address, requestId, chainId, committee1Nonce);
            await project.connect(committee1).commitApproval(requestId, committee1Commitment);
            
            await ethers.provider.send("evm_increaseTime", [1801]);
            await ethers.provider.send("evm_mine");
            
            await project.connect(committee1).approveByCommittee(requestId, committee1Nonce);
            
            request = await project.getRequest(requestId);
            expect(request.status).to.equal(2); // CommitteeApproved
            
            // Level 3: Finance
            const financeNonce = 345678;
            const financeCommitment = generateCommitment(finance.address, requestId, chainId, financeNonce);
            await project.connect(finance).commitApproval(requestId, financeCommitment);
            
            await ethers.provider.send("evm_increaseTime", [1801]);
            await ethers.provider.send("evm_mine");
            
            await project.connect(finance).approveByFinance(requestId, financeNonce);
            
            request = await project.getRequest(requestId);
            expect(request.status).to.equal(3); // FinanceApproved
            
            // Level 4: Additional Committee
            const committee2Nonce = 456789;
            const committee2Commitment = generateCommitment(committee2.address, requestId, chainId, committee2Nonce);
            await project.connect(committee2).commitApproval(requestId, committee2Commitment);
            
            await ethers.provider.send("evm_increaseTime", [1801]);
            await ethers.provider.send("evm_mine");
            
            await project.connect(committee2).approveByCommitteeAdditional(requestId, committee2Nonce);
            
            request = await project.getRequest(requestId);
            expect(request.status).to.equal(3); // Still FinanceApproved
            
            // Level 5: Director (triggers auto-distribution)
            const directorNonce = 567890;
            const directorCommitment = generateCommitment(director.address, requestId, chainId, directorNonce);
            await project.connect(director).commitApproval(requestId, directorCommitment);
            
            await ethers.provider.send("evm_increaseTime", [1801]);
            await ethers.provider.send("evm_mine");
            
            const recipientBalanceBefore = await omthbToken.balanceOf(recipient.address);
            
            await project.connect(director).approveByDirector(requestId, directorNonce);
            
            // Verify final state
            request = await project.getRequest(requestId);
            expect(request.status).to.equal(5); // Distributed
            
            // Verify funds transferred
            const recipientBalanceAfter = await omthbToken.balanceOf(recipient.address);
            expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(requestAmount);
            
            // Verify project balance decreased
            const projectBalance = await omthbToken.balanceOf(await project.getAddress());
            expect(projectBalance).to.equal(projectBudget - requestAmount);
        });
    });
});