// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ReimbursementLib
 * @notice Library for reimbursement-related logic to reduce main contract size
 * @dev Extracts common validation and calculation logic
 */
library ReimbursementLib {
    // Custom errors (shorter than require strings)
    error E01(); // InvalidAmount
    error E02(); // InvalidAddress
    error E03(); // InvalidStatus
    error E04(); // RequestNotFound
    error E05(); // InsufficientBudget
    error E06(); // AlreadyApproved
    error E07(); // UnauthorizedApprover
    error E08(); // TransferFailed
    error E09(); // ArrayLengthMismatch
    error E10(); // TooManyRecipients
    error E11(); // EmptyRecipientList
    error E12(); // InvalidDescription
    error E13(); // InvalidDocumentHash
    error E14(); // ZeroAddress
    error E15(); // DuplicateRecipient
    
    uint256 constant MIN_AMOUNT = 100e18;
    uint256 constant MAX_AMOUNT = 1000000e18;
    uint256 constant MAX_RECIPIENTS = 10;
    
    /**
     * @notice Validate request input parameters
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts
     * @param description Request description
     * @param documentHash Document reference
     * @return totalAmount Total amount across all recipients
     */
    function validateRequest(
        address[] memory recipients,
        uint256[] memory amounts,
        string calldata description,
        string calldata documentHash
    ) internal pure returns (uint256 totalAmount) {
        uint256 len = recipients.length;
        if (len == 0) revert E11();
        if (len != amounts.length) revert E09();
        if (len > MAX_RECIPIENTS) revert E10();
        
        // Validate strings
        if (bytes(description).length == 0 || bytes(description).length > 1000) revert E12();
        if (bytes(documentHash).length == 0 || bytes(documentHash).length > 100) revert E13();
        
        // Validate recipients and calculate total
        for (uint256 i; i < len;) {
            if (recipients[i] == address(0)) revert E14();
            if (amounts[i] == 0 || amounts[i] < MIN_AMOUNT || amounts[i] > MAX_AMOUNT) revert E01();
            
            // Check duplicates
            for (uint256 j; j < i;) {
                if (recipients[i] == recipients[j]) revert E15();
                unchecked { ++j; }
            }
            
            totalAmount += amounts[i];
            if (totalAmount < amounts[i]) revert E01(); // Overflow
            
            unchecked { ++i; }
        }
        
        if (totalAmount > MAX_AMOUNT) revert E01();
    }
    
    /**
     * @notice Calculate available balance considering locked funds
     * @param currentBalance Current token balance
     * @param totalLocked Total locked amount
     * @param requestAmount Amount requested
     * @param projectBudget Total project budget
     * @param totalDistributed Total amount distributed
     */
    function validateAvailableFunds(
        uint256 currentBalance,
        uint256 totalLocked,
        uint256 requestAmount,
        uint256 projectBudget,
        uint256 totalDistributed
    ) internal pure {
        uint256 available = currentBalance > totalLocked ? currentBalance - totalLocked : 0;
        if (requestAmount > available) revert E05();
        
        uint256 newLocked = totalLocked + requestAmount;
        uint256 maxLocked = (currentBalance * 80) / 100;
        if (newLocked > maxLocked) revert E05();
        
        if (totalDistributed + requestAmount > projectBudget) revert E05();
    }
    
    /**
     * @notice Generate commitment hash for approval
     * @param approver Approver address
     * @param id Request or closure ID
     * @param chainId Chain ID
     * @param nonce Random nonce
     */
    function generateCommitment(
        address approver,
        uint256 id,
        uint256 chainId,
        uint256 nonce
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(approver, id, chainId, nonce));
    }
    
    /**
     * @notice Validate commitment timing
     * @param commitTimestamp Commitment timestamp
     * @param revealWindow Reveal window duration
     */
    function validateRevealTiming(uint256 commitTimestamp, uint256 revealWindow) internal view {
        if (block.timestamp < commitTimestamp + revealWindow) revert E03();
    }
}