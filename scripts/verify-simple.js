// Simple deployment verification script
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("\n=== Deployment Verification ===");
    console.log(`Network: ${network.name}`);
    
    // Load deployment
    const deploymentPath = path.join(__dirname, '..', 'deployments', `${network.name}-latest.json`);
    if (!fs.existsSync(deploymentPath)) {
        console.error("No deployment found!");
        return;
    }
    
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const contracts = deployment.state?.contracts || deployment.contracts || {};
    
    console.log(`\nDeployment date: ${deployment.deployedAt}`);
    console.log(`Status: ${deployment.status || 'unknown'}`);
    
    // Check each contract
    console.log("\n=== Contract Status ===");
    
    // 1. OMTHB Token
    if (contracts.OMTHBToken) {
        const addr = contracts.OMTHBToken.proxy || contracts.OMTHBToken;
        const code = await ethers.provider.getCode(addr);
        console.log(`\n1. OMTHB Token:`);
        console.log(`   Proxy: ${addr}`);
        console.log(`   Deployed: ${code !== '0x' ? '✓' : '✗'}`);
        
        if (code !== '0x') {
            try {
                const token = await ethers.getContractAt("OMTHBToken", addr);
                const name = await token.name();
                const symbol = await token.symbol();
                const totalSupply = await token.totalSupply();
                console.log(`   Name: ${name}`);
                console.log(`   Symbol: ${symbol}`);
                console.log(`   Total Supply: ${ethers.formatEther(totalSupply)}`);
            } catch (e) {
                console.log(`   Error reading contract: ${e.message}`);
            }
        }
    }
    
    // 2. MetaTxForwarder
    if (contracts.MetaTxForwarder) {
        const code = await ethers.provider.getCode(contracts.MetaTxForwarder);
        console.log(`\n2. MetaTxForwarder:`);
        console.log(`   Address: ${contracts.MetaTxForwarder}`);
        console.log(`   Deployed: ${code !== '0x' ? '✓' : '✗'}`);
        
        if (code !== '0x') {
            try {
                const forwarder = await ethers.getContractAt("MetaTxForwarder", contracts.MetaTxForwarder);
                const owner = await forwarder.owner();
                console.log(`   Owner: ${owner}`);
            } catch (e) {
                console.log(`   Error reading contract: ${e.message}`);
            }
        }
    }
    
    // 3. ProjectReimbursement Implementation
    if (contracts.ProjectReimbursementImplementation) {
        const code = await ethers.provider.getCode(contracts.ProjectReimbursementImplementation);
        console.log(`\n3. ProjectReimbursement Implementation:`);
        console.log(`   Address: ${contracts.ProjectReimbursementImplementation}`);
        console.log(`   Deployed: ${code !== '0x' ? '✓' : '✗'}`);
    }
    
    // 4. ProjectFactory
    if (contracts.ProjectFactory) {
        const code = await ethers.provider.getCode(contracts.ProjectFactory);
        console.log(`\n4. ProjectFactory:`);
        console.log(`   Address: ${contracts.ProjectFactory}`);
        console.log(`   Deployed: ${code !== '0x' ? '✓' : '✗'}`);
        
        if (code !== '0x') {
            try {
                const factory = await ethers.getContractAt("ProjectFactory", contracts.ProjectFactory);
                const impl = await factory.projectImplementation();
                const token = await factory.omthbToken();
                const forwarder = await factory.metaTxForwarder();
                console.log(`   Implementation: ${impl}`);
                console.log(`   OMTHB Token: ${token}`);
                console.log(`   Forwarder: ${forwarder}`);
                
                // Check roles
                const ownerAddr = process.env.OWNER_ADDRESS || "0xeB42B3bF49091377627610A691EA1Eaf32bc6254";
                const CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
                const hasRole = await factory.hasRole(CREATOR_ROLE, ownerAddr);
                console.log(`   Owner has PROJECT_CREATOR_ROLE: ${hasRole ? '✓' : '✗'}`);
            } catch (e) {
                console.log(`   Error reading contract: ${e.message}`);
            }
        }
    }
    
    // 5. AuditAnchor
    if (contracts.AuditAnchor) {
        const code = await ethers.provider.getCode(contracts.AuditAnchor);
        console.log(`\n5. AuditAnchor:`);
        console.log(`   Address: ${contracts.AuditAnchor}`);
        console.log(`   Deployed: ${code !== '0x' ? '✓' : '✗'}`);
        
        if (code !== '0x') {
            try {
                const audit = await ethers.getContractAt("AuditAnchor", contracts.AuditAnchor);
                const owner = await audit.owner();
                const nextBatchId = await audit.nextBatchId();
                console.log(`   Owner: ${owner}`);
                console.log(`   Next Batch ID: ${nextBatchId}`);
                
                const ownerAddr = process.env.OWNER_ADDRESS || "0xeB42B3bF49091377627610A691EA1Eaf32bc6254";
                const isAuthorized = await audit.authorizedAnchors(ownerAddr);
                console.log(`   Owner authorized: ${isAuthorized ? '✓' : '✗'}`);
            } catch (e) {
                console.log(`   Error reading contract: ${e.message}`);
            }
        }
    }
    
    // Check cross-contract permissions
    console.log("\n=== Cross-Contract Permissions ===");
    
    if (contracts.OMTHBToken && contracts.ProjectFactory) {
        try {
            const token = await ethers.getContractAt("OMTHBToken", contracts.OMTHBToken.proxy || contracts.OMTHBToken);
            const MINTER_ROLE = await token.MINTER_ROLE();
            const hasMinter = await token.hasRole(MINTER_ROLE, contracts.ProjectFactory);
            console.log(`ProjectFactory has MINTER_ROLE: ${hasMinter ? '✓' : '✗'}`);
        } catch (e) {
            console.log(`Error checking MINTER_ROLE: ${e.message}`);
        }
    }
    
    console.log("\n✓ Verification complete");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });