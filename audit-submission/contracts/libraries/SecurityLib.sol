// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SecurityLib
 * @notice Library providing additional security utilities
 * @dev Implements common security patterns and validations
 */
library SecurityLib {
    /// @notice Custom errors
    error InvalidPercentage();
    error ArrayLengthMismatch();
    error DuplicateEntry();
    error InvalidTimeWindow();
    
    /**
     * @notice Validate percentage value (0-10000 basis points)
     * @param percentage The percentage in basis points
     */
    function validatePercentage(uint256 percentage) internal pure {
        if (percentage > 10000) revert InvalidPercentage();
    }
    
    /**
     * @notice Check if arrays have matching lengths
     * @param length1 First array length
     * @param length2 Second array length
     */
    function validateArrayLengths(uint256 length1, uint256 length2) internal pure {
        if (length1 != length2) revert ArrayLengthMismatch();
    }
    
    /**
     * @notice Check for duplicate addresses in array
     * @param addresses Array of addresses to check
     * @return hasDuplicates True if duplicates found
     */
    function checkDuplicateAddresses(address[] memory addresses) internal pure returns (bool hasDuplicates) {
        uint256 length = addresses.length;
        for (uint256 i = 0; i < length - 1; i++) {
            for (uint256 j = i + 1; j < length; j++) {
                if (addresses[i] == addresses[j]) {
                    return true;
                }
            }
        }
        return false;
    }
    
    /**
     * @notice Validate time window parameters
     * @param startTime Start timestamp
     * @param endTime End timestamp
     * @param currentTime Current block timestamp
     */
    function validateTimeWindow(
        uint256 startTime,
        uint256 endTime,
        uint256 currentTime
    ) internal pure {
        if (startTime >= endTime) revert InvalidTimeWindow();
        if (endTime <= currentTime) revert InvalidTimeWindow();
    }
    
    /**
     * @notice Calculate percentage of a value safely
     * @param value The value to calculate percentage of
     * @param percentage The percentage in basis points (10000 = 100%)
     * @return result The calculated percentage
     */
    function calculatePercentage(uint256 value, uint256 percentage) internal pure returns (uint256 result) {
        validatePercentage(percentage);
        result = (value * percentage) / 10000;
    }
    
    /**
     * @notice Generate unique ID from parameters
     * @param sender Address initiating the action
     * @param nonce Unique nonce
     * @param data Additional data for uniqueness
     * @return Unique bytes32 identifier
     */
    function generateUniqueId(
        address sender,
        uint256 nonce,
        bytes memory data
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(sender, nonce, data));
    }
}