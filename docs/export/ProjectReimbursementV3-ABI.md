# ProjectReimbursementV3 Contract ABI Documentation

## Contract Overview

The ProjectReimbursementV3 contract manages reimbursement requests with multi-level approval workflows, supporting multiple recipients per request, emergency closure functionality, and enhanced security features.

**Contract Address**: Deployed via ProjectFactoryV3 (unique per project)

## Key Features

- Multi-recipient reimbursement requests
- 5-level approval workflow with commit-reveal pattern
- Emergency closure with multi-sig approval
- Fund locking mechanism for approved requests
- Virtual payer tracking
- Stale request management
- Role-based access control

## Function Reference

### Reimbursement Request Management

#### createRequestMultiple

Creates a new reimbursement request with multiple recipients.

```solidity
function createRequestMultiple(
    address[] calldata recipients,
    uint256[] calldata amounts,
    string calldata description,
    string calldata documentHash,
    address virtualPayer
) external returns (uint256)
```

**Parameters:**
- `recipients`: Array of recipient addresses (max 10)
- `amounts`: Array of amounts for each recipient (must match recipients length)
- `description`: Description of the expense
- `documentHash`: IPFS hash or document reference
- `virtualPayer`: Optional virtual payer address (use address(0) if not needed)

**Returns:** `requestId` - The ID of the created request

**Requirements:**
- Caller must have `REQUESTER_ROLE`
- Contract not paused or emergency stopped
- Total amount must not exceed available balance
- Each amount must be between 100 and 1,000,000 OMTHB

**Events:**
- `RequestCreated(requestId, requester, recipients, amounts, totalAmount, description, virtualPayer)`

**Example:**
```javascript
// Create a request with multiple recipients
const recipients = ["0xAddress1", "0xAddress2"];
const amounts = [ethers.parseEther("500"), ethers.parseEther("300")];
const description = "Team expense reimbursement";
const documentHash = "QmXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const virtualPayer = "0x0000000000000000000000000000000000000000"; // No virtual payer

const tx = await contract.createRequestMultiple(
    recipients,
    amounts,
    description,
    documentHash,
    virtualPayer
);
const receipt = await tx.wait();
const requestId = receipt.logs[0].args.requestId;
```

#### createRequest

Creates a single recipient request (backward compatibility).

```solidity
function createRequest(
    address recipient,
    uint256 amount,
    string calldata description,
    string calldata documentHash
) external returns (uint256)
```

**Parameters:**
- `recipient`: The recipient address
- `amount`: The amount to reimburse
- `description`: Description of the expense
- `documentHash`: IPFS hash or document reference

**Returns:** `requestId` - The ID of the created request

### Approval Functions (Commit-Reveal Pattern)

#### commitApproval

Step 1: Commit to approve a request (prevents front-running).

```solidity
function commitApproval(uint256 requestId, bytes32 commitment) external
```

**Parameters:**
- `requestId`: The request ID to approve
- `commitment`: Hash of `keccak256(abi.encodePacked(approver, requestId, chainId, nonce))`

**Example:**
```javascript
// Generate commitment
const nonce = ethers.randomBytes(32);
const commitment = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "uint256"],
        [approverAddress, requestId, chainId, nonce]
    )
);

// Commit
await contract.commitApproval(requestId, commitment);

// Wait for reveal window (30 minutes)
await new Promise(resolve => setTimeout(resolve, 31 * 60 * 1000));
```

#### approveBySecretary

Secretary approval (Level 1) with reveal.

```solidity
function approveBySecretary(uint256 requestId, uint256 nonce) external
```

**Requirements:**
- Caller must have `SECRETARY_ROLE`
- Must have committed at least 30 minutes ago
- Request status must be `Pending`

#### approveByCommittee

Committee approval (Level 2) with reveal.

```solidity
function approveByCommittee(uint256 requestId, uint256 nonce) external
```

