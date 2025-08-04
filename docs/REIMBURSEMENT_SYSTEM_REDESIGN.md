# Reimbursement System Redesign: Deposit & Locking Mechanism

## Table of Contents
1. [Current System Analysis](#current-system-analysis)
2. [New Requirements Summary](#new-requirements-summary)
3. [Design Overview](#design-overview)
4. [Detailed Implementation Plan](#detailed-implementation-plan)
5. [Security Considerations](#security-considerations)
6. [Edge Cases](#edge-cases)
7. [Migration Strategy](#migration-strategy)

## Current System Analysis

### ProjectFactory.createProject() Analysis
The current implementation (lines 144-241 in ProjectFactory.sol) performs the following:

1. **Validation**: Checks project ID, admin address, and budget constraints
2. **Token Transfer**: Requires project creator to have approved the factory for the exact budget amount
3. **Immediate Transfer**: Transfers OMTHB tokens from creator to the newly deployed project contract
4. **Deployment**: Creates a minimal proxy of ProjectReimbursement contract

**Key Code Snippet:**
```solidity
// Lines 157-164: Check allowance and balance
uint256 allowance = omthbToken.allowance(msg.sender, address(this));
if (allowance < budget) revert InsufficientAllowance();
uint256 creatorBalance = omthbToken.balanceOf(msg.sender);
if (creatorBalance < budget) revert InsufficientBalance();

// Lines 198: Transfer tokens during creation
try omthbToken.transferFrom{gas: gasLimit}(msg.sender, clone, budget) returns (bool success) {
    transferSuccess = success;
}
```

### ProjectReimbursement Request/Approval Flow
The current flow involves:

1. **Request Creation** (lines 358-436): Creates reimbursement request with recipients and amounts
2. **Multi-level Approval**: Secretary → Committee → Finance → Committee (3 additional) → Director
3. **Auto-distribution** (line 779): Funds are automatically distributed after director approval
4. **Budget Tracking**: Uses `totalDistributed` to track spent amount against `projectBudget`

**Key Points:**
- No concept of "locked" amounts currently exists
- Budget validation only checks: `totalDistributed + requestAmount <= projectBudget`
- No separation between available and locked funds

## New Requirements Summary

1. **Decoupled Creation**: Allow project creation WITHOUT initial OMTHB transfer
2. **Deposit Functionality**: Projects must deposit OMTHB before creating reimbursement requests
3. **Request Locking**: Approved requests lock funds, reducing available balance
4. **Balance Tracking**: Separate tracking of total balance vs available balance

## Design Overview

### State Variables to Add

```solidity
// In ProjectReimbursement.sol

// Treasury management
uint256 public totalDeposited;        // Total OMTHB ever deposited
uint256 public totalLocked;           // Currently locked by approved requests
mapping(uint256 => bool) public isRequestLocked;  // Track which requests have locked funds

// Deposit tracking
mapping(address => uint256) public depositorBalances;  // Track deposits by address
uint256[] public depositHistory;      // Array of deposit events for audit trail

struct DepositRecord {
    address depositor;
    uint256 amount;
    uint256 timestamp;
}
mapping(uint256 => DepositRecord) public deposits;
uint256 public depositCounter;
```

### New Functions to Implement

```solidity
// Deposit function
function depositOMTHB(uint256 amount) external;

// View functions
function getTreasuryBalance() external view returns (uint256);
function getAvailableBalance() external view returns (uint256);
function getLockedBalance() external view returns (uint256);
function canCreateRequest(uint256 amount) external view returns (bool);
```

## Detailed Implementation Plan

### 1. Modify ProjectFactory.createProject()

```solidity
function createProject(
    string calldata projectId,
    uint256 budget,  // Now represents max budget, not initial deposit
    address projectAdmin
) external onlyRole(PROJECT_CREATOR_ROLE) nonReentrant whenNotPaused returns (address) {
    // Validation remains the same except:
    // - Remove allowance check
    // - Remove balance check
    // - Remove token transfer logic
    
    // Deploy minimal proxy
    address clone = projectImplementation.clone();
    
    // Initialize with budget (no token transfer)
    ProjectReimbursement(clone).initialize(
        projectId,
        address(omthbToken),
        budget,  // Max budget cap, not initial balance
        projectAdmin
    );
    
    // Grant roles and store project info as before
    // ...
    
    emit ProjectCreated(projectId, clone, msg.sender, budget);
    return clone;
}
```

### 2. Add Deposit Functionality to ProjectReimbursement

```solidity
/**
 * @notice Deposit OMTHB tokens into the project treasury
 * @param amount The amount of OMTHB to deposit
 * @dev Caller must have approved this contract for the amount
 */
function depositOMTHB(uint256 amount) 
    external 
    whenNotPaused 
    notEmergencyStopped 
    nonReentrant 
{
    // Validation
    if (amount == 0) revert InvalidAmount();
    if (amount > MAX_REIMBURSEMENT_AMOUNT) revert AmountTooHigh();
    
    // Check if project is closed
    if (emergencyStop || paused()) revert ContractNotActive();
    
    // Check allowance
    uint256 allowance = omthbToken.allowance(msg.sender, address(this));
    if (allowance < amount) revert InsufficientAllowance();
    
    // Check sender balance
    uint256 senderBalance = omthbToken.balanceOf(msg.sender);
    if (senderBalance < amount) revert InsufficientBalance();
    
    // Record deposit
    uint256 depositId = depositCounter++;
    deposits[depositId] = DepositRecord({
        depositor: msg.sender,
        amount: amount,
        timestamp: block.timestamp
    });
    
    // Update balances
    depositorBalances[msg.sender] += amount;
    totalDeposited += amount;
    depositHistory.push(depositId);
    
    // Transfer tokens
    bool success = omthbToken.transferFrom(msg.sender, address(this), amount);
    if (!success) revert TransferFailed();
    
    // Verify transfer
    uint256 newBalance = omthbToken.balanceOf(address(this));
    if (newBalance < amount) revert TransferFailed();
    
    emit OMTHBDeposited(msg.sender, amount, newBalance);
}
```

### 3. Modify Request Creation Validation

```solidity
function _validateBudget(uint256 amount) private view {
    // Check against available balance, not just budget
    uint256 currentBalance = omthbToken.balanceOf(address(this));
    uint256 availableBalance = currentBalance - totalLocked;
    
    if (amount > availableBalance) revert InsufficientAvailableBalance();
    
    // Still check against max project budget
    uint256 projectedTotal = totalDistributed + totalLocked + amount;
    if (projectedTotal > projectBudget) revert ExceedsProjectBudget();
}
```

### 4. Implement Locking Mechanism

```solidity
/**
 * @notice Lock funds when request is approved by director
 * @dev Called internally after director approval
 */
function _lockRequestFunds(uint256 requestId) private {
    ReimbursementRequest storage request = requests[requestId];
    
    if (isRequestLocked[requestId]) revert AlreadyLocked();
    
    // Update locked amount
    totalLocked += request.totalAmount;
    isRequestLocked[requestId] = true;
    
    emit FundsLocked(requestId, request.totalAmount, totalLocked);
}

/**
 * @notice Unlock funds when distributing or cancelling
 * @dev Called internally before distribution or cancellation
 */
function _unlockRequestFunds(uint256 requestId) private {
    ReimbursementRequest storage request = requests[requestId];
    
    if (!isRequestLocked[requestId]) return;
    
    // Update locked amount
    totalLocked -= request.totalAmount;
    isRequestLocked[requestId] = false;
    
    emit FundsUnlocked(requestId, request.totalAmount, totalLocked);
}
```

### 5. Modify Approval Flow

```solidity
function approveByDirector(uint256 requestId, uint256 nonce) 
    external 
    onlyRole(DIRECTOR_ROLE) 
    whenNotPaused 
    notEmergencyStopped
    nonReentrant
{
    // ... existing validation and reveal logic ...
    
    // After updating status to DirectorApproved:
    request.status = Status.DirectorApproved;
    request.updatedAt = block.timestamp;
    request.paymentDeadline = block.timestamp + PAYMENT_DEADLINE_DURATION;
    
    // NEW: Lock the funds
    _lockRequestFunds(requestId);
    
    // ... emit events ...
    
    // Auto-distribute funds (will unlock during distribution)
    _distributeMultipleFunds(requestId);
}
```

### 6. Modify Distribution Logic

```solidity
function _distributeMultipleFunds(uint256 requestId) private {
    ReimbursementRequest storage request = requests[requestId];
    
    // ... existing validation ...
    
    // NEW: Unlock funds before distribution
    _unlockRequestFunds(requestId);
    
    // ... rest of distribution logic remains the same ...
}
```

### 7. Implement View Functions

```solidity
/**
 * @notice Get total OMTHB balance in treasury
 * @return Current OMTHB balance held by contract
 */
function getTreasuryBalance() external view returns (uint256) {
    return omthbToken.balanceOf(address(this));
}

/**
 * @notice Get available balance for new requests
 * @return Amount available for new reimbursement requests
 */
function getAvailableBalance() external view returns (uint256) {
    uint256 currentBalance = omthbToken.balanceOf(address(this));
    if (currentBalance <= totalLocked) return 0;
    return currentBalance - totalLocked;
}

/**
 * @notice Get currently locked balance
 * @return Amount locked by approved but not yet distributed requests
 */
function getLockedBalance() external view returns (uint256) {
    return totalLocked;
}

/**
 * @notice Check if a request of given amount can be created
 * @param amount The request amount to check
 * @return True if sufficient available balance exists
 */
function canCreateRequest(uint256 amount) external view returns (bool) {
    uint256 currentBalance = omthbToken.balanceOf(address(this));
    uint256 availableBalance = currentBalance > totalLocked ? currentBalance - totalLocked : 0;
    
    // Check available balance
    if (amount > availableBalance) return false;
    
    // Check project budget limit
    uint256 projectedTotal = totalDistributed + totalLocked + amount;
    if (projectedTotal > projectBudget) return false;
    
    return true;
}

/**
 * @notice Get deposit history for an address
 * @param depositor The depositor address
 * @return Total amount deposited by address
 */
function getDepositorBalance(address depositor) external view returns (uint256) {
    return depositorBalances[depositor];
}
```

### 8. Update Cancel Request Logic

```solidity
function cancelRequest(uint256 requestId) external whenNotPaused notEmergencyStopped nonReentrant {
    // ... existing validation ...
    
    // NEW: Unlock funds if request was locked
    if (request.status == Status.DirectorApproved && isRequestLocked[requestId]) {
        _unlockRequestFunds(requestId);
    }
    
    // ... rest of cancellation logic ...
}
```

## Security Considerations

### 1. Reentrancy Protection
- All state changes happen before external calls
- Use of `nonReentrant` modifier on all public functions
- Funds are locked/unlocked atomically

### 2. Access Control
- Deposit function is public but requires token approval
- Only authorized roles can create requests
- Locking happens automatically, not manually

### 3. Integer Overflow/Underflow
- Solidity 0.8+ provides automatic protection
- Additional validation for edge cases

### 4. Race Conditions
- Locking prevents double-spending of available funds
- Atomic state updates prevent inconsistencies

### 5. DoS Prevention
- Gas limits on external calls
- Array length limits for deposit history
- Cleanup mechanisms for old data

## Edge Cases

### 1. Insufficient Balance for Approved Request
**Scenario**: Request approved but treasury drained before distribution
**Solution**: Check actual balance during distribution, revert if insufficient

### 2. Multiple Simultaneous Requests
**Scenario**: Two requests created that together exceed available balance
**Solution**: Validation checks available balance (total - locked) for each request

### 3. Cancelled Request After Director Approval
**Scenario**: Request cancelled after funds are locked
**Solution**: Unlock funds during cancellation

### 4. Emergency Closure with Locked Funds
**Scenario**: Project closed while requests have locked funds
**Solution**: Emergency closure returns all funds including locked amounts

### 5. Deposit After Project Budget Reached
**Scenario**: Deposits continue after totalDistributed reaches projectBudget
**Solution**: Allow deposits but prevent new requests that would exceed budget

### 6. Zero Balance But Locked Funds
**Scenario**: All treasury funds are locked, no available balance
**Solution**: Prevent new requests, show clear error message

## Migration Strategy

### Phase 1: Deploy Updated Contracts
1. Deploy new ProjectReimbursement implementation
2. Deploy updated ProjectFactory
3. Test thoroughly on testnet

### Phase 2: Transition Existing Projects
For existing projects with funds:
1. Pause old factory
2. Allow projects to migrate voluntarily
3. Track deposited amount as initial balance

### Phase 3: Deprecate Old System
1. Stop new project creation on old factory
2. Provide migration tools
3. Set sunset date for old contracts

## New Events

```solidity
event OMTHBDeposited(address indexed depositor, uint256 amount, uint256 newBalance);
event FundsLocked(uint256 indexed requestId, uint256 amount, uint256 totalLocked);
event FundsUnlocked(uint256 indexed requestId, uint256 amount, uint256 totalLocked);
event AvailableBalanceUpdated(uint256 available, uint256 locked, uint256 total);
```

## Testing Recommendations

1. **Unit Tests**:
   - Deposit with various amounts
   - Request creation with/without sufficient balance
   - Locking/unlocking mechanisms
   - Edge cases listed above

2. **Integration Tests**:
   - Full flow: deposit → request → approve → distribute
   - Multiple concurrent requests
   - Budget limit enforcement

3. **Security Tests**:
   - Reentrancy attempts
   - Integer overflow scenarios
   - Access control violations

4. **Gas Optimization Tests**:
   - Measure gas costs for all operations
   - Optimize storage patterns if needed