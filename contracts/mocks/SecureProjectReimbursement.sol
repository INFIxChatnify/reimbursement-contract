// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../base/AdminProtectedAccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IOMTHB.sol";

/**
 * @title SecureProjectReimbursement
 * @notice Secure reimbursement contract with enhanced features
 * @dev Implementation with pausable functionality and multi-level approval
 */
contract SecureProjectReimbursement is AdminProtectedAccessControl, ReentrancyGuard, Pausable {
    // Roles
    bytes32 public constant REQUESTER_ROLE = keccak256("REQUESTER_ROLE");
    bytes32 public constant SECRETARY_ROLE = keccak256("SECRETARY_ROLE");
    bytes32 public constant COMMITTEE_ROLE = keccak256("COMMITTEE_ROLE");
    bytes32 public constant FINANCE_ROLE = keccak256("FINANCE_ROLE");
    bytes32 public constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    
    // State variables
    string public projectId;
    address public projectFactory;
    IOMTHB public omthbToken;
    uint256 public projectBudget;
    uint256 public totalDistributed;
    
    // Request status enum
    enum Status {
        Pending,
        SecretaryApproved,
        CommitteeApproved,
        FinanceApproved,
        DirectorApproved,
        Distributed,
        Cancelled
    }
    
    // Request structure
    struct Request {
        uint256 id;
        address requester;
        address recipient;
        uint256 amount;
        string description;
        Status status;
        uint256 createdAt;
        mapping(bytes32 => address) approvers;
    }
    
    // Request counter and mapping
    uint256 private requestCounter;
    mapping(uint256 => Request) public requests;
    
    // Events
    event RequestCreated(uint256 indexed requestId, address requester, address recipient, uint256 amount);
    event RequestApproved(uint256 indexed requestId, Status newStatus, address approver);
    event RequestCancelled(uint256 indexed requestId);
    event FundsDistributed(uint256 indexed requestId, address recipient, uint256 amount);
    
    // Custom errors
    error InvalidAmount();
    error InvalidAddress();
    error InsufficientBudget();
    error RequestNotFound();
    error InvalidStatus();
    error AlreadyApproved();
    error UnauthorizedApprover();
    error TransferFailed();
    
    modifier onlyFactory() {
        require(msg.sender == projectFactory, "Only factory");
        _;
    }
    
    constructor() {
        // Implementation will be initialized by factory
    }
    
    
    function initialize(
        string memory _projectId,
        address _omthbToken,
        uint256 _projectBudget,
        address _admin
    ) external onlyFactory {
        if (_omthbToken == address(0)) revert InvalidAddress();
        if (_admin == address(0)) revert InvalidAddress();
        
        projectId = _projectId;
        projectFactory = msg.sender;
        omthbToken = IOMTHB(_omthbToken);
        projectBudget = _projectBudget;
        
        _initializeAdmin(_admin);
    }
    
    function createRequest(
        address recipient,
        uint256 amount,
        string calldata description
    ) external onlyRole(REQUESTER_ROLE) whenNotPaused returns (uint256) {
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (totalDistributed + amount > projectBudget) revert InsufficientBudget();
        
        uint256 requestId = requestCounter++;
        Request storage request = requests[requestId];
        request.id = requestId;
        request.requester = msg.sender;
        request.recipient = recipient;
        request.amount = amount;
        request.description = description;
        request.status = Status.Pending;
        request.createdAt = block.timestamp;
        
        emit RequestCreated(requestId, msg.sender, recipient, amount);
        return requestId;
    }
    
    function approveBySecretary(uint256 requestId) external onlyRole(SECRETARY_ROLE) whenNotPaused {
        Request storage request = requests[requestId];
        if (request.id != requestId || request.amount == 0) revert RequestNotFound();
        if (request.status != Status.Pending) revert InvalidStatus();
        if (request.approvers[SECRETARY_ROLE] != address(0)) revert AlreadyApproved();
        
        request.approvers[SECRETARY_ROLE] = msg.sender;
        request.status = Status.SecretaryApproved;
        
        emit RequestApproved(requestId, Status.SecretaryApproved, msg.sender);
    }
    
    function approveByCommittee(uint256 requestId) external onlyRole(COMMITTEE_ROLE) whenNotPaused {
        Request storage request = requests[requestId];
        if (request.id != requestId || request.amount == 0) revert RequestNotFound();
        if (request.status != Status.SecretaryApproved) revert InvalidStatus();
        if (request.approvers[COMMITTEE_ROLE] != address(0)) revert AlreadyApproved();
        
        request.approvers[COMMITTEE_ROLE] = msg.sender;
        request.status = Status.CommitteeApproved;
        
        emit RequestApproved(requestId, Status.CommitteeApproved, msg.sender);
    }
    
    function approveByFinance(uint256 requestId) external onlyRole(FINANCE_ROLE) whenNotPaused {
        Request storage request = requests[requestId];
        if (request.id != requestId || request.amount == 0) revert RequestNotFound();
        if (request.status != Status.CommitteeApproved) revert InvalidStatus();
        if (request.approvers[FINANCE_ROLE] != address(0)) revert AlreadyApproved();
        
        request.approvers[FINANCE_ROLE] = msg.sender;
        request.status = Status.FinanceApproved;
        
        emit RequestApproved(requestId, Status.FinanceApproved, msg.sender);
    }
    
    function approveByDirector(uint256 requestId) external onlyRole(DIRECTOR_ROLE) whenNotPaused nonReentrant {
        Request storage request = requests[requestId];
        if (request.id != requestId || request.amount == 0) revert RequestNotFound();
        if (request.status != Status.FinanceApproved) revert InvalidStatus();
        if (request.approvers[DIRECTOR_ROLE] != address(0)) revert AlreadyApproved();
        
        request.approvers[DIRECTOR_ROLE] = msg.sender;
        request.status = Status.DirectorApproved;
        
        emit RequestApproved(requestId, Status.DirectorApproved, msg.sender);
        
        // Auto-distribute after director approval
        _distributeFunds(requestId);
    }
    
    function cancelRequest(uint256 requestId) external whenNotPaused {
        Request storage request = requests[requestId];
        if (request.id != requestId || request.amount == 0) revert RequestNotFound();
        
        // Only requester or admin can cancel
        if (msg.sender != request.requester && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        
        if (request.status == Status.Distributed) revert InvalidStatus();
        
        request.status = Status.Cancelled;
        emit RequestCancelled(requestId);
    }
    
    function _distributeFunds(uint256 requestId) private {
        Request storage request = requests[requestId];
        
        request.status = Status.Distributed;
        totalDistributed += request.amount;
        
        bool success = omthbToken.transfer(request.recipient, request.amount);
        if (!success) revert TransferFailed();
        
        emit FundsDistributed(requestId, request.recipient, request.amount);
    }
    
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    function updateBudget(uint256 newBudget) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newBudget < totalDistributed) revert InvalidAmount();
        projectBudget = newBudget;
    }
    
    function getApprover(uint256 requestId, bytes32 role) external view returns (address) {
        return requests[requestId].approvers[role];
    }
}
