// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AuditableReimbursement.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/**
 * @title AuditedProjectReimbursement
 * @notice Project reimbursement contract with comprehensive audit logging
 * @dev Implements full audit trail for all payment requests and approvals
 */
contract AuditedProjectReimbursement is AuditableReimbursement, ERC2771Context, PausableUpgradeable {
    using SafeERC20 for IERC20;
    
    // Enhanced events for detailed audit trail
    event RequestCreatedAudit(
        uint256 indexed requestId,
        address indexed creator,
        uint256 totalAmount,
        uint256 receiversCount,
        uint256 timestamp,
        bytes32 requestHash,
        string description,
        bytes metadata
    );
    
    event ApprovalAudit(
        uint256 indexed requestId,
        address indexed approver,
        string approverRole,
        uint8 approvalStage,
        uint256 timestamp,
        bytes32 previousStateHash,
        bytes32 newStateHash,
        bytes metadata
    );
    
    event PaymentDistributedAudit(
        uint256 indexed requestId,
        address indexed receiver,
        uint256 amount,
        uint256 timestamp,
        bytes32 txHash,
        uint256 gasUsed,
        uint256 remainingTreasury
    );
    
    event RequestCancelledAudit(
        uint256 indexed requestId,
        address indexed cancelledBy,
        string cancellationReason,
        uint256 timestamp,
        uint256 refundedAmount,
        bytes32 finalStateHash
    );
    
    event TreasuryOperationAudit(
        string operation,
        address indexed executor,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp,
        string reason,
        uint256 newBalance
    );
    
    event AuditMetaTransaction(
        address indexed user,
        address indexed forwarder,
        string action,
        uint256 gasUsed,
        uint256 timestamp
    );
    
    event AuditStateChange(
        bytes32 indexed objectId,
        string objectType,
        bytes32 oldValue,
        bytes32 newValue,
        address indexed changedBy,
        uint256 timestamp,
        string reason
    );
    
    event AuditAccessControl(
        address indexed account,
        string action,
        bytes32 indexed role,
        address indexed performer,
        uint256 timestamp,
        bool success,
        string reason
    );
    
    event MetaTxAudit(
        address indexed user,
        address indexed relayer,
        bytes4 functionSelector,
        uint256 gasUsed,
        uint256 timestamp,
        bytes32 metaTxHash,
        bool success
    );
    
    // Role definitions
    bytes32 public constant SECRETARY_ROLE = keccak256("SECRETARY_ROLE");
    bytes32 public constant COMMITTEE_ROLE = keccak256("COMMITTEE_ROLE");
    bytes32 public constant FINANCE_ROLE = keccak256("FINANCE_ROLE");
    bytes32 public constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    // Gas optimization constants
    uint256 public constant MAX_RECEIVERS = 50;
    uint256 public constant MAX_ROLE_MEMBERS = 20;
    
    // Request status enum
    enum RequestStatus {
        Pending,
        AwaitingSecretary,
        AwaitingFirstCommittee,
        AwaitingFinance,
        AwaitingCommitteeApprovals,
        AwaitingDirector,
        Approved,
        Distributed,
        Cancelled
    }
    
    // Payment request structure
    struct PaymentRequest {
        uint256 id;
        address owner;
        address[] receivers;
        uint256[] amounts;
        uint256 totalAmount;
        string description;
        RequestStatus status;
        uint256 createdAt;
        uint256 completedAt;
        bytes32 dataHash;
    }
    
    // Approval tracking
    struct ApprovalStatus {
        bool secretaryApproved;
        address secretaryApprover;
        uint256 secretaryApprovedAt;
        
        bool firstCommitteeApproved;
        address firstCommitteeApprover;
        uint256 firstCommitteeApprovedAt;
        
        bool financeApproved;
        address financeApprover;
        uint256 financeApprovedAt;
        
        address[] committeeApprovers;
        uint256[] committeeApprovedAt;
        
        bool directorApproved;
        address directorApprover;
        uint256 directorApprovedAt;
    }
    
    // State variables
    IERC20 public omthbToken;
    address public factory;
    address public platformOwner;
    uint256 public projectId;
    
    mapping(uint256 => PaymentRequest) public requests;
    mapping(uint256 => ApprovalStatus) public approvals;
    uint256 public nextRequestId;
    uint256 public requiredCommitteeApprovals;
    
    // Audit-specific state
    mapping(uint256 => bytes32[]) public requestAuditTrail;
    mapping(address => uint256) public userActionCount;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    
    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}
    
    /**
     * @dev Initialize the project contract
     */
    function initialize(
        address _omthbToken,
        address _platformOwner,
        address _factory,
        uint256 _projectId
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        __Pausable_init();
        
        omthbToken = IERC20(_omthbToken);
        platformOwner = _platformOwner;
        factory = _factory;
        projectId = _projectId;
        requiredCommitteeApprovals = 3;
        
        // Setup roles
        _grantRole(DEFAULT_ADMIN_ROLE, _platformOwner);
        _grantRole(DEFAULT_ADMIN_ROLE, _factory);
        _grantRole(PAUSER_ROLE, _platformOwner);
        
        // Audit project initialization
        _auditProjectInitialization(_projectId, _omthbToken);
    }
    
    /**
     * @dev Setup initial roles (call after initialize to avoid stack too deep)
     */
    function setupRoles(
        address[] calldata _secretaries,
        address[] calldata _committees,
        address[] calldata _financeOfficers
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_secretaries.length <= MAX_ROLE_MEMBERS, "Too many secretaries");
        for (uint256 i = 0; i < _secretaries.length; i++) {
            _grantRole(SECRETARY_ROLE, _secretaries[i]);
            _auditAccessControl(_secretaries[i], "GRANT_ROLE", SECRETARY_ROLE, true, "Initial setup");
        }
        
        require(_committees.length <= MAX_ROLE_MEMBERS, "Too many committee members");
        for (uint256 i = 0; i < _committees.length; i++) {
            _grantRole(COMMITTEE_ROLE, _committees[i]);
            _auditAccessControl(_committees[i], "GRANT_ROLE", COMMITTEE_ROLE, true, "Initial setup");
        }
        
        require(_financeOfficers.length <= MAX_ROLE_MEMBERS, "Too many finance officers");
        for (uint256 i = 0; i < _financeOfficers.length; i++) {
            _grantRole(FINANCE_ROLE, _financeOfficers[i]);
            _auditAccessControl(_financeOfficers[i], "GRANT_ROLE", FINANCE_ROLE, true, "Initial setup");
        }
    }
    
    /**
     * @dev Create a payment request with full audit trail
     */
    function createRequest(
        address[] calldata receivers,
        uint256[] calldata amounts,
        string calldata description
    ) external nonReentrant whenNotPaused returns (uint256) {
        // Validation
        _validateRequestInputs(receivers, amounts, description);
        
        // Calculate total
        uint256 totalAmount = _calculateAndValidateTotal(receivers, amounts);
        
        // Create request
        uint256 requestId = _createPaymentRequest(receivers, amounts, totalAmount, description);
        
        // Emit audit event
        _emitRequestCreatedAudit(requestId, totalAmount, receivers.length, description);
        
        return requestId;
    }
    
    function _validateRequestInputs(
        address[] calldata receivers,
        uint256[] calldata amounts,
        string calldata description
    ) private view {
        require(receivers.length == amounts.length, "Length mismatch");
        require(receivers.length > 0 && receivers.length <= 50, "Invalid receivers count");
        require(bytes(description).length > 0 && bytes(description).length <= 500, "Invalid description");
        
        uint256 estimatedGas = receivers.length * 65000 + 150000;
        require(gasleft() > estimatedGas * 2, "Insufficient gas buffer");
    }
    
    function _calculateAndValidateTotal(
        address[] calldata receivers,
        uint256[] calldata amounts
    ) private view returns (uint256) {
        uint256 totalAmount = 0;
        uint256 length = receivers.length;
        
        for (uint256 i = 0; i < length; i++) {
            require(receivers[i] != address(0), "Invalid receiver");
            require(amounts[i] > 0 && amounts[i] <= 1000000 ether, "Invalid amount");
            totalAmount += amounts[i];
            
            for (uint256 j = 0; j < i; j++) {
                require(receivers[i] != receivers[j], "Duplicate receiver");
            }
        }
        
        require(totalAmount <= getTreasuryBalance(), "Insufficient treasury");
        require(totalAmount <= 10000000 ether, "Total exceeds maximum");
        
        return totalAmount;
    }
    
    function _createPaymentRequest(
        address[] calldata receivers,
        uint256[] calldata amounts,
        uint256 totalAmount,
        string calldata description
    ) private returns (uint256) {
        uint256 requestId = nextRequestId++;
        bytes32 requestHash = keccak256(abi.encode(
            requestId,
            _msgSender(),
            receivers,
            amounts,
            description,
            block.timestamp
        ));
        
        requests[requestId] = PaymentRequest({
            id: requestId,
            owner: _msgSender(),
            receivers: receivers,
            amounts: amounts,
            totalAmount: totalAmount,
            description: description,
            status: RequestStatus.AwaitingSecretary,
            createdAt: block.timestamp,
            completedAt: 0,
            dataHash: requestHash
        });
        
        requestAuditTrail[requestId].push(requestHash);
        userActionCount[_msgSender()]++;
        
        return requestId;
    }
    
    function _emitRequestCreatedAudit(
        uint256 requestId,
        uint256 totalAmount,
        uint256 receiversCount,
        string calldata description
    ) private {
        emit RequestCreatedAudit(
            requestId,
            _msgSender(),
            totalAmount,
            receiversCount,
            block.timestamp,
            requests[requestId].dataHash,
            description,
            ""
        );
        
        if (_msgSender() != msg.sender) {
            _auditMetaTransaction(gasleft(), "createRequest");
        }
    }
    
    /**
     * @dev Secretary approval with audit
     */
    function approveAsSecretary(uint256 requestId) 
        external 
        nonReentrant 
        onlyRole(SECRETARY_ROLE) 
    {
        uint256 gasBefore = gasleft();
        PaymentRequest storage request = requests[requestId];
        
        require(request.status == RequestStatus.AwaitingSecretary, "Invalid status");
        require(!hasApproved[requestId][_msgSender()], "Already approved");
        
        bytes32 stateBefore = _calculateRequestHash(request);
        
        // Update approval
        approvals[requestId].secretaryApproved = true;
        approvals[requestId].secretaryApprover = _msgSender();
        approvals[requestId].secretaryApprovedAt = block.timestamp;
        hasApproved[requestId][_msgSender()] = true;
        
        request.status = RequestStatus.AwaitingFirstCommittee;
        
        bytes32 stateAfter = _calculateRequestHash(request);
        requestAuditTrail[requestId].push(stateAfter);
        
        // Emit detailed approval audit
        emit ApprovalAudit(
            requestId,
            _msgSender(),
            "SECRETARY",
            1,
            block.timestamp,
            stateBefore,
            stateAfter,
            abi.encode(
                gasBefore - gasleft(),
                userActionCount[_msgSender()]++,
                _msgSender() != msg.sender // Meta-tx indicator
            )
        );
        
        if (_msgSender() != msg.sender) {
            _auditMetaTransaction(gasBefore, "approveAsSecretary");
        }
    }
    
    /**
     * @dev Director final approval with automatic distribution
     */
    function approveAsDirector(uint256 requestId) 
        external 
        nonReentrant 
        onlyRole(DIRECTOR_ROLE) 
    {
        uint256 gasBefore = gasleft();
        PaymentRequest storage request = requests[requestId];
        
        require(request.status == RequestStatus.AwaitingDirector, "Invalid status");
        require(!hasApproved[requestId][_msgSender()], "Already approved");
        
        bytes32 stateBefore = _calculateRequestHash(request);
        
        // Update approval
        approvals[requestId].directorApproved = true;
        approvals[requestId].directorApprover = _msgSender();
        approvals[requestId].directorApprovedAt = block.timestamp;
        hasApproved[requestId][_msgSender()] = true;
        
        request.status = RequestStatus.Approved;
        
        bytes32 stateAfter = _calculateRequestHash(request);
        requestAuditTrail[requestId].push(stateAfter);
        
        // Emit approval audit
        emit ApprovalAudit(
            requestId,
            _msgSender(),
            "DIRECTOR",
            5,
            block.timestamp,
            stateBefore,
            stateAfter,
            abi.encode(gasBefore - gasleft(), "FINAL_APPROVAL")
        );
        
        // Distribute payments
        _distributePayments(requestId);
        
        if (_msgSender() != msg.sender) {
            _auditMetaTransaction(gasBefore, "approveAsDirector");
        }
    }
    
    /**
     * @dev Distribute payments with individual audit entries
     */
    function _distributePayments(uint256 requestId) private {
        PaymentRequest storage request = requests[requestId];
        require(request.status == RequestStatus.Approved, "Not approved");
        
        uint256 initialBalance = getTreasuryBalance();
        
        // CRITICAL FIX: Update state BEFORE external calls (checks-effects-interactions)
        request.status = RequestStatus.Distributed;
        request.completedAt = block.timestamp;
        
        // Now perform the transfers
        for (uint256 i = 0; i < request.receivers.length; i++) {
            uint256 gasForTransfer = gasleft();
            
            // Transfer tokens
            omthbToken.safeTransfer(request.receivers[i], request.amounts[i]);
            
            uint256 gasUsed = gasForTransfer - gasleft();
            
            // Audit each payment
            emit PaymentDistributedAudit(
                requestId,
                request.receivers[i],
                request.amounts[i],
                block.timestamp,
                keccak256(abi.encode(requestId, i, request.receivers[i], request.amounts[i])),
                gasUsed,
                getTreasuryBalance()
            );
            
            // Financial transaction audit
            _auditFinancialTransaction(
                address(this),
                request.receivers[i],
                request.amounts[i],
                "REIMBURSEMENT_PAYMENT",
                bytes32(requestId),
                request.description
            );
        }
        
        // Final state audit
        _auditStateChange(
            bytes32(requestId),
            "PAYMENT_REQUEST",
            bytes32(uint256(RequestStatus.Approved)),
            bytes32(uint256(RequestStatus.Distributed)),
            "Payments distributed"
        );
        
        // Treasury balance audit
        emit TreasuryOperationAudit(
            "PAYMENT_DISTRIBUTION",
            _msgSender(),
            address(0),
            initialBalance - getTreasuryBalance(),
            block.timestamp,
            string(abi.encodePacked("Request #", uint2str(requestId))),
            getTreasuryBalance()
        );
    }
    
    /**
     * @dev Cancel request with audit
     */
    function cancelRequest(uint256 requestId) external nonReentrant {
        PaymentRequest storage request = requests[requestId];
        
        require(request.owner == _msgSender() || hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Unauthorized");
        require(request.status != RequestStatus.Distributed && request.status != RequestStatus.Cancelled, "Cannot cancel");
        
        bytes32 finalState = _calculateRequestHash(request);
        request.status = RequestStatus.Cancelled;
        request.completedAt = block.timestamp;
        
        emit RequestCancelledAudit(
            requestId,
            _msgSender(),
            "User requested cancellation",
            block.timestamp,
            0,
            finalState
        );
    }
    
    /**
     * @dev Audit meta-transaction execution
     */
    function _auditMetaTransaction(uint256 gasStart, string memory functionName) private {
        emit MetaTxAudit(
            _msgSender(),
            msg.sender,
            bytes4(keccak256(bytes(functionName))),
            gasStart - gasleft(),
            block.timestamp,
            keccak256(abi.encode(_msgSender(), msg.sender, functionName, block.timestamp)),
            true
        );
    }
    
    /**
     * @dev Calculate request hash for integrity
     */
    function _calculateRequestHash(PaymentRequest memory request) private pure returns (bytes32) {
        return keccak256(abi.encode(
            request.id,
            request.owner,
            request.totalAmount,
            request.status,
            request.createdAt,
            request.dataHash
        ));
    }
    
    /**
     * @dev Get treasury balance
     */
    function getTreasuryBalance() public view returns (uint256) {
        return omthbToken.balanceOf(address(this));
    }
    
    /**
     * @dev Override for state hash calculation
     */
    function _calculateCurrentStateHash() internal view override returns (bytes32) {
        return keccak256(abi.encode(
            nextRequestId,
            getTreasuryBalance(),
            block.timestamp
        ));
    }
    
    /**
     * @dev Override for entity hash calculation
     */
    function _calculateEntityHash(bytes32 entityId) internal view override returns (bytes32) {
        uint256 requestId = uint256(entityId);
        if (requestId < nextRequestId) {
            return _calculateRequestHash(requests[requestId]);
        }
        return bytes32(0);
    }
    
    /**
     * @dev Override for compliance checks
     */
    function _performComplianceCheck(
        string memory checkType,
        bytes memory evidence
    ) internal view override returns (bool) {
        if (keccak256(bytes(checkType)) == keccak256("TREASURY_BALANCE")) {
            uint256 minBalance = abi.decode(evidence, (uint256));
            return getTreasuryBalance() >= minBalance;
        }
        return true;
    }
    
    /**
     * @dev Override _msgSender for meta-transactions
     */
    function _msgSender() internal view override(ContextUpgradeable, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }
    
    /**
     * @dev Override _msgData for meta-transactions
     */
    function _msgData() internal view override(ContextUpgradeable, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
    
    /**
     * @dev Required override for UUPS
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {
        _auditStateChange(
            bytes32(projectId),
            "CONTRACT_UPGRADE",
            bytes32(uint256(uint160(address(this)))),
            bytes32(uint256(uint160(newImplementation))),
            "Contract upgraded"
        );
    }
    
    /**
     * @dev Override _contextSuffixLength for meta-transactions
     */
    function _contextSuffixLength() internal view override(ContextUpgradeable, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }

    /**
     * @dev Pause the contract (emergency stop)
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
        _auditStateChange(
            bytes32(projectId),
            "CONTRACT_PAUSE",
            bytes32(0),
            bytes32(uint256(1)),
            "Contract paused for emergency"
        );
    }
    
    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
        _auditStateChange(
            bytes32(projectId),
            "CONTRACT_UNPAUSE",
            bytes32(uint256(1)),
            bytes32(0),
            "Contract unpaused"
        );
    }
    
    /**
     * @dev Utility: Convert uint to string
     */
    function uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        while (_i != 0) {
            k = k-1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
    
    /**
     * @dev Helper function to audit project initialization
     */
    function _auditProjectInitialization(uint256 _projectId, address _omthbToken) private {
        bytes32 projectIdHash = bytes32(_projectId);
        bytes32 newStateHash = keccak256(abi.encode(_projectId, _omthbToken, block.timestamp));
        _auditStateChange(
            projectIdHash,
            "PROJECT",
            bytes32(0),
            newStateHash,
            "Project initialized"
        );
    }
    
}