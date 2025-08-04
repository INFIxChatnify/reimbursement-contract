// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title ERC2771ContextUpgradeable
 * @notice Upgradeable version of ERC2771Context for meta transaction support
 * @dev Extracts the original sender from trusted forwarder calls
 */
abstract contract ERC2771ContextUpgradeable is Initializable {
    /// @notice The trusted forwarder address
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable state-variable-assignment
    address private _trustedForwarder;

    /// @notice Storage gap for future upgrades
    uint256[49] private __gap;

    /**
     * @notice Initialize the trusted forwarder
     * @param trustedForwarder_ The trusted forwarder address
     */
    function __ERC2771Context_init(address trustedForwarder_) internal onlyInitializing {
        __ERC2771Context_init_unchained(trustedForwarder_);
    }

    function __ERC2771Context_init_unchained(address trustedForwarder_) internal onlyInitializing {
        _trustedForwarder = trustedForwarder_;
    }

    /**
     * @notice Check if an address is the trusted forwarder
     * @param forwarder The address to check
     * @return trusted Whether the address is the trusted forwarder
     */
    function isTrustedForwarder(address forwarder) public view virtual returns (bool) {
        return forwarder == _trustedForwarder;
    }

    /**
     * @notice Get the trusted forwarder address
     * @return The trusted forwarder address
     */
    function trustedForwarder() public view virtual returns (address) {
        return _trustedForwarder;
    }

    /**
     * @notice Get the message sender, accounting for meta transactions
     * @return sender The original sender address
     */
    function _msgSender() internal view virtual returns (address sender) {
        if (isTrustedForwarder(msg.sender)) {
            // The assembly code is more direct than the Solidity version using `abi.decode`.
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            return msg.sender;
        }
    }

    /**
     * @notice Get the message data, accounting for meta transactions
     * @return The original message data
     */
    function _msgData() internal view virtual returns (bytes calldata) {
        if (isTrustedForwarder(msg.sender)) {
            return msg.data[:msg.data.length - 20];
        } else {
            return msg.data;
        }
    }
}