// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IOMTHB.sol";

/**
 * @title OMTHBMultiSig
 * @notice Multi-signature wrapper for critical OMTHB token operations
 * @dev Implements time-locked multi-sig for mint, burn, pause, and blacklist operations
 */
contract OMTHBMultiSig is AccessControl {
    /// @notice Role for signers
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");
    
    /// @notice Operation types
    enum OperationType {
        MINT,
        BURN,
        BURN_FROM,
        PAUSE,
        UNPAUSE,
        BLACKLIST,
        UN_BLACKLIST
    }
    
    /// @notice Operation proposal structure
    struct Operation {
        OperationType opType;
        address target;
        uint256 amount;
        uint256 proposedAt;
        uint256 executedAt;
        address proposer;
        bool executed;
        mapping(address => bool) approvals;
        uint256 approvalCount;
    }
    
    /// @notice Constants
    uint256 public constant REQUIRED_APPROVALS = 3;
    uint256 public constant OPERATION_DELAY = 24 hours;
    uint256 public constant OPERATION_EXPIRY = 72 hours;
    
    /// @notice State variables
    IOMTHB public immutable omthbToken;
    mapping(uint256 => Operation) public operations;
    uint256 public nextOperationId;
    
    /// @notice Events
    event OperationProposed(
        uint256 indexed operationId,
        OperationType opType,
        address indexed target,
        uint256 amount,
        address proposer
    );
    
    event OperationApproved(
        uint256 indexed operationId,
        address indexed approver,
        uint256 approvalCount
    );
    
    event OperationExecuted(
        uint256 indexed operationId,
        address indexed executor
    );
    
    event OperationCancelled(
        uint256 indexed operationId,
        address indexed canceller
    );
    
    /// @notice Custom errors
    error InvalidOperation();
    error OperationNotReady();
    error OperationExpired();
    error AlreadyApproved();
    error InsufficientApprovals();
    error OperationAlreadyExecuted();
    error InvalidAddress();
    error InvalidAmount();
    
    constructor(address _omthbToken, address[] memory _signers) {
        if (_omthbToken == address(0)) revert InvalidAddress();
        if (_signers.length < REQUIRED_APPROVALS) revert InvalidOperation();
        
        omthbToken = IOMTHB(_omthbToken);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        
        for (uint256 i = 0; i < _signers.length; i++) {
            if (_signers[i] == address(0)) revert InvalidAddress();
            _grantRole(SIGNER_ROLE, _signers[i]);
        }
    }
    
    /**
     * @notice Propose a mint operation
     * @param to Address to mint tokens to
     * @param amount Amount to mint
     */
    function proposeMint(address to, uint256 amount) external onlyRole(SIGNER_ROLE) returns (uint256) {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        
        uint256 operationId = _createOperation(OperationType.MINT, to, amount);
        return operationId;
    }
    
    /**
     * @notice Propose a burn operation
     * @param amount Amount to burn from multi-sig
     */
    function proposeBurn(uint256 amount) external onlyRole(SIGNER_ROLE) returns (uint256) {
        if (amount == 0) revert InvalidAmount();
        
        uint256 operationId = _createOperation(OperationType.BURN, address(this), amount);
        return operationId;
    }
    
    /**
     * @notice Propose a burnFrom operation
     * @param from Address to burn from
     * @param amount Amount to burn
     */
    function proposeBurnFrom(address from, uint256 amount) external onlyRole(SIGNER_ROLE) returns (uint256) {
        if (from == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        
        uint256 operationId = _createOperation(OperationType.BURN_FROM, from, amount);
        return operationId;
    }
    
    /**
     * @notice Propose pause operation
     */
    function proposePause() external onlyRole(SIGNER_ROLE) returns (uint256) {
        uint256 operationId = _createOperation(OperationType.PAUSE, address(0), 0);
        return operationId;
    }
    
    /**
     * @notice Propose unpause operation
     */
    function proposeUnpause() external onlyRole(SIGNER_ROLE) returns (uint256) {
        uint256 operationId = _createOperation(OperationType.UNPAUSE, address(0), 0);
        return operationId;
    }
    
    /**
     * @notice Propose blacklist operation
     * @param account Address to blacklist
     */
    function proposeBlacklist(address account) external onlyRole(SIGNER_ROLE) returns (uint256) {
        if (account == address(0)) revert InvalidAddress();
        
        uint256 operationId = _createOperation(OperationType.BLACKLIST, account, 0);
        return operationId;
    }
    
    /**
     * @notice Propose unblacklist operation
     * @param account Address to unblacklist
     */
    function proposeUnBlacklist(address account) external onlyRole(SIGNER_ROLE) returns (uint256) {
        if (account == address(0)) revert InvalidAddress();
        
        uint256 operationId = _createOperation(OperationType.UN_BLACKLIST, account, 0);
        return operationId;
    }
    
    /**
     * @notice Approve an operation
     * @param operationId Operation to approve
     */
    function approveOperation(uint256 operationId) external onlyRole(SIGNER_ROLE) {
        Operation storage operation = operations[operationId];
        
        if (operation.proposedAt == 0) revert InvalidOperation();
        if (operation.executed) revert OperationAlreadyExecuted();
        if (operation.approvals[msg.sender]) revert AlreadyApproved();
        if (block.timestamp > operation.proposedAt + OPERATION_EXPIRY) revert OperationExpired();
        
        operation.approvals[msg.sender] = true;
        operation.approvalCount++;
        
        emit OperationApproved(operationId, msg.sender, operation.approvalCount);
    }
    
    /**
     * @notice Execute an approved operation
     * @param operationId Operation to execute
     */
    function executeOperation(uint256 operationId) external onlyRole(SIGNER_ROLE) {
        Operation storage operation = operations[operationId];
        
        if (operation.proposedAt == 0) revert InvalidOperation();
        if (operation.executed) revert OperationAlreadyExecuted();
        if (operation.approvalCount < REQUIRED_APPROVALS) revert InsufficientApprovals();
        if (block.timestamp < operation.proposedAt + OPERATION_DELAY) revert OperationNotReady();
        if (block.timestamp > operation.proposedAt + OPERATION_EXPIRY) revert OperationExpired();
        
        operation.executed = true;
        operation.executedAt = block.timestamp;
        
        // Execute the operation
        if (operation.opType == OperationType.MINT) {
            omthbToken.mint(operation.target, operation.amount);
        } else if (operation.opType == OperationType.BURN) {
            omthbToken.burn(operation.amount);
        } else if (operation.opType == OperationType.BURN_FROM) {
            omthbToken.burnFrom(operation.target, operation.amount);
        } else if (operation.opType == OperationType.PAUSE) {
            omthbToken.pause();
        } else if (operation.opType == OperationType.UNPAUSE) {
            omthbToken.unpause();
        } else if (operation.opType == OperationType.BLACKLIST) {
            omthbToken.blacklist(operation.target);
        } else if (operation.opType == OperationType.UN_BLACKLIST) {
            omthbToken.unBlacklist(operation.target);
        }
        
        emit OperationExecuted(operationId, msg.sender);
    }
    
    /**
     * @notice Cancel an operation (admin only)
     * @param operationId Operation to cancel
     */
    function cancelOperation(uint256 operationId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Operation storage operation = operations[operationId];
        
        if (operation.proposedAt == 0) revert InvalidOperation();
        if (operation.executed) revert OperationAlreadyExecuted();
        
        operation.executed = true; // Mark as executed to prevent future execution
        
        emit OperationCancelled(operationId, msg.sender);
    }
    
    /**
     * @notice Internal function to create operation
     */
    function _createOperation(
        OperationType opType,
        address target,
        uint256 amount
    ) internal returns (uint256) {
        uint256 operationId = nextOperationId++;
        
        Operation storage operation = operations[operationId];
        operation.opType = opType;
        operation.target = target;
        operation.amount = amount;
        operation.proposedAt = block.timestamp;
        operation.proposer = msg.sender;
        operation.approvals[msg.sender] = true;
        operation.approvalCount = 1;
        
        emit OperationProposed(operationId, opType, target, amount, msg.sender);
        
        return operationId;
    }
    
    /**
     * @notice Get operation details
     * @param operationId Operation ID
     */
    function getOperation(uint256 operationId) external view returns (
        OperationType opType,
        address target,
        uint256 amount,
        uint256 proposedAt,
        uint256 executedAt,
        address proposer,
        bool executed,
        uint256 approvalCount
    ) {
        Operation storage operation = operations[operationId];
        return (
            operation.opType,
            operation.target,
            operation.amount,
            operation.proposedAt,
            operation.executedAt,
            operation.proposer,
            operation.executed,
            operation.approvalCount
        );
    }
    
    /**
     * @notice Check if signer approved operation
     * @param operationId Operation ID
     * @param signer Signer address
     */
    function hasApproved(uint256 operationId, address signer) external view returns (bool) {
        return operations[operationId].approvals[signer];
    }
}