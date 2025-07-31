// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/ProjectFactory.sol";
import "../contracts/ProjectReimbursement.sol";
import "../contracts/interfaces/IOMTHB.sol";

/**
 * @title SecurityTests
 * @notice Comprehensive security test suite for smart contract vulnerabilities
 * @dev Tests all critical, high, and medium severity issues identified in audit
 */
contract SecurityTests is Test {
    ProjectFactory public factory;
    ProjectReimbursement public projectImplementation;
    IOMTHB public omthbToken;
    
    address public admin = address(0x1);
    address public projectCreator = address(0x2);
    address public projectAdmin = address(0x3);
    address public attacker = address(0x666);
    
    // Role addresses
    address public secretary = address(0x10);
    address public committee1 = address(0x11);
    address public committee2 = address(0x12);
    address public committee3 = address(0x13);
    address public committee4 = address(0x14);
    address public finance = address(0x15);
    address public director = address(0x16);
    address public requester = address(0x17);
    
    function setUp() public {
        // Deploy mock OMTHB token
        omthbToken = IOMTHB(address(new MockOMTHB()));
        
        // Deploy implementation
        projectImplementation = new ProjectReimbursement();
        
        // Deploy factory
        factory = new ProjectFactory(
            address(projectImplementation),
            address(omthbToken),
            address(0x6), // meta tx forwarder
            admin
        );
        
        // Setup roles
        vm.startPrank(admin);
        factory.grantRole(factory.PROJECT_CREATOR_ROLE(), projectCreator);
        vm.stopPrank();
    }
    
    // ============================================
    // CRITICAL ISSUE TESTS
    // ============================================
    
    /**
     * @notice Test CRITICAL-1: Token Transfer Griefing
     * @dev Tests if malicious token can grief project creation
     */
    function testTokenTransferGriefing() public {
        // Deploy malicious token that consumes all gas
        MaliciousToken malToken = new MaliciousToken();
        
        // Deploy new factory with malicious token
        ProjectFactory malFactory = new ProjectFactory(
            address(projectImplementation),
            address(malToken),
            address(0x6),
            admin
        );
        
        vm.startPrank(admin);
        malFactory.grantRole(malFactory.PROJECT_CREATOR_ROLE(), projectCreator);
        vm.stopPrank();
        
        // Mint tokens and approve
        malToken.mint(projectCreator, 1000e18);
        vm.startPrank(projectCreator);
        malToken.approve(address(malFactory), 1000e18);
        
        // This should revert due to gas consumption
        vm.expectRevert();
        malFactory.createProject{gas: 1000000}("MAL-001", 1000e18, projectAdmin);
        vm.stopPrank();
    }
    
    /**
     * @notice Test reentrancy attack via malicious token
     */
    function testReentrancyViaToken() public {
        // Deploy reentrancy token
        ReentrancyToken reToken = new ReentrancyToken();
        
        // Deploy factory with reentrancy token
        ProjectFactory reFactory = new ProjectFactory(
            address(projectImplementation),
            address(reToken),
            address(0x6),
            admin
        );
        
        vm.startPrank(admin);
        reFactory.grantRole(reFactory.PROJECT_CREATOR_ROLE(), projectCreator);
        vm.stopPrank();
        
        // Setup reentrancy attack
        reToken.setTarget(address(reFactory));
        reToken.mint(projectCreator, 1000e18);
        
        vm.startPrank(projectCreator);
        reToken.approve(address(reFactory), 1000e18);
        
        // Should handle reentrancy attempt gracefully
        vm.expectRevert();
        reFactory.createProject("RE-001", 1000e18, projectAdmin);
        vm.stopPrank();
    }
    
    // ============================================
    // HIGH SEVERITY TESTS
    // ============================================
    
    /**
     * @notice Test HIGH-1: Front-running Token Transfers
     * @dev Simulates sandwich attack on project creation
     */
    function testFrontRunningProjectCreation() public {
        uint256 budget = 1000e18;
        
        // Setup legitimate user
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        
        vm.startPrank(projectCreator);
        omthbToken.approve(address(factory), budget);
        
        // Attacker sees pending transaction and front-runs
        vm.stopPrank();
        vm.startPrank(attacker);
        
        // In real scenario, attacker would manipulate token state here
        // For test, we simulate by trying to create project with same ID
        MockOMTHB(address(omthbToken)).mint(attacker, budget);
        omthbToken.approve(address(factory), budget);
        
        // Attacker tries to front-run with same project ID
        vm.expectRevert(ProjectFactory.ProjectExists.selector);
        factory.createProject("FRONT-001", budget, attacker);
        vm.stopPrank();
    }
    
    /**
     * @notice Test HIGH-2: DoS via Unbounded Loop
     * @dev Tests gas consumption in isProjectClosed with many closures
     */
    function testDoSViaUnboundedLoop() public {
        // Create a project first
        uint256 budget = 1000e18;
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject("DOS-001", budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        // Setup roles for closure
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.COMMITTEE_ROLE(), committee1);
        project.grantRoleDirect(project.COMMITTEE_ROLE(), committee2);
        project.grantRoleDirect(project.COMMITTEE_ROLE(), committee3);
        project.grantRoleDirect(project.DIRECTOR_ROLE(), director);
        vm.stopPrank();
        
        // Create many closure requests (simulate DoS)
        for (uint i = 0; i < 100; i++) {
            vm.prank(committee1);
            project.initiateEmergencyClosure(admin, "DoS test");
            
            // Cancel to create more
            vm.prank(committee1);
            project.cancelEmergencyClosure(i);
        }
        
        // Measure gas for isProjectClosed
        uint256 gasBefore = gasleft();
        bool isClosed = project.isProjectClosed();
        uint256 gasUsed = gasBefore - gasleft();
        
        // Should use excessive gas
        assertGt(gasUsed, 100000, "Unbounded loop should consume excessive gas");
        assertFalse(isClosed, "Project should not be closed");
    }
    
    // ============================================
    // MEDIUM SEVERITY TESTS
    // ============================================
    
    /**
     * @notice Test MEDIUM-1: Virtual Payer Validation
     * @dev Tests if contract addresses can be set as virtual payer
     */
    function testVirtualPayerValidation() public {
        // Setup project
        uint256 budget = 1000e18;
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject("VP-001", budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        // Grant requester role
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), requester);
        vm.stopPrank();
        
        // Try to set contract as virtual payer
        vm.startPrank(requester);
        address[] memory recipients = new address[](1);
        recipients[0] = address(0x20);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100e18;
        
        // Should allow setting project contract as virtual payer (vulnerability)
        uint256 requestId = project.createRequestMultiple(
            recipients,
            amounts,
            "Test",
            "QmTest",
            address(project) // Contract address as virtual payer
        );
        
        // Verify vulnerability exists
        assertEq(project.getVirtualPayer(requestId), address(project));
        vm.stopPrank();
    }
    
    /**
     * @notice Test MEDIUM-2: Race Condition in Abandoned Requests
     * @dev Tests concurrent cancellation attempts
     */
    function testAbandonedRequestRaceCondition() public {
        // Setup project and request
        uint256 budget = 1000e18;
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject("RACE-001", budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), requester);
        vm.stopPrank();
        
        // Create request
        vm.startPrank(requester);
        uint256 requestId = project.createRequest(
            address(0x30),
            100e18,
            "Test",
            "QmTest"
        );
        vm.stopPrank();
        
        // Fast forward 15 days
        vm.warp(block.timestamp + 15 days + 1);
        
        // Multiple users try to cancel simultaneously
        address user1 = address(0x41);
        address user2 = address(0x42);
        
        // First cancellation succeeds
        vm.prank(user1);
        project.cancelAbandonedRequest(requestId);
        
        // Second cancellation fails (race condition resolved)
        vm.prank(user2);
        vm.expectRevert(ProjectReimbursement.InvalidStatus.selector);
        project.cancelAbandonedRequest(requestId);
    }
    
    /**
     * @notice Test MEDIUM-3: Weak Randomness in Commit-Reveal
     * @dev Tests predictability of commitments
     */
    function testWeakRandomnessCommitReveal() public {
        // Setup project
        uint256 budget = 1000e18;
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject("RAND-001", budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        // Setup roles
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), requester);
        project.grantRoleDirect(project.SECRETARY_ROLE(), secretary);
        vm.stopPrank();
        
        // Create request
        vm.startPrank(requester);
        uint256 requestId = project.createRequest(
            address(0x40),
            100e18,
            "Test",
            "QmTest"
        );
        vm.stopPrank();
        
        // Predictable commitment (only uses chainid which is constant)
        uint256 nonce = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(secretary, requestId, block.chainid, nonce));
        
        vm.startPrank(secretary);
        project.commitApproval(requestId, commitment);
        
        // Fast forward past reveal window
        vm.warp(block.timestamp + 31 minutes);
        
        // Reveal with predictable values
        project.approveBySecretary(requestId, nonce);
        vm.stopPrank();
        
        // Attack succeeded due to predictable randomness
        ProjectReimbursement.ReimbursementRequest memory request = project.getRequest(requestId);
        assertEq(uint(request.status), uint(ProjectReimbursement.Status.SecretaryApproved));
    }
    
    // ============================================
    // GAS OPTIMIZATION TESTS
    // ============================================
    
    /**
     * @notice Test redundant storage operations
     * @dev Measures gas usage of redundant virtual payer storage
     */
    function testRedundantStorageGas() public {
        // Setup project
        uint256 budget = 1000e18;
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject("GAS-001", budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), requester);
        vm.stopPrank();
        
        // Measure gas for request creation with virtual payer
        vm.startPrank(requester);
        address[] memory recipients = new address[](1);
        recipients[0] = address(0x50);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100e18;
        
        uint256 gasBefore = gasleft();
        project.createRequestMultiple(
            recipients,
            amounts,
            "Test",
            "QmTest",
            address(0x60) // Virtual payer
        );
        uint256 gasUsed = gasBefore - gasleft();
        
        // Gas usage includes redundant storage
        assertGt(gasUsed, 150000, "Redundant storage uses extra gas");
        vm.stopPrank();
    }
}

/**
 * @notice Malicious token that consumes all gas
 */
contract MaliciousToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    function transferFrom(address, address, uint256) external pure returns (bool) {
        // Infinite loop to consume gas
        while(true) {}
        return false;
    }
    
    function totalSupply() external pure returns (uint256) {
        return 1000000e18;
    }
}

/**
 * @notice Token that attempts reentrancy
 */
contract ReentrancyToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    address public target;
    bool attacking;
    
    function setTarget(address _target) external {
        target = _target;
    }
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (!attacking && target != address(0)) {
            attacking = true;
            // Attempt reentrancy
            ProjectFactory(target).createProject("REENTRY", 100e18, address(this));
        }
        
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        return true;
    }
    
    function totalSupply() external pure returns (uint256) {
        return 1000000e18;
    }
}

/**
 * @notice Mock OMTHB implementation
 */
contract MockOMTHB {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        
        return true;
    }
}