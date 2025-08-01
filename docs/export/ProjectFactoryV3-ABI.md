# ProjectFactoryV3 Contract ABI Documentation

## Contract Overview

The ProjectFactoryV3 contract is responsible for deploying new project reimbursement contracts using the minimal proxy pattern (EIP-1167) for gas-efficient deployments. It manages project creation, multi-sig closure approvals, and deputy management.

**Contract Address**: `0xeF26c2c6E107f04c8137d1ee67177fA058a12C7F` (OM Chain - Chain ID: 1246)

## Key Features

- Gas-efficient project deployment using minimal proxy pattern
- Zero-balance project creation (projects start with 0 OMTHB)
- Multi-signature project closure (2 deputies + 1 director)
- Role-based access control
- Pausable operations for emergency situations

## Function Reference

### Project Creation

#### createProject

Creates a new project reimbursement contract.

```solidity
function createProject(
    string calldata projectId,
    address projectAdmin
) external returns (address)
```

**Parameters:**
- `projectId`: Unique project identifier (max 100 characters)
- `projectAdmin`: Admin address for the project

**Returns:** `projectAddress` - The deployed project contract address

**Requirements:**
- Caller must have `PROJECT_CREATOR_ROLE`
- Contract not paused
- Project ID must be unique
- Project ID must not be empty

**Events:**
- `ProjectCreated(projectId, projectContract, creator, budget)`

**Example:**
```javascript
// Create a new project
const projectId = "PROJ-2024-001";
const projectAdmin = "0x742d35Cc6634C0532925a3b844Bc9e7595f6E123";

const tx = await factory.createProject(projectId, projectAdmin);
const receipt = await tx.wait();

// Get project address from event
const projectAddress = receipt.logs.find(
    log => log.eventName === "ProjectCreated"
).args.projectContract;

console.log(`Project deployed at: ${projectAddress}`);
```

### Project Closure (Multi-Sig)

#### initiateProjectClosure

Initiate a project closure request (requires multi-sig approval).

```solidity
function initiateProjectClosure(string calldata projectId) external
```

**Parameters:**
- `projectId`: The project to close

**Requirements:**
- Caller must be a deputy or have `DIRECTOR_ROLE`
- Project must exist and be active
- Creates a new closure request with caller as first signer

**Events:**
- `ClosureInitiated(projectId, initiator)`

**Example:**
```javascript
// Initiate closure as deputy or director
await factory.initiateProjectClosure("PROJ-2024-001");
```

#### signClosureRequest

Sign an existing closure request.

```solidity
function signClosureRequest(string calldata projectId) external
```

**Parameters:**
- `projectId`: The project to sign closure for

**Requirements:**
- Caller must be a deputy or have `DIRECTOR_ROLE`
- Closure request must exist and not be executed
- Caller must not have already signed
- Request must not be expired (7 days timeout)
- Automatically executes when reaching 2 deputies + 1 director signatures

**Events:**
- `ClosureSigned(projectId, signer)`
- `ProjectClosed(projectId, remainingBalance)` (when executed)

**Example:**
```javascript
// Sign closure request
await factory.signClosureRequest("PROJ-2024-001");

// Check if enough signatures
const signers = await factory.getClosureSigners("PROJ-2024-001");
console.log(`Current signers: ${signers.length}`);
```

### Deputy Management

#### addDeputy

Add a new deputy for multi-sig operations.

```solidity
function addDeputy(address deputy) external
```

**Parameters:**
- `deputy`: Address to add as deputy

**Requirements:**
- Caller must have `DEFAULT_ADMIN_ROLE`
- Maximum 10 deputies allowed
- Deputy cannot be zero address

**Events:**
- `DeputyAdded(deputy)`

**Example:**
```javascript
await factory.addDeputy("0x456d35Cc6634C0532925a3b844Bc9e7595f6E456");
```

#### removeDeputy

Remove a deputy.

```solidity
function removeDeputy(address deputy) external
```

**Parameters:**
- `deputy`: Address to remove as deputy

**Requirements:**
- Caller must have `DEFAULT_ADMIN_ROLE`

