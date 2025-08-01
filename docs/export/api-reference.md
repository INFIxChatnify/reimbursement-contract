# API Reference

This document provides a comprehensive API reference for the reimbursement smart contract system, organized by user roles and function categories.

## Table of Contents

1. [User Functions](#user-functions)
2. [Approver Functions](#approver-functions)
3. [View Functions](#view-functions)
4. [Admin Functions](#admin-functions)
5. [Emergency Functions](#emergency-functions)
6. [Token Functions](#token-functions)
7. [Factory Functions](#factory-functions)

## User Functions

Functions available to users with `REQUESTER_ROLE` for creating and managing reimbursement requests.

### createRequest

Create a single-recipient reimbursement request.

```solidity
function createRequest(
    address recipient,
    uint256 amount,
    string calldata description,
    string calldata documentHash
) external returns (uint256)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `recipient` | `address` | Recipient address |
| `amount` | `uint256` | Amount in wei (min: 100 OMTHB, max: 1M OMTHB) |
| `description` | `string` | Expense description (max 1000 chars) |
| `documentHash` | `string` | IPFS hash or document reference (max 100 chars) |

**Returns:** `uint256` - Request ID

**Access:** Requires `REQUESTER_ROLE`

**Events:**
- `RequestCreated(requestId, requester, recipients, amounts, totalAmount, description, virtualPayer)`

**Errors:**
- `InvalidAmount()` - Amount is 0 or invalid
- `AmountTooLow()` - Amount < 100 OMTHB
- `AmountTooHigh()` - Amount > 1M OMTHB
- `InsufficientAvailableBalance()` - Not enough available balance

---

### createRequestMultiple

Create a multi-recipient reimbursement request.

```solidity
function createRequestMultiple(
    address[] calldata recipients,
    uint256[] calldata amounts,
    string calldata description,
    string calldata documentHash,
    address virtualPayer
) external returns (uint256)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `recipients` | `address[]` | Array of recipient addresses (max 10) |
| `amounts` | `uint256[]` | Array of amounts in wei |
| `description` | `string` | Expense description |
| `documentHash` | `string` | IPFS hash or document reference |
| `virtualPayer` | `address` | Virtual payer for tracking (use 0x0 if not needed) |

**Returns:** `uint256` - Request ID

**Access:** Requires `REQUESTER_ROLE`

**Events:**
- `RequestCreated(requestId, requester, recipients, amounts, totalAmount, description, virtualPayer)`

**Errors:**
- `TooManyRecipients()` - More than 10 recipients
- `EmptyRecipientList()` - No recipients provided
- `ArrayLengthMismatch()` - Recipients/amounts length mismatch
- `InvalidVirtualPayer()` - Invalid virtual payer address

---

### cancelRequest

Cancel an active reimbursement request.

```solidity
function cancelRequest(uint256 requestId) external
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `requestId` | `uint256` | Request ID to cancel |

**Access:** Request creator or `DEFAULT_ADMIN_ROLE`

**Events:**
- `RequestCancelled(requestId, canceller)`

**Errors:**
- `RequestNotFound()` - Invalid request ID
- `InvalidStatus()` - Request already distributed
- `UnauthorizedApprover()` - Not creator or admin

---

### depositOMTHB

Deposit OMTHB tokens to the project.

```solidity
function depositOMTHB(uint256 amount) external
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `amount` | `uint256` | Amount to deposit (min: 10 OMTHB) |

**Access:** Public (anyone can deposit)

**Pre-requisites:**
- Caller must approve contract for token spending

**Events:**
- `OMTHBDeposited(depositor, amount, newBalance)`
- `BudgetIncreased(amount, depositor)`

**Errors:**
- `DepositAmountTooLow()` - Amount < 10 OMTHB
- `InsufficientBalance()` - Insufficient token balance
- `DepositFailed()` - Transfer failed

## Approver Functions

Functions for multi-level approval workflow using commit-reveal pattern.

### commitApproval

Commit to approve a request (Step 1 of commit-reveal).

```solidity
function commitApproval(uint256 requestId, bytes32 commitment) external
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `requestId` | `uint256` | Request ID |
| `commitment` | `bytes32` | keccak256(approver, requestId, chainId, nonce) |

**Access:** Based on request status and caller role

**Events:**
- `ApprovalCommitted(requestId, approver, timestamp, chainId)`

**Note:** Must wait 30 minutes before revealing

---

### Level 1: Secretary Approval

```solidity
function approveBySecretary(uint256 requestId, uint256 nonce) external
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `requestId` | `uint256` | Request ID |
| `nonce` | `uint256` | Nonce used in commitment |

**Access:** Requires `SECRETARY_ROLE`

**Pre-requisites:**
- Request status: `Pending`
- Valid commitment made 30+ minutes ago

**Events:**
- `RequestApproved(requestId, SecretaryApproved, approver)`
- `ApprovalRevealed(requestId, approver, SecretaryApproved)`

---

### Level 2: Committee Approval

```solidity
function approveByCommittee(uint256 requestId, uint256 nonce) external
```

**Access:** Requires `COMMITTEE_ROLE`

**Pre-requisites:**
- Request status: `SecretaryApproved`

---

### Level 3: Finance Approval

```solidity
function approveByFinance(uint256 requestId, uint256 nonce) external
```

**Access:** Requires `FINANCE_ROLE`

**Pre-requisites:**
- Request status: `CommitteeApproved`

---

### Level 4: Additional Committee Approval

```solidity
function approveByCommitteeAdditional(uint256 requestId, uint256 nonce) external
```

**Access:** Requires `COMMITTEE_ROLE`

**Pre-requisites:**
- Request status: `FinanceApproved`
- Different from Level 2 committee approver
- Need 3 total additional approvers

---

### Level 5: Director Approval

```solidity
function approveByDirector(uint256 requestId, uint256 nonce) external
```

**Access:** Requires `DIRECTOR_ROLE`

**Pre-requisites:**
- Request has 3 additional committee approvers

**Note:** Automatically distributes funds upon approval

**Events:**
- `RequestApproved(requestId, DirectorApproved, approver)`
- `FundsDistributed(requestId, recipients, amounts, totalAmount, virtualPayer)`
- `FundsLocked(requestId, amount)` then `FundsUnlocked(requestId, amount)`

## View Functions

Read-only functions for querying contract state.

### Request Information

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

---

#### getRequestRecipients

```solidity
function getRequestRecipients(uint256 requestId) external view returns (address[] memory)
```

---

#### getRequestAmounts

```solidity
function getRequestAmounts(uint256 requestId) external view returns (uint256[] memory)
```

---

#### getVirtualPayer

```solidity
function getVirtualPayer(uint256 requestId) external view returns (address)
```

---

#### getActiveRequests

```solidity
function getActiveRequests() external view returns (uint256[] memory)
```

---

#### getUserActiveRequests

```solidity
function getUserActiveRequests(address user) external view returns (uint256[] memory)
```

### Approval Information

#### getCommitteeAdditionalApprovers

```solidity
function getCommitteeAdditionalApprovers(uint256 requestId) external view returns (address[] memory)
```

---

#### hasEnoughCommitteeApprovers

```solidity
function hasEnoughCommitteeApprovers(uint256 requestId) external view returns (bool)
```

---

#### getApprovalCount

```solidity
function getApprovalCount(uint256 requestId) external view returns (uint256 count)
```

### Fund Management

#### getTotalBalance

```solidity
function getTotalBalance() external view returns (uint256)
```

---

#### getAvailableBalance

```solidity
function getAvailableBalance() external view returns (uint256)
```

**Returns:** Total balance minus locked amounts

---

#### getLockedAmount

```solidity
function getLockedAmount() external view returns (uint256)
```

---

#### getLockedAmountForRequest

```solidity
function getLockedAmountForRequest(uint256 requestId) external view returns (uint256)
```

---

#### getRemainingBudget

```solidity
function getRemainingBudget() external view returns (uint256)
```

---

#### needsDeposit

```solidity
function needsDeposit() external view returns (bool)
```

### Request Status Checks

#### isRequestAbandoned

Check if request is abandoned (15+ days).

```solidity
function isRequestAbandoned(uint256 requestId) external view returns (bool)
```

---

#### isRequestStale

Check if request is stale (30+ days since director approval).

```solidity
function isRequestStale(uint256 requestId) external view returns (bool)
```

---

#### getStaleRequests

Get all stale request IDs.

```solidity
function getStaleRequests() external view returns (uint256[] memory)
```

### Role Checks

#### hasRole

```solidity
function hasRole(bytes32 role, address account) external view returns (bool)
```

**Role Constants:**
- `SECRETARY_ROLE`
- `COMMITTEE_ROLE`
- `FINANCE_ROLE`
- `DIRECTOR_ROLE`
- `REQUESTER_ROLE`
- `DEFAULT_ADMIN_ROLE`

## Admin Functions

Functions requiring admin privileges.

### Role Management

#### grantRoleDirect

Direct role grant (factory or admin only).

```solidity
function grantRoleDirect(bytes32 role, address account) external
```

**Access:** Project factory or `DEFAULT_ADMIN_ROLE`

---

#### commitRoleGrant

Commit to grant a role (Step 1).

```solidity
function commitRoleGrant(bytes32 role, bytes32 commitment) external
```

**Access:** Role admin

---

#### grantRoleWithReveal

Grant role with reveal (Step 2).

```solidity
function grantRoleWithReveal(bytes32 role, address account, uint256 nonce) external
```

**Access:** Role admin

**Pre-requisites:**
- Valid commitment made 30+ minutes ago

### Budget Management

#### updateBudget

Update project budget.

```solidity
function updateBudget(uint256 newBudget) external
```

**Access:** Timelock controller or `DEFAULT_ADMIN_ROLE`

**Events:**
- `BudgetUpdated(oldBudget, newBudget)`

### Pause Control

#### pause

Pause contract operations (requires multi-sig).

```solidity
function pause() external
```

**Access:** `DEFAULT_ADMIN_ROLE` (2 signatures required)

---

#### unpause

Unpause contract operations.

```solidity
function unpause() external
```

**Access:** Timelock controller or `DEFAULT_ADMIN_ROLE`

## Emergency Functions

### Emergency Stop

#### activateEmergencyStop

Activate emergency stop (multi-sig required).

```solidity
function activateEmergencyStop() external
```

**Access:** `DEFAULT_ADMIN_ROLE` (2 signatures required)

---

#### deactivateEmergencyStop

Deactivate emergency stop.

```solidity
function deactivateEmergencyStop() external
```

**Access:** Timelock controller or `DEFAULT_ADMIN_ROLE`

### Emergency Closure

#### initiateEmergencyClosure

Initiate emergency closure request.

```solidity
function initiateEmergencyClosure(
    address returnAddress,
    string calldata reason
) external returns (uint256)
```

**Access:** `COMMITTEE_ROLE` or `DIRECTOR_ROLE`

**Returns:** Closure ID

---

#### commitClosureApproval

Commit to approve closure.

```solidity
function commitClosureApproval(uint256 closureId, bytes32 commitment) external
```

---

#### approveEmergencyClosure

Approve closure with reveal.

```solidity
function approveEmergencyClosure(uint256 closureId, uint256 nonce) external
```

**Requirements:**
- 3 committee members + 1 director
- Auto-executes on director approval

---

#### cancelEmergencyClosure

Cancel closure request.

```solidity
function cancelEmergencyClosure(uint256 closureId) external
```

**Access:** Initiator or `DEFAULT_ADMIN_ROLE`

### Cleanup Functions

#### cancelAbandonedRequest

Cancel abandoned requests (15+ days).

```solidity
function cancelAbandonedRequest(uint256 requestId) external
```

**Access:** Public (anyone can call)

---

#### unlockStaleRequest

Unlock stale approved requests (30+ days).

```solidity
function unlockStaleRequest(uint256 requestId) external
```

**Access:** Public (anyone can call)

## Token Functions

### OMTHBTokenV3 Core Functions

#### transfer

```solidity
function transfer(address to, uint256 value) public returns (bool)
```

---

#### transferFrom

```solidity
function transferFrom(address from, address to, uint256 value) public returns (bool)
```

---

#### approve

```solidity
function approve(address spender, uint256 value) public returns (bool)
```

---

#### mint

```solidity
function mint(address to, uint256 amount) public
```

**Access:** `MINTER_ROLE`

**Restrictions:**
- Daily limits per minter
- Global daily limit
- Suspicious amount detection

### Guardian Functions

#### emergencyPause

```solidity
function emergencyPause() external
```

**Access:** `GUARDIAN_ROLE`

---

#### emergencyRevokeMinter

```solidity
function emergencyRevokeMinter(address minter) external
```

**Access:** `GUARDIAN_ROLE`

## Factory Functions

### ProjectFactoryV3 Functions

#### createProject

Create new project contract.

```solidity
function createProject(
    string calldata projectId,
    address projectAdmin
) external returns (address)
```

**Access:** `PROJECT_CREATOR_ROLE`

**Returns:** Project contract address

---

#### initiateProjectClosure

Start multi-sig closure process.

```solidity
function initiateProjectClosure(string calldata projectId) external
```

**Access:** Deputy or `DIRECTOR_ROLE`

---

#### signClosureRequest

Sign closure request.

```solidity
function signClosureRequest(string calldata projectId) external
```

**Access:** Deputy or `DIRECTOR_ROLE`

**Note:** Executes automatically with 2 deputies + 1 director

### View Functions

#### projects

```solidity
function projects(string calldata projectId) external view returns (
    string memory projectId,
    address projectContract,
    uint256 createdAt,
    bool isActive,
    address creator
)
```

---

#### getAllProjects

```solidity
function getAllProjects() external view returns (string[] memory)
```

---

#### getProjectsByCreator

```solidity
function getProjectsByCreator(address creator) external view returns (string[] memory)
```

## Constants

### Limits and Timeouts

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_RECIPIENTS` | 10 | Maximum recipients per request |
| `MIN_DEPOSIT_AMOUNT` | 10 OMTHB | Minimum deposit amount |
| `MIN_REIMBURSEMENT_AMOUNT` | 100 OMTHB | Minimum per recipient |
| `MAX_REIMBURSEMENT_AMOUNT` | 1M OMTHB | Maximum per recipient |
| `MAX_LOCKED_PERCENTAGE` | 80% | Maximum lockable funds |
| `REVEAL_WINDOW` | 30 minutes | Commit-reveal wait time |
| `PAYMENT_DEADLINE_DURATION` | 7 days | Payment deadline after approval |
| `STALE_REQUEST_TIMEOUT` | 30 days | Stale request threshold |
| `REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS` | 3 | Additional committee needed |

### Role Hashes

```javascript
const ROLES = {
    SECRETARY: "0x4e75795e7a2b24e4a7963050506b3388ff3a19dc664fb48e863c8cf3b9b91e2b",
    COMMITTEE: "0xb788c5d126a0f4144e47f9cf960d728232bb636a6fc7e3e965f19f0e5f2e6d6e",
    FINANCE: "0x3c8e382eba87ece982e08f56a9c2e7d36b37bb433aab965a45d960de88e87cf6",
    DIRECTOR: "0xf7b7d4c7e6b9bcacc9ad1ec53b86f7c7c35c4eac7ab07c37f7e7c7e87dd3c3c7",
    REQUESTER: "0xa31f99e0c9b9f91902e635e9c03e95403f3508db3a8716d9545b7b91b7e66d67",
    ADMIN: "0x0000000000000000000000000000000000000000000000000000000000000000"
};
```