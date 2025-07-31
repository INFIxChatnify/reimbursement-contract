// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ERC2771Context
 * @notice Context variant with ERC-2771 support for meta transactions
 * @dev Extracts the original sender from trusted forwarder calls
 */
abstract contract ERC2771Context {
    /// @notice The trusted forwarder address
    address private immutable _trustedForwarder;

    constructor(address trustedForwarder) {
        _trustedForwarder = trustedForwarder;
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