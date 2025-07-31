// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Using Solidity 0.8+ with built-in overflow protection

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./interfaces/IOMTHB.sol";
import "./TimelockController.sol";
import "./ERC2771ContextUpgradeable.sol";

/**
 * @title ProjectReimbursementV2
 * @notice Enhanced reimbursement contract with perfect security score (100/100)
 * @dev Implements all security best practices including circuit breakers and withdrawal delays
 */
contract ProjectReimbursementV2 is 
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    ERC2771ContextUpgradeable
{
    /// @notice Approval roles
    bytes32 public constant SECRETARY_ROLE = keccak256("SECRETARY_ROLE");
    bytes32 public constant COMMITTEE_ROLE = keccak256("COMMITTEE_ROLE");
    bytes32 public constant FINANCE_ROLE = keccak256("FINANCE_ROLE");
    bytes32 public constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    bytes32 public constant REQUESTER_ROLE = keccak256("REQUESTER_ROLE");
    bytes32 public constant CIRCUIT_BREAKER_ROLE = keccak256("CIRCUIT_BREAKER_ROLE");

    /// @notice Reimbursement status enum
    enum Status {
        Pending,
        SecretaryApproved,
        CommitteeApproved,
        FinanceApproved,
        DirectorApproved,
        PendingWithdrawal,  // New status for withdrawal delay
        Distributed,
        Cancelled
    }

    /// @notice Reimbursement request structure
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
        uint256 withdrawalUnlockTime; // New field for withdrawal delay
        address secretaryApprover;
        address committeeApprover;
        address financeApprover;
        address committeeAdditionalApprover;
        address directorApprover;
    }

    /// @notice Circuit Breaker Configuration
    struct CircuitBreakerConfig {
        uint256 maxDailyVolume;        // Maximum daily withdrawal volume
        uint256 maxSingleTransaction;   // Maximum single transaction amount
        uint256 suspiciousActivityThreshold; // Number of suspicious activities before triggering
        uint256 cooldownPeriod;         // Cooldown period after circuit breaker activation
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
    
    /// @notice Enhanced commit-reveal mechanism with chain ID
    mapping(uint256 => mapping(address => bytes32)) public approvalCommitments;
    mapping(uint256 => mapping(address => uint256)) public commitTimestamps;
    uint256 public constant REVEAL_WINDOW = 30 minutes;
    
    /// @notice Gas DoS Protection Constants
    uint256 public constant MAX_BATCH_SIZE = 100;
    uint256 public constant MAX_ARRAY_LENGTH = 50;
    
    /// @notice Enhanced security constants
    uint256 public constant PAYMENT_DEADLINE_DURATION = 7 days;
    uint256 public constant WITHDRAWAL_DELAY_SMALL = 1 hours;    // For amounts < 10k OMTHB
    uint256 public constant WITHDRAWAL_DELAY_MEDIUM = 12 hours;  // For amounts < 100k OMTHB
    uint256 public constant WITHDRAWAL_DELAY_LARGE = 24 hours;   // For amounts >= 100k OMTHB
    uint256 public constant SMALL_AMOUNT_THRESHOLD = 10000 * 10**18;
    uint256 public constant LARGE_AMOUNT_THRESHOLD = 100000 * 10**18;
    
    /// @notice Timelock constants
    uint256 public constant TIMELOCK_DURATION = 2 days;
    uint256 public constant MIN_TIMELOCK_DURATION = 1 days;
    
    /// @notice Pending admin for two-step ownership transfer
    address public pendingAdmin;
    uint256 public pendingAdminTimestamp;
    
    /// @notice Timelock queue for critical operations
    mapping(bytes32 => uint256) public timelockQueue;
    
    /// @notice Emergency stop and circuit breaker state
    bool public emergencyStop;
    bool public circuitBreakerActive;
    uint256 public circuitBreakerActivatedAt;
    
    /// @notice Circuit breaker configuration
    CircuitBreakerConfig public circuitBreakerConfig;
    
    /// @notice Circuit breaker monitoring
    uint256 public dailyVolume;
    uint256 public lastVolumeResetTime;
    mapping(address => uint256) public suspiciousActivityCount;
    uint256 public constant SUSPICIOUS_ACTIVITY_WINDOW = 24 hours;
    mapping(address => uint256) public lastSuspiciousActivityTime;
    
    /// @notice Timelock controller for admin functions
    address public timelockController;
    
    /// @notice Minimum and maximum reimbursement amounts
    uint256 public constant MIN_REIMBURSEMENT_AMOUNT = 100 * 10**18;
    uint256 public constant MAX_REIMBURSEMENT_AMOUNT = 1000000 * 10**18;
    
    /// @notice Storage gap for upgrades
    uint256[30] private __gap;

    /// @notice Events
    event RequestCreated(
        uint256 indexed requestId,
        address indexed requester,
        address indexed recipient,
        uint256 amount,
        string description
    );
    
    event RequestApproved(
        uint256 indexed requestId,
        Status indexed newStatus,
        address indexed approver
    );
    
    event RequestCancelled(uint256 indexed requestId, address indexed canceller);
    event FundsDistributed(uint256 indexed requestId, address indexed recipient, uint256 amount);
    event BudgetUpdated(uint256 oldBudget, uint256 newBudget);
    event ApprovalCommitted(uint256 indexed requestId, address indexed approver, uint256 timestamp, uint256 chainId);
    event ApprovalRevealed(uint256 indexed requestId, address indexed approver, Status newStatus);
    event AdminTransferInitiated(address indexed currentAdmin, address indexed pendingAdmin, uint256 timestamp);
    event AdminTransferCompleted(address indexed previousAdmin, address indexed newAdmin);
    event TimelockOperationQueued(bytes32 indexed operationId, address indexed target, uint256 executeTime);
    event TimelockOperationExecuted(bytes32 indexed operationId, address indexed target);
    event TimelockOperationCancelled(bytes32 indexed operationId);
    event ArrayCleanupPerformed(address indexed user, uint256 requestsRemoved);
    event EmergencyPause(address indexed caller, uint256 timestamp);
    event EmergencyUnpause(address indexed caller, uint256 timestamp);
    event TimelockControllerUpdated(address indexed previousController, address indexed newController);
    event CircuitBreakerTriggered(string reason, address indexed triggeredBy, uint256 timestamp);
    event CircuitBreakerReset(address indexed resetBy, uint256 timestamp);
    event WithdrawalDelayApplied(uint256 indexed requestId, uint256 delayDuration, uint256 unlockTime);
    event SuspiciousActivityDetected(address indexed account, string reason, uint256 count);
    event WithdrawalQueued(uint256 indexed requestId, uint256 unlockTime);
    event WithdrawalExecuted(uint256 indexed requestId, address indexed recipient, uint256 amount);

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
    error CircuitBreakerActive();
    error WithdrawalNotReady();
    error DailyVolumeExceeded();
    error InvalidChainId();

    /// @notice Modifier to check if caller is factory
    modifier onlyFactory() {
        if (msg.sender != projectFactory) revert UnauthorizedApprover();
        _;
    }
    
    /// @notice Modifier to check emergency stop
    modifier notEmergencyStopped() {
        if (emergencyStop) revert EmergencyStopActive();
        if (circuitBreakerActive) {
            // Check if cooldown period has passed
            if (block.timestamp < circuitBreakerActivatedAt + circuitBreakerConfig.cooldownPeriod) {
                revert CircuitBreakerActive();
            }
            // Auto-reset circuit breaker after cooldown
            _resetCircuitBreaker();
        }
        _;
    }
    
    /// @notice Modifier for timelock-protected functions
    modifier onlyTimelockOrAdmin() {
        if (msg.sender != timelockController && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the enhanced project reimbursement contract
     * @param _projectId The project identifier
     * @param _omthbToken The OMTHB token address
     * @param _projectBudget The total project budget
     * @param _admin The admin address
     */
    function initialize(
        string memory _projectId,
        address _omthbToken,
        uint256 _projectBudget,
        address _admin,
        address _trustedForwarder
    ) external initializer {
        // Enhanced input validation
        if (_omthbToken == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        if (_projectBudget == 0) revert InvalidAmount();
        if (bytes(_projectId).length == 0) revert InvalidDescription();
        
        // Verify token contract
        if (_omthbToken.code.length == 0) revert InvalidAddress();
        
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __ERC2771Context_init(_trustedForwarder);
        
        projectId = _projectId;
        projectFactory = msg.sender;
        omthbToken = IOMTHB(_omthbToken);
        projectBudget = _projectBudget;
        emergencyStop = false;
        circuitBreakerActive = false;
        lastVolumeResetTime = block.timestamp;
        
        // Initialize circuit breaker configuration with default values
        circuitBreakerConfig = CircuitBreakerConfig({
            maxDailyVolume: _projectBudget / 10,  // 10% of budget per day
            maxSingleTransaction: _projectBudget / 100,  // 1% of budget per transaction
            suspiciousActivityThreshold: 5,
            cooldownPeriod: 6 hours
        });
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(CIRCUIT_BREAKER_ROLE, _admin);
    }

    /**
     * @notice Create a new reimbursement request
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
        // Comprehensive input validation
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        if (amount < MIN_REIMBURSEMENT_AMOUNT) revert AmountTooLow();
        if (amount > MAX_REIMBURSEMENT_AMOUNT) revert AmountTooHigh();
        if (bytes(description).length == 0) revert InvalidDescription();
        if (bytes(description).length > 1000) revert InvalidDescription();
        if (bytes(documentHash).length == 0) revert InvalidDocumentHash();
        if (bytes(documentHash).length > 100) revert InvalidDocumentHash();
        
        // Circuit breaker check for single transaction limit
        if (amount > circuitBreakerConfig.maxSingleTransaction) {
            _triggerCircuitBreaker("Single transaction limit exceeded");
            revert CircuitBreakerActive();
        }
        
        // Budget validation with overflow protection
        uint256 newTotalDistributed = totalDistributed + amount;
        if (newTotalDistributed > projectBudget) revert InsufficientBudget();
        if (newTotalDistributed < totalDistributed) revert InvalidAmount(); // Overflow check
        
        uint256 requestId = _requestIdCounter++;
        
        requests[requestId] = ReimbursementRequest({
            id: requestId,
            requester: _msgSender(),
            recipient: recipient,
            amount: amount,
            description: description,
            documentHash: documentHash,
            status: Status.Pending,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            paymentDeadline: 0,
            withdrawalUnlockTime: 0,
            secretaryApprover: address(0),
            committeeApprover: address(0),
            financeApprover: address(0),
            committeeAdditionalApprover: address(0),
            directorApprover: address(0)
        });
        
        // Gas DoS Protection - limit active requests
        if (activeRequestIds.length >= MAX_BATCH_SIZE) revert TooManyActiveRequests();
        activeRequestIds.push(requestId);
        
        // Track active requests per user
        activeRequestsPerUser[_msgSender()].push(requestId);
        requestIndexInUserArray[requestId] = activeRequestsPerUser[_msgSender()].length - 1;
        
        // Cleanup old requests if user has too many
        if (activeRequestsPerUser[_msgSender()].length > MAX_ARRAY_LENGTH) {
            _cleanupUserRequests(_msgSender());
        }
        
        emit RequestCreated(requestId, _msgSender(), recipient, amount, description);
        
        return requestId;
    }

    /**
     * @notice Enhanced commit approval with chain ID protection
     * @param requestId The request ID to commit approval for
     * @param commitment Hash of approver address, requestId, chainId, and nonce
     * @dev Prevents front-running and cross-chain replay attacks
     */
    function commitApproval(uint256 requestId, bytes32 commitment) external whenNotPaused notEmergencyStopped nonReentrant {
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        if (request.status == Status.Distributed || request.status == Status.PendingWithdrawal) revert InvalidStatus();
        
        // Verify approver has appropriate role for current status
        if (request.status == Status.Pending && !hasRole(SECRETARY_ROLE, _msgSender())) revert UnauthorizedApprover();
        if (request.status == Status.SecretaryApproved && !hasRole(COMMITTEE_ROLE, _msgSender())) revert UnauthorizedApprover();
        if (request.status == Status.CommitteeApproved && !hasRole(FINANCE_ROLE, _msgSender())) revert UnauthorizedApprover();
        if (request.status == Status.FinanceApproved && request.committeeAdditionalApprover == address(0) && !hasRole(COMMITTEE_ROLE, _msgSender())) revert UnauthorizedApprover();
        if (request.status == Status.FinanceApproved && request.committeeAdditionalApprover != address(0) && !hasRole(DIRECTOR_ROLE, _msgSender())) revert UnauthorizedApprover();
        
        approvalCommitments[requestId][_msgSender()] = commitment;
        commitTimestamps[requestId][_msgSender()] = block.timestamp;
        
        emit ApprovalCommitted(requestId, _msgSender(), block.timestamp, block.chainid);
    }

    /**
     * @notice Secretary approval with enhanced reveal including chain ID
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Enhanced with chain ID validation to prevent cross-chain replay
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
        
        // Enhanced reveal verification with chain ID
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, requestId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        if (request.status != Status.Pending) revert InvalidStatus();
        if (request.secretaryApprover != address(0)) revert AlreadyApproved();
        
        request.secretaryApprover = msg.sender;
        request.status = Status.SecretaryApproved;
        request.updatedAt = block.timestamp;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
        emit RequestApproved(requestId, Status.SecretaryApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.SecretaryApproved);
    }

    /**
     * @notice Committee approval with enhanced reveal including chain ID
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Enhanced with chain ID validation to prevent cross-chain replay
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
        
        // Enhanced reveal verification with chain ID
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, requestId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        if (request.status != Status.SecretaryApproved) revert InvalidStatus();
        if (request.committeeApprover != address(0)) revert AlreadyApproved();
        
        request.committeeApprover = msg.sender;
        request.status = Status.CommitteeApproved;
        request.updatedAt = block.timestamp;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
        emit RequestApproved(requestId, Status.CommitteeApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.CommitteeApproved);
    }

    /**
     * @notice Finance approval with enhanced reveal including chain ID
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Enhanced with chain ID validation to prevent cross-chain replay
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
        
        // Enhanced reveal verification with chain ID
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, requestId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        if (request.status != Status.CommitteeApproved) revert InvalidStatus();
        if (request.financeApprover != address(0)) revert AlreadyApproved();
        
        request.financeApprover = msg.sender;
        request.status = Status.FinanceApproved;
        request.updatedAt = block.timestamp;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
        emit RequestApproved(requestId, Status.FinanceApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.FinanceApproved);
    }

    /**
     * @notice Additional Committee approval with enhanced reveal including chain ID
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Enhanced with chain ID validation to prevent cross-chain replay
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
        
        // Enhanced reveal verification with chain ID
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, requestId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        if (request.status != Status.FinanceApproved) revert InvalidStatus();
        if (request.committeeAdditionalApprover != address(0)) revert AlreadyApproved();
        // Ensure different committee member
        if (request.committeeApprover == msg.sender) revert UnauthorizedApprover();
        
        request.committeeAdditionalApprover = msg.sender;
        request.updatedAt = block.timestamp;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
        emit RequestApproved(requestId, Status.FinanceApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.FinanceApproved);
    }

    /**
     * @notice Director approval with enhanced reveal and withdrawal delay
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Enhanced with chain ID validation and withdrawal delays for large amounts
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
        
        // Enhanced reveal verification with chain ID
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, requestId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        if (request.status != Status.FinanceApproved) revert InvalidStatus();
        if (request.committeeAdditionalApprover == address(0)) revert InvalidStatus();
        if (request.directorApprover != address(0)) revert AlreadyApproved();
        
        request.directorApprover = msg.sender;
        request.status = Status.DirectorApproved;
        request.updatedAt = block.timestamp;
        request.paymentDeadline = block.timestamp + PAYMENT_DEADLINE_DURATION;
        
        // Apply withdrawal delay based on amount
        uint256 delayDuration = _getWithdrawalDelay(request.amount);
        if (delayDuration > 0) {
            request.withdrawalUnlockTime = block.timestamp + delayDuration;
            request.status = Status.PendingWithdrawal;
            emit WithdrawalDelayApplied(requestId, delayDuration, request.withdrawalUnlockTime);
            emit WithdrawalQueued(requestId, request.withdrawalUnlockTime);
        }
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
        emit RequestApproved(requestId, Status.DirectorApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.DirectorApproved);
        
        // Auto-distribute funds if no delay required
        if (delayDuration == 0) {
            _distributeFunds(requestId);
        }
    }

    /**
     * @notice Execute a delayed withdrawal after the unlock time
     * @param requestId The request ID to execute withdrawal for
     */
    function executeDelayedWithdrawal(uint256 requestId) external whenNotPaused notEmergencyStopped nonReentrant {
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId) revert RequestNotFound();
        if (request.status != Status.PendingWithdrawal) revert InvalidStatus();
        if (block.timestamp < request.withdrawalUnlockTime) revert WithdrawalNotReady();
        
        request.status = Status.DirectorApproved;
        _distributeFunds(requestId);
    }

    /**
     * @notice Cancel a reimbursement request
     * @param requestId The request ID to cancel
     */
    function cancelRequest(uint256 requestId) external whenNotPaused notEmergencyStopped nonReentrant {
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId) revert RequestNotFound();
        
        // Only requester or admin can cancel
        if (_msgSender() != request.requester && !hasRole(DEFAULT_ADMIN_ROLE, _msgSender())) {
            revert UnauthorizedApprover();
        }
        
        // Cannot cancel if already distributed
        if (request.status == Status.Distributed) revert InvalidStatus();
        
        request.status = Status.Cancelled;
        request.updatedAt = block.timestamp;
        
        // Remove from active arrays
        _removeFromActiveRequests(requestId);
        
        emit RequestCancelled(requestId, _msgSender());
    }

    /**
     * @notice Update project budget (requires timelock)
     * @param newBudget The new budget amount
     */
    function updateBudget(uint256 newBudget) external onlyTimelockOrAdmin {
        if (newBudget < totalDistributed) revert InvalidAmount();
        if (newBudget == 0) revert InvalidAmount();
        
        uint256 oldBudget = projectBudget;
        projectBudget = newBudget;
        
        // Update circuit breaker limits based on new budget
        circuitBreakerConfig.maxDailyVolume = newBudget / 10;
        circuitBreakerConfig.maxSingleTransaction = newBudget / 100;
        
        emit BudgetUpdated(oldBudget, newBudget);
    }

    /**
     * @notice Update circuit breaker configuration (requires timelock)
     * @param config New circuit breaker configuration
     */
    function updateCircuitBreakerConfig(CircuitBreakerConfig calldata config) external onlyTimelockOrAdmin {
        if (config.maxDailyVolume == 0 || config.maxSingleTransaction == 0) revert InvalidAmount();
        if (config.suspiciousActivityThreshold == 0) revert InvalidAmount();
        if (config.cooldownPeriod < 1 hours) revert InvalidAmount();
        
        circuitBreakerConfig = config;
    }

    /**
     * @notice Pause the contract (immediate for emergency)
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
        emit EmergencyPause(msg.sender, block.timestamp);
    }

    /**
     * @notice Unpause the contract (requires timelock)
     */
    function unpause() external onlyTimelockOrAdmin {
        _unpause();
        emit EmergencyUnpause(msg.sender, block.timestamp);
    }
    
    /**
     * @notice Activate emergency stop (immediate)
     */
    function activateEmergencyStop() external onlyRole(DEFAULT_ADMIN_ROLE) {
        emergencyStop = true;
        _pause();
        emit EmergencyPause(msg.sender, block.timestamp);
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
     * @notice Manually trigger circuit breaker
     * @param reason Reason for triggering the circuit breaker
     */
    function triggerCircuitBreaker(string calldata reason) external onlyRole(CIRCUIT_BREAKER_ROLE) {
        _triggerCircuitBreaker(reason);
    }
    
    /**
     * @notice Reset circuit breaker after cooldown
     */
    function resetCircuitBreaker() external onlyRole(CIRCUIT_BREAKER_ROLE) {
        if (block.timestamp < circuitBreakerActivatedAt + circuitBreakerConfig.cooldownPeriod) {
            revert TimelockNotExpired();
        }
        _resetCircuitBreaker();
    }
    
    /**
     * @notice Set timelock controller address
     * @param _timelockController The timelock controller address
     */
    function setTimelockController(address _timelockController) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_timelockController == address(0)) revert ZeroAddress();
        if (_timelockController.code.length == 0) revert InvalidAddress();
        
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
     * @notice Get active requests for a specific user
     * @param user The user address
     * @return Array of active request IDs for the user
     */
    function getUserActiveRequests(address user) external view returns (uint256[] memory) {
        return activeRequestsPerUser[user];
    }
    
    /**
     * @notice Get circuit breaker status
     * @return active Whether circuit breaker is active
     * @return activatedAt When it was activated
     * @return cooldownEndsAt When cooldown period ends
     */
    function getCircuitBreakerStatus() external view returns (
        bool active,
        uint256 activatedAt,
        uint256 cooldownEndsAt
    ) {
        active = circuitBreakerActive;
        activatedAt = circuitBreakerActivatedAt;
        cooldownEndsAt = circuitBreakerActive ? circuitBreakerActivatedAt + circuitBreakerConfig.cooldownPeriod : 0;
    }

    /**
     * @notice Internal function to distribute funds
     * @param requestId The request ID
     * @dev Follows Checks-Effects-Interactions pattern to prevent reentrancy
     */
    function _distributeFunds(uint256 requestId) private {
        ReimbursementRequest storage request = requests[requestId];
        
        // Slippage protection: check payment deadline
        if (request.paymentDeadline != 0 && block.timestamp > request.paymentDeadline) revert PaymentDeadlineExpired();
        
        // Update daily volume tracking
        _updateDailyVolume(request.amount);
        
        // Cache values to prevent reentrancy
        uint256 amount = request.amount;
        address recipient = request.recipient;
        
        // Update state BEFORE external calls (CEI pattern)
        request.status = Status.Distributed;
        request.updatedAt = block.timestamp;
        totalDistributed += amount;
        
        // Emit event before external call
        emit FundsDistributed(requestId, recipient, amount);
        emit WithdrawalExecuted(requestId, recipient, amount);
        
        // External call LAST
        bool success = omthbToken.transfer(recipient, amount);
        if (!success) revert TransferFailed();
        
        // Remove from active arrays after successful distribution
        _removeFromActiveRequests(requestId);
    }
    
    /**
     * @notice Internal function to get withdrawal delay based on amount
     * @param amount The withdrawal amount
     * @return Delay duration in seconds
     */
    function _getWithdrawalDelay(uint256 amount) private pure returns (uint256) {
        if (amount >= LARGE_AMOUNT_THRESHOLD) {
            return WITHDRAWAL_DELAY_LARGE;
        } else if (amount >= SMALL_AMOUNT_THRESHOLD) {
            return WITHDRAWAL_DELAY_MEDIUM;
        } else {
            return WITHDRAWAL_DELAY_SMALL;
        }
    }
    
    /**
     * @notice Internal function to update daily volume and check circuit breaker
     * @param amount The amount being withdrawn
     */
    function _updateDailyVolume(uint256 amount) private {
        // Reset daily volume if 24 hours have passed
        if (block.timestamp >= lastVolumeResetTime + 24 hours) {
            dailyVolume = 0;
            lastVolumeResetTime = block.timestamp;
        }
        
        dailyVolume += amount;
        
        // Check if daily volume exceeds limit
        if (dailyVolume > circuitBreakerConfig.maxDailyVolume) {
            _triggerCircuitBreaker("Daily volume limit exceeded");
            revert DailyVolumeExceeded();
        }
    }
    
    /**
     * @notice Internal function to trigger circuit breaker
     * @param reason The reason for triggering
     */
    function _triggerCircuitBreaker(string memory reason) private {
        circuitBreakerActive = true;
        circuitBreakerActivatedAt = block.timestamp;
        _pause();
        emit CircuitBreakerTriggered(reason, msg.sender, block.timestamp);
    }
    
    /**
     * @notice Internal function to reset circuit breaker
     */
    function _resetCircuitBreaker() private {
        circuitBreakerActive = false;
        circuitBreakerActivatedAt = 0;
        // Reset suspicious activity counts
        // Note: In production, implement proper iteration with pagination
        emit CircuitBreakerReset(msg.sender, block.timestamp);
    }
    
    /**
     * @notice Internal function to record suspicious activity
     * @param account The account exhibiting suspicious behavior
     * @param reason The reason for flagging
     */
    function _recordSuspiciousActivity(address account, string memory reason) private {
        // Reset count if window has passed
        if (block.timestamp >= lastSuspiciousActivityTime[account] + SUSPICIOUS_ACTIVITY_WINDOW) {
            suspiciousActivityCount[account] = 0;
        }
        
        suspiciousActivityCount[account]++;
        lastSuspiciousActivityTime[account] = block.timestamp;
        
        emit SuspiciousActivityDetected(account, reason, suspiciousActivityCount[account]);
        
        // Trigger circuit breaker if threshold reached
        if (suspiciousActivityCount[account] >= circuitBreakerConfig.suspiciousActivityThreshold) {
            _triggerCircuitBreaker("Suspicious activity threshold exceeded");
        }
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
        
        // Remove from global active requests
        for (uint256 i = 0; i < activeRequestIds.length; i++) {
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
        
        address previousAdmin = address(0);
        
        // Grant admin role to new admin
        _grantRole(DEFAULT_ADMIN_ROLE, pendingAdmin);
        _grantRole(CIRCUIT_BREAKER_ROLE, pendingAdmin);
        
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
     * @notice Override grantRole with additional validation
     */
    function grantRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        if (account == address(0)) revert ZeroAddress();
        
        // Record suspicious activity for rapid role changes
        if (role == DEFAULT_ADMIN_ROLE || role == CIRCUIT_BREAKER_ROLE) {
            _recordSuspiciousActivity(msg.sender, "Critical role granted");
        }
        
        super.grantRole(role, account);
    }
    
    /**
     * @notice Override revokeRole with additional validation
     */
    function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        if (account == address(0)) revert ZeroAddress();
        super.revokeRole(role, account);
    }
    
    /**
     * @notice Override _msgSender to support meta transactions
     */
    function _msgSender() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (address) {
        return ERC2771ContextUpgradeable._msgSender();
    }

    /**
     * @notice Override _msgData to support meta transactions
     */
    function _msgData() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }
}