// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/ProjectFactory.sol";
import "../contracts/ProjectReimbursement.sol";
import "../contracts/interfaces/IOMTHB.sol";

/**
 * @title TestNewFeatures
 * @notice Test suite for new smart contract features
 * @dev Tests token locking, virtual payer, and abandoned request functionality
 */
contract TestNewFeatures is Test {
    ProjectFactory public factory;
    ProjectReimbursement public projectImplementation;
    IOMTHB public omthbToken;
    
    address public admin = address(0x1);
    address public projectCreator = address(0x2);
    address public projectAdmin = address(0x3);
    address public requester = address(0x4);
    address public virtualPayer = address(0x5);
    
    function setUp() public {
        // Deploy mock OMTHB token
        // In real tests, use proper mock
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
    
    function testProjectCreationWithTokenLocking() public {
        uint256 budget = 1000 * 10**18;
        string memory projectId = "TEST-001";
        
        // Mint tokens to creator
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        
        // Test 1: Should fail without approval
        vm.startPrank(projectCreator);
        vm.expectRevert(ProjectFactory.InsufficientAllowance.selector);
        factory.createProject(projectId, budget, projectAdmin);
        
        // Test 2: Approve and create project
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject(projectId, budget, projectAdmin);
        vm.stopPrank();
        
        // Verify tokens were transferred
        assertEq(omthbToken.balanceOf(projectAddress), budget);
        assertEq(omthbToken.balanceOf(projectCreator), 0);
    }
    
    function testVirtualPayerFunctionality() public {
        // Setup project first
        uint256 budget = 1000 * 10**18;
        string memory projectId = "TEST-002";
        
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject(projectId, budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        // Grant requester role
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), requester);
        vm.stopPrank();
        
        // Create request with virtual payer
        vm.startPrank(requester);
        address[] memory recipients = new address[](2);
        recipients[0] = address(0x10);
        recipients[1] = address(0x11);
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100 * 10**18;
        amounts[1] = 200 * 10**18;
        
        uint256 requestId = project.createRequestMultiple(
            recipients,
            amounts,
            "Test expense",
            "QmTest123",
            virtualPayer
        );
        vm.stopPrank();
        
        // Verify virtual payer is set
        assertEq(project.getVirtualPayer(requestId), virtualPayer);
        assertEq(project.virtualPayers(requestId), virtualPayer);
    }
    
    function testNewViewFunctions() public {
        // Setup project
        uint256 budget = 1000 * 10**18;
        string memory projectId = "TEST-003";
        
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject(projectId, budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        // Test getRemainingBudget
        assertEq(project.getRemainingBudget(), budget);
        
        // Test getContractBalance
        assertEq(project.getContractBalance(), budget);
    }
    
    function testAbandonedRequestCancellation() public {
        // Setup project and create request
        uint256 budget = 1000 * 10**18;
        string memory projectId = "TEST-004";
        
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject(projectId, budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        // Grant requester role and create request
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), requester);
        vm.stopPrank();
        
        vm.startPrank(requester);
        uint256 requestId = project.createRequest(
            address(0x20),
            100 * 10**18,
            "Test expense",
            "QmTest456"
        );
        vm.stopPrank();
        
        // Test 1: Should not be abandoned immediately
        assertFalse(project.isRequestAbandoned(requestId));
        
        // Test 2: Should fail to cancel before 15 days
        vm.expectRevert(ProjectReimbursement.RequestNotAbandoned.selector);
        project.cancelAbandonedRequest(requestId);
        
        // Test 3: Fast forward 15 days and test again
        vm.warp(block.timestamp + 15 days + 1);
        assertTrue(project.isRequestAbandoned(requestId));
        
        // Test 4: Anyone can cancel abandoned request
        address randomUser = address(0x99);
        vm.prank(randomUser);
        project.cancelAbandonedRequest(requestId);
        
        // Verify request is cancelled
        ProjectReimbursement.ReimbursementRequest memory request = project.getRequest(requestId);
        assertEq(uint256(request.status), uint256(ProjectReimbursement.Status.Cancelled));
    }
}

/**
 * @notice Mock OMTHB token for testing
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