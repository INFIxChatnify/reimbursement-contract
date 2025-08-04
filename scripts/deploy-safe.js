// Safe deployment script with error handling and partial save
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Load environment configuration
require("dotenv").config();

// Track deployment progress
const deploymentState = {
    contracts: {},
    errors: [],
    completed: []
};

async function saveDeploymentState(networkName, state) {
    const timestamp = Date.now();
    const deploymentPath = path.join(__dirname, '..', 'deployments', `${networkName}-partial-${timestamp}.json`);
    
    const report = {
        network: networkName,
        chainId: network.config.chainId,
        deployedAt: new Date().toISOString(),
        state: state,
        status: state.errors.length > 0 ? 'partial' : 'complete'
    };
    
    fs.writeFileSync(deploymentPath, JSON.stringify(report, null, 2));
    console.log(`\nDeployment state saved to: ${deploymentPath}`);
    
    // Also update latest
    const latestPath = path.join(__dirname, '..', 'deployments', `${networkName}-latest.json`);
    fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));
}

async function main() {
    console.log("\n=== Safe Deployment Script ===");
    console.log(`Network: ${network.name}`);
    console.log(`Chain ID: ${network.config.chainId}`);
    
    const [deployer] = await ethers.getSigners();
    const ownerAddress = process.env.OWNER_ADDRESS || deployer.address;
    
    console.log(`\nDeployer: ${deployer.address}`);
    console.log(`Owner: ${ownerAddress}`);
    
    // Check balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Deployer Balance: ${ethers.formatEther(balance)} OMTHB`);
    
    try {
        // 1. Deploy OMTHB Token
        console.log("\n1. Deploying OMTHB Token...");
        try {
            const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
            const omthbToken = await upgrades.deployProxy(
                OMTHBToken,
                [ownerAddress],
                { 
                    initializer: 'initialize',
                    kind: 'uups',
                    timeout: 180000 // 3 minutes timeout
                }
            );
            await omthbToken.waitForDeployment();
            
            const omthbAddress = await omthbToken.getAddress();
            const omthbImplementation = await upgrades.erc1967.getImplementationAddress(omthbAddress);
            
            deploymentState.contracts.OMTHBToken = {
                proxy: omthbAddress,
                implementation: omthbImplementation
            };
            deploymentState.completed.push("OMTHBToken");
            
            console.log(`✓ OMTHB Token Proxy: ${omthbAddress}`);
            console.log(`✓ OMTHB Token Implementation: ${omthbImplementation}`);
            
            // Save state after successful deployment
            await saveDeploymentState(network.name, deploymentState);
        } catch (error) {
            console.error(`✗ OMTHB Token deployment failed: ${error.message}`);
            deploymentState.errors.push(`OMTHBToken: ${error.message}`);
        }
        
        // 2. Deploy MetaTxForwarder
        console.log("\n2. Deploying MetaTxForwarder...");
        try {
            const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
            const metaTxForwarder = await MetaTxForwarder.deploy({
                gasLimit: 3000000
            });
            await metaTxForwarder.waitForDeployment();
            
            const metaTxAddress = await metaTxForwarder.getAddress();
            deploymentState.contracts.MetaTxForwarder = metaTxAddress;
            deploymentState.completed.push("MetaTxForwarder");
            
            console.log(`✓ MetaTxForwarder: ${metaTxAddress}`);
            
            // Save state
            await saveDeploymentState(network.name, deploymentState);
        } catch (error) {
            console.error(`✗ MetaTxForwarder deployment failed: ${error.message}`);
            deploymentState.errors.push(`MetaTxForwarder: ${error.message}`);
        }
        
        // 3. Deploy ProjectReimbursement Implementation
        console.log("\n3. Deploying ProjectReimbursement Implementation...");
        try {
            const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
            const projectReimbursementImpl = await ProjectReimbursement.deploy({
                gasLimit: 5000000
            });
            await projectReimbursementImpl.waitForDeployment();
            
            const projectImplAddress = await projectReimbursementImpl.getAddress();
            deploymentState.contracts.ProjectReimbursementImplementation = projectImplAddress;
            deploymentState.completed.push("ProjectReimbursementImplementation");
            
            console.log(`✓ ProjectReimbursement Implementation: ${projectImplAddress}`);
            
            // Save state
            await saveDeploymentState(network.name, deploymentState);
        } catch (error) {
            console.error(`✗ ProjectReimbursement deployment failed: ${error.message}`);
            deploymentState.errors.push(`ProjectReimbursement: ${error.message}`);
        }
        
        // 4. Deploy ProjectFactory (only if prerequisites are deployed)
        if (deploymentState.contracts.ProjectReimbursementImplementation && 
            deploymentState.contracts.OMTHBToken && 
            deploymentState.contracts.MetaTxForwarder) {
            
            console.log("\n4. Deploying ProjectFactory...");
            try {
                const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
                const projectFactory = await ProjectFactory.deploy(
                    deploymentState.contracts.ProjectReimbursementImplementation,
                    deploymentState.contracts.OMTHBToken.proxy,
                    deploymentState.contracts.MetaTxForwarder,
                    ownerAddress,
                    {
                        gasLimit: 3000000
                    }
                );
                await projectFactory.waitForDeployment();
                
                const factoryAddress = await projectFactory.getAddress();
                deploymentState.contracts.ProjectFactory = factoryAddress;
                deploymentState.completed.push("ProjectFactory");
                
                console.log(`✓ ProjectFactory: ${factoryAddress}`);
                
                // Save state
                await saveDeploymentState(network.name, deploymentState);
            } catch (error) {
                console.error(`✗ ProjectFactory deployment failed: ${error.message}`);
                deploymentState.errors.push(`ProjectFactory: ${error.message}`);
            }
        } else {
            console.log("\n4. Skipping ProjectFactory (missing prerequisites)");
            deploymentState.errors.push("ProjectFactory: Skipped due to missing prerequisites");
        }
        
        // 5. Deploy AuditAnchor
        console.log("\n5. Deploying AuditAnchor...");
        try {
            const AuditAnchor = await ethers.getContractFactory("AuditAnchor");
            const auditAnchor = await AuditAnchor.deploy({
                gasLimit: 2000000
            });
            await auditAnchor.waitForDeployment();
            
            const auditAddress = await auditAnchor.getAddress();
            deploymentState.contracts.AuditAnchor = auditAddress;
            deploymentState.completed.push("AuditAnchor");
            
            console.log(`✓ AuditAnchor: ${auditAddress}`);
            
            // Save state
            await saveDeploymentState(network.name, deploymentState);
        } catch (error) {
            console.error(`✗ AuditAnchor deployment failed: ${error.message}`);
            deploymentState.errors.push(`AuditAnchor: ${error.message}`);
        }
        
        // 6. Configure roles (only if contracts are deployed)
        console.log("\n6. Attempting role configuration...");
        
        // Configure ProjectFactory roles
        if (deploymentState.contracts.ProjectFactory && deployer.address === ownerAddress) {
            try {
                const factory = await ethers.getContractAt("ProjectFactory", deploymentState.contracts.ProjectFactory);
                const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
                
                // Check if already has role
                const hasRole = await factory.hasRole(PROJECT_CREATOR_ROLE, ownerAddress);
                if (!hasRole) {
                    const tx = await factory.grantRole(PROJECT_CREATOR_ROLE, ownerAddress, {
                        gasLimit: 100000
                    });
                    await tx.wait();
                    console.log(`✓ Granted PROJECT_CREATOR_ROLE to ${ownerAddress}`);
                } else {
                    console.log(`✓ Owner already has PROJECT_CREATOR_ROLE`);
                }
            } catch (error) {
                console.error(`✗ PROJECT_CREATOR_ROLE configuration failed: ${error.message}`);
                deploymentState.errors.push(`PROJECT_CREATOR_ROLE: ${error.message}`);
            }
        }
        
        // Configure OMTHB minter role for ProjectFactory
        if (deploymentState.contracts.OMTHBToken && deploymentState.contracts.ProjectFactory) {
            try {
                const omthb = await ethers.getContractAt("OMTHBToken", deploymentState.contracts.OMTHBToken.proxy);
                const MINTER_ROLE = await omthb.MINTER_ROLE();
                
                const hasRole = await omthb.hasRole(MINTER_ROLE, deploymentState.contracts.ProjectFactory);
                if (!hasRole && deployer.address === ownerAddress) {
                    const tx = await omthb.grantRole(MINTER_ROLE, deploymentState.contracts.ProjectFactory, {
                        gasLimit: 100000
                    });
                    await tx.wait();
                    console.log(`✓ Granted MINTER_ROLE to ProjectFactory`);
                } else if (hasRole) {
                    console.log(`✓ ProjectFactory already has MINTER_ROLE`);
                } else {
                    console.log(`⚠ Cannot grant MINTER_ROLE (not owner)`);
                }
            } catch (error) {
                console.error(`✗ MINTER_ROLE configuration failed: ${error.message}`);
                deploymentState.errors.push(`MINTER_ROLE: ${error.message}`);
            }
        }
        
        // Configure AuditAnchor authorization
        if (deploymentState.contracts.AuditAnchor && deployer.address === ownerAddress) {
            try {
                const audit = await ethers.getContractAt("AuditAnchor", deploymentState.contracts.AuditAnchor);
                const isAuthorized = await audit.authorizedAnchors(ownerAddress);
                
                if (!isAuthorized) {
                    const tx = await audit.authorizeAnchor(ownerAddress, true, {
                        gasLimit: 100000
                    });
                    await tx.wait();
                    console.log(`✓ Authorized ${ownerAddress} as audit anchor`);
                } else {
                    console.log(`✓ Owner already authorized as audit anchor`);
                }
            } catch (error) {
                console.error(`✗ Audit authorization failed: ${error.message}`);
                deploymentState.errors.push(`AuditAuthorization: ${error.message}`);
            }
        }
        
        // Final save
        await saveDeploymentState(network.name, deploymentState);
        
        // Summary
        console.log("\n=== Deployment Summary ===");
        console.log(`\nSuccessfully deployed: ${deploymentState.completed.length} contracts`);
        deploymentState.completed.forEach(contract => {
            console.log(`  ✓ ${contract}`);
        });
        
        if (deploymentState.errors.length > 0) {
            console.log(`\nErrors encountered: ${deploymentState.errors.length}`);
            deploymentState.errors.forEach(error => {
                console.log(`  ✗ ${error}`);
            });
        }
        
        console.log("\n=== Deployed Addresses ===");
        console.log(JSON.stringify(deploymentState.contracts, null, 2));
        
    } catch (error) {
        console.error("\n❌ Unexpected error:", error);
        deploymentState.errors.push(`Fatal: ${error.message}`);
        await saveDeploymentState(network.name, deploymentState);
    }
}

main()
    .then(() => {
        if (deploymentState.errors.length === 0) {
            console.log("\n✓ Deployment completed successfully");
            process.exit(0);
        } else {
            console.log("\n⚠ Deployment completed with errors");
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error("\n❌ Deployment script failed:", error);
        process.exit(1);
    });