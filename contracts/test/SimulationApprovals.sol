// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SimulationBase.sol";

/**
 * @title SimulationApprovals
 * @notice Handles direct approval operations for simulation
 * @dev DO NOT USE IN PRODUCTION - This is only for testing/simulation
 */
contract SimulationApprovals is SimulationBase {
    
    /**
     * @notice Direct approval for simulation (bypasses commit-reveal)
     * @param requestId The request ID to approve
     */
    function directApproveBySecretary(uint256 requestId) external onlyRole(SECRETARY_ROLE) {
        ReimbursementRequest storage request = requests[requestId];
        require(request.id == requestId && request.status != Status.Cancelled, "Invalid request");
        require(request.status == Status.Pending, "Invalid status");
        
        request.approvalInfo.secretaryApprover = msg.sender;
        request.status = Status.SecretaryApproved;
        request.updatedAt = block.timestamp;
        
        emit RequestApproved(requestId, Status.SecretaryApproved, msg.sender);
    }
    
    /**
     * @notice Direct committee approval for simulation
     * @param requestId The request ID to approve
     */
    function directApproveByCommittee(uint256 requestId) external onlyRole(COMMITTEE_ROLE) {
        ReimbursementRequest storage request = requests[requestId];
        require(request.id == requestId && request.status != Status.Cancelled, "Invalid request");
        require(request.status == Status.SecretaryApproved, "Invalid status");
        
        request.approvalInfo.committeeApprover = msg.sender;
        request.status = Status.CommitteeApproved;
        request.updatedAt = block.timestamp;
        
        emit RequestApproved(requestId, Status.CommitteeApproved, msg.sender);
    }
    
    /**
     * @notice Direct finance approval for simulation
     * @param requestId The request ID to approve
     */
    function directApproveByFinance(uint256 requestId) external onlyRole(FINANCE_ROLE) {
        ReimbursementRequest storage request = requests[requestId];
        require(request.id == requestId && request.status != Status.Cancelled, "Invalid request");
        require(request.status == Status.CommitteeApproved, "Invalid status");
        
        request.approvalInfo.financeApprover = msg.sender;
        request.status = Status.FinanceApproved;
        request.updatedAt = block.timestamp;
        
        emit RequestApproved(requestId, Status.FinanceApproved, msg.sender);
    }
    
    /**
     * @notice Direct director approval for simulation
     * @param requestId The request ID to approve
     */
    function directApproveByDirector(uint256 requestId) external onlyRole(DIRECTOR_ROLE) {
        ReimbursementRequest storage request = requests[requestId];
        require(request.id == requestId && request.status != Status.Cancelled, "Invalid request");
        require(request.status == Status.FinanceApproved, "Invalid status");
        
        request.approvalInfo.directorApprover = msg.sender;
        request.status = Status.DirectorApproved;
        request.updatedAt = block.timestamp;
        request.paymentDeadline = block.timestamp + PAYMENT_DEADLINE_DURATION;
        
        emit RequestApproved(requestId, Status.DirectorApproved, msg.sender);
    }
}