// Post-deployment script for initial setup and testing
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function loadDeployment(networkName) {
    const deploymentPath = path.join(__dirname, '..', 'deployments', `${networkName}-latest.json`);
    if (!fs.existsSync(deploymentPath)) {
        throw new Error(`No deployment found for network: ${networkName}`);
    }
    return JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
}

async function main() {
    console.log("\n=== Post-Deployment Setup ===");
    
    const [signer] = await ethers.getSigners();
    console.log(`Using account: ${signer.address}`);
    
    // Load deployment info
    const deployment = await loadDeployment(network.name);
    console.log(`\nLoaded deployment from: ${deployment.deployedAt}`);
    
    // Connect to contracts
    const omthbToken = await ethers.getContractAt("OMTHBToken", deployment.contracts.OMTHBToken.proxy);
    const projectFactory = await ethers.getContractAt("ProjectFactory", deployment.contracts.ProjectFactory);
    const auditAnchor = await ethers.getContractAt("AuditAnchor", deployment.contracts.AuditAnchor);
    
    // Check current state
    console.log("\n=== Current State ===");
    
    // OMTHB Token info
    const tokenName = await omthbToken.name();
    const tokenSymbol = await omthbToken.symbol();
    const totalSupply = await omthbToken.totalSupply();
    console.log(`\nOMTHB Token:`);
    console.log(`  Name: ${tokenName}`);
    console.log(`  Symbol: ${tokenSymbol}`);
    console.log(`  Total Supply: ${ethers.formatEther(totalSupply)} ${tokenSymbol}`);
    
    // Check roles
    const hasMinterRole = await omthbToken.hasRole(await omthbToken.MINTER_ROLE(), signer.address);
    const hasProjectCreatorRole = await projectFactory.hasRole(await projectFactory.PROJECT_CREATOR_ROLE(), signer.address);
    const isAuthorizedAnchor = await auditAnchor.authorizedAnchors(signer.address);
    
    console.log(`\nRoles for ${signer.address}:`);
    console.log(`  MINTER_ROLE: ${hasMinterRole}`);
    console.log(`  PROJECT_CREATOR_ROLE: ${hasProjectCreatorRole}`);
    console.log(`  Authorized Anchor: ${isAuthorizedAnchor}`);
    
    // Optional: Mint initial tokens
    if (process.env.MINT_INITIAL_TOKENS === 'true' && hasMinterRole) {
        console.log("\n=== Minting Initial Tokens ===");
        const mintAmount = ethers.parseEther(process.env.INITIAL_MINT_AMOUNT || "1000000");
        const mintTo = process.env.INITIAL_MINT_TO || signer.address;
        
        console.log(`Minting ${ethers.formatEther(mintAmount)} OMTHB to ${mintTo}...`);
        const mintTx = await omthbToken.mint(mintTo, mintAmount);
        await mintTx.wait();
        console.log(`✓ Minted successfully. Tx: ${mintTx.hash}`);
        
        const newBalance = await omthbToken.balanceOf(mintTo);
        console.log(`New balance: ${ethers.formatEther(newBalance)} OMTHB`);
    }
    
    // Optional: Create test project
    if (process.env.CREATE_TEST_PROJECT === 'true' && hasProjectCreatorRole) {
        console.log("\n=== Creating Test Project ===");
        
        const projectId = process.env.TEST_PROJECT_ID || `TEST-${Date.now()}`;
        const projectBudget = ethers.parseEther(process.env.TEST_PROJECT_BUDGET || "100000");
        const projectAdmin = process.env.TEST_PROJECT_ADMIN || signer.address;
        
        console.log(`Creating project:`);
        console.log(`  ID: ${projectId}`);
        console.log(`  Budget: ${ethers.formatEther(projectBudget)} OMTHB`);
        console.log(`  Admin: ${projectAdmin}`);
        
        const createTx = await projectFactory.createProject(projectId, projectBudget, projectAdmin);
        const receipt = await createTx.wait();
        
        // Find the ProjectCreated event
        const event = receipt.logs.find(log => {
            try {
                const parsed = projectFactory.interface.parseLog(log);
                return parsed.name === 'ProjectCreated';
            } catch {
                return false;
            }
        });
        
        if (event) {
            const parsedEvent = projectFactory.interface.parseLog(event);
            const projectAddress = parsedEvent.args.projectContract;
            console.log(`✓ Project created at: ${projectAddress}`);
            console.log(`  Transaction: ${createTx.hash}`);
            
            // Fund the project
            if (process.env.FUND_TEST_PROJECT === 'true') {
                console.log(`\nFunding project with ${ethers.formatEther(projectBudget)} OMTHB...`);
                const approveTx = await omthbToken.approve(projectAddress, projectBudget);
                await approveTx.wait();
                
                const projectContract = await ethers.getContractAt("ProjectReimbursement", projectAddress);
                const fundTx = await projectContract.fundProject(projectBudget);
                await fundTx.wait();
                console.log(`✓ Project funded successfully`);
            }
        }
    }
    
    // Optional: Anchor test audit batch
    if (process.env.CREATE_TEST_AUDIT === 'true' && isAuthorizedAnchor) {
        console.log("\n=== Creating Test Audit Batch ===");
        
        const testIpfsHash = "QmTestHash123456789";
        const testMerkleRoot = ethers.keccak256(ethers.toUtf8Bytes("test-merkle-root"));
        const testEntryCount = 10;
        const testBatchType = "TEST";
        
        console.log(`Anchoring audit batch:`);
        console.log(`  IPFS Hash: ${testIpfsHash}`);
        console.log(`  Merkle Root: ${testMerkleRoot}`);
        console.log(`  Entry Count: ${testEntryCount}`);
        console.log(`  Type: ${testBatchType}`);
        
        const anchorTx = await auditAnchor.anchorAuditBatch(
            testIpfsHash,
            testMerkleRoot,
            testEntryCount,
            testBatchType
        );
        const receipt = await anchorTx.wait();
        
        const event = receipt.logs.find(log => {
            try {
                const parsed = auditAnchor.interface.parseLog(log);
                return parsed.name === 'BatchAnchored';
            } catch {
                return false;
            }
        });
        
        if (event) {
            const parsedEvent = auditAnchor.interface.parseLog(event);
            console.log(`✓ Audit batch anchored with ID: ${parsedEvent.args.batchId}`);
            console.log(`  Transaction: ${anchorTx.hash}`);
        }
    }
    
    // Display useful commands
    console.log("\n=== Useful Commands ===");
    console.log("\nInteract with contracts:");
    console.log(`npx hardhat console --network ${network.name}`);
    console.log(`> const omthb = await ethers.getContractAt("OMTHBToken", "${deployment.contracts.OMTHBToken.proxy}")`);
    console.log(`> const factory = await ethers.getContractAt("ProjectFactory", "${deployment.contracts.ProjectFactory}")`);
    console.log(`> const audit = await ethers.getContractAt("AuditAnchor", "${deployment.contracts.AuditAnchor}")`);
    
    console.log("\nMint tokens:");
    console.log(`> await omthb.mint("0xADDRESS", ethers.parseEther("1000"))`);
    
    console.log("\nCreate project:");
    console.log(`> await factory.createProject("PROJECT-001", ethers.parseEther("50000"), "0xADMIN_ADDRESS")`);
    
    console.log("\nAdd deputy:");
    console.log(`> await factory.addDeputy("0xDEPUTY_ADDRESS")`);
    
    console.log("\n✓ Post-deployment setup complete");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });