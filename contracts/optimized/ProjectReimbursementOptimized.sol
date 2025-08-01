// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "../interfaces/IOMTHB.sol";
import "../libraries/ReimbursementLib.sol";
import "../libraries/RoleManagementLib.sol";

/**
 * @title ProjectReimbursementOptimized
 * @notice Optimized reimbursement contract with reduced bytecode size
 * @dev Uses libraries to extract logic and minimize contract size
 */
contract ProjectReimbursementOptimized is 
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using ReimbursementLib for *;
    using RoleManagementLib for *;
    
    // Constants
    uint256 constant MAX_RECIPIENTS = 10;
    uint256 constant MIN_DEPOSIT = 10e18;
    uint256 constant MAX_LOCKED_PCT = 80;
    uint256 constant STALE_TIMEOUT = 30 days;
    uint256 constant REVEAL_WINDOW = 30 minutes;
    uint256 constant PAYMENT_DEADLINE = 7 days;
    uint256 constant REQ_COMMITTEE_APPROVERS = 3;
    uint256 constant REQ_CLOSURE_APPROVERS = 3;
    
    // Enums
    enum Status { Pending, SecApproved, ComApproved, FinApproved, DirApproved, Distributed, Cancelled }
    enum ClosureStatus { None, Initiated, PartialApproved, FullyApproved, Executed, Cancelled }
    
    // Core structs
    struct Request {
        uint256 id;
        address requester;
        address[] recipients;
        uint256[] amounts;
        uint256 totalAmount;
        string description;
        string documentHash;
        Status status;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 paymentDeadline;
        address virtualPayer;
        address[5] approvers; // [sec, com, fin, dir, unused]
        address[] comAdditional;
    }
    
    struct Closure {
        uint256 id;
        address initiator;
        address returnAddress;
        string reason;
        ClosureStatus status;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 executionDeadline;
        uint256 remainingBalance;
        address[] comApprovers;
        address dirApprover;
    }
    
    // State variables
    string public projectId;
    address public projectFactory;
    IOMTHB public omthbToken;
    uint256 public projectBudget;
    uint256 public totalDistributed;
    uint256 public totalLockedAmount;
    
    uint256 private _requestIdCounter;
    uint256 private _closureIdCounter;
    uint256 public activeClosureId;
    
    mapping(uint256 => Request) public requests;
    mapping(uint256 => Closure) public closures;
    mapping(uint256 => uint256) public lockedAmounts;
    mapping(uint256 => uint256) public approvalTimestamps;
    
    // Commit-reveal mappings
    mapping(uint256 => mapping(address => bytes32)) public approvalCommits;
    mapping(uint256 => mapping(address => uint256)) public commitTimes;
    mapping(uint256 => mapping(address => bytes32)) public closureCommits;
    mapping(uint256 => mapping(address => uint256)) public closureCommitTimes;
    
    // Events (shortened names)
    event ReqCreated(uint256 indexed id, address indexed requester, uint256 amount);
    event ReqApproved(uint256 indexed id, Status status, address approver);
    event ReqCancelled(uint256 indexed id, address canceller);
    event FundsDistributed(uint256 indexed id, uint256 amount);
    event BudgetUpdated(uint256 oldBudget, uint256 newBudget);
    event Deposited(address depositor, uint256 amount);
    event ClosureInit(uint256 indexed id, address initiator);
    event ClosureApproved(uint256 indexed id, address approver);
    event ClosureExecuted(uint256 indexed id, uint256 amount);
    
    // Modifiers
    modifier onlyFactory() {
        require(msg.sender == projectFactory, "E07");
        _;
    }
    
    /**
     * @notice Initialize the contract
     */
    function initialize(
        string memory _projectId,
        address _omthbToken,
        uint256 _projectBudget,
        address _admin
    ) external initializer {
        require(_omthbToken != address(0) && _admin != address(0), "E14");
        require(_projectBudget == 0 || _projectBudget > 0, "E01"); // Allow 0 budget
        require(bytes(_projectId).length > 0, "E12");
        
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        
        projectId = _projectId;
        projectFactory = msg.sender;
        omthbToken = IOMTHB(_omthbToken);
        projectBudget = _projectBudget;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }
    
    /**
     * @notice Create reimbursement request
     */
    function createRequest(
        address[] calldata recipients,
        uint256[] calldata amounts,
        string calldata description,
        string calldata documentHash,
        address virtualPayer
    ) external onlyRole(RoleManagementLib.REQUESTER_ROLE) whenNotPaused nonReentrant returns (uint256) {
        uint256 totalAmount = ReimbursementLib.validateRequest(recipients, amounts, description, documentHash);
        
        ReimbursementLib.validateAvailableFunds(
            omthbToken.balanceOf(address(this)),
            totalLockedAmount,
            totalAmount,
            projectBudget,
            totalDistributed
        );
        
        uint256 id = _requestIdCounter++;
        Request storage req = requests[id];
        req.id = id;
        req.requester = msg.sender;
        req.recipients = recipients;
        req.amounts = amounts;
        req.totalAmount = totalAmount;
        req.description = description;
        req.documentHash = documentHash;
        req.status = Status.Pending;
        req.createdAt = block.timestamp;
        req.updatedAt = block.timestamp;
        req.virtualPayer = virtualPayer;
        
        emit ReqCreated(id, msg.sender, totalAmount);
        return id;
    }
    
    /**
     * @notice Commit approval
     */
    function commitApproval(uint256 requestId, bytes32 commitment) external whenNotPaused nonReentrant {
        Request storage req = requests[requestId];
        require(req.id == requestId && req.status != Status.Cancelled, "E04");
        require(req.status != Status.Distributed, "E03");
        
        // Validate role based on status
        if (req.status == Status.Pending) require(hasRole(RoleManagementLib.SECRETARY_ROLE, msg.sender), "E07");
        else if (req.status == Status.SecApproved) require(hasRole(RoleManagementLib.COMMITTEE_ROLE, msg.sender), "E07");
        else if (req.status == Status.ComApproved) require(hasRole(RoleManagementLib.FINANCE_ROLE, msg.sender), "E07");
        else if (req.status == Status.FinApproved) {
            if (req.comAdditional.length < REQ_COMMITTEE_APPROVERS) {
                require(hasRole(RoleManagementLib.COMMITTEE_ROLE, msg.sender), "E07");
            } else {
                require(hasRole(RoleManagementLib.DIRECTOR_ROLE, msg.sender), "E07");
            }
        }
        
        approvalCommits[requestId][msg.sender] = commitment;
        commitTimes[requestId][msg.sender] = block.timestamp;
    }
    
    /**
     * @notice Approve with reveal
     */
    function approveWithReveal(uint256 requestId, uint256 nonce) external whenNotPaused nonReentrant {
        bytes32 commitment = approvalCommits[requestId][msg.sender];
        ReimbursementLib.validateRevealTiming(commitTimes[requestId][msg.sender], REVEAL_WINDOW);
        
        bytes32 revealHash = ReimbursementLib.generateCommitment(msg.sender, requestId, block.chainid, nonce);
        RoleManagementLib.validateCommitReveal(commitment, revealHash, commitTimes[requestId][msg.sender], REVEAL_WINDOW);
        
        Request storage req = requests[requestId];
        require(req.id == requestId && req.status != Status.Cancelled, "E04");
        
        // Process approval based on current status
        if (req.status == Status.Pending && hasRole(RoleManagementLib.SECRETARY_ROLE, msg.sender)) {
            req.approvers[0] = msg.sender;
            req.status = Status.SecApproved;
        } else if (req.status == Status.SecApproved && hasRole(RoleManagementLib.COMMITTEE_ROLE, msg.sender)) {
            req.approvers[1] = msg.sender;
            req.status = Status.ComApproved;
        } else if (req.status == Status.ComApproved && hasRole(RoleManagementLib.FINANCE_ROLE, msg.sender)) {
            req.approvers[2] = msg.sender;
            req.status = Status.FinApproved;
        } else if (req.status == Status.FinApproved) {
            if (hasRole(RoleManagementLib.COMMITTEE_ROLE, msg.sender) && req.comAdditional.length < REQ_COMMITTEE_APPROVERS) {
                // Check not duplicate
                require(req.approvers[1] != msg.sender, "E06");
                for (uint256 i = 0; i < req.comAdditional.length; i++) {
                    require(req.comAdditional[i] != msg.sender, "E06");
                }
                req.comAdditional.push(msg.sender);
            } else if (hasRole(RoleManagementLib.DIRECTOR_ROLE, msg.sender) && req.comAdditional.length >= REQ_COMMITTEE_APPROVERS) {
                req.approvers[3] = msg.sender;
                req.status = Status.DirApproved;
                req.paymentDeadline = block.timestamp + PAYMENT_DEADLINE;
                
                // Lock funds
                lockedAmounts[requestId] = req.totalAmount;
                totalLockedAmount += req.totalAmount;
                approvalTimestamps[requestId] = block.timestamp;
                
                // Auto-distribute
                _distributeFunds(requestId);
                return;
            } else {
                revert("E07");
            }
        } else {
            revert("E03");
        }
        
        req.updatedAt = block.timestamp;
        delete approvalCommits[requestId][msg.sender];
        delete commitTimes[requestId][msg.sender];
        
        emit ReqApproved(requestId, req.status, msg.sender);
    }
    
    /**
     * @notice Cancel request
     */
    function cancelRequest(uint256 requestId) external whenNotPaused nonReentrant {
        Request storage req = requests[requestId];
        require(req.id == requestId, "E04");
        require(msg.sender == req.requester || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E07");
        require(req.status != Status.Distributed, "E03");
        
        req.status = Status.Cancelled;
        req.updatedAt = block.timestamp;
        
        // Unlock funds if locked
        if (lockedAmounts[requestId] > 0) {
            totalLockedAmount -= lockedAmounts[requestId];
            lockedAmounts[requestId] = 0;
        }
        
        emit ReqCancelled(requestId, msg.sender);
    }
    
    /**
     * @notice Deposit OMTHB tokens
     */
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount >= MIN_DEPOSIT, "E01");
        require(omthbToken.transferFrom(msg.sender, address(this), amount), "E08");
        
        projectBudget += amount;
        emit Deposited(msg.sender, amount);
        emit BudgetUpdated(projectBudget - amount, projectBudget);
    }
    
    /**
     * @notice Unlock stale request
     */
    function unlockStale(uint256 requestId) external whenNotPaused nonReentrant {
        Request storage req = requests[requestId];
        require(req.id == requestId && req.status == Status.DirApproved, "E03");
        require(block.timestamp >= approvalTimestamps[requestId] + STALE_TIMEOUT, "E03");
        
        req.status = Status.Cancelled;
        req.updatedAt = block.timestamp;
        
        totalLockedAmount -= lockedAmounts[requestId];
        lockedAmounts[requestId] = 0;
        
        emit ReqCancelled(requestId, msg.sender);
    }
    
    /**
     * @notice Initiate emergency closure
     */
    function initClosure(address returnAddress, string calldata reason) external whenNotPaused returns (uint256) {
        require(hasRole(RoleManagementLib.COMMITTEE_ROLE, msg.sender) || hasRole(RoleManagementLib.DIRECTOR_ROLE, msg.sender), "E07");
        require(returnAddress != address(0), "E14");
        require(bytes(reason).length > 0 && bytes(reason).length <= 1000, "E12");
        require(activeClosureId == 0 || closures[activeClosureId].status >= ClosureStatus.Executed, "E03");
        
        uint256 id = _closureIdCounter++;
        Closure storage closure = closures[id];
        closure.id = id;
        closure.initiator = msg.sender;
        closure.returnAddress = returnAddress;
        closure.reason = reason;
        closure.status = ClosureStatus.Initiated;
        closure.createdAt = block.timestamp;
        closure.updatedAt = block.timestamp;
        
        activeClosureId = id;
        emit ClosureInit(id, msg.sender);
        return id;
    }
    
    /**
     * @notice Commit closure approval
     */
    function commitClosure(uint256 closureId, bytes32 commitment) external whenNotPaused nonReentrant {
        Closure storage closure = closures[closureId];
        require(closure.id == closureId && closure.status <= ClosureStatus.FullyApproved, "E03");
        require(hasRole(RoleManagementLib.COMMITTEE_ROLE, msg.sender) || hasRole(RoleManagementLib.DIRECTOR_ROLE, msg.sender), "E07");
        
        if (hasRole(RoleManagementLib.DIRECTOR_ROLE, msg.sender)) {
            require(closure.comApprovers.length >= REQ_CLOSURE_APPROVERS, "E03");
        }
        
        closureCommits[closureId][msg.sender] = commitment;
        closureCommitTimes[closureId][msg.sender] = block.timestamp;
    }
    
    /**
     * @notice Approve closure with reveal
     */
    function approveClosure(uint256 closureId, uint256 nonce) external whenNotPaused nonReentrant {
        bytes32 commitment = closureCommits[closureId][msg.sender];
        ReimbursementLib.validateRevealTiming(closureCommitTimes[closureId][msg.sender], REVEAL_WINDOW);
        
        bytes32 revealHash = ReimbursementLib.generateCommitment(msg.sender, closureId, block.chainid, nonce);
        RoleManagementLib.validateCommitReveal(commitment, revealHash, closureCommitTimes[closureId][msg.sender], REVEAL_WINDOW);
        
        Closure storage closure = closures[closureId];
        require(closure.id == closureId && closure.status <= ClosureStatus.FullyApproved, "E03");
        
        if (hasRole(RoleManagementLib.COMMITTEE_ROLE, msg.sender) && closure.comApprovers.length < REQ_CLOSURE_APPROVERS) {
            // Check not duplicate
            for (uint256 i = 0; i < closure.comApprovers.length; i++) {
                require(closure.comApprovers[i] != msg.sender, "E06");
            }
            closure.comApprovers.push(msg.sender);
            
            if (closure.comApprovers.length >= REQ_CLOSURE_APPROVERS) {
                closure.status = ClosureStatus.PartialApproved;
            }
        } else if (hasRole(RoleManagementLib.DIRECTOR_ROLE, msg.sender) && closure.comApprovers.length >= REQ_CLOSURE_APPROVERS) {
            require(closure.dirApprover == address(0), "E06");
            closure.dirApprover = msg.sender;
            closure.status = ClosureStatus.FullyApproved;
            closure.executionDeadline = block.timestamp + PAYMENT_DEADLINE;
            
            // Execute closure
            _executeClosure(closureId);
            return;
        } else {
            revert("E07");
        }
        
        closure.updatedAt = block.timestamp;
        delete closureCommits[closureId][msg.sender];
        delete closureCommitTimes[closureId][msg.sender];
        
        emit ClosureApproved(closureId, msg.sender);
    }
    
    /**
     * @notice Internal: Distribute funds
     */
    function _distributeFunds(uint256 requestId) private {
        Request storage req = requests[requestId];
        require(req.paymentDeadline == 0 || block.timestamp <= req.paymentDeadline, "E03");
        
        req.status = Status.Distributed;
        req.updatedAt = block.timestamp;
        totalDistributed += req.totalAmount;
        
        // Unlock funds
        totalLockedAmount -= lockedAmounts[requestId];
        lockedAmounts[requestId] = 0;
        
        // Transfer to recipients
        for (uint256 i = 0; i < req.recipients.length; i++) {
            require(omthbToken.transfer(req.recipients[i], req.amounts[i]), "E08");
        }
        
        emit FundsDistributed(requestId, req.totalAmount);
    }
    
    /**
     * @notice Internal: Execute closure
     */
    function _executeClosure(uint256 closureId) private {
        Closure storage closure = closures[closureId];
        require(closure.executionDeadline == 0 || block.timestamp <= closure.executionDeadline, "E03");
        
        uint256 balance = omthbToken.balanceOf(address(this));
        closure.status = ClosureStatus.Executed;
        closure.updatedAt = block.timestamp;
        closure.remainingBalance = balance;
        activeClosureId = 0;
        
        _pause();
        
        if (balance > 0) {
            require(omthbToken.transfer(closure.returnAddress, balance), "E08");
        }
        
        emit ClosureExecuted(closureId, balance);
    }
    
    /**
     * @notice Grant role directly (factory only)
     */
    function grantRoleDirect(bytes32 role, address account) external onlyFactory {
        require(account != address(0), "E14");
        _grantRole(role, account);
    }
    
    /**
     * @notice Override grantRole to prevent direct use
     */
    function grantRole(bytes32, address) public pure override {
        revert("Use commit-reveal");
    }
    
    /**
     * @notice Override revokeRole to prevent direct use
     */
    function revokeRole(bytes32, address) public pure override {
        revert("Use commit-reveal");
    }
}