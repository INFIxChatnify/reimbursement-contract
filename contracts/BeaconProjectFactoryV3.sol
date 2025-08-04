// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Import the base BeaconProjectFactory contract
import "./BeaconProjectFactory.sol";

/**
 * @title BeaconProjectFactoryV3
 * @notice V3 deployment of the BeaconProjectFactory with zero-balance project creation
 * @dev This contract inherits all functionality from the base BeaconProjectFactory
 */
contract BeaconProjectFactoryV3 is BeaconProjectFactory {
    constructor(
        address _projectImplementation,
        address _omthbToken,
        address _metaTxForwarder,
        address _admin
    ) BeaconProjectFactory(_projectImplementation, _omthbToken, _metaTxForwarder, _admin) {
        // V3 constructor calls parent constructor with all required parameters
    }
}