// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/ProjectFactory.sol";
import "../contracts/ProjectReimbursement.sol";
import "../contracts/interfaces/IOMTHB.sol";

/**
 * @title EdgeCaseTests
 * @notice Tests for edge cases and boundary conditions
 * @dev Comprehensive testing of limits, overflows, and unusual scenarios
 */
contract EdgeCaseTests is Test {
    ProjectFactory public factory;
    ProjectReimbursement public projectImplementation;
    IOMTHB public omthbToken;
    
    address public admin = address(0x1);
    address public projectCreator = address(0x2);
    address public projectAdmin = address(0x3);
    address public requester = address(0x4);
    
    uint256 constant MAX_UINT = type(uint256).max;
    
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
    // MAXIMUM VALUE TESTS
    // ============================================
    
    /**
     * @notice Test maximum budget creation
     */
    function testMaximumBudgetCreation() public {
        uint256 maxBudget = 10**9 * 10**18; // 1 billion tokens
        
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, maxBudget);
        omthbToken.approve(address(factory), maxBudget);
        
        // Should succeed with maximum allowed budget
        address projectAddress = factory.createProject("MAX-001", maxBudget, projectAdmin);
        assertEq(omthbToken.balanceOf(projectAddress), maxBudget);
        
        // Try to create with budget exceeding maximum
        MockOMTHB(address(omthbToken)).mint(projectCreator, 1);
        omthbToken.approve(address(factory), maxBudget + 1);
        
        vm.expectRevert(ProjectFactory.InvalidBudget.selector);
        factory.createProject("MAX-002", maxBudget + 1, projectAdmin);
        vm.stopPrank();
    }
    
    /**
     * @notice Test maximum recipients per request
     */
    function testMaximumRecipientsPerRequest() public {
        // Setup project
        uint256 budget = 1000e18;
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject("RECIP-001", budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), requester);
        vm.stopPrank();
        
        // Create request with maximum recipients
        vm.startPrank(requester);
        address[] memory recipients = new address[](10); // MAX_RECIPIENTS
        uint256[] memory amounts = new uint256[](10);
        
        for (uint i = 0; i < 10; i++) {
            recipients[i] = address(uint160(0x100 + i));
            amounts[i] = 10e18;
        }
        
        // Should succeed with exactly MAX_RECIPIENTS
        uint256 requestId = project.createRequestMultiple(
            recipients,
            amounts,
            "Max recipients test",
            "QmTest",
            address(0)
        );
        
        assertEq(project.getRequestRecipients(requestId).length, 10);
        
        // Try with one more recipient
        address[] memory tooManyRecipients = new address[](11);
        uint256[] memory tooManyAmounts = new uint256[](11);
        
        for (uint i = 0; i < 11; i++) {
            tooManyRecipients[i] = address(uint160(0x200 + i));
            tooManyAmounts[i] = 10e18;
        }
        
        vm.expectRevert(ProjectReimbursement.TooManyRecipients.selector);
        project.createRequestMultiple(
            tooManyRecipients,
            tooManyAmounts,
            "Too many recipients",
            "QmTest",
            address(0)
        );
        vm.stopPrank();
    }
    
    // ============================================
    // MINIMUM VALUE TESTS
    // ============================================
    
    /**
     * @notice Test minimum reimbursement amount
     */
    function testMinimumReimbursementAmount() public {
        // Setup project
        uint256 budget = 1000e18;
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject("MIN-001", budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), requester);
        vm.stopPrank();
        
        // Try with amount below minimum
        vm.startPrank(requester);
        vm.expectRevert(ProjectReimbursement.AmountTooLow.selector);
        project.createRequest(
            address(0x100),
            99e18, // Below MIN_REIMBURSEMENT_AMOUNT (100)
            "Test",
            "QmTest"
        );
        
        // Should succeed with exactly minimum
        uint256 requestId = project.createRequest(
            address(0x100),
            100e18, // Exactly MIN_REIMBURSEMENT_AMOUNT
            "Test",
            "QmTest"
        );
        
        assertEq(project.getRequest(requestId).totalAmount, 100e18);
        vm.stopPrank();
    }
    
    // ============================================
    // EMPTY/ZERO VALUE TESTS
    // ============================================
    
    /**
     * @notice Test empty arrays and zero values
     */
    function testEmptyAndZeroValues() public {
        // Setup project
        uint256 budget = 1000e18;
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject("EMPTY-001", budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), requester);
        vm.stopPrank();
        
        vm.startPrank(requester);
        
        // Test empty recipient array
        address[] memory emptyRecipients = new address[](0);
        uint256[] memory emptyAmounts = new uint256[](0);
        
        vm.expectRevert(ProjectReimbursement.EmptyRecipientList.selector);
        project.createRequestMultiple(
            emptyRecipients,
            emptyAmounts,
            "Empty test",
            "QmTest",
            address(0)
        );
        
        // Test zero address recipient
        vm.expectRevert(ProjectReimbursement.ZeroAddress.selector);
        project.createRequest(
            address(0),
            100e18,
            "Zero address test",
            "QmTest"
        );
        
        // Test zero amount
        vm.expectRevert(ProjectReimbursement.InvalidAmount.selector);
        project.createRequest(
            address(0x100),
            0,
            "Zero amount test",
            "QmTest"
        );
        
        vm.stopPrank();
    }
    
    // ============================================
    // STRING LENGTH TESTS
    // ============================================
    
    /**
     * @notice Test string length limits
     */
    function testStringLengthLimits() public {
        // Setup project
        uint256 budget = 1000e18;
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject("STR-001", budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), requester);
        vm.stopPrank();
        
        vm.startPrank(requester);
        
        // Test empty description
        vm.expectRevert(ProjectReimbursement.InvalidDescription.selector);
        project.createRequest(
            address(0x100),
            100e18,
            "", // Empty description
            "QmTest"
        );
        
        // Test very long description (>1000 chars)
        bytes memory longDesc = new bytes(1001);
        for (uint i = 0; i < 1001; i++) {
            longDesc[i] = "a";
        }
        
        vm.expectRevert(ProjectReimbursement.InvalidDescription.selector);
        project.createRequest(
            address(0x100),
            100e18,
            string(longDesc),
            "QmTest"
        );
        
        // Test empty document hash
        vm.expectRevert(ProjectReimbursement.InvalidDocumentHash.selector);
        project.createRequest(
            address(0x100),
            100e18,
            "Valid description",
            "" // Empty document hash
        );
        
        // Test very long document hash (>100 chars)
        bytes memory longHash = new bytes(101);
        for (uint i = 0; i < 101; i++) {
            longHash[i] = "b";
        }
        
        vm.expectRevert(ProjectReimbursement.InvalidDocumentHash.selector);
        project.createRequest(
            address(0x100),
            100e18,
            "Valid description",
            string(longHash)
        );
        
        vm.stopPrank();
    }
    
    // ============================================
    // OVERFLOW TESTS
    // ============================================
    
    /**
     * @notice Test arithmetic overflow scenarios
     */
    function testArithmeticOverflow() public {
        // Setup project with large budget
        uint256 budget = type(uint256).max / 2;
        
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        
        // Should fail due to budget validation
        vm.expectRevert(ProjectFactory.InvalidBudget.selector);
        factory.createProject("OVERFLOW-001", budget, projectAdmin);
        
        // Test with valid budget
        budget = 1000e18;
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject("OVERFLOW-002", budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), requester);
        vm.stopPrank();
        
        // Test overflow in multi-recipient total
        vm.startPrank(requester);
        address[] memory recipients = new address[](2);
        recipients[0] = address(0x100);
        recipients[1] = address(0x101);
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = type(uint256).max / 2 + 1;
        amounts[1] = type(uint256).max / 2 + 1;
        
        // Should catch overflow
        vm.expectRevert(ProjectReimbursement.InvalidAmount.selector);
        project.createRequestMultiple(
            recipients,
            amounts,
            "Overflow test",
            "QmTest",
            address(0)
        );
        vm.stopPrank();
    }
    
    // ============================================
    // TIMING EDGE CASES
    // ============================================
    
    /**
     * @notice Test timing edge cases
     */
    function testTimingEdgeCases() public {
        // Setup project
        uint256 budget = 1000e18;
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject("TIME-001", budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), requester);
        project.grantRoleDirect(project.SECRETARY_ROLE(), address(0x10));
        vm.stopPrank();
        
        // Create request
        vm.startPrank(requester);
        uint256 requestId = project.createRequest(
            address(0x100),
            100e18,
            "Timing test",
            "QmTest"
        );
        vm.stopPrank();
        
        // Test reveal exactly at boundary
        uint256 nonce = 123;
        bytes32 commitment = keccak256(abi.encodePacked(address(0x10), requestId, block.chainid, nonce));
        
        vm.startPrank(address(0x10));
        project.commitApproval(requestId, commitment);
        
        // Try to reveal exactly at 30 minutes
        vm.warp(block.timestamp + 30 minutes);
        vm.expectRevert(ProjectReimbursement.RevealTooEarly.selector);
        project.approveBySecretary(requestId, nonce);
        
        // Should work 1 second later
        vm.warp(block.timestamp + 1);
        project.approveBySecretary(requestId, nonce);
        vm.stopPrank();
    }
    
    // ============================================
    // DUPLICATE AND COLLISION TESTS
    // ============================================
    
    /**
     * @notice Test duplicate recipients and project IDs
     */
    function testDuplicatesAndCollisions() public {
        uint256 budget = 1000e18;
        
        // Test duplicate project ID
        vm.startPrank(projectCreator);
        MockOMTHB(address(omthbToken)).mint(projectCreator, budget * 2);
        omthbToken.approve(address(factory), budget);
        factory.createProject("DUP-001", budget, projectAdmin);
        
        // Try to create with same ID
        omthbToken.approve(address(factory), budget);
        vm.expectRevert(ProjectFactory.ProjectExists.selector);
        factory.createProject("DUP-001", budget, projectAdmin);
        vm.stopPrank();
        
        // Create new project for recipient tests
        vm.startPrank(projectCreator);
        omthbToken.approve(address(factory), budget);
        address projectAddress = factory.createProject("DUP-002", budget, projectAdmin);
        vm.stopPrank();
        
        ProjectReimbursement project = ProjectReimbursement(projectAddress);
        
        vm.startPrank(projectAdmin);
        project.grantRoleDirect(project.REQUESTER_ROLE(), requester);
        vm.stopPrank();
        
        // Test duplicate recipients
        vm.startPrank(requester);
        address[] memory recipients = new address[](2);
        recipients[0] = address(0x100);
        recipients[1] = address(0x100); // Duplicate
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e18;
        amounts[1] = 100e18;
        
        vm.expectRevert(ProjectReimbursement.InvalidAddress.selector);
        project.createRequestMultiple(
            recipients,
            amounts,
            "Duplicate test",
            "QmTest",
            address(0)
        );
        vm.stopPrank();
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