// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./SimpleProjectReimbursement.sol";
import "../interfaces/IOMTHB.sol";

/**
 * @title SimpleProjectFactory
 * @notice Factory for deploying simple project reimbursement contracts
 * @dev Uses clones for gas-efficient deployment
 */
contract SimpleProjectFactory is AccessControl {
    using Clones for address;
    
    // Role for project creators
    bytes32 public constant PROJECT_CREATOR_ROLE = keccak256("PROJECT_CREATOR_ROLE");
    
    // Implementation contract
    address public immutable implementation;
    
    // OMTHB token
    IOMTHB public immutable omthbToken;
    
    // Project tracking
    mapping(string => address) public projects;
    string[] public projectIds;
    
    // Events
    event ProjectCreated(string indexed projectId, address indexed projectAddress, address admin);
    
    // Custom errors
    error ProjectExists();
    error InvalidProjectId();
    error InvalidBudget();
    error InvalidAddress();
    error CannotRemoveLastAdmin();
    
    constructor(address _omthbToken, address _admin) {
        if (_omthbToken == address(0) || _admin == address(0)) {
            revert InvalidAddress();
        }
        
        omthbToken = IOMTHB(_omthbToken);
        implementation = address(new SimpleProjectReimbursement("", address(0), 0, address(0)));
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PROJECT_CREATOR_ROLE, _admin);
    }
    
    /**
     * @notice Override revokeRole to prevent removing the last admin
     * @param role The role to revoke
     * @param account The account to revoke the role from
     */
    function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        if (role == DEFAULT_ADMIN_ROLE && getRoleMemberCount(DEFAULT_ADMIN_ROLE) == 1) {
            revert CannotRemoveLastAdmin();
        }
        super.revokeRole(role, account);
    }
    
    /**
     * @notice Override renounceRole to prevent the last admin from renouncing
     * @param role The role to renounce
     * @param account The account renouncing the role
     */
    function renounceRole(bytes32 role, address account) public override {
        if (role == DEFAULT_ADMIN_ROLE && getRoleMemberCount(DEFAULT_ADMIN_ROLE) == 1) {
            revert CannotRemoveLastAdmin();
        }
        super.renounceRole(role, account);
    }
    
    function createProject(
        string calldata projectId,
        uint256 projectBudget,
        address projectAdmin
    ) external onlyRole(PROJECT_CREATOR_ROLE) returns (address) {
        if (bytes(projectId).length == 0) revert InvalidProjectId();
        if (projects[projectId] != address(0)) revert ProjectExists();
        if (projectBudget == 0) revert InvalidBudget();
        if (projectAdmin == address(0)) revert InvalidAddress();
        
        // Deploy clone
        address clone = implementation.clone();
        
        // Initialize
        SimpleProjectReimbursement(clone).constructor(
            projectId,
            address(omthbToken),
            projectBudget,
            projectAdmin
        );
        
        // Track project
        projects[projectId] = clone;
        projectIds.push(projectId);
        
        // Transfer initial budget if needed
        if (projectBudget > 0) {
            require(
                omthbToken.transferFrom(msg.sender, clone, projectBudget),
                "Budget transfer failed"
            );
        }
        
        emit ProjectCreated(projectId, clone, projectAdmin);
        
        return clone;
    }
    
    function getProjectCount() external view returns (uint256) {
        return projectIds.length;
    }
    
    function getProjectByIndex(uint256 index) external view returns (string memory projectId, address projectAddress) {
        require(index < projectIds.length, "Index out of bounds");
        projectId = projectIds[index];
        projectAddress = projects[projectId];
    }
}
