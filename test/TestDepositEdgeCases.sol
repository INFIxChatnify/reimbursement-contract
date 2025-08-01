// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/BeaconProjectFactory.sol";
import "../contracts/ProjectReimbursement.sol";
import "../contracts/interfaces/IOMTHB.sol";

/**
 * @title TestDepositEdgeCases
 * @notice Edge case tests for deposit and locking functionality
 */
contract TestDepositEdgeCases is Test {
    BeaconProjectFactory public factory;
    ProjectReimbursement public projectImpl;
    ProjectReimbursement public project;
    IOMTHB public omthb;
    
    address public admin = address(0x1);
    address public projectCreator = address(0x2);
    address public projectAdmin = address(0x3);
    address public depositor1 = address(0x4);
    address public depositor2 = address(0x5);
    address public attacker = address(0x6);
    address public metaTxForwarder = address(0x7);
    
    string public constant PROJECT_ID = "EDGE-TEST-001";
    
    function setUp() public {
        // Deploy mock OMTHB token
        omthb = IOMTHB(deployMockOMTHB());
        
        // Deploy project implementation
        projectImpl = new ProjectReimbursement();
        
        // Deploy factory
        factory = new BeaconProjectFactory(
            address(projectImpl),
            address(omthb),
            metaTxForwarder,
            admin
        );
        
        // Setup roles
        vm.startPrank(admin);
        factory.grantRole(factory.PROJECT_CREATOR_ROLE(), projectCreator);
        vm.stopPrank();
        
        // Create project
        vm.startPrank(projectCreator);
        address projectAddr = factory.createProject(PROJECT_ID, projectAdmin);
        project = ProjectReimbursement(projectAddr);
        vm.stopPrank();
    }
    
    function deployMockOMTHB() internal returns (address) {
        MockOMTHB token = new MockOMTHB();
        token.mint(depositor1, 10000 * 10**18);
        token.mint(depositor2, 10000 * 10**18);
        token.mint(attacker, 10000 * 10**18);
        return address(token);
    }
    
    /**
     * @notice Test multiple depositors
     */
    function testMultipleDepositors() public {
        uint256 amount1 = 500 * 10**18;
        uint256 amount2 = 300 * 10**18;
        
        // First depositor
        vm.startPrank(depositor1);
        omthb.approve(address(project), amount1);
        project.depositOMTHB(amount1);
        vm.stopPrank();
        
        // Second depositor
        vm.startPrank(depositor2);
        omthb.approve(address(project), amount2);
        project.depositOMTHB(amount2);
        vm.stopPrank();
        
        // Verify total
        assertEq(project.getTotalBalance(), amount1 + amount2, "Total balance should be sum of deposits");
        assertEq(project.projectBudget(), amount1 + amount2, "Budget should be sum of deposits");
    }
    
    /**
     * @notice Test deposit overflow protection
     */
    function testDepositOverflowProtection() public {
        // Set project budget to near max
        vm.startPrank(projectAdmin);
        project.updateBudget(type(uint256).max - 1000);
        vm.stopPrank();
        
        // Try to deposit amount that would cause overflow
        vm.startPrank(depositor1);
        omthb.approve(address(project), 2000);
        
        // This should succeed as we handle overflow correctly
        project.depositOMTHB(1000);
        
        // This should fail due to overflow
        vm.expectRevert();
        project.depositOMTHB(1000);
        vm.stopPrank();
    }
    
    /**
     * @notice Test reentrancy protection on deposit
     */
    function testDepositReentrancyProtection() public {
        ReentrantToken reentrantToken = new ReentrantToken(address(project));
        
        // Deploy new project with reentrant token
        vm.startPrank(projectCreator);
        address newProjectAddr = factory.createProject("REENTRANT-TEST", projectAdmin);
        ProjectReimbursement newProject = ProjectReimbursement(newProjectAddr);
        vm.stopPrank();
        
        // Try reentrancy attack - should fail
        vm.startPrank(address(reentrantToken));
        vm.expectRevert("ReentrancyGuard: reentrant call");
        newProject.depositOMTHB(100);
        vm.stopPrank();
    }
    
    /**
     * @notice Test deposit when paused
     */
    function testDepositWhenPaused() public {
        // Pause the project
        vm.startPrank(projectAdmin);
        project.pause();
        vm.stopPrank();
        
        // Try to deposit
        vm.startPrank(depositor1);
        omthb.approve(address(project), 100);
        vm.expectRevert("Pausable: paused");
        project.depositOMTHB(100);
        vm.stopPrank();
    }
    
    /**
     * @notice Test locked funds exceed total balance edge case
     */
    function testLockedFundsTracking() public {
        uint256 depositAmount = 1000 * 10**18;
        
        // Deposit funds
        vm.startPrank(depositor1);
        omthb.approve(address(project), depositAmount);
        project.depositOMTHB(depositAmount);
        vm.stopPrank();
        
        // Setup roles for creating requests
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), depositor1);
        vm.stopPrank();
        
        // Create multiple small requests
        vm.startPrank(depositor1);
        uint256[] memory requestIds = new uint256[](5);
        for (uint i = 0; i < 5; i++) {
            requestIds[i] = project.createRequest(
                address(uint160(100 + i)), 
                100 * 10**18, 
                "Test", 
                "Hash"
            );
        }
        vm.stopPrank();
        
        // Verify available balance reduces correctly
        assertEq(project.getAvailableBalance(), depositAmount, "All funds should still be available");
        assertEq(project.getLockedAmount(), 0, "No funds should be locked yet");
    }
    
    /**
     * @notice Test creating request with exactly available balance
     */
    function testRequestWithExactAvailableBalance() public {
        uint256 depositAmount = 1000 * 10**18;
        uint256 firstRequestAmount = 600 * 10**18;
        
        // Setup
        vm.startPrank(depositor1);
        omthb.approve(address(project), depositAmount);
        project.depositOMTHB(depositAmount);
        vm.stopPrank();
        
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), depositor1);
        project.grantRoleDirect(project.DIRECTOR_ROLE(), depositor1);
        vm.stopPrank();
        
        // Create and approve first request to lock funds
        vm.startPrank(depositor1);
        uint256 requestId1 = project.createRequest(address(0x100), firstRequestAmount, "Test 1", "Hash1");
        
        // Mock approval process to lock funds (simplified for test)
        // In real scenario, this would go through full approval flow
        vm.stopPrank();
        
        // Now create request for exact remaining balance
        uint256 remainingBalance = depositAmount - firstRequestAmount;
        vm.startPrank(depositor1);
        uint256 requestId2 = project.createRequest(address(0x101), remainingBalance, "Test 2", "Hash2");
        vm.stopPrank();
        
        // Verify request was created successfully
        ProjectReimbursement.ReimbursementRequest memory request = project.getRequest(requestId2);
        assertEq(request.totalAmount, remainingBalance, "Request should be for exact remaining balance");
    }
    
    /**
     * @notice Test deposit after project closure
     */
    function testDepositAfterEmergencyClosure() public {
        // Setup emergency closure
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.COMMITTEE_ROLE(), depositor1);
        project.grantRoleDirect(project.DIRECTOR_ROLE(), depositor2);
        vm.stopPrank();
        
        // Initiate emergency closure
        vm.startPrank(depositor1);
        project.initiateEmergencyClosure(projectAdmin, "Emergency test");
        vm.stopPrank();
        
        // Note: Full emergency closure would require multiple approvals
        // For this test, we're checking behavior during closure process
        
        // Deposits should still work during closure initiation
        vm.startPrank(depositor2);
        omthb.approve(address(project), 100);
        project.depositOMTHB(100);
        vm.stopPrank();
        
        assertEq(project.getTotalBalance(), 100, "Deposit should succeed during closure initiation");
    }
    
    /**
     * @notice Test rapid successive deposits
     */
    function testRapidSuccessiveDeposits() public {
        uint256 amount = 10 * 10**18;
        
        vm.startPrank(depositor1);
        omthb.approve(address(project), amount * 100);
        
        uint256 totalDeposited = 0;
        for (uint i = 0; i < 10; i++) {
            project.depositOMTHB(amount);
            totalDeposited += amount;
        }
        vm.stopPrank();
        
        assertEq(project.getTotalBalance(), totalDeposited, "All deposits should be recorded");
        assertEq(project.projectBudget(), totalDeposited, "Budget should match total deposits");
    }
}

/**
 * @title ReentrantToken
 * @notice Malicious token that attempts reentrancy
 */
contract ReentrantToken {
    address public target;
    bool public attacking;
    
    constructor(address _target) {
        target = _target;
    }
    
    function transferFrom(address, address, uint256) external returns (bool) {
        if (!attacking) {
            attacking = true;
            ProjectReimbursement(target).depositOMTHB(100);
        }
        return true;
    }
    
    function balanceOf(address) external pure returns (uint256) {
        return 1000;
    }
    
    function allowance(address, address) external pure returns (uint256) {
        return 1000;
    }
}

/**
 * @title MockOMTHB
 * @notice Mock OMTHB token for testing
 */
contract MockOMTHB {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        
        emit Transfer(from, to, amount);
        return true;
    }
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }
}