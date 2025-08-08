// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IOMTHB.sol";

/**
 * @title SimpleProjectReimbursement
 * @notice Simple reimbursement contract for testing
 * @dev Minimal implementation for unit tests
 */
contract SimpleProjectReimbursement is AccessControl, ReentrancyGuard {
    // Roles
    bytes32 public constant REQUESTER_ROLE = keccak256("REQUESTER_ROLE");
    bytes32 public constant APPROVER_ROLE = keccak256("APPROVER_ROLE");
    
    // State variables
    string public projectId;
    IOMTHB public omthbToken;
    uint256 public projectBudget;
    uint256 public totalDistributed;
    
    // Simple request structure
    struct Request {
        uint256 id;
        address requester;
        address recipient;
        uint256 amount;
        bool approved;
        bool distributed;
    }
    
    // Request counter and mapping
    uint256 private requestCounter;
    mapping(uint256 => Request) public requests;
    
    // Events
    event RequestCreated(uint256 indexed requestId, address requester, address recipient, uint256 amount);
    event RequestApproved(uint256 indexed requestId, address approver);
    event FundsDistributed(uint256 indexed requestId, address recipient, uint256 amount);
    
    // Custom errors
    error InvalidAmount();
    error InvalidAddress();
    error InsufficientBudget();
    error RequestNotFound();
    error AlreadyApproved();
    error NotApproved();
    error AlreadyDistributed();
    error TransferFailed();
    error CannotRemoveLastAdmin();
    
    constructor(
        string memory _projectId,
        address _omthbToken,
        uint256 _projectBudget,
        address _admin
    ) {
        projectId = _projectId;
        omthbToken = IOMTHB(_omthbToken);
        projectBudget = _projectBudget;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(APPROVER_ROLE, _admin);
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
    
    function createRequest(
        address recipient,
        uint256 amount
    ) external onlyRole(REQUESTER_ROLE) returns (uint256) {
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (totalDistributed + amount > projectBudget) revert InsufficientBudget();
        
        uint256 requestId = requestCounter++;
        requests[requestId] = Request({
            id: requestId,
            requester: msg.sender,
            recipient: recipient,
            amount: amount,
            approved: false,
            distributed: false
        });
        
        emit RequestCreated(requestId, msg.sender, recipient, amount);
        return requestId;
    }
    
    function approveRequest(uint256 requestId) external onlyRole(APPROVER_ROLE) {
        Request storage request = requests[requestId];
        if (request.id != requestId || request.amount == 0) revert RequestNotFound();
        if (request.approved) revert AlreadyApproved();
        
        request.approved = true;
        emit RequestApproved(requestId, msg.sender);
    }
    
    function distributeReimbursement(uint256 requestId) external nonReentrant {
        Request storage request = requests[requestId];
        if (request.id != requestId || request.amount == 0) revert RequestNotFound();
        if (!request.approved) revert NotApproved();
        if (request.distributed) revert AlreadyDistributed();
        
        request.distributed = true;
        totalDistributed += request.amount;
        
        bool success = omthbToken.transfer(request.recipient, request.amount);
        if (!success) revert TransferFailed();
        
        emit FundsDistributed(requestId, request.recipient, request.amount);
    }
}
