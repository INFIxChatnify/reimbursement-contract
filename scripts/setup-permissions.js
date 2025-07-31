// Script to set up permissions after deployment
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("\n=== Setting Up Permissions ===");
    
    const [signer] = await ethers.getSigners();
    const ownerAddress = process.env.OWNER_ADDRESS || "0xeB42B3bF49091377627610A691EA1Eaf32bc6254";
    
    console.log(`Signer: ${signer.address}`);
    console.log(`Target Owner: ${ownerAddress}`);
    
    // Load deployment
    const deploymentPath = path.join(__dirname, '..', 'deployments', `${network.name}-latest.json`);
    if (!fs.existsSync(deploymentPath)) {
        console.error("No deployment found!");
        return;
    }
    
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const contracts = deployment.state?.contracts || deployment.contracts || {};
    
    console.log("\nNote: Only the current owner can grant roles and transfer ownership.");
    console.log("If you're not the owner, these operations will fail.\n");
    
    // 1. Transfer MetaTxForwarder ownership
    try {
        console.log("1. Checking MetaTxForwarder ownership...");
        const forwarder = await ethers.getContractAt("MetaTxForwarder", contracts.MetaTxForwarder);
        const currentOwner = await forwarder.owner();
        
        if (currentOwner.toLowerCase() === signer.address.toLowerCase()) {
            if (currentOwner.toLowerCase() !== ownerAddress.toLowerCase()) {
                console.log(`   Current owner: ${currentOwner}`);
                console.log(`   Transferring to: ${ownerAddress}`);
                const tx = await forwarder.transferOwnership(ownerAddress);
                await tx.wait();
                console.log(`   ✓ Ownership transferred`);
            } else {
                console.log(`   ✓ Already owned by target address`);
            }
        } else {
            console.log(`   ⚠ Not the owner (current: ${currentOwner})`);
        }
    } catch (error) {
        console.log(`   ✗ Error: ${error.message}`);
    }
    
    // 2. Transfer AuditAnchor ownership and authorize
    try {
        console.log("\n2. Checking AuditAnchor ownership...");
        const audit = await ethers.getContractAt("AuditAnchor", contracts.AuditAnchor);
        const currentOwner = await audit.owner();
        
        if (currentOwner.toLowerCase() === signer.address.toLowerCase()) {
            // Authorize owner first
            const isAuthorized = await audit.authorizedAnchors(ownerAddress);
            if (!isAuthorized) {
                console.log(`   Authorizing ${ownerAddress} as anchor...`);
                const tx1 = await audit.authorizeAnchor(ownerAddress, true);
                await tx1.wait();
                console.log(`   ✓ Authorized as anchor`);
            }
            
            // Transfer ownership
            if (currentOwner.toLowerCase() !== ownerAddress.toLowerCase()) {
                console.log(`   Transferring ownership to: ${ownerAddress}`);
                const tx2 = await audit.transferOwnership(ownerAddress);
                await tx2.wait();
                console.log(`   ✓ Ownership transferred`);
            } else {
                console.log(`   ✓ Already owned by target address`);
            }
        } else {
            console.log(`   ⚠ Not the owner (current: ${currentOwner})`);
        }
    } catch (error) {
        console.log(`   ✗ Error: ${error.message}`);
    }
    
    // 3. Set up ProjectFactory roles
    try {
        console.log("\n3. Checking ProjectFactory roles...");
        const factory = await ethers.getContractAt("ProjectFactory", contracts.ProjectFactory);
        const ADMIN_ROLE = await factory.DEFAULT_ADMIN_ROLE();
        const CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
        
        const hasAdminRole = await factory.hasRole(ADMIN_ROLE, signer.address);
        
        if (hasAdminRole) {
            // Grant PROJECT_CREATOR_ROLE to owner
            const hasCreatorRole = await factory.hasRole(CREATOR_ROLE, ownerAddress);
            if (!hasCreatorRole) {
                console.log(`   Granting PROJECT_CREATOR_ROLE to ${ownerAddress}...`);
                const tx1 = await factory.grantRole(CREATOR_ROLE, ownerAddress);
                await tx1.wait();
                console.log(`   ✓ PROJECT_CREATOR_ROLE granted`);
            } else {
                console.log(`   ✓ Owner already has PROJECT_CREATOR_ROLE`);
            }
            
            // Transfer admin role if needed
            if (signer.address.toLowerCase() !== ownerAddress.toLowerCase()) {
                const ownerHasAdmin = await factory.hasRole(ADMIN_ROLE, ownerAddress);
                if (!ownerHasAdmin) {
                    console.log(`   Granting DEFAULT_ADMIN_ROLE to ${ownerAddress}...`);
                    const tx2 = await factory.grantRole(ADMIN_ROLE, ownerAddress);
                    await tx2.wait();
                    console.log(`   ✓ DEFAULT_ADMIN_ROLE granted`);
                }
                
                console.log(`   Renouncing DEFAULT_ADMIN_ROLE...`);
                const tx3 = await factory.renounceRole(ADMIN_ROLE, signer.address);
                await tx3.wait();
                console.log(`   ✓ DEFAULT_ADMIN_ROLE renounced`);
            }
        } else {
            console.log(`   ⚠ Signer doesn't have DEFAULT_ADMIN_ROLE`);
        }
    } catch (error) {
        console.log(`   ✗ Error: ${error.message}`);
    }
    
    // 4. Set up OMTHB Token roles
    try {
        console.log("\n4. Checking OMTHB Token roles...");
        const token = await ethers.getContractAt("OMTHBToken", contracts.OMTHBToken.proxy || contracts.OMTHBToken);
        const ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
        const MINTER_ROLE = await token.MINTER_ROLE();
        
        const hasAdminRole = await token.hasRole(ADMIN_ROLE, signer.address);
        
        if (hasAdminRole) {
            // Grant MINTER_ROLE to ProjectFactory
            const factoryHasMinter = await token.hasRole(MINTER_ROLE, contracts.ProjectFactory);
            if (!factoryHasMinter) {
                console.log(`   Granting MINTER_ROLE to ProjectFactory...`);
                const tx1 = await token.grantRole(MINTER_ROLE, contracts.ProjectFactory);
                await tx1.wait();
                console.log(`   ✓ MINTER_ROLE granted to ProjectFactory`);
            } else {
                console.log(`   ✓ ProjectFactory already has MINTER_ROLE`);
            }
            
            // Transfer admin role if needed
            if (signer.address.toLowerCase() !== ownerAddress.toLowerCase()) {
                const ownerHasAdmin = await token.hasRole(ADMIN_ROLE, ownerAddress);
                if (!ownerHasAdmin) {
                    console.log(`   Granting DEFAULT_ADMIN_ROLE to ${ownerAddress}...`);
                    const tx2 = await token.grantRole(ADMIN_ROLE, ownerAddress);
                    await tx2.wait();
                    console.log(`   ✓ DEFAULT_ADMIN_ROLE granted`);
                }
                
                console.log(`   Renouncing DEFAULT_ADMIN_ROLE...`);
                const tx3 = await token.renounceRole(ADMIN_ROLE, signer.address);
                await tx3.wait();
                console.log(`   ✓ DEFAULT_ADMIN_ROLE renounced`);
            }
        } else {
            console.log(`   ⚠ Signer doesn't have DEFAULT_ADMIN_ROLE`);
        }
    } catch (error) {
        console.log(`   ✗ Error: ${error.message}`);
    }
    
    console.log("\n=== Permission Setup Summary ===");
    console.log("If you see ⚠ warnings above, it means:");
    console.log("- The deployer account doesn't have the necessary permissions");
    console.log("- You need to run this script with the current owner account");
    console.log("- Or have the current owner manually set up the permissions");
    
    console.log("\nTo complete setup, the owner should:");
    console.log("1. Grant PROJECT_CREATOR_ROLE in ProjectFactory");
    console.log("2. Grant MINTER_ROLE to ProjectFactory in OMTHB Token");
    console.log("3. Authorize themselves in AuditAnchor");
    console.log("4. Add deputy addresses to ProjectFactory");
    
    console.log("\n✓ Permission setup script complete");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });