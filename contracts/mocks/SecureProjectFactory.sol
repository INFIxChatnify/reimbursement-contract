// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./SecureProjectReimbursement.sol";
import "../interfaces/IOMTHB.sol";

/**
 * @title SecureProjectFactory
 * @notice Factory for deploying secure project reimbursement contracts
 * @dev Uses clones for gas-efficient deployment with pausable functionality
 */
contract SecureProjectFactory is AccessControl, Pausable {
    using Clones for address;
    
    // Roles
    bytes32 public constant PROJECT_CREATOR_ROLE = keccak256("PROJECT_CREATOR_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    
    // Implementation contract
    address public immutable implementation;
    
    // OMTHB token
    IOMTHB public immutable omthbToken;
    
    // Project tracking
    mapping(string => address) public projects;
    string[] public projectIds;
    
    // Project metadata
    struct ProjectInfo {
        address projectAddress;
        address admin;
        uint256 budget;
        uint256 createdAt;
        bool isActive;
    }
    
    mapping(string => ProjectInfo) public projectInfo;
    
    // Events
    event ProjectCreated(
        string indexed projectId, 
        address indexed projectAddress, 
        address indexed admin,
        uint256 budget
    );
    event ProjectDeactivated(string indexed projectId, address indexed operator);
    event ProjectReactivated(string indexed projectId, address indexed operator);
    
    // Custom errors
    error ProjectExists();
    error ProjectNotFound();
    error InvalidProjectId();
    error InvalidBudget();
    error InvalidAddress();
    error ProjectNotActive();
    error ProjectAlreadyActive();
    error CannotRemoveLastAdmin();
    
    constructor(address _omthbToken, address _admin) {
        if (_omthbToken == address(0) || _admin == address(0)) {
            revert InvalidAddress();
        }
        
        omthbToken = IOMTHB(_omthbToken);
        implementation = address(new SecureProjectReimbursement());
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PROJECT_CREATOR_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
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
    ) external onlyRole(PROJECT_CREATOR_ROLE) whenNotPaused returns (address) {
        if (bytes(projectId).length == 0) revert InvalidProjectId();
        if (projects[projectId] != address(0)) revert ProjectExists();
        if (projectBudget == 0) revert InvalidBudget();
        if (projectAdmin == address(0)) revert InvalidAddress();
        
        // Deploy clone
        address clone = implementation.clone();
        
        // Initialize
        SecureProjectReimbursement(clone).initialize(
            projectId,
            address(omthbToken),
            projectBudget,
            projectAdmin
        );
        
        // Track project
        projects[projectId] = clone;
        projectIds.push(projectId);
        
        // Store project info
        projectInfo[projectId] = ProjectInfo({
            projectAddress: clone,
            admin: projectAdmin,
            budget: projectBudget,
            createdAt: block.timestamp,
            isActive: true
        });
        
        // Transfer initial budget if needed
        if (projectBudget > 0) {
            require(
                omthbToken.transferFrom(msg.sender, clone, projectBudget),
                "Budget transfer failed"
            );
        }
        
        emit ProjectCreated(projectId, clone, projectAdmin, projectBudget);
        
        return clone;
    }
    
    function deactivateProject(string calldata projectId) external onlyRole(OPERATOR_ROLE) {
        ProjectInfo storage info = projectInfo[projectId];
        if (info.projectAddress == address(0)) revert ProjectNotFound();
        if (!info.isActive) revert ProjectNotActive();
        
        info.isActive = false;
        
        // Pause the project contract
        SecureProjectReimbursement(info.projectAddress).pause();
        
        emit ProjectDeactivated(projectId, msg.sender);
    }
    
    function reactivateProject(string calldata projectId) external onlyRole(OPERATOR_ROLE) {
        ProjectInfo storage info = projectInfo[projectId];
        if (info.projectAddress == address(0)) revert ProjectNotFound();
        if (info.isActive) revert ProjectAlreadyActive();
        
        info.isActive = true;
        
        // Unpause the project contract
        SecureProjectReimbursement(info.projectAddress).unpause();
        
        emit ProjectReactivated(projectId, msg.sender);
    }
    
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    function getProjectCount() external view returns (uint256) {
        return projectIds.length;
    }
    
    function getProjectByIndex(uint256 index) external view returns (
        string memory projectId,
        address projectAddress,
        bool isActive
    ) {
        require(index < projectIds.length, "Index out of bounds");
        projectId = projectIds[index];
        ProjectInfo memory info = projectInfo[projectId];
        projectAddress = info.projectAddress;
        isActive = info.isActive;
    }
    
    function getActiveProjects() external view returns (string[] memory) {
        uint256 activeCount = 0;
        
        // Count active projects
        for (uint256 i = 0; i < projectIds.length; i++) {
            if (projectInfo[projectIds[i]].isActive) {
                activeCount++;
            }
        }
        
        // Collect active project IDs
        string[] memory activeProjectIds = new string[](activeCount);
        uint256 currentIndex = 0;
        
        for (uint256 i = 0; i < projectIds.length; i++) {
            if (projectInfo[projectIds[i]].isActive) {
                activeProjectIds[currentIndex] = projectIds[i];
                currentIndex++;
            }
        }
        
        return activeProjectIds;
    }
}
