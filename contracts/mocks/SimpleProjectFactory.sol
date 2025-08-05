// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SimpleProjectReimbursement.sol";

/**
 * @title SimpleProjectFactory
 * @notice Factory for deploying SimpleProjectReimbursement using minimal proxy pattern
 */
contract SimpleProjectFactory is Ownable {
    using Clones for address;

    /// @notice The implementation contract address
    address public immutable implementation;
    
    /// @notice OMTHB token address
    address public immutable omthbToken;
    
    /// @notice MetaTxForwarder address for gasless support
    address public immutable metaTxForwarder;
    
    /// @notice Mapping of project ID to project address
    mapping(string => address) public projects;
    
    /// @notice Array of all project addresses
    address[] public projectList;
    
    /// @notice Events
    event ProjectCreated(
        string indexed projectId,
        address indexed projectAddress,
        address indexed creator,
        uint256 budget
    );
    
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
    ) Ownable(msg.sender) {
        require(_implementation != address(0), "Invalid implementation");
        require(_omthbToken != address(0), "Invalid token");
        
        implementation = _implementation;
        omthbToken = _omthbToken;
        metaTxForwarder = _metaTxForwarder;
    }
    
    /**
     * @notice Create a new project
     * @param projectId The unique project identifier
     * @param budget The project budget
     * @param admin The project admin address
     * @return projectAddress The deployed project address
     */
    function createProject(
        string memory projectId,
        uint256 budget,
        address admin
    ) external returns (address projectAddress) {
        require(bytes(projectId).length > 0, "Invalid project ID");
        require(projects[projectId] == address(0), "Project already exists");
        require(admin != address(0), "Invalid admin");
        
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
     * @notice Check if a project exists
     * @param projectId The project ID to check
     * @return True if the project exists
     */
    function projectExists(string memory projectId) external view returns (bool) {
        return projects[projectId] != address(0);
    }
}