**Requirements:**
- Caller must have `COMMITTEE_ROLE`
- Request status must be `SecretaryApproved`

#### approveByFinance

Finance approval (Level 3) with reveal.

```solidity
function approveByFinance(uint256 requestId, uint256 nonce) external
```

**Requirements:**
- Caller must have `FINANCE_ROLE`
- Request status must be `CommitteeApproved`

#### approveByCommitteeAdditional

Additional committee approval (Level 4) with reveal.

```solidity
function approveByCommitteeAdditional(uint256 requestId, uint256 nonce) external
```

**Requirements:**
- Caller must have `COMMITTEE_ROLE`
- Must be different from Level 2 committee approver
- Need 3 additional committee approvers total

#### approveByDirector

Director approval (Level 5) with reveal and auto-distribution.

```solidity
function approveByDirector(uint256 requestId, uint256 nonce) external
```

**Requirements:**
- Caller must have `DIRECTOR_ROLE`
- Request must have 3 additional committee approvers
- Automatically distributes funds upon approval

### Request Management

#### cancelRequest

Cancel a reimbursement request.

```solidity
function cancelRequest(uint256 requestId) external
```

**Requirements:**
- Caller must be request creator or admin
- Request not already distributed

#### cancelAbandonedRequest

Cancel a request abandoned for 15+ days.

```solidity
function cancelAbandonedRequest(uint256 requestId) external
```

**Requirements:**
- Request must be 15+ days since last update
- Can be called by anyone

#### unlockStaleRequest

Unlock funds from requests approved but not distributed for 30+ days.

```solidity
function unlockStaleRequest(uint256 requestId) external
```

**Requirements:**
- Request must be director approved but not distributed
- Must be 30+ days since director approval
- Can be called by anyone

### Token Management

#### depositOMTHB

Deposit OMTHB tokens to the project.

```solidity
function depositOMTHB(uint256 amount) external
```

**Parameters:**
- `amount`: Amount to deposit (minimum 10 OMTHB)

**Requirements:**
- Caller must have approved the contract
- Amount must be at least 10 OMTHB

**Events:**
- `OMTHBDeposited(depositor, amount, newBalance)`
- `BudgetIncreased(amount, depositor)`

### Emergency Closure

#### initiateEmergencyClosure

Initiate an emergency closure request.

```solidity
function initiateEmergencyClosure(
    address returnAddress,
    string calldata reason
) external returns (uint256)
```

**Parameters:**
- `returnAddress`: Where to send remaining tokens
- `reason`: Reason for closure

**Requirements:**
- Caller must have `COMMITTEE_ROLE` or `DIRECTOR_ROLE`
- No other active closure request

#### commitClosureApproval

Commit to approve emergency closure.

```solidity
function commitClosureApproval(uint256 closureId, bytes32 commitment) external
```

#### approveEmergencyClosure

Approve emergency closure with reveal.

```solidity
function approveEmergencyClosure(uint256 closureId, uint256 nonce) external
```

**Requirements:**
- Need 3 committee members + 1 director approval
- Auto-executes upon director approval

### View Functions

#### getRequest

Get complete request details.

```solidity
function getRequest(uint256 requestId) external view returns (ReimbursementRequest memory)
```

**Returns:**
```solidity
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
```

#### getRequestRecipients

Get recipients for a request.

```solidity
function getRequestRecipients(uint256 requestId) external view returns (address[] memory)
```

#### getRequestAmounts

Get amounts for each recipient.

```solidity
function getRequestAmounts(uint256 requestId) external view returns (uint256[] memory)
```

#### getActiveRequests

Get all active request IDs.

```solidity
function getActiveRequests() external view returns (uint256[] memory)
```

#### getUserActiveRequests

Get active requests for a specific user.

```solidity
function getUserActiveRequests(address user) external view returns (uint256[] memory)
```

#### getAvailableBalance

Get available balance (total - locked).

```solidity
function getAvailableBalance() external view returns (uint256)
```

