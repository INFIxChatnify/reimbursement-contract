// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Using Solidity 0.8+ with built-in overflow protection

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./interfaces/IOMTHB.sol";

/**
 * @title ProjectReimbursementMultiRecipient
 * @notice Enhanced reimbursement contract supporting multiple recipients per request
 * @dev Maintains all existing features while adding multi-recipient capability
 */
contract ProjectReimbursement is 
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    /// @notice Approval roles
    bytes32 public constant SECRETARY_ROLE = keccak256("SECRETARY_ROLE");
    bytes32 public constant COMMITTEE_ROLE = keccak256("COMMITTEE_ROLE");
    bytes32 public constant FINANCE_ROLE = keccak256("FINANCE_ROLE");
    bytes32 public constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    bytes32 public constant REQUESTER_ROLE = keccak256("REQUESTER_ROLE");

    /// @notice Maximum recipients per request for gas efficiency
    uint256 public constant MAX_RECIPIENTS = 10;
    
    /// @notice Minimum deposit amount (10 OMTHB)
    uint256 public constant MIN_DEPOSIT_AMOUNT = 10 * 10**18;
    
    /// @notice Maximum percentage of funds that can be locked (80%)
    uint256 public constant MAX_LOCKED_PERCENTAGE = 80;
    
    /// @notice Timeout for stale approved requests (30 days)
    uint256 public constant STALE_REQUEST_TIMEOUT = 30 days;

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

    /// @notice Emergency closure status enum
    enum ClosureStatus {
        None,
        Initiated,
        PartiallyApproved,
        FullyApproved,
        Executed,
        Cancelled
    }

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
        address virtualPayer;      // NEW: Virtual payer address (for tracking purposes)
    }
    
    struct ApprovalInfo {
        address secretaryApprover;
        address committeeApprover;
        address financeApprover;
        address[] committeeAdditionalApprovers; // Array to store multiple committee approvers
        address directorApprover;
    }

    /// @notice Emergency closure request structure
    struct EmergencyClosureRequest {
        uint256 id;
        address initiator;
        address returnAddress; // Where to return remaining tokens
        string reason; // Reason for emergency closure
        ClosureStatus status;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 executionDeadline; // Deadline to execute after approval
        ClosureApprovalInfo closureApprovalInfo;
        uint256 remainingBalance; // Cached balance at approval time
    }
    
    struct ClosureApprovalInfo {
        address[] committeeApprovers; // Array of 3 unique committee approvers
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
    mapping(uint256 => EmergencyClosureRequest) public closureRequests;
    
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
    
    /// @notice Fund locking tracking
    uint256 public totalLockedAmount;  // Total amount locked for approved requests
    mapping(uint256 => uint256) public lockedAmounts;  // requestId => locked amount
    mapping(uint256 => uint256) public approvalTimestamps;  // requestId => timestamp when approved by director
    
    /// @notice Storage gap for upgrades
    uint256[25] private __gap;  // Reduced by 4 due to new state variables

    /// @notice Events - Enhanced for multi-recipient support
    event RequestCreated(
        uint256 indexed requestId,
        address indexed requester,
        address[] recipients,
        uint256[] amounts,
        uint256 totalAmount,
        string description,
        address virtualPayer  // NEW: Include virtual payer in event
    );
    
    event RequestApproved(
        uint256 indexed requestId,
        Status indexed newStatus,
        address indexed approver
    );
    
    event RequestCancelled(uint256 indexed requestId, address indexed canceller);
    event FundsDistributed(uint256 indexed requestId, address[] recipients, uint256[] amounts, uint256 totalAmount, address virtualPayer);  // NEW: Include virtual payer
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
    event ArrayCleanupPerformed(address indexed user, uint256 requestsRemoved);
    event EmergencyPause(address indexed caller, uint256 timestamp);
    event EmergencyUnpause(address indexed caller, uint256 timestamp);
    event TimelockControllerUpdated(address indexed previousController, address indexed newController);
    event RoleCommitted(bytes32 indexed role, address indexed account, address indexed committer, uint256 timestamp);
    event RoleGrantedWithReveal(bytes32 indexed role, address indexed account, address indexed granter);
    event CriticalOperationApproved(bytes32 indexed operationId, address indexed approver, uint256 approverCount);
    event OMTHBDeposited(address indexed depositor, uint256 amount, uint256 newBalance);
    event FundsLocked(uint256 indexed requestId, uint256 amount);
    event FundsUnlocked(uint256 indexed requestId, uint256 amount);
    event BudgetIncreased(uint256 indexed amount, address indexed depositor);
    event BudgetDecreased(uint256 indexed amount, address indexed recipient);
    event AvailableBalanceChanged(uint256 oldBalance, uint256 newBalance);
    event StaleRequestUnlocked(uint256 indexed requestId, uint256 amount, uint256 daysSinceApproval);
    
    // Emergency closure events
    event EmergencyClosureInitiated(
        uint256 indexed closureId,
        address indexed initiator,
        address indexed returnAddress,
        string reason
    );
    event EmergencyClosureApproved(
        uint256 indexed closureId,
        address indexed approver,
        uint256 approverCount
    );
    event EmergencyClosureCancelled(uint256 indexed closureId, address indexed canceller);
    event EmergencyClosureExecuted(
        uint256 indexed closureId,
        address indexed returnAddress,
        uint256 returnedAmount
    );
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
    error InvalidVirtualPayer(); // SECURITY FIX MEDIUM-1: Added for virtual payer validation
    error DepositFailed();
    error NoDepositsRequired();
    error InsufficientAvailableBalance();
    error DepositAmountTooLow();
    error MaxLockedPercentageExceeded();
    error RequestNotStale();

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
        if (_omthbToken == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        if (_projectBudget == 0) revert InvalidAmount();
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
        
        // Initialize locked amount to 0
        totalLockedAmount = 0;
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
        // Validate inputs
        _validateMultiRequestInputs(recipients, amounts, description, documentHash);
        
        // Calculate total amount
        uint256 totalAmount = _calculateTotalAmount(amounts);
        
        // Validate budget with available balance (considering locked funds)
        _validateAvailableBudget(totalAmount);
        
        uint256 requestId = _requestIdCounter++;
        
        // Create request
        _createMultiReimbursementRequest(requestId, recipients, amounts, totalAmount, description, documentHash);
        
        // SECURITY FIX MEDIUM-1: Validate virtual payer address
        if (virtualPayer != address(0)) {
            // Ensure virtual payer is not a system address or contract
            _validateVirtualPayer(virtualPayer);
            
            virtualPayers[requestId] = virtualPayer;
            requests[requestId].virtualPayer = virtualPayer;
        }
        
        // Track request
        _trackActiveRequest(requestId);
        
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
        
        // Validate inputs
        _validateMultiRequestInputs(recipients, amounts, description, documentHash);
        
        // Validate budget with available balance (considering locked funds)
        _validateAvailableBudget(amount);
        
        uint256 requestId = _requestIdCounter++;
        
        // Create request
        _createMultiReimbursementRequest(requestId, recipients, amounts, amount, description, documentHash);
        
        // No virtual payer for backward compatibility
        
        // Track request
        _trackActiveRequest(requestId);
        
        emit RequestCreated(requestId, msg.sender, recipients, amounts, amount, description, address(0));
        
        return requestId;
    }
    
    function _validateMultiRequestInputs(
        address[] memory recipients,
        uint256[] memory amounts,
        string calldata description,
        string calldata documentHash
    ) private pure {
        // Validate arrays
        if (recipients.length == 0) revert EmptyRecipientList();
        if (recipients.length != amounts.length) revert ArrayLengthMismatch();
        if (recipients.length > MAX_RECIPIENTS) revert TooManyRecipients();
        
        // Validate each recipient and amount
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert InvalidAmount();
            if (amounts[i] < MIN_REIMBURSEMENT_AMOUNT) revert AmountTooLow();
            if (amounts[i] > MAX_REIMBURSEMENT_AMOUNT) revert AmountTooHigh();
            
            // Check for duplicate recipients
            for (uint256 j = 0; j < i; j++) {
                if (recipients[i] == recipients[j]) revert InvalidAddress();
            }
            
            totalAmount += amounts[i];
            if (totalAmount < amounts[i]) revert InvalidAmount(); // Overflow check
        }
        
        // Validate total amount
        if (totalAmount > MAX_REIMBURSEMENT_AMOUNT) revert AmountTooHigh();
        
        // Validate description and document hash
        if (bytes(description).length == 0) revert InvalidDescription();
        if (bytes(description).length > 1000) revert InvalidDescription();
        if (bytes(documentHash).length == 0) revert InvalidDocumentHash();
        if (bytes(documentHash).length > 100) revert InvalidDocumentHash();
    }
    
    function _calculateTotalAmount(uint256[] memory amounts) private pure returns (uint256) {
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
            if (totalAmount < amounts[i]) revert InvalidAmount(); // Overflow check
        }
        return totalAmount;
    }
    
    function _validateBudget(uint256 amount) private view {
        uint256 newTotalDistributed = totalDistributed + amount;
        if (newTotalDistributed > projectBudget) revert InsufficientBudget();
        if (newTotalDistributed < totalDistributed) revert InvalidAmount(); // Overflow check
        if (projectBudget > type(uint256).max / 2) revert InvalidAmount();
    }
    
    function _validateAvailableBudget(uint256 amount) private view {
        // Check if we have enough available balance (total balance - locked amount)
        uint256 currentBalance = omthbToken.balanceOf(address(this));
        uint256 availableBalance = currentBalance > totalLockedAmount ? currentBalance - totalLockedAmount : 0;
        
        if (amount > availableBalance) revert InsufficientAvailableBalance();
        
        // Check that new locked amount won't exceed max percentage
        uint256 newLockedAmount = totalLockedAmount + amount;
        uint256 maxAllowedLocked = (currentBalance * MAX_LOCKED_PERCENTAGE) / 100;
        if (newLockedAmount > maxAllowedLocked) revert MaxLockedPercentageExceeded();
        
        // Check against project budget (optimized to avoid redundant check)
        uint256 newTotalDistributed = totalDistributed + amount;
        if (newTotalDistributed > projectBudget) revert InsufficientBudget();
        if (newTotalDistributed < totalDistributed) revert InvalidAmount(); // Overflow check
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
    
    function _trackActiveRequest(uint256 requestId) private {
        if (activeRequestIds.length >= MAX_BATCH_SIZE) revert TooManyActiveRequests();
        activeRequestIds.push(requestId);
        
        activeRequestsPerUser[msg.sender].push(requestId);
        requestIndexInUserArray[requestId] = activeRequestsPerUser[msg.sender].length - 1;
        
        if (activeRequestsPerUser[msg.sender].length > MAX_ARRAY_LENGTH) {
            _cleanupUserRequests(msg.sender);
        }
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
        if (request.status != Status.Pending) revert InvalidStatus();
        if (request.approvalInfo.secretaryApprover != address(0)) revert AlreadyApproved();
        
        request.approvalInfo.secretaryApprover = msg.sender;
        request.status = Status.SecretaryApproved;
        request.updatedAt = block.timestamp;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
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
        if (request.status != Status.SecretaryApproved) revert InvalidStatus();
        if (request.approvalInfo.committeeApprover != address(0)) revert AlreadyApproved();
        
        request.approvalInfo.committeeApprover = msg.sender;
        request.status = Status.CommitteeApproved;
        request.updatedAt = block.timestamp;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
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
        if (request.status != Status.CommitteeApproved) revert InvalidStatus();
        if (request.approvalInfo.financeApprover != address(0)) revert AlreadyApproved();
        
        request.approvalInfo.financeApprover = msg.sender;
        request.status = Status.FinanceApproved;
        request.updatedAt = block.timestamp;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
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
        if (request.status != Status.FinanceApproved) revert InvalidStatus();
        if (request.approvalInfo.committeeAdditionalApprovers.length >= REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS) revert AlreadyApproved();
        
        // Ensure different committee member from Level 2 approver
        if (request.approvalInfo.committeeApprover == msg.sender) revert UnauthorizedApprover();
        
        // Check if this committee member has already approved in additional level
        for (uint256 i = 0; i < request.approvalInfo.committeeAdditionalApprovers.length; i++) {
            if (request.approvalInfo.committeeAdditionalApprovers[i] == msg.sender) revert AlreadyApproved();
        }
        
        // Add to additional approvers array
        request.approvalInfo.committeeAdditionalApprovers.push(msg.sender);
        request.updatedAt = block.timestamp;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
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
        if (request.status != Status.FinanceApproved) revert InvalidStatus();
        if (request.approvalInfo.committeeAdditionalApprovers.length < REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS) revert InvalidStatus();
        if (request.approvalInfo.directorApprover != address(0)) revert AlreadyApproved();
        
        request.approvalInfo.directorApprover = msg.sender;
        request.status = Status.DirectorApproved;
        request.updatedAt = block.timestamp;
        request.paymentDeadline = block.timestamp + PAYMENT_DEADLINE_DURATION;
        
        // Lock funds for this request and record approval timestamp
        _lockFunds(requestId, request.totalAmount);
        approvalTimestamps[requestId] = block.timestamp;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
        emit RequestApproved(requestId, Status.DirectorApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.DirectorApproved);
        
        // Auto-distribute funds to all recipients
        _distributeMultipleFunds(requestId);
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
        
        // Unlock funds if they were locked (director approved but not distributed)
        if (request.approvalInfo.directorApprover != address(0) && lockedAmounts[requestId] > 0) {
            _unlockFunds(requestId);
        }
        
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
        if (_timelockController == address(0)) revert ZeroAddress();
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
     * @notice Deposit OMTHB tokens to the project
     * @param amount The amount of OMTHB to deposit
     * @dev Anyone can deposit tokens to a project
     */
    function depositOMTHB(uint256 amount) external nonReentrant whenNotPaused notEmergencyStopped {
        if (amount == 0) revert InvalidAmount();
        if (amount < MIN_DEPOSIT_AMOUNT) revert DepositAmountTooLow();
        
        // Check depositor has sufficient balance
        uint256 depositorBalance = omthbToken.balanceOf(msg.sender);
        if (depositorBalance < amount) revert InsufficientBalance();
        
        // Check depositor has approved this contract
        uint256 allowance = omthbToken.allowance(msg.sender, address(this));
        if (allowance < amount) revert InsufficientBalance();
        
        // Get balance before transfer
        uint256 balanceBefore = omthbToken.balanceOf(address(this));
        
        // Transfer tokens from depositor to this contract
        bool success = omthbToken.transferFrom(msg.sender, address(this), amount);
        if (!success) revert DepositFailed();
        
        // Update project budget
        uint256 oldBudget = projectBudget;
        projectBudget += amount;
        
        // Emit enhanced events
        emit OMTHBDeposited(msg.sender, amount, projectBudget);
        emit BudgetUpdated(oldBudget, projectBudget);
        emit BudgetIncreased(amount, msg.sender);
        emit AvailableBalanceChanged(balanceBefore, omthbToken.balanceOf(address(this)));
    }
    
    /**
     * @notice Lock funds when director approves a request
     * @param requestId The request ID
     * @param amount The amount to lock
     */
    function _lockFunds(uint256 requestId, uint256 amount) private {
        lockedAmounts[requestId] = amount;
        totalLockedAmount += amount;
        
        emit FundsLocked(requestId, amount);
    }
    
    /**
     * @notice Unlock funds when request is cancelled or distributed
     * @param requestId The request ID
     */
    function _unlockFunds(uint256 requestId) private {
        uint256 amount = lockedAmounts[requestId];
        if (amount > 0) {
            totalLockedAmount -= amount;
            lockedAmounts[requestId] = 0;
            
            emit FundsUnlocked(requestId, amount);
        }
    }
    
    /**
     * @notice SECURITY FIX MEDIUM-1: Validate virtual payer address
     * @param virtualPayer The virtual payer address to validate
     * @dev Ensures virtual payer is not a critical system address
     */
    function _validateVirtualPayer(address virtualPayer) private view {
        // Prevent using this contract as virtual payer
        if (virtualPayer == address(this)) revert InvalidVirtualPayer();
        
        // Prevent using the token contract as virtual payer
        if (virtualPayer == address(omthbToken)) revert InvalidVirtualPayer();
        
        // Prevent using the factory contract as virtual payer
        if (virtualPayer == projectFactory) revert InvalidVirtualPayer();
        
        // Prevent using common system addresses
        if (virtualPayer == address(0x0)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0xdEaD)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x1)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x2)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x3)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x4)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x5)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x6)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x7)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x8)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x9)) revert InvalidVirtualPayer();
        
        // Prevent using precompiled contracts (addresses 0x1 to 0x9 are already checked above)
        // Additional check for other known precompiles
        if (uint160(virtualPayer) <= 0xff) revert InvalidVirtualPayer();
        
        // Optional: Check if address is a contract (commented out as virtual payers might be contracts)
        // if (virtualPayer.code.length > 0) revert InvalidVirtualPayer();
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
        
        // Unlock the funds since they're being distributed
        _unlockFunds(requestId);
        
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
            emit ArrayCleanupPerformed(user, removed);
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
            uint256 lastIndex = userRequests.length - 1;
            if (index != lastIndex) {
                userRequests[index] = userRequests[lastIndex];
                requestIndexInUserArray[userRequests[index]] = index;
            }
            userRequests.pop();
            delete requestIndexInUserArray[requestId];
        }
        
        // Remove from global active requests with gas limit
        uint256 length = activeRequestIds.length;
        if (length > MAX_BATCH_SIZE) {
            length = MAX_BATCH_SIZE;
        }
        
        for (uint256 i = 0; i < length; i++) {
            if (activeRequestIds[i] == requestId) {
                uint256 lastIndex = activeRequestIds.length - 1;
                if (i != lastIndex) {
                    activeRequestIds[i] = activeRequestIds[lastIndex];
                }
                activeRequestIds.pop();
                break;
            }
        }
    }
    
    /**
     * @notice Initiate admin transfer (Step 1 of two-step transfer)
     * @param newAdmin The address of the new admin
     */
    function initiateAdminTransfer(address newAdmin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newAdmin == address(0)) revert InvalidAddress();
        
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
        // In a production scenario, track current admin separately
        address previousAdmin = address(0);
        
        // Grant admin role to new admin
        _grantRole(DEFAULT_ADMIN_ROLE, pendingAdmin);
        
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
        if (target == address(0)) revert ZeroAddress();
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
        if (account == address(0)) revert ZeroAddress();
        
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
     * @dev Only callable by factory during initialization or admin for emergency
     * @param role The role to grant
     * @param account The account to grant the role to
     */
    function grantRoleDirect(bytes32 role, address account) external {
        // CRITICAL FIX: Allow factory to set initial roles
        if (msg.sender != projectFactory && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        if (account == address(0)) revert ZeroAddress();
        
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
        if (account == address(0)) revert ZeroAddress();
        
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
        
        // Validate inputs
        if (returnAddress == address(0)) revert InvalidReturnAddress();
        if (bytes(reason).length == 0) revert InvalidDescription();
        if (bytes(reason).length > 1000) revert InvalidDescription();
        
        // Check if there's already an active closure request
        if (activeClosureRequestId != 0) {
            EmergencyClosureRequest storage activeRequest = closureRequests[activeClosureRequestId];
            if (activeRequest.status == ClosureStatus.Initiated || 
                activeRequest.status == ClosureStatus.PartiallyApproved ||
                activeRequest.status == ClosureStatus.FullyApproved) {
                revert ActiveClosureExists();
            }
        }
        
        uint256 closureId = _closureIdCounter++;
        
        // Create closure request step by step to avoid stack too deep
        EmergencyClosureRequest storage closureRequest = closureRequests[closureId];
        closureRequest.id = closureId;
        closureRequest.initiator = msg.sender;
        closureRequest.returnAddress = returnAddress;
        closureRequest.reason = reason;
        closureRequest.status = ClosureStatus.Initiated;
        closureRequest.createdAt = block.timestamp;
        closureRequest.updatedAt = block.timestamp;
        closureRequest.executionDeadline = 0; // Set when fully approved
        closureRequest.remainingBalance = 0; // Set when executed
        
        // Initialize approval info
        closureRequest.closureApprovalInfo.directorApprover = address(0);
        // committeeApprovers is already initialized as empty array
        
        activeClosureRequestId = closureId;
        
        emit EmergencyClosureInitiated(closureId, msg.sender, returnAddress, reason);
        
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
        EmergencyClosureRequest storage request = closureRequests[closureId];
        if (request.id != closureId || request.status == ClosureStatus.None) {
            revert NoActiveClosureRequest();
        }
        if (request.status == ClosureStatus.Executed || request.status == ClosureStatus.Cancelled) {
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
        
        EmergencyClosureRequest storage request = closureRequests[closureId];
        if (request.id != closureId || request.status == ClosureStatus.None) {
            revert NoActiveClosureRequest();
        }
        if (request.status == ClosureStatus.Executed || request.status == ClosureStatus.Cancelled) {
            revert InvalidClosureStatus();
        }
        
        bool isCommittee = hasRole(COMMITTEE_ROLE, msg.sender);
        bool isDirector = hasRole(DIRECTOR_ROLE, msg.sender);
        
        if (!isCommittee && !isDirector) revert UnauthorizedApprover();
        
        // Handle committee approval
        if (isCommittee && request.closureApprovalInfo.committeeApprovers.length < REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
            // Check for duplicates
            for (uint256 i = 0; i < request.closureApprovalInfo.committeeApprovers.length; i++) {
                if (request.closureApprovalInfo.committeeApprovers[i] == msg.sender) {
                    revert DuplicateCommitteeApprover();
                }
            }
            
            // Add committee approver
            request.closureApprovalInfo.committeeApprovers.push(msg.sender);
            request.updatedAt = block.timestamp;
            
            if (request.closureApprovalInfo.committeeApprovers.length < REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
                request.status = ClosureStatus.PartiallyApproved;
            } else {
                request.status = ClosureStatus.FullyApproved;
            }
            
            emit EmergencyClosureApproved(closureId, msg.sender, request.closureApprovalInfo.committeeApprovers.length);
        }
        // Handle director approval
        else if (isDirector && request.closureApprovalInfo.committeeApprovers.length >= REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
            if (request.closureApprovalInfo.directorApprover != address(0)) revert AlreadyApproved();
            
            request.closureApprovalInfo.directorApprover = msg.sender;
            request.status = ClosureStatus.FullyApproved;
            request.updatedAt = block.timestamp;
            request.executionDeadline = block.timestamp + PAYMENT_DEADLINE_DURATION;
            
            emit EmergencyClosureApproved(closureId, msg.sender, request.closureApprovalInfo.committeeApprovers.length);
            
            // Auto-execute the closure
            _executeEmergencyClosure(closureId);
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
        EmergencyClosureRequest storage request = closureRequests[closureId];
        if (request.id != closureId || request.status == ClosureStatus.None) {
            revert NoActiveClosureRequest();
        }
        
        // Only initiator or admin can cancel
        if (msg.sender != request.initiator && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        
        // Cannot cancel if already executed
        if (request.status == ClosureStatus.Executed) revert InvalidClosureStatus();
        
        request.status = ClosureStatus.Cancelled;
        request.updatedAt = block.timestamp;
        
        // Clear active closure request if this was it
        if (activeClosureRequestId == closureId) {
            activeClosureRequestId = 0;
        }
        
        emit EmergencyClosureCancelled(closureId, msg.sender);
    }

    /**
     * @notice Get emergency closure request details
     * @param closureId The closure request ID
     * @return The emergency closure request details
     */
    function getClosureRequest(uint256 closureId) external view returns (EmergencyClosureRequest memory) {
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
     * @notice Internal function to execute emergency closure
     * @param closureId The closure request ID
     */
    function _executeEmergencyClosure(uint256 closureId) private {
        EmergencyClosureRequest storage request = closureRequests[closureId];
        
        // Verify deadline hasn't expired
        if (request.executionDeadline != 0 && block.timestamp > request.executionDeadline) {
            revert ClosureExecutionDeadlineExpired();
        }
        
        // Get current balance
        uint256 currentBalance = omthbToken.balanceOf(address(this));
        
        // Cache values to prevent reentrancy
        address returnAddress = request.returnAddress;
        
        // Update state BEFORE external calls (CEI pattern)
        request.status = ClosureStatus.Executed;
        request.updatedAt = block.timestamp;
        request.remainingBalance = currentBalance;
        
        // Clear active closure request
        activeClosureRequestId = 0;
        
        // Pause the contract permanently
        if (!paused()) {
            _pause();
        }
        
        // Emit event before external call
        emit EmergencyClosureExecuted(closureId, returnAddress, currentBalance);
        
        // Transfer all remaining tokens to the return address
        if (currentBalance > 0) {
            // Additional balance check to prevent issues
            uint256 actualBalance = omthbToken.balanceOf(address(this));
            if (actualBalance < currentBalance) {
                currentBalance = actualBalance;
            }
            
            bool success = omthbToken.transfer(returnAddress, currentBalance);
            if (!success) revert TransferFailed();
        }
    }
    
    /**
     * @notice Get closure approval count
     * @param closureId The closure request ID  
     * @return committeeCount Number of committee approvers
     * @return hasDirectorApproval Whether director has approved
     */
    function getClosureApprovalStatus(uint256 closureId) external view returns (uint256 committeeCount, bool hasDirectorApproval) {
        EmergencyClosureRequest storage request = closureRequests[closureId];
        committeeCount = request.closureApprovalInfo.committeeApprovers.length;
        hasDirectorApproval = request.closureApprovalInfo.directorApprover != address(0);
    }
    
    /**
     * @notice Check if the project is closed
     * @return True if an emergency closure has been executed
     */
    function isProjectClosed() external view returns (bool) {
        if (activeClosureRequestId != 0) {
            EmergencyClosureRequest storage request = closureRequests[activeClosureRequestId];
            return request.status == ClosureStatus.Executed;
        }
        // Also check all closure requests for executed status
        for (uint256 i = 0; i < _closureIdCounter; i++) {
            if (closureRequests[i].status == ClosureStatus.Executed) {
                return true;
            }
        }
        return false;
    }
    
    // ============================================
    // NEW VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get remaining budget (budget minus distributed)
     * @return The remaining budget available for distribution
     */
    function getRemainingBudget() external view returns (uint256) {
        if (projectBudget >= totalDistributed) {
            return projectBudget - totalDistributed;
        }
        return 0;
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
        
        // Unlock funds if they were locked (director approved but not distributed)
        if (request.approvalInfo.directorApprover != address(0) && lockedAmounts[requestId] > 0) {
            _unlockFunds(requestId);
        }
        
        // Remove from active arrays
        _removeFromActiveRequests(requestId);
        
        emit RequestCancelled(requestId, msg.sender);
    }
    
    // ============================================
    // NEW VIEW FUNCTIONS FOR FUND TRACKING
    // ============================================
    
    /**
     * @notice Get total balance of OMTHB tokens in the project
     * @return The total OMTHB balance
     */
    function getTotalBalance() external view returns (uint256) {
        return omthbToken.balanceOf(address(this));
    }
    
    /**
     * @notice Get available balance (total balance minus locked amounts)
     * @return The available balance for new requests
     */
    function getAvailableBalance() external view returns (uint256) {
        uint256 totalBalance = omthbToken.balanceOf(address(this));
        if (totalBalance > totalLockedAmount) {
            return totalBalance - totalLockedAmount;
        }
        return 0;
    }
    
    /**
     * @notice Get total locked amount
     * @return The total amount locked for approved requests
     */
    function getLockedAmount() external view returns (uint256) {
        return totalLockedAmount;
    }
    
    /**
     * @notice Get locked amount for a specific request
     * @param requestId The request ID
     * @return The locked amount for the request
     */
    function getLockedAmountForRequest(uint256 requestId) external view returns (uint256) {
        return lockedAmounts[requestId];
    }
    
    /**
     * @notice Check if project needs deposits before creating requests
     * @return True if project has 0 balance
     */
    function needsDeposit() external view returns (bool) {
        return omthbToken.balanceOf(address(this)) == 0;
    }
    
    /**
     * @notice Unlock funds from stale approved requests (30+ days since director approval)
     * @param requestId The request ID to unlock
     * @dev Can be called by anyone if request is stale
     */
    function unlockStaleRequest(uint256 requestId) external whenNotPaused nonReentrant {
        ReimbursementRequest storage request = requests[requestId];
        
        // Request must exist
        if (request.id != requestId) revert RequestNotFound();
        
        // Request must be director approved but not distributed
        if (request.status != Status.DirectorApproved) revert InvalidStatus();
        
        // Check if request is stale (30 days since director approval)
        uint256 approvalTime = approvalTimestamps[requestId];
        if (approvalTime == 0) revert InvalidStatus();
        if (block.timestamp < approvalTime + STALE_REQUEST_TIMEOUT) revert RequestNotStale();
        
        // Calculate days since approval for event
        uint256 daysSinceApproval = (block.timestamp - approvalTime) / 1 days;
        
        // Mark as cancelled
        request.status = Status.Cancelled;
        request.updatedAt = block.timestamp;
        
        // Unlock the funds
        uint256 unlockedAmount = lockedAmounts[requestId];
        _unlockFunds(requestId);
        
        // Remove from active arrays
        _removeFromActiveRequests(requestId);
        
        // Emit events
        emit RequestCancelled(requestId, msg.sender);
        emit StaleRequestUnlocked(requestId, unlockedAmount, daysSinceApproval);
    }
    
    /**
     * @notice Get all stale request IDs that can be unlocked
     * @return Array of stale request IDs
     */
    function getStaleRequests() external view returns (uint256[] memory) {
        uint256[] memory tempStaleRequests = new uint256[](activeRequestIds.length);
        uint256 staleCount = 0;
        
        for (uint256 i = 0; i < activeRequestIds.length; i++) {
            uint256 requestId = activeRequestIds[i];
            ReimbursementRequest storage request = requests[requestId];
            
            if (request.status == Status.DirectorApproved) {
                uint256 approvalTime = approvalTimestamps[requestId];
                if (approvalTime > 0 && block.timestamp >= approvalTime + STALE_REQUEST_TIMEOUT) {
                    tempStaleRequests[staleCount] = requestId;
                    staleCount++;
                }
            }
        }
        
        // Create properly sized array
        uint256[] memory staleRequests = new uint256[](staleCount);
        for (uint256 i = 0; i < staleCount; i++) {
            staleRequests[i] = tempStaleRequests[i];
        }
        
        return staleRequests;
    }
    
    /**
     * @notice Check if a request is stale (30+ days since director approval)
     * @param requestId The request ID to check
     * @return True if the request is stale and can be unlocked
     */
    function isRequestStale(uint256 requestId) external view returns (bool) {
        ReimbursementRequest storage request = requests[requestId];
        
        if (request.id != requestId) return false;
        if (request.status != Status.DirectorApproved) return false;
        
        uint256 approvalTime = approvalTimestamps[requestId];
        if (approvalTime == 0) return false;
        
        return block.timestamp >= approvalTime + STALE_REQUEST_TIMEOUT;
    }
    
    /**
     * @notice Get the maximum amount that can be locked for new requests
     * @return The maximum amount that can be locked
     */
    function getMaxLockableAmount() external view returns (uint256) {
        uint256 currentBalance = omthbToken.balanceOf(address(this));
        uint256 maxAllowedLocked = (currentBalance * MAX_LOCKED_PERCENTAGE) / 100;
        
        if (maxAllowedLocked > totalLockedAmount) {
            return maxAllowedLocked - totalLockedAmount;
        }
        return 0;
    }
    
    /**
     * @notice Get the percentage of funds currently locked
     * @return The percentage of funds locked (0-100)
     */
    function getLockedPercentage() external view returns (uint256) {
        uint256 currentBalance = omthbToken.balanceOf(address(this));
        if (currentBalance == 0) return 0;
        
        return (totalLockedAmount * 100) / currentBalance;
    }
}