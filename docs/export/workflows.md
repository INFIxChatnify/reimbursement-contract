# Reimbursement System Workflows

This document provides detailed workflow diagrams for all major operations in the reimbursement smart contract system.

## Table of Contents

1. [Project Creation Flow](#project-creation-flow)
2. [Single Recipient Reimbursement Flow](#single-recipient-reimbursement-flow)
3. [Multiple Recipients Reimbursement Flow](#multiple-recipients-reimbursement-flow)
4. [Emergency Closure Flow](#emergency-closure-flow)
5. [Token Deposit Flow](#token-deposit-flow)
6. [Commit-Reveal Approval Pattern](#commit-reveal-approval-pattern)

## Project Creation Flow

```mermaid
sequenceDiagram
    participant Creator as Project Creator
    participant Factory as ProjectFactoryV3
    participant Proxy as Minimal Proxy
    participant Project as ProjectReimbursement
    participant Token as OMTHB Token

    Creator->>Factory: createProject(projectId, projectAdmin)
    Note over Factory: Verify PROJECT_CREATOR_ROLE
    Note over Factory: Check project ID uniqueness
    
    Factory->>Proxy: Deploy minimal proxy
    Proxy->>Project: initialize(projectId, token, 0, admin)
    Note over Project: Start with 0 budget
    
    Factory->>Project: grantRoleDirect(REQUESTER_ROLE, admin)
    
    Factory-->>Creator: Return project address
    Factory-->>Creator: Emit ProjectCreated event
    
    Note over Creator: Project needs deposit
    Creator->>Token: approve(projectAddress, amount)
    Creator->>Project: depositOMTHB(amount)
    Project->>Token: transferFrom(creator, project, amount)
    
    Note over Project: Project ready for requests
```

## Single Recipient Reimbursement Flow

```mermaid
sequenceDiagram
    participant Requester
    participant Project as ProjectReimbursement
    participant Secretary
    participant Committee
    participant Finance
    participant CommitteeX3 as Committee (3 more)
    participant Director
    participant Recipient
    participant Token as OMTHB Token

    Requester->>Project: createRequest(recipient, amount, desc, hash)
    Note over Project: Validate amount & budget
    Note over Project: Check available balance
    Project-->>Requester: Return requestId
    
    rect rgb(200, 220, 240)
        Note over Project: Level 1: Secretary Approval
        Secretary->>Project: commitApproval(requestId, commitment)
        Note over Secretary: Wait 30 minutes
        Secretary->>Project: approveBySecretary(requestId, nonce)
        Note over Project: Status → SecretaryApproved
    end
    
    rect rgb(220, 200, 240)
        Note over Project: Level 2: Committee Approval
        Committee->>Project: commitApproval(requestId, commitment)
        Note over Committee: Wait 30 minutes
        Committee->>Project: approveByCommittee(requestId, nonce)
        Note over Project: Status → CommitteeApproved
    end
    
    rect rgb(240, 220, 200)
        Note over Project: Level 3: Finance Approval
        Finance->>Project: commitApproval(requestId, commitment)
        Note over Finance: Wait 30 minutes
        Finance->>Project: approveByFinance(requestId, nonce)
        Note over Project: Status → FinanceApproved
    end
    
    rect rgb(200, 240, 220)
        Note over Project: Level 4: Additional Committee
        loop 3 times
            CommitteeX3->>Project: commitApproval(requestId, commitment)
            Note over CommitteeX3: Wait 30 minutes
            CommitteeX3->>Project: approveByCommitteeAdditional(requestId, nonce)
        end
        Note over Project: 3 additional approvers
    end
    
    rect rgb(240, 200, 200)
        Note over Project: Level 5: Director Approval
        Director->>Project: commitApproval(requestId, commitment)
        Note over Director: Wait 30 minutes
        Director->>Project: approveByDirector(requestId, nonce)
        Note over Project: Status → DirectorApproved
        Note over Project: Lock funds
        Note over Project: Auto-distribute
        Project->>Token: transfer(recipient, amount)
        Note over Project: Status → Distributed
    end
```

## Multiple Recipients Reimbursement Flow

```mermaid
sequenceDiagram
    participant Requester
    participant Project as ProjectReimbursement
    participant Approvers as Approval Chain
    participant Recipients as Recipients[]
    participant Token as OMTHB Token

    Requester->>Project: createRequestMultiple(recipients[], amounts[], desc, hash, virtualPayer)
    Note over Project: Validate arrays match
    Note over Project: Check max 10 recipients
    Note over Project: Validate each amount
    Note over Project: Calculate total amount
    Note over Project: Check available balance
    
    alt virtualPayer != address(0)
        Note over Project: Validate virtual payer
        Note over Project: Store virtual payer
    end
    
    Project-->>Requester: Return requestId
    Project-->>Requester: Emit RequestCreated
    
    Note over Approvers: 5-level approval process
    Approvers->>Project: [Same as single recipient flow]
    
    Note over Project: Director approval triggers distribution
    
    loop For each recipient
        Project->>Token: transfer(recipients[i], amounts[i])
        Project-->>Recipients: Emit SingleDistribution
    end
    
    Project-->>Requester: Emit FundsDistributed
    Note over Project: Update total distributed
    Note over Project: Unlock funds
    Note over Project: Status → Distributed
```

## Emergency Closure Flow

```mermaid
sequenceDiagram
    participant Initiator as Committee/Director
    participant Project as ProjectReimbursement
    participant Committee1
    participant Committee2
    participant Committee3
    participant Director
    participant ReturnAddr as Return Address
    participant Token as OMTHB Token

    Initiator->>Project: initiateEmergencyClosure(returnAddress, reason)
    Note over Project: Verify role (COMMITTEE/DIRECTOR)
    Note over Project: Check no active closure
    Note over Project: Create closure request
    Project-->>Initiator: Return closureId
    
    rect rgb(240, 200, 200)
        Note over Project: Need 3 Committee Approvals
        
        Committee1->>Project: commitClosureApproval(closureId, commitment)
        Note over Committee1: Wait 30 minutes
        Committee1->>Project: approveEmergencyClosure(closureId, nonce)
        Note over Project: 1/3 committee approvals
        
        Committee2->>Project: commitClosureApproval(closureId, commitment)
        Note over Committee2: Wait 30 minutes
        Committee2->>Project: approveEmergencyClosure(closureId, nonce)
        Note over Project: 2/3 committee approvals
        
        Committee3->>Project: commitClosureApproval(closureId, commitment)
        Note over Committee3: Wait 30 minutes
        Committee3->>Project: approveEmergencyClosure(closureId, nonce)
        Note over Project: 3/3 committee approvals
        Note over Project: Status → FullyApproved
    end
    
    rect rgb(200, 240, 200)
        Note over Project: Director Final Approval
        Director->>Project: commitClosureApproval(closureId, commitment)
        Note over Director: Wait 30 minutes
        Director->>Project: approveEmergencyClosure(closureId, nonce)
        
        Note over Project: Auto-execute closure
        Project->>Project: _pause()
        Note over Project: Get total balance
        Project->>Token: transfer(returnAddress, balance)
        Note over Project: Status → Executed
        Project-->>All: Emit EmergencyClosureExecuted
    end
```

## Token Deposit Flow

```mermaid
sequenceDiagram
    participant Depositor
    participant Token as OMTHB Token
    participant Project as ProjectReimbursement

    Note over Depositor: Check project needs deposit
    Depositor->>Project: needsDeposit()
    Project-->>Depositor: Returns true/false
    
    alt Needs deposit
        Depositor->>Token: balanceOf(depositor)
        Note over Depositor: Ensure sufficient balance
        
        Depositor->>Token: approve(projectAddress, amount)
        Note over Token: Record allowance
        
        Depositor->>Project: depositOMTHB(amount)
        Note over Project: Validate amount >= 10 OMTHB
        Note over Project: Check allowance
        
        Project->>Token: transferFrom(depositor, project, amount)
        Note over Token: Transfer tokens
        
        Project->>Project: Update budget
        Project-->>Depositor: Emit OMTHBDeposited
        Project-->>Depositor: Emit BudgetIncreased
        Project-->>Depositor: Emit AvailableBalanceChanged
    end
```

## Commit-Reveal Approval Pattern

```mermaid
sequenceDiagram
    participant Approver
    participant Frontend
    participant Project as ProjectReimbursement
    participant Time as Time

    Note over Frontend: Generate random nonce
    Frontend->>Frontend: nonce = randomBytes(32)
    
    Note over Frontend: Create commitment
    Frontend->>Frontend: commitment = keccak256(approver, requestId, chainId, nonce)
    
    rect rgb(240, 240, 200)
        Note over Frontend: COMMIT PHASE
        Approver->>Project: commitApproval(requestId, commitment)
        Note over Project: Store commitment
        Note over Project: Record timestamp
        Project-->>Approver: Emit ApprovalCommitted
        
        Note over Frontend: Store nonce securely
        Frontend->>Frontend: localStorage.setItem(key, nonce)
    end
    
    Time->>Time: Wait 30 minutes minimum
    
    rect rgb(200, 240, 200)
        Note over Frontend: REVEAL PHASE
        Frontend->>Frontend: Retrieve stored nonce
        
        Approver->>Project: approveByRole(requestId, nonce)
        Note over Project: Verify timestamp >= commit + 30min
        Note over Project: Recreate commitment hash
        Note over Project: Verify hash matches
        
        alt Hash matches
            Note over Project: Process approval
            Note over Project: Update request status
            Project-->>Approver: Emit RequestApproved
            Project-->>Approver: Emit ApprovalRevealed
        else Hash mismatch
            Project-->>Approver: Revert InvalidCommitment
        end
    end
```

## State Transitions

### Request Status Flow

```mermaid
stateDiagram-v2
    [*] --> Pending: createRequest()
    
    Pending --> SecretaryApproved: approveBySecretary()
    Pending --> Cancelled: cancelRequest()
    
    SecretaryApproved --> CommitteeApproved: approveByCommittee()
    SecretaryApproved --> Cancelled: cancelRequest()
    
    CommitteeApproved --> FinanceApproved: approveByFinance()
    CommitteeApproved --> Cancelled: cancelRequest()
    
    FinanceApproved --> FinanceApproved: approveByCommitteeAdditional() [<3]
    FinanceApproved --> DirectorApproved: approveByDirector() [>=3]
    FinanceApproved --> Cancelled: cancelRequest()
    
    DirectorApproved --> Distributed: Auto-distribute
    DirectorApproved --> Cancelled: unlockStaleRequest() [30+ days]
    
    Distributed --> [*]
    Cancelled --> [*]
```

### Emergency Closure Status Flow

```mermaid
stateDiagram-v2
    [*] --> Initiated: initiateEmergencyClosure()
    
    Initiated --> PartiallyApproved: approveEmergencyClosure() [<3 committee]
    Initiated --> FullyApproved: approveEmergencyClosure() [3 committee]
    Initiated --> Cancelled: cancelEmergencyClosure()
    
    PartiallyApproved --> FullyApproved: approveEmergencyClosure() [3 committee]
    PartiallyApproved --> Cancelled: cancelEmergencyClosure()
    
    FullyApproved --> Executed: approveEmergencyClosure() [director]
    FullyApproved --> Cancelled: cancelEmergencyClosure()
    
    Executed --> [*]: Contract paused permanently
    Cancelled --> [*]
```

## Best Practices

### For Frontend Developers

1. **Nonce Storage**: Store nonces securely in browser storage with request ID as key
2. **Commitment Timing**: Show countdown timer for 30-minute reveal window
3. **Error Handling**: Catch and handle specific revert reasons
4. **Gas Estimation**: Always estimate gas before transactions
5. **Event Listening**: Subscribe to events for real-time updates

### For Users

1. **Approval Timing**: Plan approvals considering 30-minute wait time
2. **Multiple Recipients**: Batch payments to save gas
3. **Document Hashes**: Use IPFS for document storage
4. **Role Verification**: Check roles before attempting operations
5. **Emergency Procedures**: Understand closure process for emergencies

### Security Considerations

1. **Commit-Reveal**: Prevents front-running attacks
2. **Role Separation**: Different roles for different approval levels
3. **Time Locks**: Prevents rushed malicious actions
4. **Multi-Sig**: Critical operations require multiple signatures
5. **Fund Locking**: Approved funds are locked until distributed