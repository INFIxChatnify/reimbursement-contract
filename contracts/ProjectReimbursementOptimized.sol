// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Using Solidity 0.8+ with built-in overflow protection

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./interfaces/IOMTHB.sol";
import "./libraries/ValidationLib.sol";
import "./libraries/ViewLib.sol";
import "./libraries/ArrayLib.sol";
import "./libraries/EmergencyClosureLib.sol";

/**
 * @title ProjectReimbursementOptimized
 * @notice Optimized reimbursement contract using libraries to reduce size
 * @dev Maintains all existing features while reducing contract size below 24KB
 */
contract ProjectReimbursementOptimized is 
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using ValidationLib for *;
    using ViewLib for ViewLib.ReimbursementRequest;
    using ArrayLib for uint256[];
    using EmergencyClosureLib for EmergencyClosureLib.EmergencyClosureRequest;
    using EmergencyClosureLib for mapping(uint256 => EmergencyClosureLib.EmergencyClosureRequest);

    /// @notice Approval roles
    bytes32 public constant SECRETARY_ROLE = keccak256("SECRETARY_ROLE");
    bytes32 public constant COMMITTEE_ROLE = keccak256("COMMITTEE_ROLE");
    bytes32 public constant FINANCE_ROLE = keccak256("FINANCE_ROLE");
    bytes32 public constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    bytes32 public constant REQUESTER_ROLE = keccak256("REQUESTER_ROLE");

    /// @notice Maximum recipients per request for gas efficiency
    uint256 public constant MAX_RECIPIENTS = 10;

    /// @notice Reimbursement status enum
    enum Status {
        Pending,
        SecretaryApproved,
        CommitteeApproved,
        FinanceApproved,
        DirectorApproved,
        Distributed,
        Cancelled
    }

    /// @notice Emergency closure status enum (imported from library)
    using EmergencyClosureLib for EmergencyClosureLib.ClosureStatus;

    /// @notice Reimbursement request structure with multi-recipient support
    struct ReimbursementRequest {
        uint256 id;
        address requester;
        address[] recipients;      // Array of recipient addresses
        uint256[] amounts;         // Array of amounts for each recipient
        uint256 totalAmount;       // Total amount across all recipients
        string description;
        string documentHash;       // IPFS hash or document reference
        Status status;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 paymentDeadline;   // Slippage protection: payment must execute before this time
        ApprovalInfo approvalInfo;
        address virtualPayer;      // Virtual payer address (for tracking purposes)
    }
    
    struct ApprovalInfo {
        address secretaryApprover;
        address committeeApprover;
        address financeApprover;
        address[] committeeAdditionalApprovers; // Array to store multiple committee approvers
        address directorApprover;
    }

    /// @notice Project information
    string public projectId;
    address public projectFactory;
    IOMTHB public omthbToken;
    uint256 public projectBudget;
    uint256 public totalDistributed;
    
    /// @notice Request counter
    uint256 private _requestIdCounter;
    
    /// @notice Reimbursement requests mapping
    mapping(uint256 => ReimbursementRequest) public requests;
    
    /// @notice Active request IDs
    uint256[] public activeRequestIds;
    
    /// @notice Mapping to track active requests per user for cleanup
    mapping(address => uint256[]) public activeRequestsPerUser;
    
    /// @notice Mapping to track index of request in activeRequestsPerUser array
    mapping(uint256 => uint256) private requestIndexInUserArray;
    
    /// @notice Emergency closure counter
    uint256 private _closureIdCounter;
    
    /// @notice Emergency closure requests mapping
    mapping(uint256 => EmergencyClosureLib.EmergencyClosureRequest) public closureRequests;
    
    /// @notice Active closure request ID (only one allowed at a time)
    uint256 public activeClosureRequestId;
    
    /// @notice Virtual payer mapping (requestId => virtual payer address)
    mapping(uint256 => address) public virtualPayers;
    
    /// @notice Commit-reveal mechanism for front-running protection
    mapping(uint256 => mapping(address => bytes32)) public approvalCommitments;
    mapping(uint256 => mapping(address => uint256)) public commitTimestamps;
    uint256 public constant REVEAL_WINDOW = 30 minutes; // Minimum time before reveal
    
    /// @notice Commit-reveal for emergency closures
    mapping(uint256 => mapping(address => bytes32)) public closureCommitments;
    mapping(uint256 => mapping(address => uint256)) public closureCommitTimestamps;
    
    /// @notice Gas DoS Protection Constants
    uint256 public constant MAX_BATCH_SIZE = 100;
    uint256 public constant MAX_ARRAY_LENGTH = 50;
    
    /// @notice Slippage protection constant - 7 days payment deadline after final approval
    uint256 public constant PAYMENT_DEADLINE_DURATION = 7 days;
    
    /// @notice Timelock constants for critical admin functions
    uint256 public constant TIMELOCK_DURATION = 2 days;
    uint256 public constant MIN_TIMELOCK_DURATION = 1 days;
    
    /// @notice Pending admin for two-step ownership transfer
    address public pendingAdmin;
    uint256 public pendingAdminTimestamp;
    
    /// @notice Timelock queue for critical operations
    mapping(bytes32 => uint256) public timelockQueue;
    
    /// @notice Circuit breaker for emergency stops
    bool public emergencyStop;
    
    /// @notice Timelock controller for admin functions
    address public timelockController;
    
    /// @notice Current admin address for tracking admin transfers
    address public currentAdmin;
    
    /// @notice Minimum and maximum reimbursement amounts
    uint256 public constant MIN_REIMBURSEMENT_AMOUNT = 100 * 10**18; // 100 OMTHB
    uint256 public constant MAX_REIMBURSEMENT_AMOUNT = 1000000 * 10**18; // 1M OMTHB
    
    /// @notice Required number of additional committee approvers
    uint256 public constant REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS = 3;
    
    /// @notice Required number of committee approvers for emergency closure
    uint256 public constant REQUIRED_CLOSURE_COMMITTEE_APPROVERS = 3;
    
    /// @notice Role management commit-reveal mechanism
    mapping(bytes32 => mapping(address => bytes32)) public roleCommitments;
    mapping(bytes32 => mapping(address => uint256)) public roleCommitTimestamps;
    
    /// @notice Multi-sig requirement for critical functions
    uint256 public constant CRITICAL_OPERATION_THRESHOLD = 2;
    mapping(bytes32 => address[]) public criticalOperationApprovers;
    
    /// @notice Storage gap for upgrades
    uint256[27] private __gap;  // Reduced by 2: virtualPayers mapping and currentAdmin

    /// @notice Events - Enhanced for multi-recipient support
    event RequestCreated(
        uint256 indexed requestId,
        address indexed requester,
        address[] recipients,
        uint256[] amounts,
        uint256 totalAmount,
        string description,
        address virtualPayer
    );
    
    event RequestApproved(
        uint256 indexed requestId,
        Status indexed newStatus,
        address indexed approver
    );
    
    event RequestCancelled(uint256 indexed requestId, address indexed canceller);
    event FundsDistributed(uint256 indexed requestId, address[] recipients, uint256[] amounts, uint256 totalAmount, address virtualPayer);
    event SingleDistribution(uint256 indexed requestId, address indexed recipient, uint256 amount);
    event TotalDistributedUpdated(uint256 oldTotal, uint256 newTotal);
    event BudgetUpdated(uint256 oldBudget, uint256 newBudget);
    event ApprovalCommitted(uint256 indexed requestId, address indexed approver, uint256 timestamp, uint256 chainId);
    event ApprovalRevealed(uint256 indexed requestId, address indexed approver, Status newStatus);
    // RoleGranted and RoleRevoked events are already defined in AccessControl
    event AdminTransferInitiated(address indexed currentAdmin, address indexed pendingAdmin, uint256 timestamp);
    event AdminTransferCompleted(address indexed previousAdmin, address indexed newAdmin);
    event TimelockOperationQueued(bytes32 indexed operationId, address indexed target, uint256 executeTime);
    event TimelockOperationExecuted(bytes32 indexed operationId, address indexed target);
    event TimelockOperationCancelled(bytes32 indexed operationId);
    event EmergencyPause(address indexed caller, uint256 timestamp);
    event EmergencyUnpause(address indexed caller, uint256 timestamp);
    event TimelockControllerUpdated(address indexed previousController, address indexed newController);
    event RoleCommitted(bytes32 indexed role, address indexed account, address indexed committer, uint256 timestamp);
    event RoleGrantedWithReveal(bytes32 indexed role, address indexed account, address indexed granter);
    event CriticalOperationApproved(bytes32 indexed operationId, address indexed approver, uint256 approverCount);
    event ClosureCommitted(uint256 indexed closureId, address indexed approver, uint256 timestamp);
    event ClosureApprovalRevealed(uint256 indexed closureId, address indexed approver);

    /// @notice Custom errors
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
    error ArrayLengthExceeded();
    error TimelockNotExpired();
    error OperationNotQueued();
    error PendingAdminOnly();
    error TransferNotInitiated();
    error EmergencyStopActive();
    error AmountTooLow();
    error AmountTooHigh();
    error InvalidDescription();
    error InvalidDocumentHash();
    error ZeroAddress();
    error ActiveClosureExists();
    error NoActiveClosureRequest();
    error InvalidClosureStatus();
    error InsufficientCommitteeApprovers();
    error DuplicateCommitteeApprover();
    error InvalidReturnAddress();
    error ClosureExecutionDeadlineExpired();
    error InsufficientBalance();
    error ContractNotPaused();
    error RoleCommitmentExists();
    error InvalidRoleCommitment();
    error ArrayLengthMismatch();
    error TooManyRecipients();
    error EmptyRecipientList();
    error InvalidTotalAmount();
    error RequestNotAbandoned();
    error InvalidVirtualPayer();

    /// @notice Modifier to check if caller is factory
    modifier onlyFactory() {
        if (msg.sender != projectFactory) revert UnauthorizedApprover();
        _;
    }
    
    /// @notice Modifier to check emergency stop
    modifier notEmergencyStopped() {
        if (emergencyStop) revert EmergencyStopActive();
        _;
    }
    
    /// @notice Modifier for timelock-protected functions
    modifier onlyTimelockOrAdmin() {
        if (msg.sender != timelockController && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        _;
    }

    /**
     * @notice Initialize the project reimbursement contract
     * @param _projectId The project identifier
     * @param _omthbToken The OMTHB token address
     * @param _projectBudget The total project budget
     * @param _admin The admin address
     */
    function initialize(
        string memory _projectId,
        address _omthbToken,
        uint256 _projectBudget,
        address _admin
    ) external initializer {
        // Enhanced input validation
        ValidationLib.validateNotZero(_omthbToken);
        ValidationLib.validateNotZero(_admin);
        // Budget always starts at 0 during initialization - no validation needed
        if (bytes(_projectId).length == 0) revert InvalidDescription();
        
        // Verify token contract
        if (_omthbToken.code.length == 0) revert InvalidAddress();
        
        // Additional token validation
        try IOMTHB(_omthbToken).totalSupply() returns (uint256) {
            // Token is valid ERC20
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
        emergencyStop = false;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        currentAdmin = _admin;
    }

    /**
     * @notice Create a new reimbursement request with multiple recipients
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts for each recipient
     * @param description The description of the expense
     * @param documentHash The document reference (IPFS hash)
     * @param virtualPayer Optional virtual payer address (use address(0) if not needed)
     * @return requestId The ID of the created request
     */
    function createRequestMultiple(
        address[] calldata recipients,
        uint256[] calldata amounts,
        string calldata description,
        string calldata documentHash,
        address virtualPayer
    ) external onlyRole(REQUESTER_ROLE) whenNotPaused notEmergencyStopped returns (uint256) {
        // Validate inputs using library
        ValidationLib.validateMultiRequestInputs(recipients, amounts, description, documentHash);
        
        // Calculate total amount using library
        uint256 totalAmount = ValidationLib.calculateTotalAmount(amounts);
        
        // Validate budget using library
        ValidationLib.validateBudget(totalAmount, totalDistributed, projectBudget);
        
        uint256 requestId = _requestIdCounter++;
        
        // Create request
        _createMultiReimbursementRequest(requestId, recipients, amounts, totalAmount, description, documentHash);
        
        // Validate virtual payer address
        if (virtualPayer != address(0)) {
            ValidationLib.validateVirtualPayer(virtualPayer, address(this), address(omthbToken), projectFactory);
            
            virtualPayers[requestId] = virtualPayer;
            requests[requestId].virtualPayer = virtualPayer;
        }
        
        // Track request using library
        activeRequestIds.trackActiveRequest(activeRequestsPerUser, requestIndexInUserArray, requestId, msg.sender);
        
        // Check if cleanup needed
        if (activeRequestsPerUser[msg.sender].length > MAX_ARRAY_LENGTH) {
            _cleanupUserRequests(msg.sender);
        }
        
        emit RequestCreated(requestId, msg.sender, recipients, amounts, totalAmount, description, virtualPayer);
        
        return requestId;
    }

    /**
     * @notice Create a single recipient request (backward compatibility)
     * @param recipient The recipient of the reimbursement
     * @param amount The amount to reimburse
     * @param description The description of the expense
     * @param documentHash The document reference (IPFS hash)
     * @return requestId The ID of the created request
     */
    function createRequest(
        address recipient,
        uint256 amount,
        string calldata description,
        string calldata documentHash
    ) external onlyRole(REQUESTER_ROLE) whenNotPaused notEmergencyStopped returns (uint256) {
        // Convert to array format for internal processing
        address[] memory recipients = new address[](1);
        recipients[0] = recipient;
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        
        // Validate inputs using library
        ValidationLib.validateMultiRequestInputs(recipients, amounts, description, documentHash);
        
        // Validate budget using library
        ValidationLib.validateBudget(amount, totalDistributed, projectBudget);
        
        uint256 requestId = _requestIdCounter++;
        
        // Create request
        _createMultiReimbursementRequest(requestId, recipients, amounts, amount, description, documentHash);
        
        // Track request using library
        activeRequestIds.trackActiveRequest(activeRequestsPerUser, requestIndexInUserArray, requestId, msg.sender);
        
        // Check if cleanup needed
        if (activeRequestsPerUser[msg.sender].length > MAX_ARRAY_LENGTH) {
            _cleanupUserRequests(msg.sender);
        }
        
        emit RequestCreated(requestId, msg.sender, recipients, amounts, amount, description, address(0));
        
        return requestId;
    }
    
    function _createMultiReimbursementRequest(
        uint256 requestId,
        address[] memory recipients,
        uint256[] memory amounts,
        uint256 totalAmount,
        string calldata description,
        string calldata documentHash
    ) private {
        // First create the request with basic fields
        ReimbursementRequest storage request = requests[requestId];
        request.id = requestId;
        request.requester = msg.sender;
        request.recipients = recipients;
        request.amounts = amounts;
        request.totalAmount = totalAmount;
        request.description = description;
        request.documentHash = documentHash;
        request.status = Status.Pending;
        request.createdAt = block.timestamp;
        request.updatedAt = block.timestamp;
        request.paymentDeadline = 0;
        
        // Then set approval info fields
        request.approvalInfo.secretaryApprover = address(0);
        request.approvalInfo.committeeApprover = address(0);
        request.approvalInfo.financeApprover = address(0);
        request.approvalInfo.directorApprover = address(0);
        // committeeAdditionalApprovers is already initialized as empty array
        request.virtualPayer = address(0); // Initialize virtual payer
    }

    /**
     * @notice Commit an approval for a request (Step 1 of commit-reveal)
     * @param requestId The request ID to commit approval for
     * @param commitment Hash of approver address, requestId, and nonce
     * @dev Prevents front-running by requiring commitment before approval
     */
    function commitApproval(uint256 requestId, bytes32 commitment) external whenNotPaused notEmergencyStopped nonReentrant {
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        if (request.status == Status.Distributed) revert InvalidStatus();
        
        // Verify approver has appropriate role for current status
        if (request.status == Status.Pending && !hasRole(SECRETARY_ROLE, msg.sender)) revert UnauthorizedApprover();
        if (request.status == Status.SecretaryApproved && !hasRole(COMMITTEE_ROLE, msg.sender)) revert UnauthorizedApprover();
        if (request.status == Status.CommitteeApproved && !hasRole(FINANCE_ROLE, msg.sender)) revert UnauthorizedApprover();
        if (request.status == Status.FinanceApproved) {
            if (request.approvalInfo.committeeAdditionalApprovers.length < REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS) {
                if (!hasRole(COMMITTEE_ROLE, msg.sender)) revert UnauthorizedApprover();
            } else {
                if (!hasRole(DIRECTOR_ROLE, msg.sender)) revert UnauthorizedApprover();
            }
        }
        
        approvalCommitments[requestId][msg.sender] = commitment;
        commitTimestamps[requestId][msg.sender] = block.timestamp;
        
        emit ApprovalCommitted(requestId, msg.sender, block.timestamp, block.chainid);
    }

    /**
     * @notice Secretary approval with reveal (Level 1)
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Part of commit-reveal pattern to prevent front-running
     */
    function approveBySecretary(uint256 requestId, uint256 nonce) 
        external 
        onlyRole(SECRETARY_ROLE) 
        whenNotPaused 
        notEmergencyStopped
        nonReentrant
    {
        _verifyAndRevealApproval(requestId, nonce);
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.status != Status.Pending) revert InvalidStatus();
        if (request.approvalInfo.secretaryApprover != address(0)) revert AlreadyApproved();
        
        request.approvalInfo.secretaryApprover = msg.sender;
        request.status = Status.SecretaryApproved;
        request.updatedAt = block.timestamp;
        
        emit RequestApproved(requestId, Status.SecretaryApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.SecretaryApproved);
    }

    /**
     * @notice Committee approval with reveal (Level 2)
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Part of commit-reveal pattern to prevent front-running
     */
    function approveByCommittee(uint256 requestId, uint256 nonce) 
        external 
        onlyRole(COMMITTEE_ROLE) 
        whenNotPaused 
        notEmergencyStopped
        nonReentrant
    {
        _verifyAndRevealApproval(requestId, nonce);
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.status != Status.SecretaryApproved) revert InvalidStatus();
        if (request.approvalInfo.committeeApprover != address(0)) revert AlreadyApproved();
        
        request.approvalInfo.committeeApprover = msg.sender;
        request.status = Status.CommitteeApproved;
        request.updatedAt = block.timestamp;
        
        emit RequestApproved(requestId, Status.CommitteeApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.CommitteeApproved);
    }

    /**
     * @notice Finance approval with reveal (Level 3)
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Part of commit-reveal pattern to prevent front-running
     */
    function approveByFinance(uint256 requestId, uint256 nonce) 
        external 
        onlyRole(FINANCE_ROLE) 
        whenNotPaused 
        notEmergencyStopped
        nonReentrant
    {
        _verifyAndRevealApproval(requestId, nonce);
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.status != Status.CommitteeApproved) revert InvalidStatus();
        if (request.approvalInfo.financeApprover != address(0)) revert AlreadyApproved();
        
        request.approvalInfo.financeApprover = msg.sender;
        request.status = Status.FinanceApproved;
        request.updatedAt = block.timestamp;
        
        emit RequestApproved(requestId, Status.FinanceApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.FinanceApproved);
    }

    /**
     * @notice Additional Committee approval with reveal (Level 4)
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Part of commit-reveal pattern to prevent front-running
     */
    function approveByCommitteeAdditional(uint256 requestId, uint256 nonce) 
        external 
        onlyRole(COMMITTEE_ROLE) 
        whenNotPaused 
        notEmergencyStopped
        nonReentrant
    {
        _verifyAndRevealApproval(requestId, nonce);
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.status != Status.FinanceApproved) revert InvalidStatus();
        if (request.approvalInfo.committeeAdditionalApprovers.length >= REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS) revert AlreadyApproved();
        
        // Check if this committee member has already approved in additional level
        for (uint256 i = 0; i < request.approvalInfo.committeeAdditionalApprovers.length; i++) {
            if (request.approvalInfo.committeeAdditionalApprovers[i] == msg.sender) revert AlreadyApproved();
        }
        
        // Add to additional approvers array
        request.approvalInfo.committeeAdditionalApprovers.push(msg.sender);
        request.updatedAt = block.timestamp;
        
        emit RequestApproved(requestId, Status.FinanceApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.FinanceApproved);
    }

    /**
     * @notice Director approval with reveal and auto-distribution (Level 5)
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Part of commit-reveal pattern to prevent front-running
     */
    function approveByDirector(uint256 requestId, uint256 nonce) 
        external 
        onlyRole(DIRECTOR_ROLE) 
        whenNotPaused 
        notEmergencyStopped
        nonReentrant
    {
        _verifyAndRevealApproval(requestId, nonce);
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.status != Status.FinanceApproved) revert InvalidStatus();
        if (request.approvalInfo.committeeAdditionalApprovers.length < REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS) revert InvalidStatus();
        if (request.approvalInfo.directorApprover != address(0)) revert AlreadyApproved();
        
        request.approvalInfo.directorApprover = msg.sender;
        request.status = Status.DirectorApproved;
        request.updatedAt = block.timestamp;
        request.paymentDeadline = block.timestamp + PAYMENT_DEADLINE_DURATION;
        
        emit RequestApproved(requestId, Status.DirectorApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.DirectorApproved);
        
        // Auto-distribute funds to all recipients
        _distributeMultipleFunds(requestId);
    }

    /**
     * @notice Internal function to verify and reveal approval
     * @param requestId The request ID
     * @param nonce The nonce used in commitment
     */
    function _verifyAndRevealApproval(uint256 requestId, uint256 nonce) private {
        // Verify commitment exists and reveal window has passed
        bytes32 commitment = approvalCommitments[requestId][msg.sender];
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (block.timestamp < commitTimestamps[requestId][msg.sender] + REVEAL_WINDOW) {
            revert RevealTooEarly();
        }
        
        // Verify the reveal matches the commitment with chain ID
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, requestId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
    }

    /**
     * @notice Cancel a reimbursement request
     * @param requestId The request ID to cancel
     */
    function cancelRequest(uint256 requestId) external whenNotPaused notEmergencyStopped nonReentrant {
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId) revert RequestNotFound();
        
        // Only requester or admin can cancel
        if (msg.sender != request.requester && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        
        // Cannot cancel if already distributed
        if (request.status == Status.Distributed) revert InvalidStatus();
        
        request.status = Status.Cancelled;
        request.updatedAt = block.timestamp;
        
        // Remove from active arrays
        _removeFromActiveRequests(requestId);
        
        emit RequestCancelled(requestId, msg.sender);
    }

    /**
     * @notice Update project budget (requires timelock)
     * @param newBudget The new budget amount
     */
    function updateBudget(uint256 newBudget) external onlyTimelockOrAdmin nonReentrant {
        if (newBudget < totalDistributed) revert InvalidAmount();
        if (newBudget == 0) revert InvalidAmount();
        if (newBudget > type(uint256).max / 2) revert InvalidAmount(); // Prevent manipulation
        
        uint256 oldBudget = projectBudget;
        projectBudget = newBudget;
        
        emit BudgetUpdated(oldBudget, newBudget);
    }

    /**
     * @notice Pause the contract (requires multi-sig)
     */
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
            
            // Clean up
            delete criticalOperationApprovers[operationId];
        }
    }

    /**
     * @notice Unpause the contract (requires timelock)
     */
    function unpause() external onlyTimelockOrAdmin {
        _unpause();
        emit EmergencyUnpause(msg.sender, block.timestamp);
    }
    
    /**
     * @notice Activate emergency stop (requires multi-sig)
     */
    function activateEmergencyStop() external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 operationId = keccak256(abi.encodePacked("emergencyStop", block.timestamp));
        
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
            emergencyStop = true;
            _pause();
            emit EmergencyPause(msg.sender, block.timestamp);
            
            // Clean up
            delete criticalOperationApprovers[operationId];
        }
    }
    
    /**
     * @notice Deactivate emergency stop (requires timelock)
     */
    function deactivateEmergencyStop() external onlyTimelockOrAdmin {
        emergencyStop = false;
        _unpause();
        emit EmergencyUnpause(msg.sender, block.timestamp);
    }
    
    /**
     * @notice Set timelock controller address
     * @param _timelockController The timelock controller address
     */
    function setTimelockController(address _timelockController) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        ValidationLib.validateNotZero(_timelockController);
        // Validate that the address is a contract, not an EOA
        if (_timelockController.code.length == 0) revert InvalidAddress();
        
        // Additional validation - basic sanity check for contract size
        if (_timelockController.code.length < 100) revert InvalidAddress();
        
        address previousController = timelockController;
        timelockController = _timelockController;
        
        emit TimelockControllerUpdated(previousController, _timelockController);
    }

    /**
     * @notice Get active requests
     * @return Array of active request IDs
     */
    function getActiveRequests() external view returns (uint256[] memory) {
        return activeRequestIds;
    }

    /**
     * @notice Get request details
     * @param requestId The request ID
     * @return The reimbursement request details
     */
    function getRequest(uint256 requestId) external view returns (ReimbursementRequest memory) {
        return requests[requestId];
    }
    
    /**
     * @notice Get request recipients
     * @param requestId The request ID
     * @return Array of recipient addresses
     */
    function getRequestRecipients(uint256 requestId) external view returns (address[] memory) {
        return requests[requestId].recipients;
    }
    
    /**
     * @notice Get request amounts
     * @param requestId The request ID
     * @return Array of amounts for each recipient
     */
    function getRequestAmounts(uint256 requestId) external view returns (uint256[] memory) {
        return requests[requestId].amounts;
    }
    
    /**
     * @notice Get active requests for a specific user
     * @param user The user address
     * @return Array of active request IDs for the user
     */
    function getUserActiveRequests(address user) external view returns (uint256[] memory) {
        return activeRequestsPerUser[user];
    }
    
    /**
     * @notice Get committee additional approvers for a request
     * @param requestId The request ID
     * @return Array of committee additional approver addresses
     */
    function getCommitteeAdditionalApprovers(uint256 requestId) external view returns (address[] memory) {
        return requests[requestId].approvalInfo.committeeAdditionalApprovers;
    }
    
    /**
     * @notice Check if request has enough committee additional approvers
     * @param requestId The request ID
     * @return True if request has enough approvers for director approval
     */
    function hasEnoughCommitteeApprovers(uint256 requestId) external view returns (bool) {
        return requests[requestId].approvalInfo.committeeAdditionalApprovers.length >= REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS;
    }
    
    /**
     * @notice Get total approval count for a request
     * @param requestId The request ID
     * @return count Total number of approvals
     */
    function getApprovalCount(uint256 requestId) external view returns (uint256 count) {
        // Convert to ViewLib.ReimbursementRequest for library usage
        ReimbursementRequest storage request = requests[requestId];
        
        if (request.approvalInfo.secretaryApprover != address(0)) count++;
        if (request.approvalInfo.committeeApprover != address(0)) count++;
        if (request.approvalInfo.financeApprover != address(0)) count++;
        count += request.approvalInfo.committeeAdditionalApprovers.length;
        if (request.approvalInfo.directorApprover != address(0)) count++;
        
        return count;
    }
    
    /**
     * @notice Get virtual payer for a request
     * @param requestId The request ID
     * @return Virtual payer address (address(0) if not set)
     */
    function getVirtualPayer(uint256 requestId) external view returns (address) {
        return requests[requestId].virtualPayer;
    }

    /**
     * @notice Internal function to distribute funds to multiple recipients
     * @param requestId The request ID
     * @dev Follows Checks-Effects-Interactions pattern to prevent reentrancy
     */
    function _distributeMultipleFunds(uint256 requestId) private {
        ReimbursementRequest storage request = requests[requestId];
        
        // Slippage protection: check payment deadline
        if (request.paymentDeadline != 0 && block.timestamp > request.paymentDeadline) revert PaymentDeadlineExpired();
        
        // CRITICAL FIX: Cache values to prevent reentrancy
        uint256 totalAmount = request.totalAmount;
        address[] memory recipients = request.recipients;
        uint256[] memory amounts = request.amounts;
        
        // CRITICAL FIX: Update state BEFORE external calls (CEI pattern)
        request.status = Status.Distributed;
        request.updatedAt = block.timestamp;
        uint256 oldTotal = totalDistributed;
        totalDistributed += totalAmount;
        emit TotalDistributedUpdated(oldTotal, totalDistributed);
        
        // Emit event before external calls
        emit FundsDistributed(requestId, recipients, amounts, totalAmount, request.virtualPayer);
        
        // CRITICAL FIX: External calls LAST with additional safety
        // Check token balance before transfers
        uint256 contractBalance = omthbToken.balanceOf(address(this));
        if (contractBalance < totalAmount) revert InsufficientBalance();
        
        // Distribute to each recipient
        for (uint256 i = 0; i < recipients.length; i++) {
            bool success = omthbToken.transfer(recipients[i], amounts[i]);
            if (!success) revert TransferFailed();
            
            emit SingleDistribution(requestId, recipients[i], amounts[i]);
        }
        
        // Verify total transfer was successful
        uint256 newBalance = omthbToken.balanceOf(address(this));
        if (contractBalance - newBalance != totalAmount) revert TransferFailed();
        
        // Remove from active arrays after successful distribution
        _removeFromActiveRequests(requestId);
    }
    
    /**
     * @notice Internal function to cleanup user's completed/cancelled requests
     * @param user The user address to cleanup requests for
     */
    function _cleanupUserRequests(address user) private {
        uint256[] storage userRequests = activeRequestsPerUser[user];
        uint256 removed = 0;
        uint256 length = userRequests.length;
        
        // Return early if array is empty
        if (length == 0) return;
        
        // Iterate backwards to avoid index shifting issues
        // Start from length - 1 and go down to 0
        uint256 i = length;
        while (i > 0) {
            i--; // Decrement first to get valid index
            uint256 requestId = userRequests[i];
            ReimbursementRequest storage request = requests[requestId];
            
            // Remove if distributed or cancelled
            if (request.status == Status.Distributed || request.status == Status.Cancelled) {
                // Swap with last element and pop
                uint256 lastIndex = userRequests.length - 1;
                if (i != lastIndex) {
                    userRequests[i] = userRequests[lastIndex];
                    requestIndexInUserArray[userRequests[i]] = i;
                }
                userRequests.pop();
                removed++;
                
                // Limit removals per transaction to prevent gas issues
                if (removed >= 10) break;
            }
        }
        
        if (removed > 0) {
            emit ArrayLib.ArrayCleanupPerformed(user, removed);
        }
    }
    
    /**
     * @notice Remove request from active arrays
     * @param requestId The request ID to remove
     */
    function _removeFromActiveRequests(uint256 requestId) private {
        ReimbursementRequest storage request = requests[requestId];
        
        // Remove from user's active requests
        uint256[] storage userRequests = activeRequestsPerUser[request.requester];
        uint256 index = requestIndexInUserArray[requestId];
        
        if (index < userRequests.length && userRequests[index] == requestId) {
            ArrayLib.removeFromArray(userRequests, index, requestIndexInUserArray);
            delete requestIndexInUserArray[requestId];
        }
        
        // Remove from global active requests
        activeRequestIds.removeFromActiveRequests(requestId);
    }
    
    /**
     * @notice Initiate admin transfer (Step 1 of two-step transfer)
     * @param newAdmin The address of the new admin
     */
    function initiateAdminTransfer(address newAdmin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ValidationLib.validateNotZero(newAdmin);
        
        pendingAdmin = newAdmin;
        pendingAdminTimestamp = block.timestamp;
        
        emit AdminTransferInitiated(msg.sender, newAdmin, block.timestamp);
    }
    
    /**
     * @notice Complete admin transfer (Step 2 of two-step transfer)
     * @dev Can only be called by pending admin after timelock
     */
    function acceptAdminTransfer() external {
        if (msg.sender != pendingAdmin) revert PendingAdminOnly();
        if (pendingAdminTimestamp == 0) revert TransferNotInitiated();
        if (block.timestamp < pendingAdminTimestamp + TIMELOCK_DURATION) revert TimelockNotExpired();
        
        // Store previous admin before granting new role
        address previousAdmin = currentAdmin;
        
        // Grant admin role to new admin
        _grantRole(DEFAULT_ADMIN_ROLE, pendingAdmin);
        
        // Update current admin
        currentAdmin = pendingAdmin;
        
        // Note: The previous admin should manually revoke their role
        // This is safer than automatic revocation
        
        emit AdminTransferCompleted(previousAdmin, pendingAdmin);
        
        // Reset pending admin
        pendingAdmin = address(0);
        pendingAdminTimestamp = 0;
    }
    
    /**
     * @notice Queue a timelock operation
     * @param target The target address for the operation
     * @param data The encoded function call
     * @return operationId The unique operation identifier
     */
    function queueTimelockOperation(address target, bytes calldata data) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
        returns (bytes32) 
    {
        // Input validation
        ValidationLib.validateNotZero(target);
        if (data.length == 0) revert InvalidDescription();
        if (data.length > 10000) revert InvalidDescription(); // Prevent gas griefing
        
        bytes32 operationId = keccak256(abi.encode(target, data, block.timestamp));
        uint256 executeTime = block.timestamp + TIMELOCK_DURATION;
        
        timelockQueue[operationId] = executeTime;
        
        emit TimelockOperationQueued(operationId, target, executeTime);
        
        return operationId;
    }
    
    /**
     * @notice Execute a queued timelock operation
     * @param operationId The operation identifier
     * @param target The target address
     * @param data The encoded function call
     */
    function executeTimelockOperation(
        bytes32 operationId,
        address target,
        bytes calldata data
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 executeTime = timelockQueue[operationId];
        if (executeTime == 0) revert OperationNotQueued();
        if (block.timestamp < executeTime) revert TimelockNotExpired();
        
        // Verify operation matches
        bytes32 expectedId = keccak256(abi.encode(target, data, executeTime - TIMELOCK_DURATION));
        if (expectedId != operationId) revert InvalidCommitment();
        
        // Execute operation
        delete timelockQueue[operationId];
        
        (bool success, ) = target.call(data);
        if (!success) revert TransferFailed();
        
        emit TimelockOperationExecuted(operationId, target);
    }
    
    /**
     * @notice Cancel a queued timelock operation
     * @param operationId The operation identifier
     */
    function cancelTimelockOperation(bytes32 operationId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (timelockQueue[operationId] == 0) revert OperationNotQueued();
        
        delete timelockQueue[operationId];
        
        emit TimelockOperationCancelled(operationId);
    }
    
    /**
     * @notice Commit to grant a role (Step 1 of commit-reveal)
     * @param role The role to grant
     * @param commitment Hash of role, account, granter, and nonce
     */
    function commitRoleGrant(bytes32 role, bytes32 commitment) external onlyRole(getRoleAdmin(role)) {
        if (roleCommitments[role][msg.sender] != bytes32(0)) revert RoleCommitmentExists();
        
        roleCommitments[role][msg.sender] = commitment;
        roleCommitTimestamps[role][msg.sender] = block.timestamp;
        
        emit RoleCommitted(role, address(0), msg.sender, block.timestamp);
    }
    
    /**
     * @notice Grant role with reveal (Step 2 of commit-reveal)
     * @param role The role to grant
     * @param account The account to grant the role to
     * @param nonce The nonce used in commitment
     */
    function grantRoleWithReveal(bytes32 role, address account, uint256 nonce) external onlyRole(getRoleAdmin(role)) {
        ValidationLib.validateNotZero(account);
        
        // Verify commitment
        bytes32 commitment = roleCommitments[role][msg.sender];
        if (commitment == bytes32(0)) revert InvalidRoleCommitment();
        if (block.timestamp < roleCommitTimestamps[role][msg.sender] + REVEAL_WINDOW) {
            revert RevealTooEarly();
        }
        
        // Verify reveal matches commitment
        bytes32 revealHash = keccak256(abi.encodePacked(role, account, msg.sender, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidRoleCommitment();
        
        // Clear commitment
        delete roleCommitments[role][msg.sender];
        delete roleCommitTimestamps[role][msg.sender];
        
        // Grant role
        _grantRole(role, account);
        
        emit RoleGrantedWithReveal(role, account, msg.sender);
    }
    
    /**
     * @notice Direct role grant for initial setup only
     * @dev Only callable by factory during initialization
     * @param role The role to grant
     * @param account The account to grant the role to
     */
    function grantRoleDirect(bytes32 role, address account) external {
        // CRITICAL FIX: Allow factory to set initial roles ONLY
        if (msg.sender != projectFactory) {
            revert UnauthorizedApprover();
        }
        ValidationLib.validateNotZero(account);
        
        _grantRole(role, account);
    }
    
    /**
     * @notice Override grantRole to use commit-reveal pattern
     * @dev This function is deprecated in favor of grantRoleWithReveal
     */
    function grantRole(bytes32 role, address account) public pure override {
        revert("Use grantRoleWithReveal or grantRoleDirect for initial setup");
    }
    
    /**
     * @notice Override revokeRole to use commit-reveal pattern
     * @dev This function is deprecated in favor of revokeRoleWithReveal
     */
    function revokeRole(bytes32 role, address account) public pure override {
        revert("Use revokeRoleWithReveal instead");
    }
    
    /**
     * @notice Revoke role with commit-reveal pattern
     * @param role The role to revoke
     * @param account The account to revoke the role from
     * @param nonce The nonce used in commitment
     */
    function revokeRoleWithReveal(bytes32 role, address account, uint256 nonce) external onlyRole(getRoleAdmin(role)) {
        ValidationLib.validateNotZero(account);
        
        // Verify commitment
        bytes32 commitment = roleCommitments[role][msg.sender];
        if (commitment == bytes32(0)) revert InvalidRoleCommitment();
        if (block.timestamp < roleCommitTimestamps[role][msg.sender] + REVEAL_WINDOW) {
            revert RevealTooEarly();
        }
        
        // Verify reveal matches commitment
        bytes32 revealHash = keccak256(abi.encodePacked(role, account, msg.sender, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidRoleCommitment();
        
        // Clear commitment
        delete roleCommitments[role][msg.sender];
        delete roleCommitTimestamps[role][msg.sender];
        
        // Revoke role
        _revokeRole(role, account);
        
        emit RoleRevoked(role, account, msg.sender);
    }

    // ============================================
    // EMERGENCY CLOSURE FUNCTIONS
    // ============================================

    /**
     * @notice Initiate an emergency closure request
     * @param returnAddress The address where remaining tokens should be sent
     * @param reason The reason for emergency closure
     * @return closureId The ID of the created closure request
     */
    function initiateEmergencyClosure(
        address returnAddress,
        string calldata reason
    ) external whenNotPaused notEmergencyStopped returns (uint256) {
        // Only committee members or director can initiate
        if (!hasRole(COMMITTEE_ROLE, msg.sender) && !hasRole(DIRECTOR_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        
        // Validate inputs using library
        EmergencyClosureLib.validateClosureInputs(returnAddress, reason);
        
        // Check if there's already an active closure request using library
        if (EmergencyClosureLib.hasActiveClosureRequest(activeClosureRequestId, closureRequests)) {
            revert ActiveClosureExists();
        }
        
        uint256 closureId = _closureIdCounter++;
        
        // Create closure request step by step to avoid stack too deep
        EmergencyClosureLib.EmergencyClosureRequest storage closureRequest = closureRequests[closureId];
        closureRequest.id = closureId;
        closureRequest.initiator = msg.sender;
        closureRequest.returnAddress = returnAddress;
        closureRequest.reason = reason;
        closureRequest.status = EmergencyClosureLib.ClosureStatus.Initiated;
        closureRequest.createdAt = block.timestamp;
        closureRequest.updatedAt = block.timestamp;
        closureRequest.executionDeadline = 0; // Set when fully approved
        closureRequest.remainingBalance = 0; // Set when executed
        
        // Initialize approval info
        closureRequest.closureApprovalInfo.directorApprover = address(0);
        // committeeApprovers is already initialized as empty array
        
        activeClosureRequestId = closureId;
        
        emit EmergencyClosureLib.EmergencyClosureInitiated(closureId, msg.sender, returnAddress, reason);
        
        return closureId;
    }

    /**
     * @notice Commit an approval for emergency closure (Step 1 of commit-reveal)
     * @param closureId The closure request ID
     * @param commitment Hash of approver address, closureId, and nonce
     */
    function commitClosureApproval(uint256 closureId, bytes32 commitment) 
        external 
        whenNotPaused 
        notEmergencyStopped 
        nonReentrant 
    {
        EmergencyClosureLib.EmergencyClosureRequest storage request = closureRequests[closureId];
        if (request.id != closureId || request.status == EmergencyClosureLib.ClosureStatus.None) {
            revert NoActiveClosureRequest();
        }
        if (request.status == EmergencyClosureLib.ClosureStatus.Executed || request.status == EmergencyClosureLib.ClosureStatus.Cancelled) {
            revert InvalidClosureStatus();
        }
        
        // Verify approver has appropriate role
        bool isCommittee = hasRole(COMMITTEE_ROLE, msg.sender);
        bool isDirector = hasRole(DIRECTOR_ROLE, msg.sender);
        
        if (!isCommittee && !isDirector) revert UnauthorizedApprover();
        
        // If director, check that we have enough committee approvers
        if (isDirector && request.closureApprovalInfo.committeeApprovers.length < REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
            revert InsufficientCommitteeApprovers();
        }
        
        closureCommitments[closureId][msg.sender] = commitment;
        closureCommitTimestamps[closureId][msg.sender] = block.timestamp;
        
        emit ClosureCommitted(closureId, msg.sender, block.timestamp);
    }

    /**
     * @notice Approve emergency closure with reveal
     * @param closureId The closure request ID
     * @param nonce The nonce used in the commitment
     */
    function approveEmergencyClosure(uint256 closureId, uint256 nonce) 
        external 
        whenNotPaused 
        notEmergencyStopped
        nonReentrant
    {
        // Verify commitment exists and reveal window has passed
        bytes32 commitment = closureCommitments[closureId][msg.sender];
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (block.timestamp < closureCommitTimestamps[closureId][msg.sender] + REVEAL_WINDOW) {
            revert RevealTooEarly();
        }
        
        // Verify the reveal matches the commitment
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, closureId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        EmergencyClosureLib.EmergencyClosureRequest storage request = closureRequests[closureId];
        if (request.id != closureId || request.status == EmergencyClosureLib.ClosureStatus.None) {
            revert NoActiveClosureRequest();
        }
        if (request.status == EmergencyClosureLib.ClosureStatus.Executed || request.status == EmergencyClosureLib.ClosureStatus.Cancelled) {
            revert InvalidClosureStatus();
        }
        
        bool isCommittee = hasRole(COMMITTEE_ROLE, msg.sender);
        bool isDirector = hasRole(DIRECTOR_ROLE, msg.sender);
        
        if (!isCommittee && !isDirector) revert UnauthorizedApprover();
        
        // Handle committee approval
        if (isCommittee && request.closureApprovalInfo.committeeApprovers.length < REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
            bool isFullyApproved = request.addCommitteeApprover(msg.sender);
            
            emit EmergencyClosureLib.EmergencyClosureApproved(closureId, msg.sender, request.closureApprovalInfo.committeeApprovers.length);
        }
        // Handle director approval
        else if (isDirector && request.closureApprovalInfo.committeeApprovers.length >= REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
            request.addDirectorApproval(msg.sender);
            
            emit EmergencyClosureLib.EmergencyClosureApproved(closureId, msg.sender, request.closureApprovalInfo.committeeApprovers.length);
            
            // Auto-execute the closure
            (uint256 balance, bool shouldClear) = request.executeEmergencyClosure(omthbToken);
            if (shouldClear) {
                activeClosureRequestId = 0;
            }
            
            // Pause the contract permanently
            if (!paused()) {
                _pause();
            }
        } else {
            revert InvalidClosureStatus();
        }
        
        // Clear the commitment after use
        delete closureCommitments[closureId][msg.sender];
        delete closureCommitTimestamps[closureId][msg.sender];
        
        emit ClosureApprovalRevealed(closureId, msg.sender);
    }

    /**
     * @notice Cancel an emergency closure request
     * @param closureId The closure request ID to cancel
     */
    function cancelEmergencyClosure(uint256 closureId) external whenNotPaused nonReentrant {
        EmergencyClosureLib.EmergencyClosureRequest storage request = closureRequests[closureId];
        if (request.id != closureId || request.status == EmergencyClosureLib.ClosureStatus.None) {
            revert NoActiveClosureRequest();
        }
        
        // Only initiator or admin can cancel
        if (msg.sender != request.initiator && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        
        // Cannot cancel if already executed
        if (request.status == EmergencyClosureLib.ClosureStatus.Executed) revert InvalidClosureStatus();
        
        request.status = EmergencyClosureLib.ClosureStatus.Cancelled;
        request.updatedAt = block.timestamp;
        
        // Clear active closure request if this was it
        if (activeClosureRequestId == closureId) {
            activeClosureRequestId = 0;
        }
        
        emit EmergencyClosureLib.EmergencyClosureCancelled(closureId, msg.sender);
    }

    /**
     * @notice Get emergency closure request details
     * @param closureId The closure request ID
     * @return The emergency closure request details
     */
    function getClosureRequest(uint256 closureId) external view returns (EmergencyClosureLib.EmergencyClosureRequest memory) {
        return closureRequests[closureId];
    }

    /**
     * @notice Get committee approvers for a closure request
     * @param closureId The closure request ID
     * @return Array of committee approver addresses
     */
    function getClosureCommitteeApprovers(uint256 closureId) external view returns (address[] memory) {
        return closureRequests[closureId].closureApprovalInfo.committeeApprovers;
    }

    /**
     * @notice Check if closure request has enough committee approvers
     * @param closureId The closure request ID
     * @return True if request has enough approvers for director approval
     */
    function hasEnoughClosureCommitteeApprovers(uint256 closureId) external view returns (bool) {
        return closureRequests[closureId].closureApprovalInfo.committeeApprovers.length >= REQUIRED_CLOSURE_COMMITTEE_APPROVERS;
    }
    
    /**
     * @notice Get closure approval count
     * @param closureId The closure request ID  
     * @return committeeCount Number of committee approvers
     * @return hasDirectorApproval Whether director has approved
     */
    function getClosureApprovalStatus(uint256 closureId) external view returns (uint256 committeeCount, bool hasDirectorApproval) {
        return closureRequests[closureId].getClosureApprovalStatus();
    }
    
    /**
     * @notice Check if the project is closed
     * @return True if an emergency closure has been executed
     */
    function isProjectClosed() external view returns (bool) {
        return EmergencyClosureLib.isProjectClosed(activeClosureRequestId, closureRequests, _closureIdCounter);
    }
    
    // ============================================
    // NEW VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get remaining budget (budget minus distributed)
     * @return The remaining budget available for distribution
     */
    function getRemainingBudget() external view returns (uint256) {
        return ViewLib.getRemainingBudget(projectBudget, totalDistributed);
    }
    
    /**
     * @notice Get current contract balance of OMTHB tokens
     * @return The current OMTHB token balance
     */
    function getContractBalance() external view returns (uint256) {
        return omthbToken.balanceOf(address(this));
    }
    
    /**
     * @notice Check if a request is abandoned (15+ days since last update without distribution)
     * @param requestId The request ID to check
     * @return True if the request is abandoned
     */
    function isRequestAbandoned(uint256 requestId) external view returns (bool) {
        ReimbursementRequest storage request = requests[requestId];
        
        // Request must exist
        if (request.id != requestId) return false;
        
        // Request must not be distributed or cancelled
        if (request.status == Status.Distributed || request.status == Status.Cancelled) return false;
        
        // Check if 15 days have passed since last update
        uint256 abandonmentPeriod = 15 days;
        return block.timestamp >= request.updatedAt + abandonmentPeriod;
    }
    
    /**
     * @notice Cancel an abandoned request (15+ days since last update)
     * @param requestId The request ID to cancel
     * @dev Can be called by anyone if request is abandoned
     */
    function cancelAbandonedRequest(uint256 requestId) external whenNotPaused nonReentrant {
        ReimbursementRequest storage request = requests[requestId];
        
        // Request must exist
        if (request.id != requestId) revert RequestNotFound();
        
        // Request must not be distributed or already cancelled
        if (request.status == Status.Distributed || request.status == Status.Cancelled) revert InvalidStatus();
        
        // Check if request is abandoned (15 days since last update)
        uint256 abandonmentPeriod = 15 days;
        if (block.timestamp < request.updatedAt + abandonmentPeriod) revert RequestNotAbandoned();
        
        // Mark as cancelled
        request.status = Status.Cancelled;
        request.updatedAt = block.timestamp;
        
        // Remove from active arrays
        _removeFromActiveRequests(requestId);
        
        emit RequestCancelled(requestId, msg.sender);
    }
}
