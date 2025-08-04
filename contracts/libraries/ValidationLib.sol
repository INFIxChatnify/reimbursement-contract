// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ValidationLib
 * @notice Library for validation functions to reduce main contract size
 */
library ValidationLib {
    // Custom errors
    error InvalidAmount();
    error InvalidAddress();
    error ZeroAddress();
    error AmountTooLow();
    error AmountTooHigh();
    error InvalidDescription();
    error InvalidDocumentHash();
    error ArrayLengthMismatch();
    error TooManyRecipients();
    error EmptyRecipientList();
    error InvalidVirtualPayer();

    // Constants
    uint256 internal constant MIN_REIMBURSEMENT_AMOUNT = 100 * 10**18; // 100 OMTHB
    uint256 internal constant MAX_REIMBURSEMENT_AMOUNT = 1000000 * 10**18; // 1M OMTHB
    uint256 internal constant MAX_RECIPIENTS = 10;

    /**
     * @notice Validate multi-request inputs
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts for each recipient
     * @param description The description of the expense
     * @param documentHash The document reference
     */
    function validateMultiRequestInputs(
        address[] memory recipients,
        uint256[] memory amounts,
        string calldata description,
        string calldata documentHash
    ) internal pure {
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
    
    /**
     * @notice Calculate total amount from amounts array
     * @param amounts Array of amounts
     * @return totalAmount The sum of all amounts
     */
    function calculateTotalAmount(uint256[] memory amounts) internal pure returns (uint256) {
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
            if (totalAmount < amounts[i]) revert InvalidAmount(); // Overflow check
        }
        return totalAmount;
    }
    
    /**
     * @notice Validate budget constraints
     * @param amount Amount to validate
     * @param totalDistributed Current total distributed
     * @param projectBudget Project budget limit
     */
    function validateBudget(
        uint256 amount,
        uint256 totalDistributed,
        uint256 projectBudget
    ) internal pure {
        uint256 newTotalDistributed = totalDistributed + amount;
        if (newTotalDistributed > projectBudget) revert InvalidAmount();
        if (newTotalDistributed < totalDistributed) revert InvalidAmount(); // Overflow check
        if (projectBudget > type(uint256).max / 2) revert InvalidAmount();
    }
    
    /**
     * @notice Validate virtual payer address
     * @param virtualPayer The virtual payer address to validate
     * @param contractAddress The contract address
     * @param tokenAddress The token contract address
     * @param factoryAddress The factory contract address
     */
    function validateVirtualPayer(
        address virtualPayer,
        address contractAddress,
        address tokenAddress,
        address factoryAddress
    ) internal pure {
        // Prevent using this contract as virtual payer
        if (virtualPayer == contractAddress) revert InvalidVirtualPayer();
        
        // Prevent using the token contract as virtual payer
        if (virtualPayer == tokenAddress) revert InvalidVirtualPayer();
        
        // Prevent using the factory contract as virtual payer
        if (virtualPayer == factoryAddress) revert InvalidVirtualPayer();
        
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
        
        // Prevent using precompiled contracts
        if (uint160(virtualPayer) <= 0xff) revert InvalidVirtualPayer();
    }
    
    /**
     * @notice Validate address is not zero
     * @param addr Address to validate
     */
    function validateNotZero(address addr) internal pure {
        if (addr == address(0)) revert ZeroAddress();
    }
    
    /**
     * @notice Validate amount is not zero
     * @param amount Amount to validate
     */
    function validateAmountNotZero(uint256 amount) internal pure {
        if (amount == 0) revert InvalidAmount();
    }
}