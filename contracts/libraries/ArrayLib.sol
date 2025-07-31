// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ArrayLib
 * @notice Library for array management functions to reduce main contract size
 */
library ArrayLib {
    // Custom errors
    error TooManyActiveRequests();
    
    // Constants
    uint256 internal constant MAX_BATCH_SIZE = 100;
    uint256 internal constant MAX_ARRAY_LENGTH = 50;
    
    // Events
    event ArrayCleanupPerformed(address indexed user, uint256 requestsRemoved);
    
    /**
     * @notice Remove an element from an array by swapping with last element
     * @param array The array to remove from
     * @param index The index to remove
     * @param indexMapping Mapping to track indices
     */
    function removeFromArray(
        uint256[] storage array,
        uint256 index,
        mapping(uint256 => uint256) storage indexMapping
    ) internal {
        uint256 lastIndex = array.length - 1;
        if (index != lastIndex) {
            uint256 lastElement = array[lastIndex];
            array[index] = lastElement;
            indexMapping[lastElement] = index;
        }
        array.pop();
    }
    
    /**
     * @notice Remove request from global active requests array
     * @param activeRequestIds The array of active request IDs
     * @param requestId The request ID to remove
     */
    function removeFromActiveRequests(
        uint256[] storage activeRequestIds,
        uint256 requestId
    ) internal {
        uint256 length = activeRequestIds.length;
        if (length > MAX_BATCH_SIZE) {
            length = MAX_BATCH_SIZE;
        }
        
        for (uint256 i = 0; i < length; i++) {
            if (activeRequestIds[i] == requestId) {
                uint256 lastIndex = activeRequestIds.length - 1;
                if (i != lastIndex) {
                    activeRequestIds[i] = activeRequestIds[lastIndex];
                }
                activeRequestIds.pop();
                break;
            }
        }
    }
    
    /**
     * @notice Track a new active request
     * @param activeRequestIds Global active request IDs array
     * @param activeRequestsPerUser User's active requests array
     * @param requestIndexInUserArray Mapping of request ID to index in user array
     * @param requestId The request ID to track
     * @param user The user address
     */
    function trackActiveRequest(
        uint256[] storage activeRequestIds,
        mapping(address => uint256[]) storage activeRequestsPerUser,
        mapping(uint256 => uint256) storage requestIndexInUserArray,
        uint256 requestId,
        address user
    ) internal {
        if (activeRequestIds.length >= MAX_BATCH_SIZE) revert TooManyActiveRequests();
        activeRequestIds.push(requestId);
        
        activeRequestsPerUser[user].push(requestId);
        requestIndexInUserArray[requestId] = activeRequestsPerUser[user].length - 1;
    }
}