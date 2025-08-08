// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IOMTHB.sol";

/**
 * @title ProjectFactoryOptimized
 * @notice Optimized factory contract with reduced bytecode size
 * @dev Removes unnecessary features and uses more efficient patterns
 */
contract ProjectFactoryOptimized is AccessControl, ReentrancyGuard, Pausable {
    using Clones for address;
    
    // Roles
    bytes32 constant CREATOR_ROLE = keccak256("PROJECT_CREATOR_ROLE");
    bytes32 constant DEPUTY_ROLE = keccak256("DEPUTY_ROLE");
    bytes32 constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    bytes32 constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    // Constants
    uint256 constant MAX_DEPUTIES = 10;
    uint256 constant CLOSURE_SIGS_REQUIRED = 3;
    uint256 constant CLOSURE_TIMEOUT = 7 days;
    
    // Project info
    struct Project {
        address contractAddr;
        uint256 createdAt;
        bool isActive;
    }
    
    // Closure request
    struct Closure {
        uint256 timestamp;
        address initiator;
        uint256 signCount;
        mapping(address => bool) hasSigned;
    }
    
    // Immutable state
    address public immutable implementation;
    IOMTHB public immutable omthbToken;
    
    // Storage
    mapping(string => Project) public projects;
    mapping(string => Closure) public closures;
    address[] public deputies;
    mapping(address => bool) public isDeputy;
    
    // Events
    event ProjectCreated(string indexed id, address indexed contractAddr, address creator);
    event ClosureInitiated(string indexed id, address initiator);
    event ClosureSigned(string indexed id, address signer);
    event ProjectClosed(string indexed id);
    event DeputyUpdated(address deputy, bool added);
    
    // Errors
    error E01(); // ProjectExists
    error E02(); // ProjectNotFound
    error E03(); // InvalidAddress
    error E04(); // AlreadySigned
    error E05(); // NotActive
    error E06(); // UnauthorizedSigner
    error E07(); // Timeout
    error E08(); // InvalidInput
    error E09(); // CannotRemoveLastAdmin
    
    constructor(
        address _implementation,
        address _omthbToken,
        address _admin
    ) {
        require(_implementation != address(0) && _omthbToken != address(0) && _admin != address(0), "E03");
        
        implementation = _implementation;
        omthbToken = IOMTHB(_omthbToken);
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(DIRECTOR_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
    }
    
    /**
     * @notice Override revokeRole to prevent removing the last admin
     * @param role The role to revoke
     * @param account The account to revoke the role from
     */
    function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        if (role == DEFAULT_ADMIN_ROLE && getRoleMemberCount(DEFAULT_ADMIN_ROLE) == 1) {
            revert E09();
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
            revert E09();
        }
        super.renounceRole(role, account);
    }
    
    /**
     * @notice Create project
     */
    function createProject(
        string calldata projectId,
        address projectAdmin
    ) external onlyRole(CREATOR_ROLE) nonReentrant whenNotPaused returns (address) {
        if (bytes(projectId).length == 0 || bytes(projectId).length > 100) revert E08();
        if (projects[projectId].contractAddr != address(0)) revert E01();
        if (projectAdmin == address(0)) revert E03();
        
        // Deploy clone
        address clone = implementation.clone();
        
        // Initialize with 0 budget
        (bool success,) = clone.call(
            abi.encodeWithSignature(
                "initialize(string,address,uint256,address)",
                projectId,
                address(omthbToken),
                0,
                projectAdmin
            )
        );
        require(success, "Init failed");
        
        // Grant initial role
        (success,) = clone.call(
            abi.encodeWithSignature(
                "grantRoleDirect(bytes32,address)",
                keccak256("REQUESTER_ROLE"),
                projectAdmin
            )
        );
        
        // Store project
        projects[projectId] = Project({
            contractAddr: clone,
            createdAt: block.timestamp,
            isActive: true
        });
        
        emit ProjectCreated(projectId, clone, msg.sender);
        return clone;
    }
    
    /**
     * @notice Initiate closure
     */
    function initiateClosure(string calldata projectId) external {
        Project storage project = projects[projectId];
        if (project.contractAddr == address(0)) revert E02();
        if (!project.isActive) revert E05();
        if (!isDeputy[msg.sender] && !hasRole(DIRECTOR_ROLE, msg.sender)) revert E06();
        
        Closure storage closure = closures[projectId];
        closure.timestamp = block.timestamp;
        closure.initiator = msg.sender;
        closure.signCount = 1;
        closure.hasSigned[msg.sender] = true;
        
        emit ClosureInitiated(projectId, msg.sender);
    }
    
    /**
     * @notice Sign closure
     */
    function signClosure(string calldata projectId) external {
        Project storage project = projects[projectId];
        if (project.contractAddr == address(0)) revert E02();
        if (!project.isActive) revert E05();
        if (!isDeputy[msg.sender] && !hasRole(DIRECTOR_ROLE, msg.sender)) revert E06();
        
        Closure storage closure = closures[projectId];
        if (closure.timestamp == 0) revert E02();
        if (closure.hasSigned[msg.sender]) revert E04();
        if (block.timestamp > closure.timestamp + CLOSURE_TIMEOUT) revert E07();
        
        closure.hasSigned[msg.sender] = true;
        closure.signCount++;
        
        emit ClosureSigned(projectId, msg.sender);
        
        // Check if ready to execute
        if (_hasEnoughSignatures(projectId)) {
            _executeClosure(projectId);
        }
    }
    
    /**
     * @notice Update deputy
     */
    function updateDeputy(address deputy, bool add) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (deputy == address(0)) revert E03();
        
        if (add && !isDeputy[deputy]) {
            require(deputies.length < MAX_DEPUTIES, "Max reached");
            deputies.push(deputy);
            isDeputy[deputy] = true;
            _grantRole(DEPUTY_ROLE, deputy);
        } else if (!add && isDeputy[deputy]) {
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
        }
        
        emit DeputyUpdated(deputy, add);
    }
    
    /**
     * @notice Pause/unpause
     */
    function setPaused(bool paused) external onlyRole(PAUSER_ROLE) {
        if (paused) _pause();
        else _unpause();
    }
    
    /**
     * @notice Check signatures
     */
    function _hasEnoughSignatures(string memory projectId) private view returns (bool) {
        Closure storage closure = closures[projectId];
        uint256 deputyCount;
        bool hasDirector;
        
        for (uint256 i = 0; i < deputies.length; i++) {
            if (closure.hasSigned[deputies[i]]) deputyCount++;
        }
        
        // Check director separately
        if (hasRole(DIRECTOR_ROLE, msg.sender)) {
            hasDirector = true;
        }
        
        return deputyCount >= 2 && hasDirector;
    }
    
    /**
     * @notice Execute closure
     */
    function _executeClosure(string memory projectId) private {
        Project storage project = projects[projectId];
        project.isActive = false;
        
        // Pause project with gas limit
        address projectContract = project.contractAddr;
        (bool success,) = projectContract.call{gas: 50000}(
            abi.encodeWithSignature("pause()")
        );
        
        if (!success) {
            project.isActive = true;
            revert("Pause failed");
        }
        
        emit ProjectClosed(projectId);
    }
}
