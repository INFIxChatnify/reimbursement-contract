// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title CustomTimelockController
 * @notice Extended TimelockController with additional security features
 * @dev Provides time-delayed execution of critical admin functions
 */
contract CustomTimelockController is TimelockController {
    /**
     * @notice Initialize the timelock controller
     * @param minDelay The minimum delay for operations
     * @param proposers List of addresses that can propose operations
     * @param executors List of addresses that can execute operations
     * @param admin Address that can grant and revoke roles
     */
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}