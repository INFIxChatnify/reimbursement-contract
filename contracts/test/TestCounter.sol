// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TestCounter
 * @notice Simple counter contract for testing meta transactions
 */
contract TestCounter {
    mapping(address => uint256) public counters;
    
    event CounterIncremented(address indexed user, uint256 newValue);
    
    /**
     * @notice Increment the counter for the caller
     */
    function increment() external {
        address user = _msgSender();
        counters[user]++;
        emit CounterIncremented(user, counters[user]);
    }
    
    /**
     * @notice Get the counter value for a user
     */
    function getCounter(address user) external view returns (uint256) {
        return counters[user];
    }
    
    /**
     * @notice ERC-2771 compatible message sender extraction
     */
    function _msgSender() internal view returns (address) {
        // If called directly, return msg.sender
        if (msg.data.length < 20) {
            return msg.sender;
        }
        
        // Extract appended sender address (last 20 bytes)
        address sender;
        assembly {
            sender := shr(96, calldataload(sub(calldatasize(), 20)))
        }
        
        // Validate that the call came from trusted forwarder
        // In production, you'd check if msg.sender is the trusted forwarder
        // For testing, we'll accept any appended address
        return sender;
    }
}