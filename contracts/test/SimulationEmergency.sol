// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SimulationBase.sol";

/**
 * @title SimulationEmergency
 * @notice Handles direct emergency closure operations for simulation
 * @dev DO NOT USE IN PRODUCTION - This is only for testing/simulation
 */
contract SimulationEmergency is SimulationBase {
    
    /**
     * @notice Direct emergency closure approval for simulation
     * @param closureId The closure ID
     */
    function directApproveEmergencyClosure(uint256 closureId) external {
        EmergencyClosureRequest storage request = closureRequests[closureId];
        require(request.id == closureId && request.status != ClosureStatus.None, "Invalid closure");
        require(request.status != ClosureStatus.Executed && request.status != ClosureStatus.Cancelled, "Invalid status");
        
        bool isCommittee = hasRole(COMMITTEE_ROLE, msg.sender);
        bool isDirector = hasRole(DIRECTOR_ROLE, msg.sender);
        
        require(isCommittee || isDirector, "Unauthorized");
        
        if (isCommittee && request.closureApprovalInfo.committeeApprovers.length < REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
            // Check for duplicates
            for (uint256 i = 0; i < request.closureApprovalInfo.committeeApprovers.length; i++) {
                require(request.closureApprovalInfo.committeeApprovers[i] != msg.sender, "Already approved");
            }
            
            request.closureApprovalInfo.committeeApprovers.push(msg.sender);
            request.updatedAt = block.timestamp;
            
            if (request.closureApprovalInfo.committeeApprovers.length < REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
                request.status = ClosureStatus.PartiallyApproved;
            } else {
                request.status = ClosureStatus.FullyApproved;
            }
            
            emit EmergencyClosureApproved(closureId, msg.sender, request.closureApprovalInfo.committeeApprovers.length);
        }
        else if (isDirector && request.closureApprovalInfo.committeeApprovers.length >= REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
            require(request.closureApprovalInfo.directorApprover == address(0), "Already approved");
            
            request.closureApprovalInfo.directorApprover = msg.sender;
            request.status = ClosureStatus.FullyApproved;
            request.updatedAt = block.timestamp;
            request.executionDeadline = block.timestamp + PAYMENT_DEADLINE_DURATION;
            
            emit EmergencyClosureApproved(closureId, msg.sender, request.closureApprovalInfo.committeeApprovers.length);
        } else {
            revert("Invalid approval state");
        }
    }
    
    /**
     * @notice Direct emergency closure execution for simulation
     * @param closureId The closure ID
     */
    function directExecuteEmergencyClosure(uint256 closureId) external onlyRole(DIRECTOR_ROLE) {
        EmergencyClosureRequest storage request = closureRequests[closureId];
        require(request.id == closureId, "Invalid closure");
        require(request.status == ClosureStatus.FullyApproved, "Not fully approved");
        
        // Transfer all remaining tokens to the return address
        uint256 balance = omthbToken.balanceOf(address(this));
        if (balance > 0) {
            require(omthbToken.transfer(request.returnAddress, balance), "Transfer failed");
        }
        
        // Pause the contract permanently
        _pause();
        
        request.status = ClosureStatus.Executed;
        request.updatedAt = block.timestamp;
        request.remainingBalance = balance;
        
        emit EmergencyClosureExecuted(closureId, request.returnAddress, balance);
    }
}