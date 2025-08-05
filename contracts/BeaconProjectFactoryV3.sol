// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Import the base BeaconProjectFactory contract
import "./optimized/BeaconProjectFactoryOptimized.sol";

/**
 * @title BeaconProjectFactoryV3
 * @notice V3 deployment of the BeaconProjectFactory with zero-balance project creation
 * @dev This contract inherits all functionality from the base BeaconProjectFactory
 */
contract BeaconProjectFactoryV3 is BeaconProjectFactoryOptimized {
    constructor(
        address _projectImplementation,
        address _omthbToken,
        address _metaTxForwarder,
        address _admin
    ) BeaconProjectFactoryOptimized(_projectImplementation, _omthbToken, _admin) {
        // V3 constructor calls parent constructor with all required parameters
    }
}
