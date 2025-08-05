// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "../interfaces/IOMTHB.sol";

/**
 * @title SecureProjectReimbursement
 * @notice Enhanced security version with audit fixes
 */
contract SecureProjectReimbursement is AccessControl, ReentrancyGuard, Pausable {
    // Roles
    bytes32 public constant SECRETARY_ROLE = keccak256("SECRETARY_ROLE");
    bytes32 public constant COMMITTEE_ROLE = keccak256("COMMITTEE_ROLE");
    bytes32 public constant FINANCE_ROLE = keccak256("FINANCE_ROLE");
    bytes32 public constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    
    // Request status
    enum RequestStatus {
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
        address requester;
        address[] recipients;
        uint256[] amounts;
        uint256 totalAmount;
        string description;
        RequestStatus status;
        uint256 createdAt;
    }
    
    // State variables
    IOMTHB public omthbToken;
    string public projectId;
    uint256 public projectBudget;
    uint256 public totalDistributed;
    bool private initialized;
    
    // Requests
    mapping(uint256 => Request) public requests;
    uint256 public requestCounter;
    
    // Events
    event RequestCreated(uint256 indexed requestId, address indexed requester);
    event RequestApproved(uint256 indexed requestId, uint8 level, address indexed approver);
    event TokensDistributed(uint256 indexed requestId, uint256 totalAmount);
    event RequestCancelled(uint256 indexed requestId);
    event EmergencyWithdraw(address indexed to, uint256 amount);
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @notice Initialize the project with security checks
     */
    function initialize(
        string memory _projectId,
        uint256 _projectBudget,
        address _omthbToken,
        address _admin
    ) external {
        require(!initialized, "Already initialized");
        require(bytes(_projectId).length > 0, "Invalid project ID");
        require(_projectBudget > 0, "Invalid budget");
        require(_omthbToken != address(0), "Invalid token address");
        require(_omthbToken.code.length > 0, "Token not a contract");
        require(_admin != address(0), "Invalid admin");
        
        initialized = true;
        projectId = _projectId;
        projectBudget = _projectBudget;
        omthbToken = IOMTHB(_omthbToken);
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(SECRETARY_ROLE, _admin);
        _grantRole(DISTRIBUTOR_ROLE, _admin);
    }
    
    /**
     * @notice Create multi-recipient reimbursement request
     */
    function createRequestMultiple(
        address[] calldata recipients,
        uint256[] calldata amounts,
        string calldata description,
        string calldata receiptHash
    ) external onlyRole(SECRETARY_ROLE) whenNotPaused returns (uint256) {
        require(recipients.length == amounts.length, "Length mismatch");
        require(recipients.length > 0 && recipients.length <= 100, "Invalid recipients count");
        
        uint256 total = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient");
            require(amounts[i] > 0, "Invalid amount");
            total += amounts[i];
        }
        
        require(totalDistributed + total <= projectBudget, "Exceeds budget");
        
        uint256 requestId = requestCounter++;
        requests[requestId] = Request({
            requester: msg.sender,
            recipients: recipients,
            amounts: amounts,
            totalAmount: total,
            description: description,
            status: RequestStatus.Pending,
            createdAt: block.timestamp
        });
        
        emit RequestCreated(requestId, msg.sender);
        return requestId;
    }
    
    /**
     * @notice Secretary approval
     */
    function approveBySecretary(uint256 requestId) external onlyRole(SECRETARY_ROLE) whenNotPaused {
        Request storage request = requests[requestId];
        require(request.status == RequestStatus.Pending, "Invalid status");
        
        request.status = RequestStatus.SecretaryApproved;
        emit RequestApproved(requestId, 1, msg.sender);
    }
    
    /**
     * @notice Committee approval  
     */
    function approveByCommittee(uint256 requestId) external onlyRole(COMMITTEE_ROLE) whenNotPaused {
        Request storage request = requests[requestId];
        require(request.status == RequestStatus.SecretaryApproved, "Invalid status");
        
        request.status = RequestStatus.CommitteeApproved;
        emit RequestApproved(requestId, 2, msg.sender);
    }
    
    /**
     * @notice Finance approval
     */
    function approveByFinance(uint256 requestId) external onlyRole(FINANCE_ROLE) whenNotPaused {
        Request storage request = requests[requestId];
        require(request.status == RequestStatus.CommitteeApproved, "Invalid status");
        
        request.status = RequestStatus.FinanceApproved;
        emit RequestApproved(requestId, 3, msg.sender);
    }
    
    /**
     * @notice Director approval
     */
    function approveByDirector(uint256 requestId) external onlyRole(DIRECTOR_ROLE) whenNotPaused {
        Request storage request = requests[requestId];
        require(request.status == RequestStatus.FinanceApproved, "Invalid status");
        
        request.status = RequestStatus.DirectorApproved;
        emit RequestApproved(requestId, 4, msg.sender);
    }
    
    /**
     * @notice Distribute tokens with enhanced security
     */
    function distribute(uint256 requestId) external nonReentrant onlyRole(DISTRIBUTOR_ROLE) whenNotPaused {
        Request storage request = requests[requestId];
        require(request.status == RequestStatus.DirectorApproved, "Not approved");
        
        // Check contract balance
        uint256 contractBalance = omthbToken.balanceOf(address(this));
        require(contractBalance >= request.totalAmount, "Insufficient balance");
        
        request.status = RequestStatus.Distributed;
        totalDistributed += request.totalAmount;
        
        // Transfer tokens to recipients
        for (uint256 i = 0; i < request.recipients.length; i++) {
            require(
                omthbToken.transfer(request.recipients[i], request.amounts[i]),
                "Transfer failed"
            );
        }
        
        emit TokensDistributed(requestId, request.totalAmount);
    }
    
    /**
     * @notice Cancel request
     */
    function cancelRequest(uint256 requestId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Request storage request = requests[requestId];
        require(request.status != RequestStatus.Distributed, "Already distributed");
        require(request.status != RequestStatus.Cancelled, "Already cancelled");
        
        request.status = RequestStatus.Cancelled;
        emit RequestCancelled(requestId);
    }
    
    /**
     * @notice Emergency pause
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @notice Unpause
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @notice Emergency withdraw
     */
    function emergencyWithdraw(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "Invalid address");
        uint256 balance = omthbToken.balanceOf(address(this));
        require(balance > 0, "No balance");
        
        require(omthbToken.transfer(to, balance), "Transfer failed");
        emit EmergencyWithdraw(to, balance);
    }
    
    /**
     * @notice Get request details
     */
    function getRequest(uint256 requestId) external view returns (Request memory) {
        return requests[requestId];
    }
    
    /**
     * @notice Get project balance
     */
    function getProjectBalance() external view returns (uint256) {
        return omthbToken.balanceOf(address(this));
    }
}