#### getTotalBalance

Get total OMTHB balance.

```solidity
function getTotalBalance() external view returns (uint256)
```

#### getLockedAmount

Get total locked amount.

```solidity
function getLockedAmount() external view returns (uint256)
```

#### needsDeposit

Check if project needs deposits.

```solidity
function needsDeposit() external view returns (bool)
```

#### isRequestStale

Check if a request is stale (30+ days).

```solidity
function isRequestStale(uint256 requestId) external view returns (bool)
```

#### isRequestAbandoned

Check if a request is abandoned (15+ days).

```solidity
function isRequestAbandoned(uint256 requestId) external view returns (bool)
```

### Role Management

#### hasRole

Check if an address has a specific role.

```solidity
function hasRole(bytes32 role, address account) external view returns (bool)
```

**Available Roles:**
- `SECRETARY_ROLE`: `0x4e75795e7a2b24e4a7963050506b3388ff3a19dc664fb48e863c8cf3b9b91e2b`
- `COMMITTEE_ROLE`: `0xb788c5d126a0f4144e47f9cf960d728232bb636a6fc7e3e965f19f0e5f2e6d6e`
- `FINANCE_ROLE`: `0x3c8e382eba87ece982e08f56a9c2e7d36b37bb433aab965a45d960de88e87cf6`
- `DIRECTOR_ROLE`: `0xf7b7d4c7e6b9bcacc9ad1ec53b86f7c7c35c4eac7ab07c37f7e7c7e87dd3c3c7`
- `REQUESTER_ROLE`: `0xa31f99e0c9b9f91902e635e9c03e95403f3508db3a8716d9545b7b91b7e66d67`
- `DEFAULT_ADMIN_ROLE`: `0x0000000000000000000000000000000000000000000000000000000000000000`

## Events

### Core Events

```solidity
event RequestCreated(
    uint256 indexed requestId,
    address indexed requester,
    address[] recipients,
    uint256[] amounts,
    uint256 totalAmount,
    string description,
    address virtualPayer
);

event RequestApproved(
    uint256 indexed requestId,
    Status indexed newStatus,
    address indexed approver
);

event FundsDistributed(
    uint256 indexed requestId,
    address[] recipients,
    uint256[] amounts,
    uint256 totalAmount,
    address virtualPayer
);

event RequestCancelled(uint256 indexed requestId, address indexed canceller);

event OMTHBDeposited(address indexed depositor, uint256 amount, uint256 newBalance);

event FundsLocked(uint256 indexed requestId, uint256 amount);

event FundsUnlocked(uint256 indexed requestId, uint256 amount);
```

### Emergency Closure Events

```solidity
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

event EmergencyClosureExecuted(
    uint256 indexed closureId,
    address indexed returnAddress,
    uint256 returnedAmount
);
```

## Error Codes

```solidity
error InvalidAmount();                  // Amount is 0 or invalid
error InvalidAddress();                 // Invalid address provided
error InvalidStatus();                  // Wrong status for operation
error RequestNotFound();                // Request ID doesn't exist
error InsufficientBudget();            // Exceeds project budget
error InsufficientAvailableBalance();  // Exceeds available balance
error AlreadyApproved();               // Already approved at this level
error UnauthorizedApprover();          // Caller lacks required role
error TransferFailed();                // Token transfer failed
error InvalidCommitment();             // Invalid commit-reveal data
error RevealTooEarly();                // Must wait 30 minutes
error TooManyRecipients();             // Exceeds 10 recipients
error EmptyRecipientList();            // No recipients provided
error ArrayLengthMismatch();           // Recipients/amounts mismatch
error AmountTooLow();                  // Below 100 OMTHB
error AmountTooHigh();                 // Above 1M OMTHB
error MaxLockedPercentageExceeded();   // Would lock >80% of funds
error RequestNotStale();               // Not stale enough to unlock
error RequestNotAbandoned();           // Not abandoned long enough
```

