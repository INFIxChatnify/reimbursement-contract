// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RoleManagementLib
 * @notice Library for role management logic to reduce main contract size
 * @dev Handles commit-reveal and role validation logic
 */
library RoleManagementLib {
    // Role constants
    bytes32 constant SECRETARY_ROLE = keccak256("SECRETARY_ROLE");
    bytes32 constant COMMITTEE_ROLE = keccak256("COMMITTEE_ROLE");
    bytes32 constant FINANCE_ROLE = keccak256("FINANCE_ROLE");
    bytes32 constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    bytes32 constant REQUESTER_ROLE = keccak256("REQUESTER_ROLE");
    
    // Custom errors
    error E20(); // InvalidCommitment
    error E21(); // RevealTooEarly
    error E22(); // RoleCommitmentExists
    error E23(); // InvalidRoleCommitment
    
    /**
     * @notice Validate role commitment
     * @param commitment Stored commitment
     * @param revealHash Calculated reveal hash
     * @param commitTimestamp Commitment timestamp
     * @param revealWindow Reveal window duration
     */
    function validateCommitReveal(
        bytes32 commitment,
        bytes32 revealHash,
        uint256 commitTimestamp,
        uint256 revealWindow
    ) internal view {
        if (commitment == bytes32(0)) revert E20();
        if (block.timestamp < commitTimestamp + revealWindow) revert E21();
        if (revealHash != commitment) revert E20();
    }
    
    /**
     * @notice Generate role commitment hash
     * @param role Role identifier
     * @param account Account to grant/revoke role
     * @param granter Granter address
     * @param chainId Chain ID
     * @param nonce Random nonce
     */
    function generateRoleCommitment(
        bytes32 role,
        address account,
        address granter,
        uint256 chainId,
        uint256 nonce
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(role, account, granter, chainId, nonce));
    }
}