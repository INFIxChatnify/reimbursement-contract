// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IOMTHB.sol";

/**
 * @title BeaconProjectFactoryOptimized
 * @notice Optimized beacon factory with reduced bytecode size
 * @dev Uses beacon proxy pattern with minimal features
 */
contract BeaconProjectFactoryOptimized is AccessControl, ReentrancyGuard, Pausable {
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
        uint256 signCount;
        mapping(address => bool) hasSigned;
    }
    
    // Immutable state
    UpgradeableBeacon public immutable beacon;
    IOMTHB public immutable omthbToken;
    
    // Storage
    mapping(string => Project) public projects;
    mapping(string => Closure) public closures;
    address[] public deputies;
    mapping(address => bool) public isDeputy;
    
    // Events
    event ProjectCreated(string indexed id, address indexed contractAddr);
    event ClosureInitiated(string indexed id);
    event ClosureSigned(string indexed id, address signer);
    event ProjectClosed(string indexed id);
    event BeaconUpgraded(address newImpl);
    
    // Errors
    error E01(); // ProjectExists
    error E02(); // ProjectNotFound
    error E03(); // InvalidAddress
    error E04(); // AlreadySigned
    error E05(); // NotActive
    error E06(); // UnauthorizedSigner
    error E07(); // Timeout
    error E08(); // InvalidInput
    
    constructor(
        address _implementation,
        address _omthbToken,
        address _admin
    ) {
        require(_implementation != address(0) && _omthbToken != address(0) && _admin != address(0), "E03");
        
        beacon = new UpgradeableBeacon(_implementation, address(this));
        omthbToken = IOMTHB(_omthbToken);
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(DIRECTOR_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
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
        
        // Deploy beacon proxy
        BeaconProxy proxy = new BeaconProxy(
            address(beacon),
            abi.encodeWithSignature(
                "initialize(string,address,uint256,address)",
                projectId,
                address(omthbToken),
                0,
                projectAdmin
            )
        );
        
        address projectContract = address(proxy);
        
        // Store project
        projects[projectId] = Project({
            contractAddr: projectContract,
            createdAt: block.timestamp,
            isActive: true
        });
        
        emit ProjectCreated(projectId, projectContract);
        return projectContract;
    }
    
    /**
     * @notice Upgrade beacon
     */
    function upgradeBeacon(address newImpl) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newImpl == address(0)) revert E03();
        beacon.upgradeTo(newImpl);
        emit BeaconUpgraded(newImpl);
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
        closure.signCount = 1;
        closure.hasSigned[msg.sender] = true;
        
        emit ClosureInitiated(projectId);
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
        
        // Check if ready
        if (_hasEnoughSigs(projectId)) {
            _executeClosure(projectId);
        }
    }
    
    /**
     * @notice Update deputy
     */
    function updateDeputy(address deputy, bool add) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (deputy == address(0)) revert E03();
        
        if (add && !isDeputy[deputy]) {
            require(deputies.length < MAX_DEPUTIES, "Max");
            deputies.push(deputy);
            isDeputy[deputy] = true;
            _grantRole(DEPUTY_ROLE, deputy);
        } else if (!add && isDeputy[deputy]) {
            isDeputy[deputy] = false;
            _revokeRole(DEPUTY_ROLE, deputy);
            
            // Remove from array
            uint256 len = deputies.length;
            for (uint256 i = 0; i < len;) {
                if (deputies[i] == deputy) {
                    deputies[i] = deputies[len - 1];
                    deputies.pop();
                    break;
                }
                unchecked { ++i; }
            }
        }
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
    function _hasEnoughSigs(string memory projectId) private view returns (bool) {
        Closure storage closure = closures[projectId];
        uint256 deputyCount;
        bool hasDirector;
        
        uint256 len = deputies.length;
        for (uint256 i = 0; i < len;) {
            if (closure.hasSigned[deputies[i]]) deputyCount++;
            unchecked { ++i; }
        }
        
        // Check director
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
        
        // Pause project
        (bool success,) = project.contractAddr.call{gas: 50000}(
            abi.encodeWithSignature("pause()")
        );
        
        if (!success) {
            project.isActive = true;
            revert("Pause failed");
        }
        
        emit ProjectClosed(projectId);
    }
}