## Integration Examples

### Complete Request Creation Flow

```javascript
// 1. Check if deposit needed
const needsDeposit = await contract.needsDeposit();
if (needsDeposit) {
    // Approve and deposit tokens
    await omthbToken.approve(contractAddress, depositAmount);
    await contract.depositOMTHB(depositAmount);
}

// 2. Create multi-recipient request
const recipients = [
    "0x742d35Cc6634C0532925a3b844Bc9e7595f6E123",
    "0x456d35Cc6634C0532925a3b844Bc9e7595f6E456"
];
const amounts = [
    ethers.parseEther("250"),
    ethers.parseEther("150")
];

const tx = await contract.createRequestMultiple(
    recipients,
    amounts,
    "Conference expenses Q4 2024",
    "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWE5Hkj7a8dT1a",
    "0x0000000000000000000000000000000000000000"
);

const receipt = await tx.wait();
const requestId = receipt.logs.find(
    log => log.eventName === "RequestCreated"
).args.requestId;
```

### Complete Approval Flow

```javascript
// 1. Generate and store commitment
const nonce = ethers.hexlify(ethers.randomBytes(32));
const commitment = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "uint256"],
        [approverAddress, requestId, chainId, nonce]
    )
);

// 2. Commit approval
await contract.commitApproval(requestId, commitment);

// 3. Wait for reveal window (30 minutes)
await new Promise(resolve => setTimeout(resolve, 31 * 60 * 1000));

// 4. Reveal approval based on role
const request = await contract.getRequest(requestId);
switch(request.status) {
    case 0: // Pending
        await contract.approveBySecretary(requestId, nonce);
        break;
    case 1: // SecretaryApproved
        await contract.approveByCommittee(requestId, nonce);
        break;
    case 2: // CommitteeApproved
        await contract.approveByFinance(requestId, nonce);
        break;
    case 3: // FinanceApproved
        const approverCount = await contract.getCommitteeAdditionalApprovers(requestId);
        if (approverCount.length < 3) {
            await contract.approveByCommitteeAdditional(requestId, nonce);
        } else {
            await contract.approveByDirector(requestId, nonce);
        }
        break;
}
```

### Event Listening

```javascript
// Listen for request creation
contract.on("RequestCreated", (requestId, requester, recipients, amounts, totalAmount, description, virtualPayer) => {
    console.log(`New request ${requestId} created by ${requester}`);
    console.log(`Total amount: ${ethers.formatEther(totalAmount)} OMTHB`);
    console.log(`Recipients: ${recipients.length}`);
});

// Listen for approvals
contract.on("RequestApproved", (requestId, newStatus, approver) => {
    const statusNames = ["Pending", "SecretaryApproved", "CommitteeApproved", "FinanceApproved", "DirectorApproved", "Distributed", "Cancelled"];
    console.log(`Request ${requestId} approved to ${statusNames[newStatus]} by ${approver}`);
});

// Listen for distributions
contract.on("FundsDistributed", (requestId, recipients, amounts, totalAmount, virtualPayer) => {
    console.log(`Funds distributed for request ${requestId}`);
    recipients.forEach((recipient, i) => {
        console.log(`- ${recipient}: ${ethers.formatEther(amounts[i])} OMTHB`);
    });
});
```

### Error Handling

```javascript
try {
    await contract.createRequestMultiple(recipients, amounts, description, documentHash, virtualPayer);
} catch (error) {
    if (error.message.includes("InsufficientAvailableBalance")) {
        console.error("Not enough available balance. Check locked funds.");
        const available = await contract.getAvailableBalance();
        console.log(`Available: ${ethers.formatEther(available)} OMTHB`);
    } else if (error.message.includes("TooManyRecipients")) {
        console.error("Maximum 10 recipients per request");
    } else if (error.message.includes("AmountTooLow")) {
        console.error("Each amount must be at least 100 OMTHB");
    }
}
```