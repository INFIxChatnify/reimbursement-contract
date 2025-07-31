// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title AuditableReimbursement
 * @notice Base contract providing comprehensive audit trail functionality
 * @dev All reimbursement contracts should inherit from this for audit compliance
 */
abstract contract AuditableReimbursement is 
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable 
{
    // Audit event that all contracts emit for base tracking
    event AuditLog(
        address indexed actor,
        string indexed action,
        bytes32 indexed entityId,
        uint256 timestamp,
        bytes metadata
    );
    
    // Structured metadata for audit entries
    struct AuditMetadata {
        bytes32 previousStateHash;
        bytes32 newStateHash;
        uint256 gasUsed;
        bytes additionalData;
    }
    
    // Enhanced events for specific audit scenarios
    event FinancialTransactionAudit(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 timestamp,
        string transactionType,
        bytes32 referenceId,
        string description
    );
    
    event AccessControlAudit(
        address indexed subject,
        address indexed actor,
        string action,
        bytes32 role,
        uint256 timestamp,
        bool success,
        string reason
    );
    
    event StateChangeAudit(
        bytes32 indexed entityId,
        string entityType,
        bytes32 previousState,
        bytes32 newState,
        address indexed changedBy,
        uint256 timestamp,
        string changeReason
    );
    
    event ComplianceCheckAudit(
        bytes32 indexed checkId,
        string checkType,
        bool passed,
        address indexed checker,
        uint256 timestamp,
        bytes evidence
    );
    
    // Gas DoS Protection Constants
    uint256 public constant MAX_BATCH_SIZE = 100;
    uint256 public constant MAX_ARRAY_LENGTH = 50;
    
    // Nonce for generating unique IDs
    uint256 private _auditNonce;
    
    // Commit-reveal error types
    error NotInCommitPhase();
    error NotInRevealPhase();
    error CommitPhaseExpired();
    error RevealPhaseExpired();
    
    /**
     * @dev Emits comprehensive audit event with metadata
     */
    function _emitAuditEvent(
        string memory action,
        bytes32 entityId,
        AuditMetadata memory metadata
    ) internal {
        emit AuditLog(
            msg.sender,
            action,
            entityId,
            block.timestamp,
            abi.encode(metadata)
        );
    }
    
    /**
     * @dev Emits financial transaction audit event
     */
    function _auditFinancialTransaction(
        address from,
        address to,
        uint256 amount,
        string memory transactionType,
        bytes32 referenceId,
        string memory description
    ) internal {
        emit FinancialTransactionAudit(
            from,
            to,
            amount,
            block.timestamp,
            transactionType,
            referenceId,
            description
        );
    }
    
    /**
     * @dev Emits access control audit event
     */
    function _auditAccessControl(
        address subject,
        string memory action,
        bytes32 role,
        bool success,
        string memory reason
    ) internal {
        emit AccessControlAudit(
            subject,
            msg.sender,
            action,
            role,
            block.timestamp,
            success,
            reason
        );
    }
    
    /**
     * @dev Emits state change audit event
     */
    function _auditStateChange(
        bytes32 entityId,
        string memory entityType,
        bytes32 previousState,
        bytes32 newState,
        string memory changeReason
    ) internal {
        emit StateChangeAudit(
            entityId,
            entityType,
            previousState,
            newState,
            msg.sender,
            block.timestamp,
            changeReason
        );
    }
    
    /**
     * @dev Generates unique audit ID
     */
    function _generateAuditId() internal returns (bytes32) {
        return keccak256(abi.encodePacked(
            block.timestamp,
            msg.sender,
            _auditNonce++,
            blockhash(block.number - 1)
        ));
    }
    
    /**
     * @dev Modifier to automatically audit function calls
     */
    modifier audited(string memory action, bytes32 entityId) {
        uint256 gasStart = gasleft();
        bytes32 stateBefore = _calculateCurrentStateHash();
        
        _;
        
        uint256 gasUsed = gasStart - gasleft();
        bytes32 stateAfter = _calculateCurrentStateHash();
        
        _emitAuditEvent(
            action,
            entityId,
            AuditMetadata({
                previousStateHash: stateBefore,
                newStateHash: stateAfter,
                gasUsed: gasUsed,
                additionalData: abi.encode(block.number, tx.origin)
            })
        );
    }
    
    /**
     * @dev Modifier to audit financial operations
     */
    modifier auditedFinancial(
        address from,
        address to,
        uint256 amount,
        string memory txType,
        bytes32 refId
    ) {
        _;
        
        _auditFinancialTransaction(
            from,
            to,
            amount,
            txType,
            refId,
            ""
        );
    }
    
    /**
     * @dev Override in child contracts to calculate state hash
     */
    function _calculateCurrentStateHash() internal view virtual returns (bytes32);
    
    /**
     * @dev Override in child contracts to provide entity-specific hash
     */
    function _calculateEntityHash(bytes32 entityId) internal view virtual returns (bytes32);
    
    /**
     * @dev Batch audit event emission for gas efficiency
     */
    function _emitBatchAuditEvents(
        string[] memory actions,
        bytes32[] memory entityIds,
        AuditMetadata[] memory metadata
    ) internal {
        require(
            actions.length == entityIds.length && 
            actions.length == metadata.length,
            "Array length mismatch"
        );
        
        // Gas DoS Protection
        require(actions.length <= MAX_BATCH_SIZE, "Batch size exceeds limit");
        
        for (uint256 i = 0; i < actions.length; i++) {
            emit AuditLog(
                msg.sender,
                actions[i],
                entityIds[i],
                block.timestamp,
                abi.encode(metadata[i])
            );
        }
    }
    
    /**
     * @dev Check and audit compliance rules
     */
    function _checkAndAuditCompliance(
        string memory checkType,
        bytes memory evidence
    ) internal returns (bool passed, bytes32 checkId) {
        checkId = _generateAuditId();
        
        // Implement compliance check logic (override in child contracts)
        passed = _performComplianceCheck(checkType, evidence);
        
        emit ComplianceCheckAudit(
            checkId,
            checkType,
            passed,
            msg.sender,
            block.timestamp,
            evidence
        );
        
        return (passed, checkId);
    }
    
    /**
     * @dev Override in child contracts to implement specific compliance checks
     */
    function _performComplianceCheck(
        string memory checkType,
        bytes memory evidence
    ) internal view virtual returns (bool);
    
    /**
     * @dev Validate commit phase for commit-reveal pattern
     * @param commitDeadline The deadline for commits
     */
    function validateCommitPhase(uint256 commitDeadline) internal view {
        if (block.timestamp > commitDeadline) {
            revert CommitPhaseExpired();
        }
    }
    
    /**
     * @dev Validate reveal phase for commit-reveal pattern
     * @param revealDeadline The deadline for reveals
     */
    function validateRevealPhase(uint256 revealDeadline) internal view {
        if (block.timestamp > revealDeadline) {
            revert RevealPhaseExpired();
        }
    }
}