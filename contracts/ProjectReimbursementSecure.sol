// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./interfaces/IOMTHB.sol";

/**
 * @title ProjectReimbursementSecure
 * @notice Secure version with all vulnerabilities fixed and optimized for compilation
 * @dev Clone implementation for each project with isolated OMTHB treasury
 */
contract ProjectReimbursementSecure is 
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    // ============================================
    // CONSTANTS AND STATE VARIABLES
    // ============================================
    
    bytes32 public constant SECRETARY_ROLE = keccak256("SECRETARY_ROLE");
    bytes32 public constant COMMITTEE_ROLE = keccak256("COMMITTEE_ROLE");
    bytes32 public constant FINANCE_ROLE = keccak256("FINANCE_ROLE");
    bytes32 public constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    bytes32 public constant REQUESTER_ROLE = keccak256("REQUESTER_ROLE");

    enum Status {
        Pending,
        SecretaryApproved,
        CommitteeApproved,
        FinanceApproved,
        DirectorApproved,
        Distributed,
        Cancelled
    }

    struct ReimbursementRequest {
        uint256 id;
        address requester;
        address recipient;
        uint256 amount;
        string description;
        string documentHash;
        Status status;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 paymentDeadline;
    }
    
    struct ApprovalTracking {
        address secretaryApprover;
        address committeeApprover;
        address financeApprover;
        address directorApprover;
        address[] committeeAdditionalApprovers;
    }

    // Project info
    string public projectId;
    address public projectFactory;
    IOMTHB public omthbToken;
    uint256 public projectBudget;
    uint256 public totalDistributed;
    
    // Request tracking
    uint256 private _requestIdCounter;
    mapping(uint256 => ReimbursementRequest) public requests;
    mapping(uint256 => ApprovalTracking) public approvals;
    uint256[] public activeRequestIds;
    
    // Security features
    mapping(uint256 => mapping(address => bytes32)) public approvalCommitments;
    mapping(uint256 => mapping(address => uint256)) public commitTimestamps;
    uint256 public constant REVEAL_WINDOW = 30 minutes;
    
    // Constants
    uint256 public constant MIN_REIMBURSEMENT_AMOUNT = 100 * 10**18;
    uint256 public constant MAX_REIMBURSEMENT_AMOUNT = 1000000 * 10**18;
    uint256 public constant MAX_BATCH_SIZE = 100;
    uint256 public constant PAYMENT_DEADLINE_DURATION = 7 days;
    uint256 public constant REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS = 3;
    
    // Multi-sig for admin functions
    uint256 public constant CRITICAL_OPERATION_THRESHOLD = 2;
    mapping(bytes32 => address[]) public criticalOperationApprovers;
    
    // Storage gap
    uint256[40] private __gap;

    // ============================================
    // EVENTS
    // ============================================
    
    event RequestCreated(uint256 indexed requestId, address indexed requester, address indexed recipient, uint256 amount, string description);
    event RequestApproved(uint256 indexed requestId, Status indexed newStatus, address indexed approver);
    event RequestCancelled(uint256 indexed requestId, address indexed canceller);
    event FundsDistributed(uint256 indexed requestId, address indexed recipient, uint256 amount);
    event TotalDistributedUpdated(uint256 oldTotal, uint256 newTotal);
    event BudgetUpdated(uint256 oldBudget, uint256 newBudget);
    event ApprovalCommitted(uint256 indexed requestId, address indexed approver, uint256 timestamp);
    event ApprovalRevealed(uint256 indexed requestId, address indexed approver, Status newStatus);
    event CriticalOperationApproved(bytes32 indexed operationId, address indexed approver, uint256 approverCount);
    event EmergencyPause(address indexed caller, uint256 timestamp);

    // ============================================
    // ERRORS
    // ============================================
    
    error InvalidAmount();
    error InvalidAddress();
    error InvalidStatus();
    error RequestNotFound();
    error InsufficientBudget();
    error AlreadyApproved();
    error UnauthorizedApprover();
    error TransferFailed();
    error TooManyActiveRequests();
    error InvalidCommitment();
    error RevealTooEarly();
    error PaymentDeadlineExpired();
    error AmountTooLow();
    error AmountTooHigh();
    error InvalidDescription();
    error InvalidDocumentHash();
    error ZeroAddress();
    error InsufficientBalance();

    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier onlyFactory() {
        if (msg.sender != projectFactory) revert UnauthorizedApprover();
        _;
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    
    function initialize(
        string memory _projectId,
        address _omthbToken,
        uint256 _projectBudget,
        address _admin
    ) external initializer {
        if (_omthbToken == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        if (_projectBudget == 0) revert InvalidAmount();
        if (bytes(_projectId).length == 0) revert InvalidDescription();
        
        // Verify token contract
        if (_omthbToken.code.length == 0) revert InvalidAddress();
        
        // Verify token is valid ERC20
        try IOMTHB(_omthbToken).totalSupply() returns (uint256) {
            // Token is valid
        } catch {
            revert InvalidAddress();
        }
        
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        
        projectId = _projectId;
        projectFactory = msg.sender;
        omthbToken = IOMTHB(_omthbToken);
        projectBudget = _projectBudget;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    // ============================================
    // REIMBURSEMENT FUNCTIONS
    // ============================================
    
    function createRequest(
        address recipient,
        uint256 amount,
        string calldata description,
        string calldata documentHash
    ) external onlyRole(REQUESTER_ROLE) whenNotPaused returns (uint256) {
        // Input validation
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        if (amount < MIN_REIMBURSEMENT_AMOUNT) revert AmountTooLow();
        if (amount > MAX_REIMBURSEMENT_AMOUNT) revert AmountTooHigh();
        if (bytes(description).length == 0 || bytes(description).length > 1000) revert InvalidDescription();
        if (bytes(documentHash).length == 0 || bytes(documentHash).length > 100) revert InvalidDocumentHash();
        
        // Budget validation
        uint256 newTotal = totalDistributed + amount;
        if (newTotal > projectBudget) revert InsufficientBudget();
        if (newTotal < totalDistributed) revert InvalidAmount(); // Overflow check
        
        // DoS protection
        if (activeRequestIds.length >= MAX_BATCH_SIZE) revert TooManyActiveRequests();
        
        uint256 requestId = _requestIdCounter++;
        
        requests[requestId] = ReimbursementRequest({
            id: requestId,
            requester: msg.sender,
            recipient: recipient,
            amount: amount,
            description: description,
            documentHash: documentHash,
            status: Status.Pending,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            paymentDeadline: 0
        });
        
        approvals[requestId] = ApprovalTracking({
            secretaryApprover: address(0),
            committeeApprover: address(0),
            financeApprover: address(0),
            directorApprover: address(0),
            committeeAdditionalApprovers: new address[](0)
        });
        
        activeRequestIds.push(requestId);
        
        emit RequestCreated(requestId, msg.sender, recipient, amount, description);
        
        return requestId;
    }

    function commitApproval(uint256 requestId, bytes32 commitment) external whenNotPaused nonReentrant {
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled || request.status == Status.Distributed) {
            revert InvalidStatus();
        }
        
        // Verify role based on current status
        _verifyApprovalRole(request.status);
        
        approvalCommitments[requestId][msg.sender] = commitment;
        commitTimestamps[requestId][msg.sender] = block.timestamp;
        
        emit ApprovalCommitted(requestId, msg.sender, block.timestamp);
    }

    function approveBySecretary(uint256 requestId, uint256 nonce) external onlyRole(SECRETARY_ROLE) whenNotPaused nonReentrant {
        _verifyAndReveal(requestId, nonce, Status.Pending);
        
        ApprovalTracking storage approval = approvals[requestId];
        if (approval.secretaryApprover != address(0)) revert AlreadyApproved();
        
        approval.secretaryApprover = msg.sender;
        requests[requestId].status = Status.SecretaryApproved;
        requests[requestId].updatedAt = block.timestamp;
        
        emit RequestApproved(requestId, Status.SecretaryApproved, msg.sender);
    }

    function approveByCommittee(uint256 requestId, uint256 nonce) external onlyRole(COMMITTEE_ROLE) whenNotPaused nonReentrant {
        _verifyAndReveal(requestId, nonce, Status.SecretaryApproved);
        
        ApprovalTracking storage approval = approvals[requestId];
        if (approval.committeeApprover != address(0)) revert AlreadyApproved();
        
        approval.committeeApprover = msg.sender;
        requests[requestId].status = Status.CommitteeApproved;
        requests[requestId].updatedAt = block.timestamp;
        
        emit RequestApproved(requestId, Status.CommitteeApproved, msg.sender);
    }

    function approveByFinance(uint256 requestId, uint256 nonce) external onlyRole(FINANCE_ROLE) whenNotPaused nonReentrant {
        _verifyAndReveal(requestId, nonce, Status.CommitteeApproved);
        
        ApprovalTracking storage approval = approvals[requestId];
        if (approval.financeApprover != address(0)) revert AlreadyApproved();
        
        approval.financeApprover = msg.sender;
        requests[requestId].status = Status.FinanceApproved;
        requests[requestId].updatedAt = block.timestamp;
        
        emit RequestApproved(requestId, Status.FinanceApproved, msg.sender);
    }

    function approveByCommitteeAdditional(uint256 requestId, uint256 nonce) external onlyRole(COMMITTEE_ROLE) whenNotPaused nonReentrant {
        _verifyAndReveal(requestId, nonce, Status.FinanceApproved);
        
        ApprovalTracking storage approval = approvals[requestId];
        
        // Ensure not same as primary committee approver
        if (approval.committeeApprover == msg.sender) revert AlreadyApproved();
        
        // Check for duplicates
        for (uint256 i = 0; i < approval.committeeAdditionalApprovers.length; i++) {
            if (approval.committeeAdditionalApprovers[i] == msg.sender) revert AlreadyApproved();
        }
        
        approval.committeeAdditionalApprovers.push(msg.sender);
        requests[requestId].updatedAt = block.timestamp;
        
        emit RequestApproved(requestId, Status.FinanceApproved, msg.sender);
    }

    function approveByDirector(uint256 requestId, uint256 nonce) external onlyRole(DIRECTOR_ROLE) whenNotPaused nonReentrant {
        _verifyAndReveal(requestId, nonce, Status.FinanceApproved);
        
        ApprovalTracking storage approval = approvals[requestId];
        if (approval.committeeAdditionalApprovers.length < REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS) {
            revert InvalidStatus();
        }
        if (approval.directorApprover != address(0)) revert AlreadyApproved();
        
        approval.directorApprover = msg.sender;
        requests[requestId].status = Status.DirectorApproved;
        requests[requestId].updatedAt = block.timestamp;
        requests[requestId].paymentDeadline = block.timestamp + PAYMENT_DEADLINE_DURATION;
        
        emit RequestApproved(requestId, Status.DirectorApproved, msg.sender);
        
        // Auto-distribute funds
        _distributeFunds(requestId);
    }

    function cancelRequest(uint256 requestId) external whenNotPaused nonReentrant {
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId) revert RequestNotFound();
        
        // Only requester or admin can cancel
        if (msg.sender != request.requester && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        
        if (request.status == Status.Distributed) revert InvalidStatus();
        
        request.status = Status.Cancelled;
        request.updatedAt = block.timestamp;
        
        // Remove from active requests
        _removeFromActiveRequests(requestId);
        
        emit RequestCancelled(requestId, msg.sender);
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================
    
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 operationId = keccak256(abi.encodePacked("pause", block.timestamp));
        
        // Check if already approved by this admin
        address[] storage approvers = criticalOperationApprovers[operationId];
        for (uint256 i = 0; i < approvers.length; i++) {
            if (approvers[i] == msg.sender) revert AlreadyApproved();
        }
        
        // Add approval
        approvers.push(msg.sender);
        emit CriticalOperationApproved(operationId, msg.sender, approvers.length);
        
        // Execute if threshold reached
        if (approvers.length >= CRITICAL_OPERATION_THRESHOLD) {
            _pause();
            emit EmergencyPause(msg.sender, block.timestamp);
            delete criticalOperationApprovers[operationId];
        }
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function updateBudget(uint256 newBudget) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (newBudget < totalDistributed) revert InvalidAmount();
        if (newBudget == 0) revert InvalidAmount();
        if (newBudget > type(uint256).max / 2) revert InvalidAmount();
        
        uint256 oldBudget = projectBudget;
        projectBudget = newBudget;
        
        emit BudgetUpdated(oldBudget, newBudget);
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    function getActiveRequests() external view returns (uint256[] memory) {
        return activeRequestIds;
    }

    function getRequest(uint256 requestId) external view returns (ReimbursementRequest memory) {
        return requests[requestId];
    }
    
    function getApprovalInfo(uint256 requestId) external view returns (ApprovalTracking memory) {
        return approvals[requestId];
    }

    // ============================================
    // INTERNAL FUNCTIONS
    // ============================================
    
    function _verifyApprovalRole(Status status) private view {
        if (status == Status.Pending && !hasRole(SECRETARY_ROLE, msg.sender)) revert UnauthorizedApprover();
        if (status == Status.SecretaryApproved && !hasRole(COMMITTEE_ROLE, msg.sender)) revert UnauthorizedApprover();
        if (status == Status.CommitteeApproved && !hasRole(FINANCE_ROLE, msg.sender)) revert UnauthorizedApprover();
        if (status == Status.FinanceApproved) {
            if (!hasRole(COMMITTEE_ROLE, msg.sender) && !hasRole(DIRECTOR_ROLE, msg.sender)) {
                revert UnauthorizedApprover();
            }
        }
    }

    function _verifyAndReveal(uint256 requestId, uint256 nonce, Status expectedStatus) private {
        bytes32 commitment = approvalCommitments[requestId][msg.sender];
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (block.timestamp < commitTimestamps[requestId][msg.sender] + REVEAL_WINDOW) {
            revert RevealTooEarly();
        }
        
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, requestId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.status != expectedStatus) revert InvalidStatus();
        
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
        emit ApprovalRevealed(requestId, msg.sender, request.status);
    }

    function _distributeFunds(uint256 requestId) private {
        ReimbursementRequest storage request = requests[requestId];
        
        if (request.paymentDeadline != 0 && block.timestamp > request.paymentDeadline) {
            revert PaymentDeadlineExpired();
        }
        
        uint256 amount = request.amount;
        address recipient = request.recipient;
        
        // Update state BEFORE external calls (CEI pattern)
        request.status = Status.Distributed;
        request.updatedAt = block.timestamp;
        
        uint256 oldTotal = totalDistributed;
        totalDistributed += amount;
        
        emit TotalDistributedUpdated(oldTotal, totalDistributed);
        emit FundsDistributed(requestId, recipient, amount);
        
        // Check balance before transfer
        uint256 contractBalance = omthbToken.balanceOf(address(this));
        if (contractBalance < amount) revert InsufficientBalance();
        
        // External call LAST
        bool success = omthbToken.transfer(recipient, amount);
        if (!success) revert TransferFailed();
        
        // Verify transfer
        uint256 newBalance = omthbToken.balanceOf(address(this));
        if (contractBalance - newBalance != amount) revert TransferFailed();
        
        _removeFromActiveRequests(requestId);
    }

    function _removeFromActiveRequests(uint256 requestId) private {
        uint256 length = activeRequestIds.length;
        for (uint256 i = 0; i < length; i++) {
            if (activeRequestIds[i] == requestId) {
                if (i != length - 1) {
                    activeRequestIds[i] = activeRequestIds[length - 1];
                }
                activeRequestIds.pop();
                break;
            }
        }
    }
}