**Events:**
- `DeputyRemoved(deputy)`

### View Functions

#### projects

Get project information.

```solidity
function projects(string calldata projectId) external view returns (
    string memory projectId,
    address projectContract,
    uint256 createdAt,
    bool isActive,
    address creator
)
```

**Returns:**
```solidity
struct ProjectInfo {
    string projectId;       // Unique project identifier
    address projectContract; // Deployed contract address
    uint256 createdAt;      // Creation timestamp
    bool isActive;          // Whether project is active
    address creator;        // Address that created the project
}
```

#### getAllProjects

Get all project IDs.

```solidity
function getAllProjects() external view returns (string[] memory)
```

**Returns:** Array of all project IDs

#### getProjectsByCreator

Get projects created by a specific address.

```solidity
function getProjectsByCreator(address creator) external view returns (string[] memory)
```

**Parameters:**
- `creator`: The creator address

**Returns:** Array of project IDs created by this address

#### getClosureSigners

Get closure request signers.

```solidity
function getClosureSigners(string calldata projectId) external view returns (address[] memory)
```

**Parameters:**
- `projectId`: The project ID

**Returns:** Array of addresses that have signed the closure request

#### getDeputies

Get all deputy addresses.

```solidity
function getDeputies() external view returns (address[] memory)
```

**Returns:** Array of all deputy addresses

#### isDeputy

Check if an address is a deputy.

```solidity
mapping(address => bool) public isDeputy
```

### Administrative Functions

#### pause

Pause factory operations.

```solidity
function pause() external
```

**Requirements:**
- Caller must have `PAUSER_ROLE`

#### unpause

Unpause factory operations.

```solidity
function unpause() external
```

**Requirements:**
- Caller must have `PAUSER_ROLE`

### Role Management

#### hasRole

Check if an address has a specific role.

```solidity
function hasRole(bytes32 role, address account) external view returns (bool)
```

**Available Roles:**
- `PROJECT_CREATOR_ROLE`: `0xc8817be3b495ba8de17769eaa0737bb966db9b87efca07308e48efa0db857133`
- `DEPUTY_ROLE`: `0x17a24e87ca079cf52947a061caa946a2df9ca5cb798fce59d58b3dc4b6e9bc31`
- `DIRECTOR_ROLE`: `0xf7b7d4c7e6b9bcacc9ad1ec53b86f7c7c35c4eac7ab07c37f7e7c7e87dd3c3c7`
- `PAUSER_ROLE`: `0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a`
- `DEFAULT_ADMIN_ROLE`: `0x0000000000000000000000000000000000000000000000000000000000000000`

## Events

```solidity
event ProjectCreated(
    string indexed projectId,
    address indexed projectContract,
    address indexed creator,
    uint256 budget  // Always 0 in V3
);

event ClosureInitiated(string indexed projectId, address indexed initiator);

event ClosureSigned(string indexed projectId, address indexed signer);

event ProjectClosed(string indexed projectId, uint256 remainingBalance);

event DeputyAdded(address indexed deputy);

event DeputyRemoved(address indexed deputy);
```

## Error Codes

```solidity
error ProjectExists();              // Project ID already used
error ProjectNotFound();            // Project doesn't exist
error InvalidAddress();             // Invalid address provided
error AlreadySigned();              // Already signed closure
error InsufficientSignatures();     // Not enough signatures
error ClosureTimeout();             // Closure request expired (7 days)
error NotActive();                  // Project not active
error UnauthorizedSigner();         // Not deputy or director
error TooManyDeputies();           // Exceeds 10 deputies
error InvalidProjectId();           // Invalid project ID format
error ZeroAddress();               // Zero address provided
```

## Constants

```solidity
uint256 public constant CLOSURE_SIGNATURES_REQUIRED = 3;  // 2 deputies + director
uint256 public constant CLOSURE_TIMEOUT = 7 days;         // Closure request timeout
uint256 public constant MAX_DEPUTIES = 10;                // Maximum deputies
uint256 public constant MAX_SIGNERS = 20;                 // Maximum signers per closure
```

