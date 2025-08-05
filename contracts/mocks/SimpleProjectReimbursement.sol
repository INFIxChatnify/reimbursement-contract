// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IOMTHB.sol";

/**
 * @title SimpleProjectReimbursement
 * @notice Simplified version for testing approval flow on OMChain
 */
contract SimpleProjectReimbursement is AccessControl, ReentrancyGuard {
    // Roles
    bytes32 public constant SECRETARY_ROLE = keccak256("SECRETARY_ROLE");
    bytes32 public constant COMMITTEE_ROLE = keccak256("COMMITTEE_ROLE");
    bytes32 public constant FINANCE_ROLE = keccak256("FINANCE_ROLE");
    bytes32 public constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    
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
    
    // Requests
    mapping(uint256 => Request) public requests;
    uint256 public requestCounter;
    
    // Events
    event RequestCreated(uint256 indexed requestId, address indexed requester);
    event RequestApproved(uint256 indexed requestId, uint8 level, address indexed approver);
    event TokensDistributed(uint256 indexed requestId, uint256 totalAmount);
    event RequestCancelled(uint256 indexed requestId);
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @notice Initialize the project
     */
    function initialize(
        string memory _projectId,
        uint256 _projectBudget,
        address _omthbToken,
        address _admin
    ) external {
        require(bytes(projectId).length == 0, "Already initialized");
        
        projectId = _projectId;
        projectBudget = _projectBudget;
        omthbToken = IOMTHB(_omthbToken);
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(SECRETARY_ROLE, _admin);
    }
    
    /**
     * @notice Create multi-recipient reimbursement request
     */
    function createRequestMultiple(
        address[] calldata recipients,
        uint256[] calldata amounts,
        string calldata description,
        string calldata
    ) external onlyRole(SECRETARY_ROLE) returns (uint256) {
        require(recipients.length == amounts.length, "Length mismatch");
        require(recipients.length > 0, "No recipients");
        
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
    function approveBySecretary(uint256 requestId) external onlyRole(SECRETARY_ROLE) {
        Request storage request = requests[requestId];
        require(request.status == RequestStatus.Pending, "Invalid status");
        
        request.status = RequestStatus.SecretaryApproved;
        emit RequestApproved(requestId, 1, msg.sender);
    }
    
    /**
     * @notice Committee approval  
     */
    function approveByCommittee(uint256 requestId) external onlyRole(COMMITTEE_ROLE) {
        Request storage request = requests[requestId];
        require(request.status == RequestStatus.SecretaryApproved, "Invalid status");
        
        request.status = RequestStatus.CommitteeApproved;
        emit RequestApproved(requestId, 2, msg.sender);
    }
    
    /**
     * @notice Finance approval
     */
    function approveByFinance(uint256 requestId) external onlyRole(FINANCE_ROLE) {
        Request storage request = requests[requestId];
        require(request.status == RequestStatus.CommitteeApproved, "Invalid status");
        
        request.status = RequestStatus.FinanceApproved;
        emit RequestApproved(requestId, 3, msg.sender);
    }
    
    /**
     * @notice Director approval
     */
    function approveByDirector(uint256 requestId) external onlyRole(DIRECTOR_ROLE) {
        Request storage request = requests[requestId];
        require(request.status == RequestStatus.FinanceApproved, "Invalid status");
        
        request.status = RequestStatus.DirectorApproved;
        emit RequestApproved(requestId, 4, msg.sender);
    }
    
    /**
     * @notice Distribute tokens to recipients
     */
    function distribute(uint256 requestId) external nonReentrant {
        Request storage request = requests[requestId];
        require(request.status == RequestStatus.DirectorApproved, "Not approved");
        
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
