// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Import the base ProjectFactory contract
import "./ProjectFactory.sol";

/**
 * @title ProjectFactoryV3
 * @notice V3 deployment of the ProjectFactory with zero-balance project creation
 * @dev This contract inherits all functionality from the base ProjectFactory
 */
contract ProjectFactoryV3 is ProjectFactory {
    constructor(
        address _projectImplementation,
        address _omthbToken,
        address _metaTxForwarder,
        address _admin
    ) ProjectFactory(_projectImplementation, _omthbToken, _metaTxForwarder, _admin) {
        // V3 constructor calls parent constructor with all required parameters
    }
}