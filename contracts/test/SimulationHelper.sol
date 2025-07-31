// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SimulationApprovals.sol";

/**
 * @title SimulationHelper
 * @notice Lightweight helper contract for simulation and testing that bypasses commit-reveal
 * @dev DO NOT USE IN PRODUCTION - This is only for testing/simulation
 * @dev This contract combines the functionality of SimulationApprovals for a complete simulation interface
 */
contract SimulationHelper is SimulationApprovals {
    
    /**
     * @notice Quick setup function for simulations
     * @dev Sets up common roles for testing
     * @param secretary Secretary address
     * @param committee Committee member address
     * @param finance Finance address
     * @param director Director address
     * @param requester Requester address
     */
    function quickSetup(
        address secretary,
        address committee,
        address finance,
        address director,
        address requester
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(SECRETARY_ROLE, secretary);
        _grantRole(COMMITTEE_ROLE, committee);
        _grantRole(FINANCE_ROLE, finance);
        _grantRole(DIRECTOR_ROLE, director);
        _grantRole(REQUESTER_ROLE, requester);
    }
    
    /**
     * @notice Direct approval chain for simulation
     * @dev Approves a request through all levels at once
     * @param requestId The request ID to approve
     * @param secretary Secretary approver
     * @param committee Committee approver
     * @param finance Finance approver
     * @param director Director approver
     */
    function quickApprovalChain(
        uint256 requestId,
        address secretary,
        address committee,
        address finance,
        address director
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // Temporarily grant roles
        _grantRole(SECRETARY_ROLE, secretary);
        _grantRole(COMMITTEE_ROLE, committee);
        _grantRole(FINANCE_ROLE, finance);
        _grantRole(DIRECTOR_ROLE, director);
        
        // Execute approvals
        ReimbursementRequest storage request = requests[requestId];
        require(request.id == requestId, "Invalid request");
        
        // Secretary approval
        request.approvalInfo.secretaryApprover = secretary;
        request.status = Status.SecretaryApproved;
        emit RequestApproved(requestId, Status.SecretaryApproved, secretary);
        
        // Committee approval
        request.approvalInfo.committeeApprover = committee;
        request.status = Status.CommitteeApproved;
        emit RequestApproved(requestId, Status.CommitteeApproved, committee);
        
        // Finance approval
        request.approvalInfo.financeApprover = finance;
        request.status = Status.FinanceApproved;
        emit RequestApproved(requestId, Status.FinanceApproved, finance);
        
        // Director approval
        request.approvalInfo.directorApprover = director;
        request.status = Status.DirectorApproved;
        request.paymentDeadline = block.timestamp + PAYMENT_DEADLINE_DURATION;
        emit RequestApproved(requestId, Status.DirectorApproved, director);
        
        request.updatedAt = block.timestamp;
    }
}