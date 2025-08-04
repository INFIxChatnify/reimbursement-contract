# OMTHBTokenV3 Contract ABI Documentation

## Contract Overview

The OMTHBTokenV3 is an upgradeable ERC20 token with enhanced security features including timelock mechanisms, minting limits, emergency controls, and meta-transaction support.

**Contract Address (Proxy)**: `0xb69c9a0998AC337fd7101D5eE710176030b186b1` (OM Chain - Chain ID: 1246)

## Key Features

- ERC20 standard with 18 decimals
- Upgradeable via UUPS pattern
- Timelock for critical operations (1-7 days)
- Daily minting limits (per-minter and global)
- Emergency pause by guardians
- Blacklist functionality
- Meta-transaction support (ERC2771)
- Burnable tokens

## Function Reference

### Token Operations

#### transfer

Transfer tokens to another address.

```solidity
function transfer(address to, uint256 value) public returns (bool)
```

**Parameters:**
- `to`: Recipient address
- `value`: Amount to transfer

**Returns:** `success` - Whether the transfer succeeded

**Requirements:**
- Neither sender nor recipient can be blacklisted
- Contract not paused

**Example:**
```javascript
// Transfer 100 OMTHB
const amount = ethers.parseEther("100");
await omthbToken.transfer(recipientAddress, amount);
```

#### transferFrom

Transfer tokens from one address to another.

```solidity
function transferFrom(address from, address to, uint256 value) public returns (bool)
```

**Parameters:**
- `from`: Sender address
- `to`: Recipient address
- `value`: Amount to transfer

**Requirements:**
- Caller must have allowance from sender
- Neither party can be blacklisted
- Contract not paused

#### approve

Approve another address to spend tokens.

```solidity
function approve(address spender, uint256 value) public returns (bool)
```

**Parameters:**
- `spender`: Address allowed to spend
- `value`: Amount to approve

**Example:**
```javascript
// Approve project contract to spend 1000 OMTHB
const amount = ethers.parseEther("1000");
await omthbToken.approve(projectAddress, amount);
```

#### burn

Burn tokens from caller's balance.

```solidity
function burn(uint256 value) public
```

**Parameters:**
- `value`: Amount to burn

#### burnFrom

Burn tokens from another address.

```solidity
function burnFrom(address account, uint256 value) public
```

**Parameters:**
- `account`: Address to burn from
- `value`: Amount to burn

**Requirements:**
- Caller must have allowance from account

### Minting Functions

#### mint

Mint new tokens (restricted to minters with limits).

```solidity
function mint(address to, uint256 amount) public
```

**Parameters:**
- `to`: Address to mint to
- `amount`: Amount to mint

**Requirements:**
- Caller must have `MINTER_ROLE`
- Amount must not exceed daily limits
- Amount must not exceed suspicious threshold
- Contract not paused

**Events:**
- `Minted(to, amount)`
- `SuspiciousActivityDetected(minter, amount)` (if threshold exceeded)

**Example:**
```javascript
// Mint 500 OMTHB
const amount = ethers.parseEther("500");
await omthbToken.mint(recipientAddress, amount);
```

### Guardian Functions

#### emergencyPause

Emergency pause by guardian (immediate, no timelock).

```solidity
function emergencyPause() external
```

**Requirements:**
- Caller must have `GUARDIAN_ROLE`

**Events:**
- `EmergencyPause(guardian)`

#### emergencyRevokeMinter

Emergency revoke minter by guardian (immediate).

```solidity
function emergencyRevokeMinter(address minter) external
```

**Parameters:**
- `minter`: Minter to revoke

**Requirements:**
- Caller must have `GUARDIAN_ROLE`

**Events:**
- `MinterRevoked(minter, guardian)`

### Timelock Functions

#### scheduleAddMinter

Schedule adding a new minter (with timelock).

```solidity
function scheduleAddMinter(address minter, uint256 dailyLimit) external returns (bytes32)
```

**Parameters:**
- `minter`: Address to add as minter
- `dailyLimit`: Daily minting limit for this minter

**Returns:** `actionId` - Unique action identifier

**Requirements:**
- Caller must have `TIMELOCK_ADMIN_ROLE`
- Minter must not already exist

**Events:**
- `ActionScheduled(actionId, actionType, target, value, executeTime)`

