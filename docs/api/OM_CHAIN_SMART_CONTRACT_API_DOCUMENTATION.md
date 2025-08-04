# OM Chain Smart Contract API Documentation

This comprehensive documentation covers all deployed smart contracts on OM Chain for the Reimbursement System. This guide is designed for frontend developers to integrate with the contracts.

## Table of Contents

1. [Contract Overview](#contract-overview)
2. [OMTHB Token](#1-omthb-token)
3. [Gas Tank](#2-gas-tank)
4. [MetaTxForwarder](#3-metatxforwarder)
5. [ProjectFactory](#4-projectfactory)
6. [ProjectReimbursementMultiRecipient](#5-projectreimbursementmultirecipient)
7. [Integration Examples](#integration-examples)
8. [Error Handling](#error-handling)
9. [Gas Optimization Tips](#gas-optimization-tips)

## Contract Overview

### Network Details
- **Network**: OM Chain
- **Chain ID**: 1246
- **RPC URL**: https://rpc.omplatform.com
- **Explorer**: https://explorer.omplatform.com

### Deployed Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| OMTHB Token | `0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161` | ERC20 stablecoin for payments |
| Gas Tank | `0x25D70c51552CBBdd8AE70DF6E56b22BC964FdB9C` | Manages gas credits for meta-transactions |
| MetaTxForwarder | `0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347` | Enables gasless transactions |
| ProjectFactory | `0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1` | Creates and manages projects |
| ProjectReimbursementMultiRecipient | `0x1100ED4175BB828958396a708278D46146e1748b` | Handles reimbursement requests |

### Key Features
- **Gasless Transactions**: Users can interact without holding OM tokens
- **Multi-Level Approval**: 5-level approval workflow for reimbursements
- **Multi-Recipient Support**: Single request can pay multiple recipients
- **Emergency Closure**: Projects can be closed with multi-sig approval
- **Role-Based Access**: Granular permission system

---

## 1. OMTHB Token

**Contract Address**: `0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161`  
**ABI Location**: `/artifacts/contracts/upgradeable/OMTHBToken.sol/OMTHBToken.json`

### Overview
OMTHB is an upgradeable ERC20 token representing Thai Baht on OM Chain. It includes mint/burn capabilities, pausability, and blacklist features.

### Key Roles
- `DEFAULT_ADMIN_ROLE`: Full control
- `MINTER_ROLE`: Can mint new tokens
- `PAUSER_ROLE`: Can pause/unpause transfers
- `BLACKLISTER_ROLE`: Can blacklist addresses
- `UPGRADER_ROLE`: Can upgrade the contract

### Read Methods

#### `totalSupply()`
Returns the total supply of OMTHB tokens.
```solidity
function totalSupply() external view returns (uint256)
```
- **Returns**: Total supply in wei (18 decimals)
- **Gas**: ~25,000

#### `balanceOf(address account)`
Returns the balance of an account.
```solidity
function balanceOf(address account) external view returns (uint256)
```
- **Parameters**:
  - `account`: Address to check
- **Returns**: Balance in wei
- **Gas**: ~28,000

#### `allowance(address owner, address spender)`
Returns the remaining allowance.
```solidity
function allowance(address owner, address spender) external view returns (uint256)
```
- **Parameters**:
  - `owner`: Token owner address
  - `spender`: Spender address
- **Returns**: Allowance amount in wei
- **Gas**: ~30,000

#### `isBlacklisted(address account)`
Checks if an address is blacklisted.
```solidity
function isBlacklisted(address account) external view returns (bool)
```
- **Parameters**:
  - `account`: Address to check
- **Returns**: True if blacklisted
- **Gas**: ~27,000

#### `paused()`
Returns whether token transfers are paused.
```solidity
function paused() external view returns (bool)
```
- **Returns**: True if paused
- **Gas**: ~23,000

#### `canReceive(address account)`
Checks if an address can receive tokens.
```solidity
function canReceive(address account) external view returns (bool)
```
- **Parameters**:
  - `account`: Address to check
- **Returns**: True if can receive (not blacklisted, not zero address, not paused)
- **Gas**: ~35,000

### Write Methods

#### `transfer(address to, uint256 value)`
Transfers tokens to another address.
```solidity
function transfer(address to, uint256 value) external returns (bool)
```
- **Parameters**:
  - `to`: Recipient address
  - `value`: Amount in wei
- **Returns**: Success boolean
- **Required**: Sender has sufficient balance, neither party blacklisted
- **Gas**: ~65,000
- **Events**: `Transfer(from, to, value)`

#### `approve(address spender, uint256 value)`
Approves a spender to use tokens.
```solidity
function approve(address spender, uint256 value) external returns (bool)
```
- **Parameters**:
  - `spender`: Address to approve
  - `value`: Amount to approve
- **Returns**: Success boolean
- **Gas**: ~45,000
- **Events**: `Approval(owner, spender, value)`

#### `transferFrom(address from, address to, uint256 value)`
Transfers tokens on behalf of another address.
```solidity
function transferFrom(address from, address to, uint256 value) external returns (bool)
```
- **Parameters**:
  - `from`: Sender address
  - `to`: Recipient address
  - `value`: Amount in wei
- **Required**: Sufficient allowance and balance
- **Gas**: ~75,000
- **Events**: `Transfer(from, to, value)`

#### `mint(address to, uint256 amount)` 
Mints new tokens (MINTER_ROLE required).
```solidity
function mint(address to, uint256 amount) external
```
- **Parameters**:
  - `to`: Recipient address
  - `amount`: Amount to mint
- **Required Role**: `MINTER_ROLE`
- **Gas**: ~70,000
- **Events**: `Minted(to, amount)`, `Transfer(0x0, to, amount)`

#### `burn(uint256 value)`
Burns tokens from caller's balance.
```solidity
function burn(uint256 value) external
```
- **Parameters**:
  - `value`: Amount to burn
- **Gas**: ~55,000
- **Events**: `Transfer(from, 0x0, value)`

### Events

#### `Transfer`
```solidity
event Transfer(address indexed from, address indexed to, uint256 value)
```

#### `Approval`
```solidity
event Approval(address indexed owner, address indexed spender, uint256 value)
```

#### `Minted`
```solidity
event Minted(address indexed to, uint256 amount)
```

#### `Blacklisted`
```solidity
event Blacklisted(address indexed account)
```

#### `UnBlacklisted`
```solidity
event UnBlacklisted(address indexed account)
```

---

## 2. Gas Tank

**Contract Address**: `0x25D70c51552CBBdd8AE70DF6E56b22BC964FdB9C`  
**ABI Location**: `/artifacts/contracts/GasTank.sol/GasTank.json`

### Overview
The Gas Tank manages gas credits for meta-transactions, allowing users to interact with contracts without holding OM tokens.

### Key Roles
- `DEFAULT_ADMIN_ROLE`: Full control
- `RELAYER_ROLE`: Can request gas refunds
- `OPERATOR_ROLE`: Can update gas credits

### Data Structures

#### `GasCredit`
```solidity
struct GasCredit {
    uint256 totalDeposited;      // Total deposited amount
    uint256 totalUsed;           // Total used amount
    uint256 maxPerTransaction;   // Max gas per transaction
    uint256 dailyLimit;          // Daily spending limit
    uint256 dailyUsed;           // Amount used today
    uint256 lastResetTime;       // Last daily reset
    bool isActive;               // Whether credit is active
}
```

#### `GasUsage`
```solidity
struct GasUsage {
    uint256 gasUsed;         // Gas amount used
    uint256 gasPrice;        // Gas price in wei
    uint256 cost;            // Total cost
    uint256 timestamp;       // When used
    address relayer;         // Relayer address
    bytes32 txHash;          // Transaction hash
}
```

### Read Methods

#### `getAvailableCredit(address account)`
Returns available gas credit for an account.
```solidity
function getAvailableCredit(address account) external view returns (uint256)
```
- **Parameters**:
  - `account`: Address to check
- **Returns**: Available credit in wei
- **Gas**: ~30,000

#### `gasCredits(address account)`
Returns full gas credit details.
```solidity
function gasCredits(address account) external view returns (GasCredit memory)
```
- **Parameters**:
  - `account`: Address to check
- **Returns**: GasCredit struct
- **Gas**: ~35,000

#### `getGasUsageHistory(address account, uint256 limit)`
Returns gas usage history.
```solidity
function getGasUsageHistory(address account, uint256 limit) external view returns (GasUsage[] memory)
```
- **Parameters**:
  - `account`: Address to check
  - `limit`: Maximum records to return
- **Returns**: Array of GasUsage structs
- **Gas**: ~40,000 + 5,000 per record

### Write Methods

#### `depositGasCredit(address account)`
Deposits OM tokens as gas credit.
```solidity
function depositGasCredit(address account) external payable
```
- **Parameters**:
  - `account`: Account to deposit for
- **Value**: Amount of OM to deposit
- **Gas**: ~85,000
- **Events**: `GasCreditDeposited(account, amount)`

#### `withdrawGasCredit(uint256 amount)`
Withdraws unused gas credit.
```solidity
function withdrawGasCredit(uint256 amount) external
```
- **Parameters**:
  - `amount`: Amount to withdraw
- **Required**: Sufficient available credit
- **Gas**: ~65,000
- **Events**: `GasCreditWithdrawn(msg.sender, amount)`

#### `requestGasRefund(address user, uint256 gasUsed, uint256 gasPrice, bytes32 txHash)`
Requests gas refund for a meta-transaction (RELAYER_ROLE required).
```solidity
function requestGasRefund(address user, uint256 gasUsed, uint256 gasPrice, bytes32 txHash) external
```
- **Parameters**:
  - `user`: User who initiated the meta-tx
  - `gasUsed`: Gas amount used
  - `gasPrice`: Gas price used
  - `txHash`: Transaction hash
- **Required Role**: `RELAYER_ROLE`
- **Gas**: ~120,000
- **Events**: `GasRefunded(relayer, user, amount, txHash)`

### Events

#### `GasCreditDeposited`
```solidity
event GasCreditDeposited(address indexed account, uint256 amount)
```

#### `GasCreditWithdrawn`
```solidity
event GasCreditWithdrawn(address indexed account, uint256 amount)
```

#### `GasRefunded`
```solidity
event GasRefunded(address indexed relayer, address indexed user, uint256 amount, bytes32 txHash)
```

---

## 3. MetaTxForwarder

**Contract Address**: `0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347`  
**ABI Location**: `/artifacts/contracts/MetaTxForwarder.sol/MetaTxForwarder.json`

### Overview
ERC-2771 compliant forwarder enabling gasless transactions with rate limiting and security features.

### Data Structures

#### `ForwardRequest`
```solidity
struct ForwardRequest {
    address from;        // Transaction sender
    address to;          // Target contract
    uint256 value;       // OM value to send
    uint256 gas;         // Gas limit
    uint256 nonce;       // Sender's nonce
    uint256 deadline;    // Expiration timestamp
    uint256 chainId;     // Chain ID
    bytes data;          // Encoded function call
}
```

### Read Methods

#### `verify(ForwardRequest calldata req, bytes calldata signature)`
Verifies a meta-transaction signature.
```solidity
function verify(ForwardRequest calldata req, bytes calldata signature) external view returns (bool)
```
- **Parameters**:
  - `req`: Forward request struct
  - `signature`: EIP-712 signature
- **Returns**: True if valid
- **Gas**: ~35,000

#### `getNonce(address from)`
Returns current nonce for an address.
```solidity
function getNonce(address from) external view returns (uint256)
```
- **Parameters**:
  - `from`: Address to check
- **Returns**: Current nonce
- **Gas**: ~25,000

#### `isTargetWhitelisted(address target)`
Checks if a target contract is whitelisted.
```solidity
function isTargetWhitelisted(address target) external view returns (bool)
```
- **Parameters**:
  - `target`: Contract address
- **Returns**: True if whitelisted
- **Gas**: ~25,000

### Write Methods

#### `execute(ForwardRequest calldata req, bytes calldata signature)`
Executes a meta-transaction.
```solidity
function execute(ForwardRequest calldata req, bytes calldata signature) external payable returns (bool success, bytes memory returnData)
```
- **Parameters**:
  - `req`: Forward request struct
  - `signature`: EIP-712 signature
- **Returns**: Success status and return data
- **Gas**: 100,000 + target function gas
- **Events**: `MetaTransactionExecuted(from, to, value, nonce, success, returnData)`

#### `batchExecute(ForwardRequest[] calldata requests, bytes[] calldata signatures)`
Executes multiple meta-transactions.
```solidity
function batchExecute(ForwardRequest[] calldata requests, bytes[] calldata signatures) external payable returns (bool[] memory successes, bytes[] memory returnDatas)
```
- **Parameters**:
  - `requests`: Array of forward requests
  - `signatures`: Array of signatures
- **Returns**: Arrays of success statuses and return data
- **Gas**: 50,000 + sum of all target functions
- **Events**: Multiple `MetaTransactionExecuted` events

### Events

#### `MetaTransactionExecuted`
```solidity
event MetaTransactionExecuted(
    address indexed from,
    address indexed to,
    uint256 value,
    uint256 nonce,
    bool success,
    bytes returnData
)
```

### Signature Generation

To create a valid signature for meta-transactions:

```javascript
// EIP-712 Domain
const domain = {
    name: "MetaTxForwarder",
    version: "1",
    chainId: 1246,
    verifyingContract: "0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347"
};

// EIP-712 Types
const types = {
    ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "chainId", type: "uint256" },
        { name: "data", type: "bytes" }
    ]
};

// Sign the request
const signature = await signer._signTypedData(domain, types, forwardRequest);
```

---

## 4. ProjectFactory

**Contract Address**: `0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1`  
**ABI Location**: `/artifacts/contracts/ProjectFactory.sol/ProjectFactory.json`

### Overview
Factory contract for deploying project reimbursement contracts with multi-sig closure capabilities.

### Key Roles
- `DEFAULT_ADMIN_ROLE`: Full control
- `PROJECT_CREATOR_ROLE`: Can create projects
- `DEPUTY_ROLE`: Can approve project closures
- `DIRECTOR_ROLE`: Can approve project closures
- `PAUSER_ROLE`: Can pause/unpause factory

### Data Structures

#### `ProjectInfo`
```solidity
struct ProjectInfo {
    string projectId;          // Unique identifier
    address projectContract;   // Deployed contract address
    uint256 createdAt;        // Creation timestamp
    bool isActive;            // Active status
    address creator;          // Creator address
}
```

#### `ClosureRequest`
```solidity
struct ClosureRequest {
    uint256 timestamp;        // Request timestamp
    address initiator;        // Who initiated
    address[] signers;        // Who has signed
    bool executed;            // Execution status
    mapping(address => bool) hasSigned;  // Signature tracking
}
```

### Read Methods

#### `projects(string calldata projectId)`
Returns project information.
```solidity
function projects(string calldata projectId) external view returns (ProjectInfo memory)
```
- **Parameters**:
  - `projectId`: Project identifier
- **Returns**: ProjectInfo struct
- **Gas**: ~35,000

#### `getAllProjects()`
Returns all project IDs.
```solidity
function getAllProjects() external view returns (string[] memory)
```
- **Returns**: Array of project IDs
- **Gas**: ~30,000 + 3,000 per project

#### `getProjectsByCreator(address creator)`
Returns projects created by an address.
```solidity
function getProjectsByCreator(address creator) external view returns (string[] memory)
```
- **Parameters**:
  - `creator`: Creator address
- **Returns**: Array of project IDs
- **Gas**: ~35,000 + 3,000 per project

#### `getDeputies()`
Returns all deputy addresses.
```solidity
function getDeputies() external view returns (address[] memory)
```
- **Returns**: Array of deputy addresses
- **Gas**: ~30,000 + 2,000 per deputy

### Write Methods

#### `createProject(string calldata projectId, uint256 budget, address projectAdmin)`
Creates a new project contract.
```solidity
function createProject(string calldata projectId, uint256 budget, address projectAdmin) external returns (address)
```
- **Parameters**:
  - `projectId`: Unique identifier
  - `budget`: Project budget in OMTHB
  - `projectAdmin`: Initial admin address
- **Required Role**: `PROJECT_CREATOR_ROLE`
- **Returns**: Deployed contract address
- **Gas**: ~500,000
- **Events**: `ProjectCreated(projectId, projectContract, creator, budget)`

#### `initiateProjectClosure(string calldata projectId)`
Initiates project closure (requires multi-sig).
```solidity
function initiateProjectClosure(string calldata projectId) external
```
- **Parameters**:
  - `projectId`: Project to close
- **Required Role**: `DEPUTY_ROLE` or `DIRECTOR_ROLE`
- **Gas**: ~85,000
- **Events**: `ClosureInitiated(projectId, initiator)`

#### `signClosureRequest(string calldata projectId)`
Signs a closure request.
```solidity
function signClosureRequest(string calldata projectId) external
```
- **Parameters**:
  - `projectId`: Project to sign for
- **Required Role**: `DEPUTY_ROLE` or `DIRECTOR_ROLE`
- **Gas**: ~75,000
- **Events**: `ClosureSigned(projectId, signer)`, potentially `ProjectClosed(projectId, remainingBalance)`

### Events

#### `ProjectCreated`
```solidity
event ProjectCreated(
    string indexed projectId,
    address indexed projectContract,
    address indexed creator,
    uint256 budget
)
```

#### `ClosureInitiated`
```solidity
event ClosureInitiated(string indexed projectId, address indexed initiator)
```

#### `ClosureSigned`
```solidity
event ClosureSigned(string indexed projectId, address indexed signer)
```

#### `ProjectClosed`
```solidity
event ProjectClosed(string indexed projectId, uint256 remainingBalance)
```

---

## 5. ProjectReimbursementMultiRecipient

**Contract Address**: `0x1100ED4175BB828958396a708278D46146e1748b`  
**ABI Location**: `/artifacts/contracts/ProjectReimbursementMultiRecipient.sol/ProjectReimbursementMultiRecipient.json`

### Overview
Manages reimbursement requests with multi-recipient support and 5-level approval workflow.

### Key Roles
- `DEFAULT_ADMIN_ROLE`: Full control
- `REQUESTER_ROLE`: Can create reimbursement requests
- `SECRETARY_ROLE`: Level 1 approver
- `COMMITTEE_ROLE`: Level 2 & 4 approver
- `FINANCE_ROLE`: Level 3 approver
- `DIRECTOR_ROLE`: Level 5 approver

### Data Structures

#### `ReimbursementRequest`
```solidity
struct ReimbursementRequest {
    uint256 id;                    // Request ID
    address requester;             // Who created request
    address[] recipients;          // Array of recipients
    uint256[] amounts;            // Array of amounts
    uint256 totalAmount;          // Sum of all amounts
    string description;           // Description
    string documentHash;          // IPFS hash
    Status status;                // Current status
    uint256 createdAt;           // Creation time
    uint256 updatedAt;           // Last update
    uint256 paymentDeadline;     // Payment deadline
    ApprovalInfo approvalInfo;   // Approval details
}
```

#### `Status` Enum
```solidity
enum Status {
    Pending,              // 0: Created
    SecretaryApproved,    // 1: Level 1 approved
    CommitteeApproved,    // 2: Level 2 approved
    FinanceApproved,      // 3: Level 3 approved
    DirectorApproved,     // 4: Level 5 approved
    Distributed,          // 5: Paid out
    Cancelled            // 6: Cancelled
}
```

### Read Methods

#### `getRequest(uint256 requestId)`
Returns full request details.
```solidity
function getRequest(uint256 requestId) external view returns (ReimbursementRequest memory)
```
- **Parameters**:
  - `requestId`: Request ID
- **Returns**: ReimbursementRequest struct
- **Gas**: ~50,000

#### `getActiveRequests()`
Returns all active request IDs.
```solidity
function getActiveRequests() external view returns (uint256[] memory)
```
- **Returns**: Array of active request IDs
- **Gas**: ~35,000 + 3,000 per request

#### `getUserActiveRequests(address user)`
Returns active requests for a user.
```solidity
function getUserActiveRequests(address user) external view returns (uint256[] memory)
```
- **Parameters**:
  - `user`: User address
- **Returns**: Array of request IDs
- **Gas**: ~35,000 + 3,000 per request

#### `getApprovalCount(uint256 requestId)`
Returns total approval count.
```solidity
function getApprovalCount(uint256 requestId) external view returns (uint256 count)
```
- **Parameters**:
  - `requestId`: Request ID
- **Returns**: Number of approvals
- **Gas**: ~40,000

### Write Methods

#### `createRequest(address[] calldata recipients, uint256[] calldata amounts, string calldata description, string calldata documentHash)`
Creates a multi-recipient reimbursement request.
```solidity
function createRequest(
    address[] calldata recipients,
    uint256[] calldata amounts,
    string calldata description,
    string calldata documentHash
) external returns (uint256)
```
- **Parameters**:
  - `recipients`: Array of recipient addresses (max 10)
  - `amounts`: Array of amounts in OMTHB
  - `description`: Request description
  - `documentHash`: IPFS hash or document reference
- **Required Role**: `REQUESTER_ROLE`
- **Returns**: Request ID
- **Gas**: ~150,000 + 20,000 per recipient
- **Events**: `RequestCreated(requestId, requester, recipients, amounts, totalAmount, description)`

#### `commitApproval(uint256 requestId, bytes32 commitment)`
Commits an approval (step 1 of commit-reveal).
```solidity
function commitApproval(uint256 requestId, bytes32 commitment) external
```
- **Parameters**:
  - `requestId`: Request to approve
  - `commitment`: Hash of (approver, requestId, chainId, nonce)
- **Required**: Appropriate role for current status
- **Gas**: ~65,000
- **Events**: `ApprovalCommitted(requestId, approver, timestamp, chainId)`

#### `approveBySecretary(uint256 requestId, uint256 nonce)`
Secretary approval (Level 1).
```solidity
function approveBySecretary(uint256 requestId, uint256 nonce) external
```
- **Parameters**:
  - `requestId`: Request to approve
  - `nonce`: Nonce used in commitment
- **Required Role**: `SECRETARY_ROLE`
- **Required**: Valid commitment, reveal window passed
- **Gas**: ~85,000
- **Events**: `RequestApproved(requestId, SecretaryApproved, approver)`

#### `approveByCommittee(uint256 requestId, uint256 nonce)`
Committee approval (Level 2).
```solidity
function approveByCommittee(uint256 requestId, uint256 nonce) external
```
- **Parameters**:
  - `requestId`: Request to approve
  - `nonce`: Nonce used in commitment
- **Required Role**: `COMMITTEE_ROLE`
- **Required**: Secretary approved, valid commitment
- **Gas**: ~85,000
- **Events**: `RequestApproved(requestId, CommitteeApproved, approver)`

#### `approveByFinance(uint256 requestId, uint256 nonce)`
Finance approval (Level 3).
```solidity
function approveByFinance(uint256 requestId, uint256 nonce) external
```
- **Parameters**:
  - `requestId`: Request to approve
  - `nonce`: Nonce used in commitment
- **Required Role**: `FINANCE_ROLE`
- **Required**: Committee approved, valid commitment
- **Gas**: ~85,000
- **Events**: `RequestApproved(requestId, FinanceApproved, approver)`

#### `approveByCommitteeAdditional(uint256 requestId, uint256 nonce)`
Additional committee approval (Level 4).
```solidity
function approveByCommitteeAdditional(uint256 requestId, uint256 nonce) external
```
- **Parameters**:
  - `requestId`: Request to approve
  - `nonce`: Nonce used in commitment
- **Required Role**: `COMMITTEE_ROLE`
- **Required**: Finance approved, not same as Level 2 approver
- **Gas**: ~90,000
- **Events**: `RequestApproved(requestId, FinanceApproved, approver)`

#### `approveByDirector(uint256 requestId, uint256 nonce)`
Director approval and auto-distribution (Level 5).
```solidity
function approveByDirector(uint256 requestId, uint256 nonce) external
```
- **Parameters**:
  - `requestId`: Request to approve
  - `nonce`: Nonce used in commitment
- **Required Role**: `DIRECTOR_ROLE`
- **Required**: 3 additional committee approvals
- **Gas**: ~200,000 + 50,000 per recipient
- **Events**: `RequestApproved(requestId, DirectorApproved, approver)`, `FundsDistributed(requestId, recipients, amounts)`

#### `cancelRequest(uint256 requestId)`
Cancels a reimbursement request.
```solidity
function cancelRequest(uint256 requestId) external
```
- **Parameters**:
  - `requestId`: Request to cancel
- **Required**: Requester or admin, not already distributed
- **Gas**: ~65,000
- **Events**: `RequestCancelled(requestId, canceller)`

### Events

#### `RequestCreated`
```solidity
event RequestCreated(
    uint256 indexed requestId,
    address indexed requester,
    address[] recipients,
    uint256[] amounts,
    uint256 totalAmount,
    string description
)
```

#### `RequestApproved`
```solidity
event RequestApproved(
    uint256 indexed requestId,
    Status indexed newStatus,
    address indexed approver
)
```

#### `FundsDistributed`
```solidity
event FundsDistributed(
    uint256 indexed requestId,
    address[] recipients,
    uint256[] amounts
)
```

### Commit-Reveal Process

The approval process uses commit-reveal to prevent front-running:

1. **Commit Phase**: Approver commits hash of their approval
2. **Wait Period**: Must wait 30 minutes (REVEAL_WINDOW)
3. **Reveal Phase**: Approver reveals their approval with nonce

```javascript
// Generate commitment
const commitment = ethers.utils.solidityKeccak256(
    ["address", "uint256", "uint256", "uint256"],
    [approverAddress, requestId, chainId, nonce]
);

// Wait for reveal window
await new Promise(resolve => setTimeout(resolve, 31 * 60 * 1000));

// Reveal approval
await contract.approveBySecretary(requestId, nonce);
```

---

## Integration Examples

### Web3.js Example

```javascript
const Web3 = require('web3');
const web3 = new Web3('https://rpc.omplatform.com');

// Contract instances
const omthb = new web3.eth.Contract(OMTHB_ABI, '0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161');
const projectFactory = new web3.eth.Contract(FACTORY_ABI, '0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1');

// Check OMTHB balance
async function checkBalance(address) {
    const balance = await omthb.methods.balanceOf(address).call();
    return web3.utils.fromWei(balance, 'ether');
}

// Create a new project
async function createProject(projectId, budget, admin) {
    const budgetWei = web3.utils.toWei(budget.toString(), 'ether');
    const tx = await projectFactory.methods
        .createProject(projectId, budgetWei, admin)
        .send({ from: creatorAddress });
    return tx.events.ProjectCreated.returnValues.projectContract;
}
```

### Ethers.js Example

```javascript
const { ethers } = require('ethers');
const provider = new ethers.providers.JsonRpcProvider('https://rpc.omplatform.com');

// Contract instances
const omthb = new ethers.Contract('0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161', OMTHB_ABI, provider);
const forwarder = new ethers.Contract('0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347', FORWARDER_ABI, provider);

// Create meta-transaction
async function createMetaTx(signer, targetContract, functionData) {
    const nonce = await forwarder.getNonce(signer.address);
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    
    const request = {
        from: signer.address,
        to: targetContract,
        value: 0,
        gas: 500000,
        nonce: nonce,
        deadline: deadline,
        chainId: 1246,
        data: functionData
    };
    
    const domain = {
        name: "MetaTxForwarder",
        version: "1",
        chainId: 1246,
        verifyingContract: forwarder.address
    };
    
    const types = {
        ForwardRequest: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "gas", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "chainId", type: "uint256" },
            { name: "data", type: "bytes" }
        ]
    };
    
    const signature = await signer._signTypedData(domain, types, request);
    return { request, signature };
}
```

### Multi-Recipient Request Example

```javascript
// Create multi-recipient reimbursement request
async function createMultiRecipientRequest(contract, recipients, amounts, description, ipfsHash) {
    // Validate inputs
    if (recipients.length !== amounts.length) {
        throw new Error("Recipients and amounts length mismatch");
    }
    if (recipients.length > 10) {
        throw new Error("Maximum 10 recipients allowed");
    }
    
    // Convert amounts to wei
    const amountsWei = amounts.map(amount => 
        ethers.utils.parseEther(amount.toString())
    );
    
    // Create request
    const tx = await contract.createRequest(
        recipients,
        amountsWei,
        description,
        ipfsHash
    );
    
    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === 'RequestCreated');
    return event.args.requestId;
}

// Example usage
const requestId = await createMultiRecipientRequest(
    reimbursementContract,
    ['0x123...', '0x456...', '0x789...'],
    [1000, 2000, 3000], // OMTHB amounts
    'Conference expenses for 3 speakers',
    'QmXxx...' // IPFS hash
);
```

### Gasless Transaction Flow

```javascript
// Complete gasless transaction flow
async function executeGaslessTransaction(userSigner, targetFunction) {
    // 1. Ensure user has gas credits
    const gasTank = new ethers.Contract(GAS_TANK_ADDRESS, GAS_TANK_ABI, provider);
    const availableCredit = await gasTank.getAvailableCredit(userSigner.address);
    
    if (availableCredit.lt(ethers.utils.parseEther('0.1'))) {
        throw new Error('Insufficient gas credit');
    }
    
    // 2. Create meta-transaction
    const { request, signature } = await createMetaTx(userSigner, TARGET_CONTRACT, targetFunction);
    
    // 3. Send to relayer
    const response = await fetch('https://relayer.example.com/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request, signature })
    });
    
    const { txHash } = await response.json();
    
    // 4. Wait for confirmation
    const receipt = await provider.waitForTransaction(txHash);
    return receipt;
}
```

---

## Error Handling

### Common Errors

| Error | Description | Solution |
|-------|-------------|----------|
| `InvalidAmount()` | Amount is 0 or exceeds limits | Check amount is within valid range |
| `InvalidAddress()` | Zero address provided | Ensure valid address |
| `InsufficientBudget()` | Project budget exceeded | Check remaining budget |
| `UnauthorizedApprover()` | Missing required role | Verify user has correct role |
| `InvalidCommitment()` | Commitment hash mismatch | Check nonce and parameters |
| `RevealTooEarly()` | Reveal before window | Wait 30 minutes after commit |
| `RateLimitExceeded()` | Too many transactions | Wait for rate limit reset |
| `InsufficientGasCredit()` | Not enough gas credit | Deposit more OM to gas tank |

### Error Handling Example

```javascript
try {
    await contract.createRequest(recipients, amounts, description, ipfsHash);
} catch (error) {
    if (error.reason === 'InvalidAmount()') {
        console.error('Amount must be between 100 and 1,000,000 OMTHB');
    } else if (error.reason === 'InsufficientBudget()') {
        const budget = await contract.projectBudget();
        const distributed = await contract.totalDistributed();
        console.error(`Remaining budget: ${budget.sub(distributed)}`);
    } else {
        console.error('Transaction failed:', error.reason);
    }
}
```

---

## Gas Optimization Tips

### 1. Batch Operations
Use batch functions when possible:
```javascript
// Instead of multiple individual calls
await forwarder.batchExecute(requests, signatures);
```

### 2. Optimize Array Sizes
Keep arrays small to reduce gas:
- Maximum 10 recipients per request
- Batch meta-transactions in groups of 5-10

### 3. Use Events for Data
Store only essential data on-chain:
```javascript
// Store IPFS hash on-chain, detailed data off-chain
const ipfsHash = await ipfs.add(detailedData);
await contract.createRequest(recipients, amounts, summary, ipfsHash);
```

### 4. Pre-calculate Gas Limits
```javascript
// Estimate gas before sending
const gasEstimate = await contract.estimateGas.createRequest(
    recipients, amounts, description, ipfsHash
);
const gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer
```

### 5. Monitor Gas Prices
```javascript
// Check current gas price
const gasPrice = await provider.getGasPrice();
if (gasPrice.gt(ethers.utils.parseUnits('500', 'gwei'))) {
    console.warn('High gas price, consider waiting');
}
```

---

## Security Considerations

### 1. Signature Verification
Always verify signatures off-chain before relaying:
```javascript
const isValid = await forwarder.verify(request, signature);
if (!isValid) throw new Error('Invalid signature');
```

### 2. Deadline Validation
Set reasonable deadlines for meta-transactions:
```javascript
const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
```

### 3. Nonce Management
Track nonces to prevent replay attacks:
```javascript
const nonce = await forwarder.getNonce(userAddress);
// Store nonce with request to detect replays
```

### 4. Amount Validation
Validate amounts before submission:
```javascript
const MIN = ethers.utils.parseEther('100');
const MAX = ethers.utils.parseEther('1000000');
if (amount.lt(MIN) || amount.gt(MAX)) {
    throw new Error('Amount out of range');
}
```

---

## Support

For additional support:
- **Technical Documentation**: [GitHub Repository]
- **API Status**: https://api.omplatform.com/status
- **Support Email**: support@omplatform.com
- **Discord**: [OM Platform Discord]

---

Last Updated: 2025-07-31