## Integration Examples

### Complete Project Creation Flow

```javascript
// 1. Check if caller has PROJECT_CREATOR_ROLE
const hasRole = await factory.hasRole(PROJECT_CREATOR_ROLE, callerAddress);
if (!hasRole) {
    throw new Error("Caller lacks PROJECT_CREATOR_ROLE");
}

// 2. Create project
const projectId = `PROJ-${Date.now()}`;
const projectAdmin = "0x742d35Cc6634C0532925a3b844Bc9e7595f6E123";

const tx = await factory.createProject(projectId, projectAdmin);
const receipt = await tx.wait();

// 3. Get project address from event
const event = receipt.logs.find(log => log.eventName === "ProjectCreated");
const projectAddress = event.args.projectContract;

// 4. Instantiate project contract
const projectContract = new ethers.Contract(
    projectAddress,
    ProjectReimbursementV3ABI,
    signer
);

// 5. Project starts with 0 balance, needs deposit
await omthbToken.approve(projectAddress, depositAmount);
await projectContract.depositOMTHB(depositAmount);
```

### Multi-Sig Closure Flow

```javascript
// 1. Deputy 1 initiates closure
await factory.connect(deputy1).initiateProjectClosure(projectId);

// 2. Deputy 2 signs
await factory.connect(deputy2).signClosureRequest(projectId);

// 3. Check current signers
const signers = await factory.getClosureSigners(projectId);
console.log(`Current signers: ${signers.length}/3 required`);

// 4. Director signs (triggers execution)
await factory.connect(director).signClosureRequest(projectId);

// Project is now closed and paused
```

### Deputy Management

```javascript
// Add deputies
const deputies = [
    "0x123...",
    "0x456...",
    "0x789..."
];

for (const deputy of deputies) {
    await factory.addDeputy(deputy);
}

// Check deputy status
const isDeputy = await factory.isDeputy(deputies[0]);
console.log(`Is deputy: ${isDeputy}`);

// Get all deputies
const allDeputies = await factory.getDeputies();
console.log(`Total deputies: ${allDeputies.length}`);
```

### Event Listening

```javascript
// Listen for project creation
factory.on("ProjectCreated", (projectId, projectContract, creator, budget) => {
    console.log(`New project: ${projectId}`);
    console.log(`Contract: ${projectContract}`);
    console.log(`Creator: ${creator}`);
    console.log(`Initial budget: ${budget} (always 0 in V3)`);
});

// Listen for closure progress
factory.on("ClosureInitiated", (projectId, initiator) => {
    console.log(`Closure initiated for ${projectId} by ${initiator}`);
});

factory.on("ClosureSigned", (projectId, signer) => {
    console.log(`${signer} signed closure for ${projectId}`);
});

factory.on("ProjectClosed", (projectId, remainingBalance) => {
    console.log(`Project ${projectId} closed`);
    console.log(`Remaining balance: ${ethers.formatEther(remainingBalance)} OMTHB`);
});
```

### Error Handling

```javascript
try {
    await factory.createProject(projectId, projectAdmin);
} catch (error) {
    if (error.message.includes("ProjectExists")) {
        console.error("Project ID already exists");
    } else if (error.message.includes("Pausable: paused")) {
        console.error("Factory is paused");
    } else if (error.message.includes("InvalidProjectId")) {
        console.error("Invalid project ID format");
    }
}
```

### Query Projects

```javascript
// Get all projects
const allProjects = await factory.getAllProjects();
console.log(`Total projects: ${allProjects.length}`);

// Get projects by creator
const creatorProjects = await factory.getProjectsByCreator(creatorAddress);
console.log(`Projects by creator: ${creatorProjects.length}`);

// Get project details
for (const projectId of allProjects) {
    const info = await factory.projects(projectId);
    console.log(`Project: ${info.projectId}`);
    console.log(`Contract: ${info.projectContract}`);
    console.log(`Active: ${info.isActive}`);
    console.log(`Created: ${new Date(info.createdAt * 1000).toISOString()}`);
}
```