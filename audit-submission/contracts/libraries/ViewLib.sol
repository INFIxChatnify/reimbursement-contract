// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ViewLib
 * @notice Library for view functions to reduce main contract size
 */
library ViewLib {
    enum Status {
        Pending,
        SecretaryApproved,
        CommitteeApproved,
        FinanceApproved,
        DirectorApproved,
        Distributed,
        Cancelled
    }
    
    struct ReimbursementRequest {
        uint256 id;
        address requester;
        address[] recipients;
        uint256[] amounts;
        uint256 totalAmount;
        string description;
        string documentHash;
        Status status;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 paymentDeadline;
        ApprovalInfo approvalInfo;
        address virtualPayer;
    }
    
    struct ApprovalInfo {
        address secretaryApprover;
        address committeeApprover;
        address financeApprover;
        address[] committeeAdditionalApprovers;
        address directorApprover;
    }
    
    uint256 internal constant REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS = 3;
    
    /**
     * @notice Get total approval count for a request
     * @param request The reimbursement request
     * @return count Total number of approvals
     */
    function getApprovalCount(ReimbursementRequest storage request) internal view returns (uint256 count) {
        if (request.approvalInfo.secretaryApprover != address(0)) count++;
        if (request.approvalInfo.committeeApprover != address(0)) count++;
        if (request.approvalInfo.financeApprover != address(0)) count++;
        count += request.approvalInfo.committeeAdditionalApprovers.length;
        if (request.approvalInfo.directorApprover != address(0)) count++;
        
        return count;
    }
    
    /**
     * @notice Check if request has enough committee additional approvers
     * @param request The reimbursement request
     * @return True if request has enough approvers for director approval
     */
    function hasEnoughCommitteeApprovers(ReimbursementRequest storage request) internal view returns (bool) {
        return request.approvalInfo.committeeAdditionalApprovers.length >= REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS;
    }
    
    /**
     * @notice Check if a request is abandoned (15+ days since last update without distribution)
     * @param request The reimbursement request
     * @return True if the request is abandoned
     */
    function isRequestAbandoned(ReimbursementRequest storage request) internal view returns (bool) {
        // Request must exist
        if (request.id == 0 && request.createdAt == 0) return false;
        
        // Request must not be distributed or cancelled
        if (request.status == Status.Distributed || request.status == Status.Cancelled) return false;
        
        // Check if 15 days have passed since last update
        uint256 abandonmentPeriod = 15 days;
        return block.timestamp >= request.updatedAt + abandonmentPeriod;
    }
    
    /**
     * @notice Get remaining budget
     * @param projectBudget The total project budget
     * @param totalDistributed The total amount distributed
     * @return The remaining budget available for distribution
     */
    function getRemainingBudget(uint256 projectBudget, uint256 totalDistributed) internal pure returns (uint256) {
        if (projectBudget >= totalDistributed) {
            return projectBudget - totalDistributed;
        }
        return 0;
    }
}