**Example:**
```javascript
// Schedule adding a minter with 10,000 OMTHB daily limit
const dailyLimit = ethers.parseEther("10000");
const actionId = await omthbToken.scheduleAddMinter(minterAddress, dailyLimit);

// Wait for timelock period (e.g., 2 days)
const action = await omthbToken.getActionInfo(actionId);
console.log(`Can execute at: ${new Date(action.executeTime * 1000)}`);
```

#### scheduleRemoveMinter

Schedule removing a minter.

```solidity
function scheduleRemoveMinter(address minter) external returns (bytes32)
```

#### scheduleSetMintingLimit

Schedule changing minter's daily limit.

```solidity
function scheduleSetMintingLimit(address minter, uint256 newLimit) external returns (bytes32)
```

#### executeAction

Execute a scheduled action after timelock.

```solidity
function executeAction(bytes32 actionId) external
```

**Parameters:**
- `actionId`: Action to execute

**Requirements:**
- Action must exist and not be executed/cancelled
- Timelock period must have passed

**Events:**
- `ActionExecuted(actionId)`

#### cancelAction

Cancel a scheduled action.

```solidity
function cancelAction(bytes32 actionId) external
```

**Requirements:**
- Caller must have `TIMELOCK_ADMIN_ROLE`

**Events:**
- `ActionCancelled(actionId)`

### View Functions

#### balanceOf

Get token balance of an address.

```solidity
function balanceOf(address account) public view returns (uint256)
```

#### totalSupply

Get total token supply.

```solidity
function totalSupply() public view returns (uint256)
```

#### allowance

Get spending allowance.

```solidity
function allowance(address owner, address spender) public view returns (uint256)
```

#### getMinterInfo

Get minter information.

```solidity
function getMinterInfo(address minter) external view returns (MinterInfo memory)
```

**Returns:**
```solidity
struct MinterInfo {
    bool isMinter;        // Whether address is a minter
    uint256 dailyLimit;   // Daily minting limit
    uint256 dailyMinted;  // Amount minted today
    uint256 lastMintDay;  // Last mint day (for reset)
    uint256 totalMinted;  // Total ever minted
}
```

#### getRemainingDailyLimit

Get remaining daily mint limit for a minter.

```solidity
function getRemainingDailyLimit(address minter) external view returns (uint256)
```

#### getRemainingGlobalDailyLimit

Get remaining global daily mint limit.

```solidity
function getRemainingGlobalDailyLimit() external view returns (uint256)
```

#### getTimeRemaining

Get time remaining until action can be executed.

```solidity
function getTimeRemaining(bytes32 actionId) external view returns (uint256)
```

#### getPendingActions

Get all pending timelock actions.

```solidity
function getPendingActions() external view returns (bytes32[] memory)
```

#### isBlacklisted

Check if address is blacklisted.

```solidity
function isBlacklisted(address account) public view returns (bool)
```

### Administrative Functions

#### pause

Pause token transfers.

```solidity
function pause() public
```

**Requirements:**
- Caller must have `PAUSER_ROLE`

#### unpause

Unpause token transfers.

```solidity
function unpause() public
```

**Requirements:**
- Caller must have `PAUSER_ROLE`

#### blacklist

Add address to blacklist.

```solidity
function blacklist(address account) public
```

**Requirements:**
- Caller must have `BLACKLISTER_ROLE`

**Events:**
- `Blacklisted(account)`

#### unBlacklist

Remove address from blacklist.

```solidity
function unBlacklist(address account) public
```

**Requirements:**
- Caller must have `BLACKLISTER_ROLE`

**Events:**
- `UnBlacklisted(account)`

#### setGlobalDailyLimit

Set global daily minting limit.

```solidity
function setGlobalDailyLimit(uint256 limit) external
```

**Requirements:**
- Caller must have `DEFAULT_ADMIN_ROLE`

**Events:**
- `GlobalDailyLimitUpdated(oldLimit, limit)`

## Events

```solidity
event Minted(address indexed to, uint256 amount);
event ActionScheduled(bytes32 indexed actionId, ActionType actionType, address target, uint256 value, uint256 executeTime);
event ActionExecuted(bytes32 indexed actionId);
event ActionCancelled(bytes32 indexed actionId);
event EmergencyPause(address indexed guardian);
event MinterRevoked(address indexed minter, address indexed guardian);
event MintingLimitSet(address indexed minter, uint256 limit);
event DailyLimitExceeded(address indexed minter, uint256 attempted, uint256 limit);
event SuspiciousActivityDetected(address indexed minter, uint256 amount);
event Blacklisted(address indexed account);
event UnBlacklisted(address indexed account);
event GlobalDailyLimitUpdated(uint256 oldLimit, uint256 newLimit);
```

