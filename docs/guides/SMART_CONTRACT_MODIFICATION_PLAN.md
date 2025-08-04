# Smart Contract Modification Plan

## Overview
This document outlines the planned modifications to implement:
1. Automatic OMTHB locking in project treasury during project creation
2. Distribution flow through requester's wallet (automated)

## 1. OMTHB Locking During Project Creation

### Current Flow
1. ProjectFactory creates project with budget parameter
2. Budget is only stored as a limit
3. Admin must manually transfer OMTHB later

### New Flow
1. Project creator approves OMTHB to ProjectFactory
2. ProjectFactory transfers OMTHB from creator to new project
3. Project is created with actual funds, not just budget limit

### Implementation Changes

#### ProjectFactory.sol Modifications

```solidity
// Add at the beginning of createProject function
function createProject(
    string calldata projectId,
    uint256 budget,
    address projectAdmin
) external onlyRole(PROJECT_CREATOR_ROLE) nonReentrant whenNotPaused returns (address) {
    // ... existing validation ...
    
    // NEW: Check OMTHB allowance and balance
    uint256 allowance = omthbToken.allowance(msg.sender, address(this));
    if (allowance < budget) revert InsufficientAllowance();
    
    uint256 balance = omthbToken.balanceOf(msg.sender);
    if (balance < budget) revert InsufficientBalance();
    
    // Deploy minimal proxy (existing code)
    address clone = projectImplementation.clone();
    
    // Initialize the project contract (existing code)
    ProjectReimbursement(clone).initialize(...);
    
    // NEW: Transfer OMTHB from creator to project
    bool success = omthbToken.transferFrom(msg.sender, clone, budget);
    if (!success) revert TransferFailed();
    
    // ... rest of existing code ...
}

// Add new error definitions
error InsufficientAllowance();
error InsufficientBalance();
error TransferFailed();
```

### Frontend Integration Requirements
```javascript
// Before creating project
await omthbToken.approve(projectFactoryAddress, budgetAmount);
await projectFactory.createProject(projectId, budgetAmount, projectAdmin);
```

## 2. Distribution Through Requester's Wallet

### Current Flow
1. Director approves
2. Contract transfers directly to recipients

### New Flow
1. Director approves
2. Contract transfers total amount to requester
3. Requester automatically distributes to recipients
4. All automated in single transaction

### Implementation Approach

#### Option A: Internal Accounting (Recommended)
- Transfer to requester first
- Use delegatecall or internal function to distribute
- Single transaction, gas efficient

#### Option B: Two-Step with Callback
- Transfer to requester
- Requester contract callback to distribute
- More complex but clearer fund flow

### Implementation Changes (Option A)

#### ProjectReimbursementMultiRecipient.sol Modifications

```solidity
// Modify _distributeMultipleFunds function
function _distributeMultipleFunds(uint256 requestId) private {
    ReimbursementRequest storage request = requests[requestId];
    
    // ... existing validation ...
    
    // Cache values
    uint256 totalAmount = request.totalAmount;
    address[] memory recipients = request.recipients;
    uint256[] memory amounts = request.amounts;
    address requester = request.requester;
    
    // Update state before transfers
    request.status = Status.Distributed;
    request.updatedAt = block.timestamp;
    totalDistributed += totalAmount;
    
    // NEW: Transfer total to requester first
    emit FundsTransferredToRequester(requestId, requester, totalAmount);
    bool success = omthbToken.transfer(requester, totalAmount);
    if (!success) revert TransferFailed();
    
    // NEW: Execute distributions from requester
    // This requires requester to have pre-approved this contract
    for (uint256 i = 0; i < recipients.length; i++) {
        success = omthbToken.transferFrom(requester, recipients[i], amounts[i]);
        if (!success) revert RequesterDistributionFailed();
        emit FundsDistributedFromRequester(requester, recipients[i], amounts[i]);
    }
    
    emit FundsDistributed(requestId, recipients, amounts, totalAmount);
}

// Add new events
event FundsTransferredToRequester(uint256 indexed requestId, address indexed requester, uint256 totalAmount);
event FundsDistributedFromRequester(address indexed from, address indexed to, uint256 amount);

// Add new error
error RequesterDistributionFailed();
```

### Alternative: Smart Wallet Approach

Create a temporary smart wallet for distribution:

```solidity
contract DistributionWallet {
    function distribute(
        IOMTHB token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        for (uint256 i = 0; i < recipients.length; i++) {
            token.transfer(recipients[i], amounts[i]);
        }
        // Self-destruct to return any remaining gas
        selfdestruct(payable(msg.sender));
    }
}
```

## 3. Security Considerations

### For OMTHB Locking
1. **Reentrancy Protection**: Already implemented with nonReentrant
2. **Approval Front-running**: Users should use increaseAllowance/decreaseAllowance
3. **Budget Validation**: Maximum budget limits prevent mistakes

### For Requester Distribution
1. **Pre-approval Required**: Requester must approve contract before creating request
2. **Atomic Transaction**: All transfers in single transaction
3. **Insufficient Balance**: Check requester has received funds before distribution

## 4. Gas Optimization

### Estimated Gas Costs
- Project Creation: +50,000 gas for token transfer
- Distribution: +30,000 gas per recipient for additional transfers

### Optimization Strategies
1. Batch transfers if OMTHB supports it
2. Use CREATE2 for deterministic addresses
3. Pack struct data efficiently

## 5. Migration Strategy

### Phase 1: Deploy Updated Contracts
1. Deploy new ProjectFactory
2. Update all role assignments
3. Test with small amounts

### Phase 2: Frontend Updates
1. Add approval flow before project creation
2. Add requester approval for distributions
3. Update transaction monitoring

### Phase 3: User Communication
1. Notify about new approval requirements
2. Provide migration guide
3. Support period for questions

## 6. Testing Requirements

### Unit Tests
1. Test OMTHB transfer during project creation
2. Test insufficient balance/allowance scenarios
3. Test distribution through requester
4. Test partial distribution failures

### Integration Tests
1. Full flow from creation to distribution
2. Multi-recipient distributions
3. Gas usage measurements
4. Failure recovery scenarios

## 7. Audit Considerations

### Key Areas for Review
1. Token transfer safety
2. Reentrancy protection
3. Access control
4. Integer overflow (using Solidity 0.8+)
5. Front-running vulnerabilities

## 8. Alternative Approaches Considered

### For OMTHB Locking
1. **Escrow Contract**: Separate escrow for all projects (more complex)
2. **Pull Pattern**: Projects pull funds as needed (gas inefficient)
3. **Streaming**: Continuous funding stream (overkill for this use case)

### For Distribution Flow
1. **Multi-sig Wallet**: Too complex for automated flow
2. **Proxy Pattern**: Additional complexity without clear benefits
3. **Direct Multi-call**: Loses the "through requester" requirement

## Recommendation

Proceed with:
1. **Direct transfer on creation** for OMTHB locking (simplest, most secure)
2. **Internal accounting approach** for requester distribution (maintains atomicity)

This provides the clearest implementation while maintaining security and gas efficiency.