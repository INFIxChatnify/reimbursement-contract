// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IOMTHB.sol";

/**
 * @title EmergencyClosureLib
 * @notice Library for emergency closure functionality to reduce main contract size
 */
library EmergencyClosureLib {
    // Enums
    enum ClosureStatus {
        None,
        Initiated,
        PartiallyApproved,
        FullyApproved,
        Executed,
        Cancelled
    }
    
    // Structs
    struct EmergencyClosureRequest {
        uint256 id;
        address initiator;
        address returnAddress;
        string reason;
        ClosureStatus status;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 executionDeadline;
        ClosureApprovalInfo closureApprovalInfo;
        uint256 remainingBalance;
    }
    
    struct ClosureApprovalInfo {
        address[] committeeApprovers;
        address directorApprover;
    }
    
    // Constants
    uint256 internal constant REQUIRED_CLOSURE_COMMITTEE_APPROVERS = 3;
    uint256 internal constant PAYMENT_DEADLINE_DURATION = 7 days;
    
    // Custom errors
    error InvalidReturnAddress();
    error InvalidDescription();
    error ActiveClosureExists();
    error NoActiveClosureRequest();
    error InvalidClosureStatus();
    error DuplicateCommitteeApprover();
    error AlreadyApproved();
    error ClosureExecutionDeadlineExpired();
    error TransferFailed();
    
    // Events
    event EmergencyClosureInitiated(
        uint256 indexed closureId,
        address indexed initiator,
        address indexed returnAddress,
        string reason
    );
    event EmergencyClosureApproved(
        uint256 indexed closureId,
        address indexed approver,
        uint256 approverCount
    );
    event EmergencyClosureCancelled(uint256 indexed closureId, address indexed canceller);
    event EmergencyClosureExecuted(
        uint256 indexed closureId,
        address indexed returnAddress,
        uint256 returnedAmount
    );
    
    /**
     * @notice Validate emergency closure inputs
     * @param returnAddress The address where remaining tokens should be sent
     * @param reason The reason for emergency closure
     */
    function validateClosureInputs(
        address returnAddress,
        string calldata reason
    ) internal pure {
        if (returnAddress == address(0)) revert InvalidReturnAddress();
        if (bytes(reason).length == 0) revert InvalidDescription();
        if (bytes(reason).length > 1000) revert InvalidDescription();
    }
    
    /**
     * @notice Check if there's an active closure request
     * @param activeClosureRequestId Current active closure request ID
     * @param closureRequests Mapping of closure requests
     * @return True if there's an active closure request
     */
    function hasActiveClosureRequest(
        uint256 activeClosureRequestId,
        mapping(uint256 => EmergencyClosureRequest) storage closureRequests
    ) internal view returns (bool) {
        if (activeClosureRequestId != 0) {
            EmergencyClosureRequest storage activeRequest = closureRequests[activeClosureRequestId];
            if (activeRequest.status == ClosureStatus.Initiated || 
                activeRequest.status == ClosureStatus.PartiallyApproved ||
                activeRequest.status == ClosureStatus.FullyApproved) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * @notice Add committee approver to closure request
     * @param request The emergency closure request
     * @param approver The approver address
     * @return isFullyApproved True if request now has enough committee approvers
     */
    function addCommitteeApprover(
        EmergencyClosureRequest storage request,
        address approver
    ) internal returns (bool isFullyApproved) {
        // Check for duplicates
        for (uint256 i = 0; i < request.closureApprovalInfo.committeeApprovers.length; i++) {
            if (request.closureApprovalInfo.committeeApprovers[i] == approver) {
                revert DuplicateCommitteeApprover();
            }
        }
        
        // Add committee approver
        request.closureApprovalInfo.committeeApprovers.push(approver);
        request.updatedAt = block.timestamp;
        
        if (request.closureApprovalInfo.committeeApprovers.length < REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
            request.status = ClosureStatus.PartiallyApproved;
            return false;
        } else {
            request.status = ClosureStatus.FullyApproved;
            return true;
        }
    }
    
    /**
     * @notice Add director approval to closure request
     * @param request The emergency closure request
     * @param approver The director approver address
     */
    function addDirectorApproval(
        EmergencyClosureRequest storage request,
        address approver
    ) internal {
        if (request.closureApprovalInfo.directorApprover != address(0)) revert AlreadyApproved();
        
        request.closureApprovalInfo.directorApprover = approver;
        request.status = ClosureStatus.FullyApproved;
        request.updatedAt = block.timestamp;
        request.executionDeadline = block.timestamp + PAYMENT_DEADLINE_DURATION;
    }
    
    /**
     * @notice Execute emergency closure
     * @param request The emergency closure request
     * @param omthbToken The OMTHB token contract
     * @return currentBalance The balance that was transferred
     */
    function executeEmergencyClosure(
        EmergencyClosureRequest storage request,
        IOMTHB omthbToken
    ) internal returns (uint256 currentBalance, bool shouldClearActiveRequest) {
        // Verify deadline hasn't expired
        if (request.executionDeadline != 0 && block.timestamp > request.executionDeadline) {
            revert ClosureExecutionDeadlineExpired();
        }
        
        // Get current balance
        currentBalance = omthbToken.balanceOf(address(this));
        
        // Cache values to prevent reentrancy
        address returnAddress = request.returnAddress;
        
        // Update state BEFORE external calls (CEI pattern)
        request.status = ClosureStatus.Executed;
        request.updatedAt = block.timestamp;
        request.remainingBalance = currentBalance;
        
        // Signal to clear active closure request
        shouldClearActiveRequest = true;
        
        // Emit event before external call
        emit EmergencyClosureExecuted(request.id, returnAddress, currentBalance);
        
        // Transfer all remaining tokens to the return address
        if (currentBalance > 0) {
            // Additional balance check to prevent issues
            uint256 actualBalance = omthbToken.balanceOf(address(this));
            if (actualBalance < currentBalance) {
                currentBalance = actualBalance;
            }
            
            bool success = omthbToken.transfer(returnAddress, currentBalance);
            if (!success) revert TransferFailed();
        }
        
        return (currentBalance, shouldClearActiveRequest);
    }
    
    /**
     * @notice Get closure approval count
     * @param request The emergency closure request
     * @return committeeCount Number of committee approvers
     * @return hasDirectorApproval Whether director has approved
     */
    function getClosureApprovalStatus(
        EmergencyClosureRequest storage request
    ) internal view returns (uint256 committeeCount, bool hasDirectorApproval) {
        committeeCount = request.closureApprovalInfo.committeeApprovers.length;
        hasDirectorApproval = request.closureApprovalInfo.directorApprover != address(0);
    }
    
    /**
     * @notice Check if the project is closed
     * @param activeClosureRequestId Current active closure request ID
     * @param closureRequests Mapping of closure requests
     * @param closureIdCounter Total number of closure requests
     * @return True if an emergency closure has been executed
     */
    function isProjectClosed(
        uint256 activeClosureRequestId,
        mapping(uint256 => EmergencyClosureRequest) storage closureRequests,
        uint256 closureIdCounter
    ) internal view returns (bool) {
        if (activeClosureRequestId != 0) {
            EmergencyClosureRequest storage request = closureRequests[activeClosureRequestId];
            if (request.status == ClosureStatus.Executed) {
                return true;
            }
        }
        // Also check all closure requests for executed status
        for (uint256 i = 0; i < closureIdCounter; i++) {
            if (closureRequests[i].status == ClosureStatus.Executed) {
                return true;
            }
        }
        return false;
    }
}