## Role Constants

```solidity
bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
bytes32 public constant BLACKLISTER_ROLE = keccak256("BLACKLISTER_ROLE");
bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
bytes32 public constant TIMELOCK_ADMIN_ROLE = keccak256("TIMELOCK_ADMIN_ROLE");
```

## Error Codes

```solidity
error AccountBlacklisted(address account);      // Account is blacklisted
error DailyLimitExceededError(address minter, uint256 requested, uint256 limit);
error GlobalDailyLimitExceeded(uint256 requested, uint256 limit);
error NotGuardian(address caller);              // Caller not guardian
error InvalidTimelockDelay();                   // Invalid timelock delay
error InvalidMintingLimit();                    // Invalid mint limit
error MinterAlreadyExists(address minter);      // Minter already exists
error MinterDoesNotExist(address minter);       // Minter doesn't exist
error SuspiciousAmount(uint256 amount);         // Amount exceeds threshold
error TimelockNotReady(bytes32 actionId, uint256 readyTime);
error ActionAlreadyExecuted(bytes32 actionId);
error ActionCancelledError(bytes32 actionId);
error ActionNotFound(bytes32 actionId);
```

## Integration Examples

### Basic Token Operations

```javascript
// Check balance
const balance = await omthbToken.balanceOf(userAddress);
console.log(`Balance: ${ethers.formatEther(balance)} OMTHB`);

// Approve and check allowance
await omthbToken.approve(spenderAddress, ethers.parseEther("1000"));
const allowance = await omthbToken.allowance(userAddress, spenderAddress);
console.log(`Allowance: ${ethers.formatEther(allowance)} OMTHB`);

// Transfer tokens
await omthbToken.transfer(recipientAddress, ethers.parseEther("100"));
```

### Minting with Limits

```javascript
// Check minter info
const minterInfo = await omthbToken.getMinterInfo(minterAddress);
console.log(`Daily limit: ${ethers.formatEther(minterInfo.dailyLimit)}`);
console.log(`Already minted today: ${ethers.formatEther(minterInfo.dailyMinted)}`);

// Check remaining limits
const remainingMinter = await omthbToken.getRemainingDailyLimit(minterAddress);
const remainingGlobal = await omthbToken.getRemainingGlobalDailyLimit();

const mintAmount = ethers.parseEther("500");
if (mintAmount > remainingMinter || mintAmount > remainingGlobal) {
    throw new Error("Mint amount exceeds daily limits");
}

// Mint tokens
await omthbToken.mint(recipientAddress, mintAmount);
```

### Timelock Operations

```javascript
// Schedule adding a minter
const dailyLimit = ethers.parseEther("10000");
const actionId = await omthbToken.scheduleAddMinter(newMinter, dailyLimit);

// Check time remaining
const timeRemaining = await omthbToken.getTimeRemaining(actionId);
console.log(`Time until execution: ${timeRemaining} seconds`);

// Wait for timelock
await new Promise(resolve => setTimeout(resolve, timeRemaining * 1000));

// Execute action
await omthbToken.executeAction(actionId);
```

### Emergency Operations

```javascript
// As guardian, pause in emergency
if (suspiciousActivity) {
    await omthbToken.connect(guardian).emergencyPause();
    console.log("Token paused due to suspicious activity");
}

// Revoke compromised minter
if (minterCompromised) {
    await omthbToken.connect(guardian).emergencyRevokeMinter(compromisedMinter);
    console.log("Minter revoked immediately");
}
```

### Event Monitoring

```javascript
// Monitor minting
omthbToken.on("Minted", (to, amount) => {
    console.log(`Minted ${ethers.formatEther(amount)} OMTHB to ${to}`);
});

// Monitor suspicious activity
omthbToken.on("SuspiciousActivityDetected", (minter, amount) => {
    console.log(`ALERT: Suspicious mint attempt by ${minter}`);
    console.log(`Amount: ${ethers.formatEther(amount)} OMTHB`);
    // Token auto-pauses on suspicious activity
});

// Monitor limit exceeded
omthbToken.on("DailyLimitExceeded", (minter, attempted, limit) => {
    console.log(`Minter ${minter} exceeded daily limit`);
    console.log(`Attempted: ${ethers.formatEther(attempted)}`);
    console.log(`Limit: ${ethers.formatEther(limit)}`);
});
```