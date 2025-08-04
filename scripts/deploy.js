// Deploy script for OMChain Reimbursement System
const { ethers, upgrades } = require("hardhat");

// OMChain Configuration
const OMCHAIN_CONFIG = {
    chainId: 1246,
    rpcUrl: "https://rpc.omplatform.com",
    ownerAddress: "0xeB42B3bF49091377627610A691EA1Eaf32bc6254"
};

async function main() {
    console.log("Deploying to OMChain...");
    console.log("Chain ID:", OMCHAIN_CONFIG.chainId);
    console.log("Owner Address:", OMCHAIN_CONFIG.ownerAddress);
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

    // 1. Deploy OMTHB Token (UUPS Upgradeable)
    console.log("\n1. Deploying OMTHB Token...");
    const OMTHBToken = await ethers.getContractFactory("OMTHBToken");
    const omthbToken = await upgrades.deployProxy(
        OMTHBToken,
        [OMCHAIN_CONFIG.ownerAddress],
        { 
            initializer: 'initialize',
            kind: 'uups'
        }
    );
    await omthbToken.waitForDeployment();
    console.log("OMTHB Token Proxy deployed to:", await omthbToken.getAddress());
    
    const omthbImplementation = await upgrades.erc1967.getImplementationAddress(await omthbToken.getAddress());
    console.log("OMTHB Token Implementation:", omthbImplementation);

    // 2. Deploy MetaTxForwarder
    console.log("\n2. Deploying MetaTxForwarder...");
    const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder");
    const metaTxForwarder = await MetaTxForwarder.deploy();
    await metaTxForwarder.waitForDeployment();
    console.log("MetaTxForwarder deployed to:", await metaTxForwarder.getAddress());

    // 3. Deploy ProjectReimbursement Implementation
    console.log("\n3. Deploying ProjectReimbursement Implementation...");
    const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement");
    const projectReimbursementImpl = await ProjectReimbursement.deploy();
    await projectReimbursementImpl.waitForDeployment();
    console.log("ProjectReimbursement Implementation deployed to:", await projectReimbursementImpl.getAddress());

    // 4. Deploy ProjectFactory
    console.log("\n4. Deploying ProjectFactory...");
    const ProjectFactory = await ethers.getContractFactory("ProjectFactory");
    const projectFactory = await ProjectFactory.deploy(
        await projectReimbursementImpl.getAddress(),
        await omthbToken.getAddress(),
        await metaTxForwarder.getAddress(),
        OMCHAIN_CONFIG.ownerAddress
    );
    await projectFactory.waitForDeployment();
    console.log("ProjectFactory deployed to:", await projectFactory.getAddress());

    // 5. Configure roles and permissions
    console.log("\n5. Configuring roles and permissions...");
    
    // Grant PROJECT_CREATOR_ROLE to owner
    const PROJECT_CREATOR_ROLE = await projectFactory.PROJECT_CREATOR_ROLE();
    await projectFactory.grantRole(PROJECT_CREATOR_ROLE, OMCHAIN_CONFIG.ownerAddress);
    console.log("Granted PROJECT_CREATOR_ROLE to owner");

    // Add example deputies (you should replace these with actual deputy addresses)
    const exampleDeputies = [
        "0x0000000000000000000000000000000000000001", // Replace with actual deputy 1
        "0x0000000000000000000000000000000000000002", // Replace with actual deputy 2
    ];
    
    for (const deputy of exampleDeputies) {
        if (deputy !== "0x0000000000000000000000000000000000000001" && 
            deputy !== "0x0000000000000000000000000000000000000002") {
            await projectFactory.addDeputy(deputy);
            console.log(`Added deputy: ${deputy}`);
        }
    }

    // Transfer ownership to final owner
    console.log("\n6. Transferring ownership to", OMCHAIN_CONFIG.ownerAddress);
    
    // Transfer OMTHB Token ownership
    await omthbToken.grantRole(await omthbToken.DEFAULT_ADMIN_ROLE(), OMCHAIN_CONFIG.ownerAddress);
    await omthbToken.renounceRole(await omthbToken.DEFAULT_ADMIN_ROLE(), deployer.address);
    console.log("Transferred OMTHB Token admin role");
    
    // Transfer MetaTxForwarder ownership
    await metaTxForwarder.transferOwnership(OMCHAIN_CONFIG.ownerAddress);
    console.log("Transferred MetaTxForwarder ownership");
    
    // Transfer ProjectFactory admin role
    await projectFactory.grantRole(await projectFactory.DEFAULT_ADMIN_ROLE(), OMCHAIN_CONFIG.ownerAddress);
    await projectFactory.renounceRole(await projectFactory.DEFAULT_ADMIN_ROLE(), deployer.address);
    console.log("Transferred ProjectFactory admin role");
    
    // Save deployment info
    const deploymentInfo = {
        network: "OMChain",
        chainId: OMCHAIN_CONFIG.chainId,
        deployedAt: new Date().toISOString(),
        deployedBy: deployer.address,
        contracts: {
            OMTHBToken: {
                proxy: await omthbToken.getAddress(),
                implementation: omthbImplementation
            },
            MetaTxForwarder: await metaTxForwarder.getAddress(),
            ProjectReimbursementImplementation: await projectReimbursementImpl.getAddress(),
            ProjectFactory: await projectFactory.getAddress()
        },
        owner: OMCHAIN_CONFIG.ownerAddress,
        ownershipTransferred: true
    };

    console.log("\n=== Deployment Summary ===");
    console.log(JSON.stringify(deploymentInfo, null, 2));

    // Save to file
    const fs = require('fs');
    fs.writeFileSync(
        './deployments/omchain-deployment.json',
        JSON.stringify(deploymentInfo, null, 2)
    );
    console.log("\nDeployment info saved to ./deployments/omchain-deployment.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });