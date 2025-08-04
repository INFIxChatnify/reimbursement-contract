// Complete deployment script for OMChain Reimbursement System
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Load environment configuration
require("dotenv").config();

async function main() {
    console.log("\n=== OMChain Reimbursement System Deployment ===");
    console.log(`Network: ${network.name}`);
    console.log(`Chain ID: ${network.config.chainId}`);
    console.log(`RPC URL: ${network.config.url}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    const [deployer] = await ethers.getSigners();
    const ownerAddress = process.env.OWNER_ADDRESS || deployer.address;
    
    console.log("\nDeployment Configuration:");
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Owner: ${ownerAddress}`);
    
    // Check deployer balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Deployer Balance: ${ethers.formatEther(balance)} OMTHB`);
    
    if (balance == 0n) {
        throw new Error("Deployer has no balance. Please fund the account.");
    }
    
    const deployedContracts = {};
    const gasUsed = {};
    
    try {
        // 1. Deploy OMTHB Token (UUPS Upgradeable)
        console.log("\n1. Deploying OMTHB Token...");
        const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
        const omthbToken = await upgrades.deployProxy(
            OMTHBToken,
            [ownerAddress],
            { 
                initializer: 'initialize',
                kind: 'uups'
            }
        );
        await omthbToken.waitForDeployment();
        const omthbAddress = await omthbToken.getAddress();
        const omthbImplementation = await upgrades.erc1967.getImplementationAddress(omthbAddress);
        
        deployedContracts.OMTHBToken = {
            proxy: omthbAddress,
            implementation: omthbImplementation
        };
        console.log(`✓ OMTHB Token Proxy: ${omthbAddress}`);
        console.log(`✓ OMTHB Token Implementation: ${omthbImplementation}`);
        
        // 2. Deploy MetaTxForwarder
        console.log("\n2. Deploying MetaTxForwarder...");
        const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
        const metaTxForwarder = await MetaTxForwarder.deploy();
        await metaTxForwarder.waitForDeployment();
        const metaTxAddress = await metaTxForwarder.getAddress();
        
        deployedContracts.MetaTxForwarder = metaTxAddress;
        console.log(`✓ MetaTxForwarder: ${metaTxAddress}`);
        
        // 3. Deploy ProjectReimbursement Implementation
        console.log("\n3. Deploying ProjectReimbursement Implementation...");
        const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
        const projectReimbursementImpl = await ProjectReimbursement.deploy();
        await projectReimbursementImpl.waitForDeployment();
        const projectImplAddress = await projectReimbursementImpl.getAddress();
        
        deployedContracts.ProjectReimbursementImplementation = projectImplAddress;
        console.log(`✓ ProjectReimbursement Implementation: ${projectImplAddress}`);
        
        // 4. Deploy ProjectFactory
        console.log("\n4. Deploying ProjectFactory...");
        const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
        const projectFactory = await ProjectFactory.deploy(
            projectImplAddress,
            omthbAddress,
            metaTxAddress,
            ownerAddress
        );
        await projectFactory.waitForDeployment();
        const factoryAddress = await projectFactory.getAddress();
        
        deployedContracts.ProjectFactory = factoryAddress;
        console.log(`✓ ProjectFactory: ${factoryAddress}`);
        
        // 5. Deploy AuditAnchor
        console.log("\n5. Deploying AuditAnchor...");
        const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
        const auditAnchor = await AuditAnchor.deploy();
        await auditAnchor.waitForDeployment();
        const auditAddress = await auditAnchor.getAddress();
        
        deployedContracts.AuditAnchor = auditAddress;
        console.log(`✓ AuditAnchor: ${auditAddress}`);
        
        // 6. Configure Roles and Permissions
        console.log("\n6. Configuring roles and permissions...");
        
        // Grant PROJECT_CREATOR_ROLE
        const PROJECT_CREATOR_ROLE = await projectFactory.PROJECT_CREATOR_ROLE();
        const tx1 = await projectFactory.grantRole(PROJECT_CREATOR_ROLE, ownerAddress);
        await tx1.wait();
        console.log(`✓ Granted PROJECT_CREATOR_ROLE to ${ownerAddress}`);
        
        // Grant MINTER_ROLE for OMTHB Token (needed for funding projects)
        const MINTER_ROLE = await omthbToken.MINTER_ROLE();
        const tx2 = await omthbToken.grantRole(MINTER_ROLE, factoryAddress);
        await tx2.wait();
        console.log(`✓ Granted MINTER_ROLE to ProjectFactory`);
        
        // Authorize AuditAnchor for the owner
        const tx3 = await auditAnchor.authorizeAnchor(ownerAddress, true);
        await tx3.wait();
        console.log(`✓ Authorized ${ownerAddress} as audit anchor`);
        
        // Add example deputies (replace with actual addresses in production)
        console.log("\n7. Adding deputy addresses...");
        const deputies = process.env.DEPUTIES ? process.env.DEPUTIES.split(',') : [];
        
        if (deputies.length > 0) {
            for (const deputy of deputies) {
                if (ethers.isAddress(deputy)) {
                    const tx = await projectFactory.addDeputy(deputy);
                    await tx.wait();
                    console.log(`✓ Added deputy: ${deputy}`);
                }
            }
        } else {
            console.log("⚠ No deputies configured. Add them later using addDeputy()");
        }
        
        // 8. Transfer Ownership (if deployer is different from owner)
        if (deployer.address.toLowerCase() !== ownerAddress.toLowerCase()) {
            console.log("\n8. Transferring ownership...");
            
            // Transfer OMTHB Token admin role
            const DEFAULT_ADMIN_ROLE = await omthbToken.DEFAULT_ADMIN_ROLE();
            const tx4 = await omthbToken.grantRole(DEFAULT_ADMIN_ROLE, ownerAddress);
            await tx4.wait();
            const tx5 = await omthbToken.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
            await tx5.wait();
            console.log("✓ Transferred OMTHB Token admin role");
            
            // Transfer MetaTxForwarder ownership
            const tx6 = await metaTxForwarder.transferOwnership(ownerAddress);
            await tx6.wait();
            console.log("✓ Transferred MetaTxForwarder ownership");
            
            // Transfer ProjectFactory admin role
            const tx7 = await projectFactory.grantRole(DEFAULT_ADMIN_ROLE, ownerAddress);
            await tx7.wait();
            const tx8 = await projectFactory.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
            await tx8.wait();
            console.log("✓ Transferred ProjectFactory admin role");
            
            // Transfer AuditAnchor ownership
            const tx9 = await auditAnchor.transferOwnership(ownerAddress);
            await tx9.wait();
            console.log("✓ Transferred AuditAnchor ownership");
        }
        
        // 9. Prepare deployment report
        const deploymentReport = {
            network: network.name,
            chainId: network.config.chainId,
            deployedAt: new Date().toISOString(),
            deployedBy: deployer.address,
            owner: ownerAddress,
            contracts: deployedContracts,
            configuration: {
                deputies: deputies.length > 0 ? deputies : "None configured",
                projectCreatorRole: PROJECT_CREATOR_ROLE,
                minterRole: MINTER_ROLE
            },
            notes: [
                "OMTHB Token is upgradeable (UUPS pattern)",
                "ProjectReimbursement uses minimal proxy pattern for gas efficiency",
                "Deputies need to be added manually if not configured in .env",
                "Ensure owner has sufficient OMTHB tokens to fund projects"
            ]
        };
        
        // 10. Save deployment info
        const deploymentPath = path.join(__dirname, '..', 'deployments', `${network.name}-deployment-${Date.now()}.json`);
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentReport, null, 2));
        
        // Also save as latest deployment
        const latestPath = path.join(__dirname, '..', 'deployments', `${network.name}-latest.json`);
        fs.writeFileSync(latestPath, JSON.stringify(deploymentReport, null, 2));
        
        console.log("\n=== Deployment Summary ===");
        console.log(JSON.stringify(deploymentReport, null, 2));
        console.log(`\nDeployment report saved to: ${deploymentPath}`);
        
        // 11. Verify contracts on block explorer (if API key is available)
        if (process.env.OMCHAIN_API_KEY && network.name === 'omchain') {
            console.log("\n=== Verifying Contracts ===");
            try {
                // Verify implementation contracts
                console.log("Verifying OMTHB Token implementation...");
                await hre.run("verify:verify", {
                    address: omthbImplementation,
                    constructorArguments: []
                });
                
                console.log("Verifying MetaTxForwarder...");
                await hre.run("verify:verify", {
                    address: metaTxAddress,
                    constructorArguments: []
                });
                
                console.log("Verifying ProjectReimbursement implementation...");
                await hre.run("verify:verify", {
                    address: projectImplAddress,
                    constructorArguments: []
                });
                
                console.log("Verifying ProjectFactory...");
                await hre.run("verify:verify", {
                    address: factoryAddress,
                    constructorArguments: [
                        projectImplAddress,
                        omthbAddress,
                        metaTxAddress,
                        ownerAddress
                    ]
                });
                
                console.log("Verifying AuditAnchor...");
                await hre.run("verify:verify", {
                    address: auditAddress,
                    constructorArguments: []
                });
                
                console.log("✓ All contracts verified successfully");
            } catch (error) {
                console.log("⚠ Contract verification failed:", error.message);
                console.log("You can verify contracts manually later");
            }
        }
        
    } catch (error) {
        console.error("\n❌ Deployment failed:", error);
        throw error;
    }
}

// Execute deployment
main()
    .then(() => {
        console.log("\n✓ Deployment completed successfully");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    });