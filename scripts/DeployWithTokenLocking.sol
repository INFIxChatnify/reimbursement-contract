// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/ProjectFactory.sol";
import "../contracts/ProjectReimbursement.sol";
import "../contracts/interfaces/IOMTHB.sol";

/**
 * @title DeployWithTokenLocking
 * @notice Deployment script demonstrating the new token locking feature
 * @dev Shows the complete flow from deployment to project creation with token locking
 */
contract DeployWithTokenLocking is Script {
    function run() external {
        // Configuration
        address omthbTokenAddress = vm.envAddress("OMTHB_TOKEN_ADDRESS");
        address metaTxForwarder = vm.envAddress("META_TX_FORWARDER");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy ProjectReimbursement implementation
        ProjectReimbursement implementation = new ProjectReimbursement();
        console.log("Implementation deployed at:", address(implementation));
        
        // 2. Deploy ProjectFactory
        ProjectFactory factory = new ProjectFactory(
            address(implementation),
            omthbTokenAddress,
            metaTxForwarder,
            admin
        );
        console.log("Factory deployed at:", address(factory));
        
        vm.stopBroadcast();
        
        // Log deployment info
        console.log("\n=== Deployment Complete ===");
        console.log("Implementation:", address(implementation));
        console.log("Factory:", address(factory));
        console.log("\n=== Next Steps ===");
        console.log("1. Grant PROJECT_CREATOR_ROLE to project creators");
        console.log("2. Project creators must approve Factory for budget amount");
        console.log("3. Call createProject() to deploy with automatic token locking");
    }
}

/**
 * @title CreateProjectWithTokens
 * @notice Script to create a project with token locking
 * @dev Demonstrates the complete flow for project creation
 */
contract CreateProjectWithTokens is Script {
    function run() external {
        // Configuration
        address factoryAddress = vm.envAddress("FACTORY_ADDRESS");
        address omthbTokenAddress = vm.envAddress("OMTHB_TOKEN_ADDRESS");
        uint256 creatorPrivateKey = vm.envUint("CREATOR_PRIVATE_KEY");
        
        // Project parameters
        string memory projectId = vm.envString("PROJECT_ID");
        uint256 budget = vm.envUint("PROJECT_BUDGET");
        address projectAdmin = vm.envAddress("PROJECT_ADMIN");
        
        ProjectFactory factory = ProjectFactory(factoryAddress);
        IOMTHB omthbToken = IOMTHB(omthbTokenAddress);
        
        vm.startBroadcast(creatorPrivateKey);
        
        // 1. Check current balance
        address creator = vm.addr(creatorPrivateKey);
        uint256 currentBalance = omthbToken.balanceOf(creator);
        console.log("Creator balance:", currentBalance / 10**18, "OMTHB");
        
        require(currentBalance >= budget, "Insufficient OMTHB balance");
        
        // 2. Approve factory for budget amount
        console.log("Approving factory for", budget / 10**18, "OMTHB");
        omthbToken.approve(factoryAddress, budget);
        
        // 3. Create project (tokens will be automatically transferred)
        console.log("Creating project with ID:", projectId);
        address projectAddress = factory.createProject(projectId, budget, projectAdmin);
        
        console.log("\n=== Project Created Successfully ===");
        console.log("Project Address:", projectAddress);
        console.log("Budget Locked:", budget / 10**18, "OMTHB");
        console.log("Project Admin:", projectAdmin);
        
        // 4. Verify token transfer
        uint256 projectBalance = omthbToken.balanceOf(projectAddress);
        uint256 newCreatorBalance = omthbToken.balanceOf(creator);
        
        console.log("\n=== Token Transfer Verification ===");
        console.log("Project Balance:", projectBalance / 10**18, "OMTHB");
        console.log("Creator Balance After:", newCreatorBalance / 10**18, "OMTHB");
        console.log("Tokens Transferred:", (currentBalance - newCreatorBalance) / 10**18, "OMTHB");
        
        vm.stopBroadcast();
    }
}

/**
 * @title CreateRequestWithVirtualPayer
 * @notice Script to create a reimbursement request with virtual payer
 * @dev Demonstrates the virtual payer feature
 */
contract CreateRequestWithVirtualPayer is Script {
    function run() external {
        // Configuration
        address projectAddress = vm.envAddress("PROJECT_ADDRESS");
        uint256 requesterPrivateKey = vm.envUint("REQUESTER_PRIVATE_KEY");
        
        // Request parameters
        address virtualPayer = vm.envAddress("VIRTUAL_PAYER");
        address[] memory recipients = vm.envAddress("RECIPIENTS", ",");
        uint256[] memory amounts = vm.envUint("AMOUNTS", ",");
        string memory description = vm.envString("DESCRIPTION");
        string memory documentHash = vm.envString("DOCUMENT_HASH");
        
        ProjectReimbursementMultiRecipient project = ProjectReimbursementMultiRecipient(projectAddress);
        
        vm.startBroadcast(requesterPrivateKey);
        
        console.log("Creating request with virtual payer:", virtualPayer);
        console.log("Total recipients:", recipients.length);
        
        // Calculate total amount
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        console.log("Total amount:", totalAmount / 10**18, "OMTHB");
        
        // Create request
        uint256 requestId = project.createRequestMultiple(
            recipients,
            amounts,
            description,
            documentHash,
            virtualPayer
        );
        
        console.log("\n=== Request Created Successfully ===");
        console.log("Request ID:", requestId);
        console.log("Virtual Payer:", project.getVirtualPayer(requestId));
        
        // Display remaining budget
        console.log("\n=== Budget Status ===");
        console.log("Remaining Budget:", project.getRemainingBudget() / 10**18, "OMTHB");
        console.log("Contract Balance:", project.getContractBalance() / 10**18, "OMTHB");
        
        vm.stopBroadcast();
    }
}