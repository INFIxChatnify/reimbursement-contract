// Deployment verification and health check script
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
    console.log("\n=== Deployment Verification ===");
    console.log(`Network: ${network.name}`);
    console.log(`Chain ID: ${network.config.chainId}`);
    
    const [signer] = await ethers.getSigners();
    console.log(`Verifying with account: ${signer.address}`);
    
    // Load deployment
    const deployment = await loadDeployment(network.name);
    console.log(`\nDeployment date: ${deployment.deployedAt}`);
    console.log(`Status: ${deployment.status || 'unknown'}`);
    
    // Handle both old and new deployment formats
    const contracts = deployment.contracts || deployment.state?.contracts || {};
    const deployedBy = deployment.deployedBy || deployment.state?.deployedBy;
    const owner = deployment.owner || process.env.OWNER_ADDRESS;
    
    console.log(`Deployed by: ${deployedBy || 'unknown'}`);
    console.log(`Owner: ${owner}`);
    
    const results = {
        contracts: {},
        roles: {},
        configuration: {},
        errors: []
    };
    
    try {
        // 1. Verify OMTHB Token
        console.log("\n1. Verifying OMTHB Token...");
        if (!contracts.OMTHBToken) {
            results.errors.push("OMTHBToken not found in deployment");
        } else {
            const omthbAddress = contracts.OMTHBToken.proxy || contracts.OMTHBToken;
            const omthbToken = await ethers.getContractAt("OMTHBToken", omthbAddress);
            
            // Check proxy
            const proxyCode = await ethers.provider.getCode(omthbAddress);
            if (proxyCode === '0x') {
                results.errors.push("OMTHB Token proxy not deployed");
            } else {
                results.contracts.OMTHBToken = {
                    proxy: omthbAddress,
                    proxyDeployed: true
                };
                
                // Check implementation
                const implAddress = contracts.OMTHBToken.implementation;
                if (implAddress) {
                    const implCode = await ethers.provider.getCode(implAddress);
                    results.contracts.OMTHBToken.implementationDeployed = implCode !== '0x';
                }
                
                // Check basic functionality
                try {
                    const name = await omthbToken.name();
                    const symbol = await omthbToken.symbol();
                    const decimals = await omthbToken.decimals();
                    const totalSupply = await omthbToken.totalSupply();
                    
                    results.contracts.OMTHBToken.details = {
                        name,
                        symbol,
                        decimals: decimals.toString(),
                        totalSupply: ethers.formatEther(totalSupply)
                    };
                    console.log(`✓ OMTHB Token verified: ${name} (${symbol})`);
                } catch (error) {
                    results.errors.push(`OMTHB Token call failed: ${error.message}`);
                }
            }
        }
        
        // 2. Verify MetaTxForwarder
        console.log("\n2. Verifying MetaTxForwarder...");
        if (!contracts.MetaTxForwarder) {
            results.errors.push("MetaTxForwarder not found in deployment");
        } else {
            const forwarderCode = await ethers.provider.getCode(contracts.MetaTxForwarder);
        if (forwarderCode === '0x') {
            results.errors.push("MetaTxForwarder not deployed");
            } else {
                const forwarder = await ethers.getContractAt("MetaTxForwarder", contracts.MetaTxForwarder);
                try {
                    const forwarderOwner = await forwarder.owner();
                    const maxTxPerWindow = await forwarder.maxTxPerWindow();
                    results.contracts.MetaTxForwarder = {
                        address: contracts.MetaTxForwarder,
                        deployed: true,
                        owner: forwarderOwner,
                        maxTxPerWindow: maxTxPerWindow.toString()
                    };
                console.log(`✓ MetaTxForwarder verified`);
            } catch (error) {
                results.errors.push(`MetaTxForwarder call failed: ${error.message}`);
                }
            }
        }
        
        // 3. Verify ProjectReimbursement Implementation
        console.log("\n3. Verifying ProjectReimbursement Implementation...");
        if (!contracts.ProjectReimbursementImplementation) {
            results.errors.push("ProjectReimbursementImplementation not found in deployment");
        } else {
            const implCode = await ethers.provider.getCode(contracts.ProjectReimbursementImplementation);
            results.contracts.ProjectReimbursementImplementation = {
                address: contracts.ProjectReimbursementImplementation,
                deployed: implCode !== '0x'
            };
        if (implCode !== '0x') {
            console.log(`✓ ProjectReimbursement implementation verified`);
            if (implCode !== '0x') {
                console.log(`✓ ProjectReimbursement implementation verified`);
            } else {
                results.errors.push("ProjectReimbursement implementation not deployed");
            }
        }
        
        // 4. Verify ProjectFactory
        console.log("\n4. Verifying ProjectFactory...");
        if (!contracts.ProjectFactory) {
            results.errors.push("ProjectFactory not found in deployment");
        } else {
            const factoryCode = await ethers.provider.getCode(contracts.ProjectFactory);
        if (factoryCode === '0x') {
            results.errors.push("ProjectFactory not deployed");
            } else {
                const factory = await ethers.getContractAt("ProjectFactory", contracts.ProjectFactory);
                try {
                    // Check configuration
                    const projectImpl = await factory.projectImplementation();
                    const omthbTokenAddress = await factory.omthbToken();
                    const forwarderAddress = await factory.metaTxForwarder();
                    
                    results.contracts.ProjectFactory = {
                        address: contracts.ProjectFactory,
                        deployed: true,
                        projectImplementation: projectImpl,
                        omthbToken: omthbTokenAddress,
                        metaTxForwarder: forwarderAddress
                    };
                
                // Check deputies
                const deputies = await factory.getDeputies();
                results.configuration.deputies = deputies;
                
                // Check role members
                const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE();
                const hasCreatorRole = await factory.hasRole(PROJECT_CREATOR_ROLE, owner);
                results.roles.projectCreator = {
                    role: PROJECT_CREATOR_ROLE,
                    ownerHasRole: hasCreatorRole
                };
                
                console.log(`✓ ProjectFactory verified`);
                console.log(`  Deputies: ${deputies.length}`);
            } catch (error) {
                results.errors.push(`ProjectFactory call failed: ${error.message}`);
                }
            }
        }
        
        // 5. Verify AuditAnchor
        console.log("\n5. Verifying AuditAnchor...");
        if (!contracts.AuditAnchor) {
            results.errors.push("AuditAnchor not found in deployment");
        } else {
            const auditCode = await ethers.provider.getCode(contracts.AuditAnchor);
        if (auditCode === '0x') {
            results.errors.push("AuditAnchor not deployed");
            } else {
                const audit = await ethers.getContractAt("AuditAnchor", contracts.AuditAnchor);
                try {
                    const auditOwner = await audit.owner();
                    const nextBatchId = await audit.nextBatchId();
                    const totalEntries = await audit.totalEntriesAnchored();
                    const isOwnerAuthorized = await audit.authorizedAnchors(owner);
                    
                    results.contracts.AuditAnchor = {
                        address: contracts.AuditAnchor,
                        deployed: true,
                        owner: auditOwner,
                        nextBatchId: nextBatchId.toString(),
                        totalEntriesAnchored: totalEntries.toString(),
                        ownerAuthorized: isOwnerAuthorized
                    };
                console.log(`✓ AuditAnchor verified`);
            } catch (error) {
                results.errors.push(`AuditAnchor call failed: ${error.message}`);
                }
            }
        }
        
        // 6. Check cross-contract permissions
        console.log("\n6. Verifying cross-contract permissions...");
        if (results.contracts.OMTHBToken && results.contracts.ProjectFactory) {
            try {
                const MINTER_ROLE = await omthbToken.MINTER_ROLE();
                const factoryHasMinter = await omthbToken.hasRole(MINTER_ROLE, contracts.ProjectFactory);
                results.roles.minter = {
                    role: MINTER_ROLE,
                    factoryHasRole: factoryHasMinter
                };
                console.log(`✓ ProjectFactory ${factoryHasMinter ? 'has' : 'does NOT have'} MINTER_ROLE`);
            } catch (error) {
                results.errors.push(`Role check failed: ${error.message}`);
            }
        }
        
        // 7. Generate summary
        console.log("\n=== Verification Summary ===");
        
        const contractCount = Object.keys(results.contracts).length;
        const deployedCount = Object.values(results.contracts).filter(c => c.deployed || c.proxyDeployed).length;
        
        console.log(`\nContracts: ${deployedCount}/${contractCount} deployed`);
        Object.entries(results.contracts).forEach(([name, info]) => {
            const status = info.deployed || info.proxyDeployed ? '✓' : '✗';
            console.log(`  ${status} ${name}: ${info.address || info.proxy}`);
        });
        
        console.log(`\nConfiguration:`);
        console.log(`  Deputies configured: ${results.configuration.deputies?.length || 0}`);
        console.log(`  Owner has PROJECT_CREATOR_ROLE: ${results.roles.projectCreator?.ownerHasRole || false}`);
        console.log(`  Factory has MINTER_ROLE: ${results.roles.minter?.factoryHasRole || false}`);
        console.log(`  Owner is authorized anchor: ${results.contracts.AuditAnchor?.ownerAuthorized || false}`);
        
        if (results.errors.length > 0) {
            console.log(`\n⚠ Errors found:`);
            results.errors.forEach(error => console.log(`  - ${error}`));
        } else {
            console.log(`\n✓ All checks passed!`);
        }
        
        // Save verification results
        const verificationPath = path.join(__dirname, '..', 'deployments', `${network.name}-verification-${Date.now()}.json`);
        fs.writeFileSync(verificationPath, JSON.stringify(results, null, 2));
        console.log(`\nVerification results saved to: ${verificationPath}`);
        
    } catch (error) {
        console.error("\n❌ Verification failed:", error);
        results.errors.push(`Fatal error: ${error.message}`);
    }
    
    return results.errors.length === 0;
}

main()
    .then((success) => {
        if (success) {
            console.log("\n✓ Deployment verification completed successfully");
            process.exit(0);
        } else {
            console.log("\n⚠ Deployment verification completed with errors");
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error("\n❌ Verification script failed:", error);
        process.exit(1);
    });