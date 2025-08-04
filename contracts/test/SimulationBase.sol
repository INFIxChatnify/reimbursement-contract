// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../ProjectReimbursementV3.sol";

/**
 * @title SimulationBase
 * @notice Base contract for simulation helpers with direct access methods
 * @dev DO NOT USE IN PRODUCTION - This is only for testing/simulation
 */
abstract contract SimulationBase is ProjectReimbursementV3 {
    
    /**
     * @notice Direct role grant for simulation purposes
     * @dev Bypasses the commit-reveal mechanism
     * @param role The role to grant
     * @param account The account to grant the role to
     */
    function directGrantRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(role, account);
    }
    
    /**
     * @notice Direct role revoke for simulation purposes
     * @dev Bypasses the commit-reveal mechanism
     * @param role The role to revoke
     * @param account The account to revoke the role from
     */
    function directRevokeRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(role, account);
    }
}