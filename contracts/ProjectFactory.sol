// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Using Solidity 0.8+ with built-in overflow protection

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./ProjectReimbursementV3.sol";
import "./interfaces/IOMTHB.sol";
import "./libraries/SecurityLib.sol";

/**
 * @title ProjectFactory
 * @notice Factory for deploying project reimbursement contracts with multi-sig closure
 * @dev Uses minimal proxy pattern (EIP-1167) for gas-efficient deployments
 */
contract ProjectFactory is AccessControl, ReentrancyGuard, Pausable {
    using SecurityLib for uint256;
    using SecurityLib for address[];
    using Clones for address;

    /// @notice Roles
    bytes32 public constant PROJECT_CREATOR_ROLE = keccak256("PROJECT_CREATOR_ROLE");
    bytes32 public constant DEPUTY_ROLE = keccak256("DEPUTY_ROLE");
    bytes32 public constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    /// @notice Gas optimization constants
    uint256 public constant MAX_DEPUTIES = 10;
    uint256 public constant MAX_SIGNERS = 20;

    /// @notice Project closure request structure
    struct ClosureRequest {
        uint256 timestamp;
        address initiator;
        address[] signers;
        bool executed;
        mapping(address => bool) hasSigned;
    }

    /// @notice Project information
    struct ProjectInfo {
        string projectId;
        address projectContract;
        uint256 createdAt;
        bool isActive;
        address creator;
    }

    /// @notice State variables
    address public immutable projectImplementation;
    IOMTHB public immutable omthbToken;
    address public immutable metaTxForwarder;
    
    /// @notice Project tracking
    mapping(string => ProjectInfo) public projects;
    mapping(address => string[]) public projectsByCreator;
    string[] public allProjectIds;
    
    /// @notice Closure requests
    mapping(string => ClosureRequest) public closureRequests;
    
    /// @notice Deputy addresses (for multi-sig)
    address[] public deputies;
    mapping(address => bool) public isDeputy;
    
    /// @notice Configuration
    uint256 public constant CLOSURE_SIGNATURES_REQUIRED = 3; // 2 deputies + director
    uint256 public constant CLOSURE_TIMEOUT = 7 days;

    /// @notice Events
    event ProjectCreated(
        string indexed projectId,
        address indexed projectContract,
        address indexed creator,
        uint256 budget
    );
    
    event ClosureInitiated(string indexed projectId, address indexed initiator);
    event ClosureSigned(string indexed projectId, address indexed signer);
    event ProjectClosed(string indexed projectId, uint256 remainingBalance);
    event DeputyAdded(address indexed deputy);
    event DeputyRemoved(address indexed deputy);

    /// @notice Custom errors
    error ProjectExists();
    error ProjectNotFound();
    error InvalidAddress();
    error InvalidBudget();
    error AlreadySigned();
    error InsufficientSignatures();
    error ClosureTimeout();
    error NotActive();
    error UnauthorizedSigner();
    error TooManyDeputies();
    error InvalidProjectId();
    error ZeroAddress();
    error InsufficientAllowance();
    error InsufficientBalance();
    error TokenTransferFailed();

    /**
     * @notice Constructor
     * @param _projectImplementation Address of the ProjectReimbursementV3 implementation
     * @param _omthbToken Address of the OMTHB token
     * @param _metaTxForwarder Address of the meta transaction forwarder
     * @param _admin Admin address
     */
    constructor(
        address _projectImplementation,
        address _omthbToken,
        address _metaTxForwarder,
        address _admin
    ) {
        if (_projectImplementation == address(0)) revert ZeroAddress();
        if (_omthbToken == address(0)) revert ZeroAddress();
        if (_metaTxForwarder == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        
        // Verify contracts exist
        if (_projectImplementation.code.length == 0) revert InvalidAddress();
        if (_omthbToken.code.length == 0) revert InvalidAddress();
        if (_metaTxForwarder.code.length == 0) revert InvalidAddress();
            
        projectImplementation = _projectImplementation;
        omthbToken = IOMTHB(_omthbToken);
        metaTxForwarder = _metaTxForwarder;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(DIRECTOR_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
    }

    /**
     * @notice Create a new project without initial OMTHB transfer
     * @param projectId Unique project identifier
     * @param projectAdmin Admin address for the project
     * @return projectAddress The deployed project contract address
     * @dev Projects now start with 0 balance and require deposits after creation
     */
    function createProject(
        string calldata projectId,
        address projectAdmin
    ) external onlyRole(PROJECT_CREATOR_ROLE) nonReentrant whenNotPaused returns (address) {
        // Enhanced validation
        if (bytes(projectId).length == 0) revert InvalidProjectId();
        if (bytes(projectId).length > 100) revert InvalidProjectId();
        if (projects[projectId].projectContract != address(0)) revert ProjectExists();
        if (projectAdmin == address(0)) revert ZeroAddress();
        
        // Deploy minimal proxy
        address clone = projectImplementation.clone();
        
        // Initialize the project contract with 0 budget
        try ProjectReimbursementV3(clone).initialize(
            projectId,
            address(omthbToken),
            0, // Start with 0 budget
            projectAdmin
        ) {} catch Error(string memory reason) {
            revert(string(abi.encodePacked("Failed to initialize project: ", reason)));
        } catch (bytes memory) {
            revert("Failed to initialize project: Unknown error");
        }
        
        // CRITICAL FIX: Grant initial roles directly
        // The factory needs to set up initial roles for the project to function
        try ProjectReimbursementV3(clone).grantRoleDirect(
            keccak256("REQUESTER_ROLE"),
            projectAdmin
        ) {} catch {
            // Role might already be granted or function might not exist in older versions
        }
        
        // Store project info
        projects[projectId] = ProjectInfo({
            projectId: projectId,
            projectContract: clone,
            createdAt: block.timestamp,
            isActive: true,
            creator: msg.sender
        });
        
        projectsByCreator[msg.sender].push(projectId);
        allProjectIds.push(projectId);
        
        emit ProjectCreated(projectId, clone, msg.sender, 0);
        
        return clone;
    }

    /**
     * @notice Initiate project closure (requires multi-sig)
     * @param projectId The project to close
     */
    function initiateProjectClosure(string calldata projectId) external {
        ProjectInfo storage project = projects[projectId];
        if (project.projectContract == address(0)) revert ProjectNotFound();
        if (!project.isActive) revert NotActive();
        
        // Only deputies or director can initiate
        if (!isDeputy[msg.sender] && !hasRole(DIRECTOR_ROLE, msg.sender)) {
            revert UnauthorizedSigner();
        }
        
        ClosureRequest storage request = closureRequests[projectId];
        request.timestamp = block.timestamp;
        request.initiator = msg.sender;
        request.executed = false;
        delete request.signers;
        
        // Add initiator as first signer
        request.signers.push(msg.sender);
        request.hasSigned[msg.sender] = true;
        
        emit ClosureInitiated(projectId, msg.sender);
    }

    /**
     * @notice Sign a closure request
     * @param projectId The project to sign closure for
     */
    function signClosureRequest(string calldata projectId) external {
        ProjectInfo storage project = projects[projectId];
        if (project.projectContract == address(0)) revert ProjectNotFound();
        if (!project.isActive) revert NotActive();
        
        // Only deputies or director can sign
        if (!isDeputy[msg.sender] && !hasRole(DIRECTOR_ROLE, msg.sender)) {
            revert UnauthorizedSigner();
        }
        
        ClosureRequest storage request = closureRequests[projectId];
        if (request.timestamp == 0) revert ProjectNotFound();
        if (request.executed) revert NotActive();
        if (request.hasSigned[msg.sender]) revert AlreadySigned();
        if (block.timestamp > request.timestamp + CLOSURE_TIMEOUT) revert ClosureTimeout();
        
        // Add signature
        require(request.signers.length < MAX_SIGNERS, "Max signers reached");
        request.signers.push(msg.sender);
        request.hasSigned[msg.sender] = true;
        
        emit ClosureSigned(projectId, msg.sender);
        
        // Check if we have enough signatures
        if (_hasRequiredSignatures(request)) {
            _executeProjectClosure(projectId);
        }
    }

    /**
     * @notice Add a deputy
     * @param deputy Address to add as deputy
     */
    function addDeputy(address deputy) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (deputy == address(0)) revert InvalidAddress();
        if (isDeputy[deputy]) return;
        require(deputies.length < MAX_DEPUTIES, "Max deputies reached");
        
        deputies.push(deputy);
        isDeputy[deputy] = true;
        _grantRole(DEPUTY_ROLE, deputy);
        
        emit DeputyAdded(deputy);
    }

    /**
     * @notice Remove a deputy
     * @param deputy Address to remove as deputy
     */
    function removeDeputy(address deputy) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!isDeputy[deputy]) return;
        
        isDeputy[deputy] = false;
        _revokeRole(DEPUTY_ROLE, deputy);
        
        // Remove from array
        for (uint256 i = 0; i < deputies.length; i++) {
            if (deputies[i] == deputy) {
                deputies[i] = deputies[deputies.length - 1];
                deputies.pop();
                break;
            }
        }
        
        emit DeputyRemoved(deputy);
    }

    /**
     * @notice Get all projects
     * @return Array of all project IDs
     */
    function getAllProjects() external view returns (string[] memory) {
        return allProjectIds;
    }

    /**
     * @notice Get projects by creator
     * @param creator The creator address
     * @return Array of project IDs
     */
    function getProjectsByCreator(address creator) external view returns (string[] memory) {
        return projectsByCreator[creator];
    }

    /**
     * @notice Get closure request signers
     * @param projectId The project ID
     * @return Array of signer addresses
     */
    function getClosureSigners(string calldata projectId) external view returns (address[] memory) {
        return closureRequests[projectId].signers;
    }

    /**
     * @notice Get all deputies
     * @return Array of deputy addresses
     */
    function getDeputies() external view returns (address[] memory) {
        return deputies;
    }

    /**
     * @notice Pause factory operations
     * @dev Only PAUSER_ROLE can pause
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause factory operations
     * @dev Only PAUSER_ROLE can unpause
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Check if closure has required signatures
     * @param request The closure request
     * @return bool Whether requirements are met
     */
    function _hasRequiredSignatures(ClosureRequest storage request) private view returns (bool) {
        uint256 deputyCount = 0;
        bool hasDirector = false;
        
        for (uint256 i = 0; i < request.signers.length; i++) {
            if (isDeputy[request.signers[i]]) {
                deputyCount++;
            }
            if (hasRole(DIRECTOR_ROLE, request.signers[i])) {
                hasDirector = true;
            }
        }
        
        // Need at least 2 deputies + director
        return deputyCount >= 2 && hasDirector;
    }

    /**
     * @notice Execute project closure
     * @param projectId The project to close
     * @dev Implements proper error handling for external calls
     */
    function _executeProjectClosure(string memory projectId) private {
        ProjectInfo storage project = projects[projectId];
        ClosureRequest storage request = closureRequests[projectId];
        
        // Get remaining balance from project contract
        ProjectReimbursementV3 projectContract = ProjectReimbursementV3(project.projectContract);
        uint256 remainingBalance = omthbToken.balanceOf(address(projectContract));
        
        // CRITICAL FIX: Mark as closed FIRST (state changes before external calls)
        project.isActive = false;
        request.executed = true;
        
        // SECURITY FIX CRITICAL-1: Pause with gas limit to prevent griefing
        // Gas limit for pause operation to prevent malicious contracts from consuming all gas
        uint256 pauseGasLimit = 50000;
        
        // Attempt to pause with gas limit and comprehensive error handling
        try projectContract.pause{gas: pauseGasLimit}() {
            emit ProjectClosed(projectId, remainingBalance);
        } catch Error(string memory reason) {
            // Revert state changes on failure
            project.isActive = true;
            request.executed = false;
            revert(string(abi.encodePacked("Failed to pause project: ", reason)));
        } catch (bytes memory lowLevelData) {
            // Revert state changes on failure
            project.isActive = true;
            request.executed = false;
            
            // Handle low-level errors with proper error propagation
            if (lowLevelData.length > 0) {
                // Bubble up the revert reason if available
                assembly {
                    let returndata_size := mload(lowLevelData)
                    revert(add(32, lowLevelData), returndata_size)
                }
            } else {
                revert("Failed to pause project: Unknown error");
            }
        }
    }
}