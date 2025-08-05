// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./SimpleProjectReimbursement.sol";

/**
 * @title SecureProjectFactory
 * @notice Secure factory with access control and limits
 */
contract SecureProjectFactory is AccessControl, Pausable {
    using Clones for address;

    // Roles
    bytes32 public constant PROJECT_CREATOR_ROLE = keccak256("PROJECT_CREATOR_ROLE");
    
    /// @notice The implementation contract address
    address public immutable implementation;
    
    /// @notice OMTHB token address
    address public immutable omthbToken;
    
    /// @notice MetaTxForwarder address for gasless support
    address public immutable metaTxForwarder;
    
    /// @notice Maximum number of projects allowed
    uint256 public constant MAX_PROJECTS = 1000;
    
    /// @notice Mapping of project ID to project address
    mapping(string => address) public projects;
    
    /// @notice Array of all project addresses
    address[] public projectList;
    
    /// @notice Rate limiting: user => timestamp
    mapping(address => uint256) public lastProjectCreation;
    
    /// @notice Minimum time between project creations per user (1 hour)
    uint256 public constant CREATION_COOLDOWN = 1 hours;
    
    /// @notice Events
    event ProjectCreated(
        string indexed projectId,
        address indexed projectAddress,
        address indexed creator,
        uint256 budget
    );
    
    event MaxProjectsUpdated(uint256 newMax);
    event CooldownUpdated(uint256 newCooldown);
    
    /**
     * @notice Constructor
     * @param _implementation The implementation contract address
     * @param _omthbToken The OMTHB token address
     * @param _metaTxForwarder The MetaTxForwarder address
     */
    constructor(
        address _implementation,
        address _omthbToken,
        address _metaTxForwarder
    ) {
        require(_implementation != address(0), "Invalid implementation");
        require(_implementation.code.length > 0, "Implementation not a contract");
        require(_omthbToken != address(0), "Invalid token");
        require(_omthbToken.code.length > 0, "Token not a contract");
        
        implementation = _implementation;
        omthbToken = _omthbToken;
        metaTxForwarder = _metaTxForwarder;
        
        // Setup roles
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PROJECT_CREATOR_ROLE, msg.sender);
    }
    
    /**
     * @notice Create a new project with access control
     * @param projectId The unique project identifier
     * @param budget The project budget
     * @param admin The project admin address
     * @return projectAddress The deployed project address
     */
    function createProject(
        string memory projectId,
        uint256 budget,
        address admin
    ) external onlyRole(PROJECT_CREATOR_ROLE) whenNotPaused returns (address projectAddress) {
        // Input validation
        require(bytes(projectId).length > 0 && bytes(projectId).length <= 100, "Invalid project ID");
        require(projects[projectId] == address(0), "Project already exists");
        require(admin != address(0), "Invalid admin");
        require(budget > 0, "Invalid budget");
        
        // Check project limit
        require(projectList.length < MAX_PROJECTS, "Max projects reached");
        
        // Rate limiting
        require(
            block.timestamp >= lastProjectCreation[msg.sender] + CREATION_COOLDOWN,
            "Creation cooldown active"
        );
        lastProjectCreation[msg.sender] = block.timestamp;
        
        // Deploy minimal proxy
        projectAddress = implementation.clone();
        
        // Initialize the project
        SimpleProjectReimbursement(projectAddress).initialize(
            projectId,
            budget,
            omthbToken,
            admin
        );
        
        // Store project info
        projects[projectId] = projectAddress;
        projectList.push(projectAddress);
        
        // Emit event
        emit ProjectCreated(projectId, projectAddress, msg.sender, budget);
        
        return projectAddress;
    }
    
    /**
     * @notice Batch create projects (admin only)
     * @param projectIds Array of project IDs
     * @param budgets Array of budgets
     * @param admins Array of admin addresses
     */
    function batchCreateProjects(
        string[] memory projectIds,
        uint256[] memory budgets,
        address[] memory admins
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        require(projectIds.length == budgets.length, "Length mismatch");
        require(projectIds.length == admins.length, "Length mismatch");
        require(projectIds.length <= 10, "Too many projects");
        
        for (uint256 i = 0; i < projectIds.length; i++) {
            // Skip rate limiting for batch creation
            if (bytes(projectIds[i]).length > 0 && 
                projects[projectIds[i]] == address(0) && 
                projectList.length < MAX_PROJECTS) {
                
                address projectAddress = implementation.clone();
                
                SimpleProjectReimbursement(projectAddress).initialize(
                    projectIds[i],
                    budgets[i],
                    omthbToken,
                    admins[i]
                );
                
                projects[projectIds[i]] = projectAddress;
                projectList.push(projectAddress);
                
                emit ProjectCreated(projectIds[i], projectAddress, msg.sender, budgets[i]);
            }
        }
    }
    
    /**
     * @notice Get total number of projects
     * @return The total number of projects created
     */
    function getProjectCount() external view returns (uint256) {
        return projectList.length;
    }
    
    /**
     * @notice Get project address by ID
     * @param projectId The project ID
     * @return The project address
     */
    function getProject(string memory projectId) external view returns (address) {
        return projects[projectId];
    }
    
    /**
     * @notice Get all project addresses
     * @return Array of all project addresses
     */
    function getAllProjects() external view returns (address[] memory) {
        return projectList;
    }
    
    /**
     * @notice Get projects paginated
     * @param offset Starting index
     * @param limit Number of projects to return
     * @return Array of project addresses
     */
    function getProjectsPaginated(uint256 offset, uint256 limit) 
        external 
        view 
        returns (address[] memory) 
    {
        require(offset < projectList.length, "Offset out of bounds");
        
        uint256 end = offset + limit;
        if (end > projectList.length) {
            end = projectList.length;
        }
        
        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = projectList[i];
        }
        
        return result;
    }
    
    /**
     * @notice Check if a project exists
     * @param projectId The project ID to check
     * @return True if the project exists
     */
    function projectExists(string memory projectId) external view returns (bool) {
        return projects[projectId] != address(0);
    }
    
    /**
     * @notice Emergency pause
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @notice Unpause
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @notice Grant project creator role
     * @param account Address to grant role to
     */
    function grantCreatorRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(PROJECT_CREATOR_ROLE, account);
    }
    
    /**
     * @notice Revoke project creator role
     * @param account Address to revoke role from
     */
    function revokeCreatorRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(PROJECT_CREATOR_ROLE, account);
    }
}
