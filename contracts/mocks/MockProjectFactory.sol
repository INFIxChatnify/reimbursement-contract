// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../ProjectReimbursement.sol";

contract MockProjectFactory {
    address public omthbToken;
    
    event ProjectCreated(address indexed projectAddress, string projectId);
    
    constructor(address _omthbToken) {
        omthbToken = _omthbToken;
    }
    
    function createProject(string memory projectId, uint256 budget, address admin) external returns (address) {
        // Deploy new project using proxy pattern
        ProjectReimbursement implementation = new ProjectReimbursement();
        
        // Simple proxy deployment for testing
        bytes memory data = abi.encodeWithSelector(
            ProjectReimbursement.initialize.selector,
            projectId,
            omthbToken,
            budget,
            admin
        );
        
        // Create a minimal proxy (clone) - simplified for testing
        address project = address(implementation);
        
        emit ProjectCreated(project, projectId);
        return project;
    }
    
    function grantProjectRole(address project, bytes32 role, address account) external {
        ProjectReimbursement(project).grantRoleDirect(role, account);
    }
}