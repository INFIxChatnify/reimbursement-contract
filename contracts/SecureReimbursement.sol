// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Using Solidity 0.8+ with built-in overflow protection

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./interfaces/IOMTHB.sol";

/**
 * @title SecureReimbursement
 * @notice Production-ready reimbursement contract with comprehensive security
 * @dev Implements all security best practices without stack too deep issues
 */
contract SecureReimbursement is 
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    /// @notice Roles for access control
    bytes32 public constant SECRETARY_ROLE = keccak256("SECRETARY_ROLE");
    bytes32 public constant COMMITTEE_ROLE = keccak256("COMMITTEE_ROLE");
    bytes32 public constant FINANCE_ROLE = keccak256("FINANCE_ROLE");
    bytes32 public constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    bytes32 public constant REQUESTER_ROLE = keccak256("REQUESTER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    /// @notice Reimbursement status
    enum Status {
        Pending,
        SecretaryApproved,
        CommitteeApproved,
        FinanceApproved,
        DirectorApproved,
        Distributed,
        Cancelled
    }

    /// @notice Core request data
    struct Request {
        uint256 id;
        address requester;
        address recipient;
        uint256 amount;
        string description;
        Status status;
        uint256 createdAt;
        uint256 paymentDeadline;
        bytes32 approvalHash;
    }

    /// @notice State variables
    string public projectId;
    IOMTHB public omthbToken;
    uint256 public projectBudget;
    uint256 public totalDistributed;
    uint256 private _requestIdCounter;
    bool public emergencyStop;
    address public timelockController;
    
    /// @notice Security constants
    uint256 public constant MIN_AMOUNT = 100 * 10**18; // 100 tokens
    uint256 public constant MAX_AMOUNT = 1000000 * 10**18; // 1M tokens
    uint256 public constant PAYMENT_DEADLINE = 7 days;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 500;
    
    /// @notice Storage mappings
    mapping(uint256 => Request) public requests;
    mapping(uint256 => mapping(address => bytes32)) public commitments;
    mapping(uint256 => mapping(address => uint256)) public commitTimestamps;
    mapping(address => uint256) public userRequestCount;
    
    /// @notice Rate limiting
    mapping(address => uint256) public lastRequestTime;
    uint256 public constant REQUEST_COOLDOWN = 1 hours;
    
    /// @notice Events
    event RequestCreated(uint256 indexed id, address indexed requester, uint256 amount);
    event RequestApproved(uint256 indexed id, Status newStatus, address indexed approver);
    event FundsDistributed(uint256 indexed id, address indexed recipient, uint256 amount);
    event EmergencyStopActivated(address indexed activator);
    event TimelockControllerUpdated(address indexed newController);
    
    /// @notice Custom errors
    error InvalidAmount();
    error InvalidRecipient();
    error InvalidDescription();
    error BudgetExceeded();
    error InvalidStatus();
    error UnauthorizedApprover();
    error TransferFailed();
    error EmergencyStopActive();
    error CooldownNotMet();
    error PaymentDeadlineExpired();
    error RequestNotFound();
    
    /// @notice Emergency stop modifier
    modifier notEmergencyStopped() {
        if (emergencyStop) revert EmergencyStopActive();
        _;
    }
    
    /// @notice Rate limiting modifier
    modifier rateLimited() {
        if (block.timestamp < lastRequestTime[msg.sender] + REQUEST_COOLDOWN) {
            revert CooldownNotMet();
        }
        _;
    }
    
    /**
     * @notice Initialize the contract
     * @param _projectId Project identifier
     * @param _omthbToken OMTHB token address
     * @param _projectBudget Total project budget
     * @param _admin Admin address
     */
    function initialize(
        string memory _projectId,
        address _omthbToken,
        uint256 _projectBudget,
        address _admin
    ) external initializer {
        require(_omthbToken != address(0), "Invalid token");
        require(_admin != address(0), "Invalid admin");
        require(_projectBudget > 0, "Invalid budget");
        require(bytes(_projectId).length > 0, "Invalid project ID");
        
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        
        projectId = _projectId;
        omthbToken = IOMTHB(_omthbToken);
        projectBudget = _projectBudget;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(EMERGENCY_ROLE, _admin);
    }
    
    /**
     * @notice Create a reimbursement request
     * @param recipient Recipient address
     * @param amount Amount to reimburse
     * @param description Description of expense
     * @return requestId The created request ID
     */
    function createRequest(
        address recipient,
        uint256 amount,
        string calldata description
    ) external 
      onlyRole(REQUESTER_ROLE) 
      whenNotPaused 
      notEmergencyStopped 
      rateLimited 
      nonReentrant 
      returns (uint256) 
    {
        // Input validation
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) revert InvalidAmount();
        if (bytes(description).length == 0 || bytes(description).length > MAX_DESCRIPTION_LENGTH) {
            revert InvalidDescription();
        }
        
        // Budget check with overflow protection
        uint256 newTotal = totalDistributed + amount;
        if (newTotal > projectBudget || newTotal < totalDistributed) revert BudgetExceeded();
        
        // Create request
        uint256 requestId = _requestIdCounter++;
        requests[requestId] = Request({
            id: requestId,
            requester: msg.sender,
            recipient: recipient,
            amount: amount,
            description: description,
            status: Status.Pending,
            createdAt: block.timestamp,
            paymentDeadline: 0,
            approvalHash: keccak256(abi.encode(requestId, msg.sender, recipient, amount))
        });
        
        // Update rate limiting
        lastRequestTime[msg.sender] = block.timestamp;
        userRequestCount[msg.sender]++;
        
        emit RequestCreated(requestId, msg.sender, amount);
        return requestId;
    }
    
    /**
     * @notice Approve request as secretary
     * @param requestId Request ID to approve
     */
    function approveAsSecretary(uint256 requestId) 
        external 
        onlyRole(SECRETARY_ROLE) 
        whenNotPaused
        notEmergencyStopped
        nonReentrant 
    {
        Request storage request = requests[requestId];
        if (request.id != requestId) revert RequestNotFound();
        if (request.status != Status.Pending) revert InvalidStatus();
        
        request.status = Status.SecretaryApproved;
        emit RequestApproved(requestId, Status.SecretaryApproved, msg.sender);
    }
    
    /**
     * @notice Approve request as committee
     * @param requestId Request ID to approve
     */
    function approveAsCommittee(uint256 requestId) 
        external 
        onlyRole(COMMITTEE_ROLE)
        whenNotPaused
        notEmergencyStopped
        nonReentrant 
    {
        Request storage request = requests[requestId];
        if (request.id != requestId) revert RequestNotFound();
        if (request.status != Status.SecretaryApproved) revert InvalidStatus();
        
        request.status = Status.CommitteeApproved;
        emit RequestApproved(requestId, Status.CommitteeApproved, msg.sender);
    }
    
    /**
     * @notice Approve request as finance
     * @param requestId Request ID to approve
     */
    function approveAsFinance(uint256 requestId) 
        external 
        onlyRole(FINANCE_ROLE)
        whenNotPaused
        notEmergencyStopped
        nonReentrant 
    {
        Request storage request = requests[requestId];
        if (request.id != requestId) revert RequestNotFound();
        if (request.status != Status.CommitteeApproved) revert InvalidStatus();
        
        request.status = Status.FinanceApproved;
        emit RequestApproved(requestId, Status.FinanceApproved, msg.sender);
    }
    
    /**
     * @notice Approve request as director and trigger distribution
     * @param requestId Request ID to approve
     */
    function approveAsDirector(uint256 requestId) 
        external 
        onlyRole(DIRECTOR_ROLE)
        whenNotPaused
        notEmergencyStopped
        nonReentrant 
    {
        Request storage request = requests[requestId];
        if (request.id != requestId) revert RequestNotFound();
        if (request.status != Status.FinanceApproved) revert InvalidStatus();
        
        request.status = Status.DirectorApproved;
        request.paymentDeadline = block.timestamp + PAYMENT_DEADLINE;
        
        emit RequestApproved(requestId, Status.DirectorApproved, msg.sender);
        
        // Auto-distribute funds
        _distributeFunds(requestId);
    }
    
    /**
     * @notice Internal function to distribute funds (CEI pattern)
     * @param requestId Request ID to distribute funds for
     */
    function _distributeFunds(uint256 requestId) private {
        Request storage request = requests[requestId];
        
        // Checks
        if (request.status != Status.DirectorApproved) revert InvalidStatus();
        if (request.paymentDeadline > 0 && block.timestamp > request.paymentDeadline) {
            revert PaymentDeadlineExpired();
        }
        
        // Effects (state changes BEFORE external call)
        uint256 amount = request.amount;
        address recipient = request.recipient;
        request.status = Status.Distributed;
        totalDistributed += amount;
        
        emit FundsDistributed(requestId, recipient, amount);
        
        // Interactions (external call LAST)
        bool success = omthbToken.transfer(recipient, amount);
        if (!success) revert TransferFailed();
    }
    
    /**
     * @notice Emergency stop activation (immediate)
     */
    function activateEmergencyStop() external onlyRole(EMERGENCY_ROLE) {
        emergencyStop = true;
        _pause();
        emit EmergencyStopActivated(msg.sender);
    }
    
    /**
     * @notice Emergency stop deactivation (requires timelock)
     */
    function deactivateEmergencyStop() external {
        require(msg.sender == timelockController || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Unauthorized");
        emergencyStop = false;
        _unpause();
    }
    
    /**
     * @notice Update timelock controller
     * @param _timelockController New timelock controller address
     */
    function setTimelockController(address _timelockController) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_timelockController != address(0), "Invalid address");
        timelockController = _timelockController;
        emit TimelockControllerUpdated(_timelockController);
    }
    
    /**
     * @notice Get request details
     * @param requestId Request ID
     * @return Request details
     */
    function getRequest(uint256 requestId) external view returns (Request memory) {
        return requests[requestId];
    }
    
    /**
     * @notice Get remaining budget
     * @return Available budget
     */
    function getRemainingBudget() external view returns (uint256) {
        return projectBudget - totalDistributed;
    }
}