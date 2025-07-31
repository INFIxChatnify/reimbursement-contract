# Frontend Integration Guide - OM Chain Reimbursement System

## Quick Start

### 1. Network Configuration

```javascript
const OM_CHAIN_CONFIG = {
  chainId: 1246,
  chainName: 'OM Chain',
  rpcUrls: ['https://rpc.omplatform.com'],
  nativeCurrency: {
    name: 'OM',
    symbol: 'OM',
    decimals: 18
  },
  blockExplorerUrls: ['https://omscan.omplatform.com']
};
```

### 2. Contract Addresses

```javascript
const CONTRACTS = {
  OMTHB_TOKEN: '0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161',
  GAS_TANK: '0x25D70c51552CBBdd8AE70DF6E56b22BC964FdB9C',
  META_TX_FORWARDER: '0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347',
  PROJECT_FACTORY: '0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1',
  PROJECT_IMPLEMENTATION: '0x1100ED4175BB828958396a708278D46146e1748b'
};
```

## Core User Flows

### 1. Creating a Project (Admin Only)

```javascript
// Connect to ProjectFactory
const projectFactory = new ethers.Contract(
  CONTRACTS.PROJECT_FACTORY,
  ProjectFactoryABI,
  signer
);

// Create project
const tx = await projectFactory.createProject(
  "PROJECT-2025-001",    // projectId
  ethers.parseEther("100000"), // budget in OMTHB
  "0x...",               // admin address
  {
    commitDuration: 300,   // 5 minutes
    revealDuration: 300    // 5 minutes
  }
);

// Get project address from event
const receipt = await tx.wait();
const event = receipt.logs.find(log => log.eventName === 'ProjectCreated');
const projectAddress = event.args.projectAddress;
```

### 2. Creating Multi-Recipient Reimbursement Request

```javascript
// Connect to Project contract
const project = new ethers.Contract(
  projectAddress,
  ProjectReimbursementABI,
  signer
);

// Create request with multiple recipients
const recipients = [
  "0x123...", // Lead Researcher
  "0x456...", // Senior Researcher  
  "0x789...", // Junior Researcher
  "0xABC...", // Assistant
];

const amounts = [
  ethers.parseEther("30000"), // 30,000 OMTHB
  ethers.parseEther("25000"), // 25,000 OMTHB
  ethers.parseEther("20000"), // 20,000 OMTHB
  ethers.parseEther("10000"), // 10,000 OMTHB
];

const tx = await project.createRequestMultiple(
  recipients,
  amounts,
  "Q1 2025 Research Team Salaries",
  "ipfs://QmXxx..." // document hash
);

const receipt = await tx.wait();
const requestId = receipt.logs[0].args.requestId;
```

### 3. Gasless Transaction Flow

```javascript
// 1. Prepare meta-transaction
const domain = {
  name: 'OMTHBForwarder',
  version: '1',
  chainId: 1246,
  verifyingContract: CONTRACTS.META_TX_FORWARDER
};

const types = {
  ForwardRequest: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'gas', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'data', type: 'bytes' }
  ]
};

// 2. Get nonce
const forwarder = new ethers.Contract(
  CONTRACTS.META_TX_FORWARDER,
  MetaTxForwarderABI,
  provider
);
const nonce = await forwarder.getNonce(userAddress);

// 3. Prepare transaction data
const data = project.interface.encodeFunctionData('createRequestMultiple', [
  recipients,
  amounts,
  description,
  documentHash
]);

// 4. Create request
const request = {
  from: userAddress,
  to: projectAddress,
  value: 0,
  gas: 500000,
  nonce: nonce.toString(),
  deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  data: data
};

// 5. Sign request
const signature = await signer.signTypedData(domain, types, request);

// 6. Send to relayer
const response = await fetch('https://your-relayer.com/forward', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ request, signature })
});
```

### 4. Approval Workflow (5 Levels)

```javascript
// Level 1: Secretary Approval
await project.connect(secretary).approveBySecretary(requestId);

// Level 2: Committee Approval  
await project.connect(committee1).approveByCommittee(requestId);

// Level 3: Finance Approval
await project.connect(finance).approveByFinance(requestId);

// Level 4: Additional Committee Approvals (3 required)
await project.connect(committee2).approveAdditionalCommittee(requestId);
await project.connect(committee3).approveAdditionalCommittee(requestId);
await project.connect(committee4).approveAdditionalCommittee(requestId);

// Level 5: Director Approval (auto-distributes funds)
await project.connect(director).approveByDirector(requestId);
```

### 5. Monitoring Request Status

```javascript
// Get request details
const request = await project.getRequest(requestId);
console.log({
  id: request.id,
  requester: request.requester,
  recipients: request.recipients,
  amounts: request.amounts,
  totalAmount: request.totalAmount,
  description: request.description,
  status: request.status,
  createdAt: request.createdAt,
  isDistributed: request.isDistributed
});

// Get approval status
const secretaryApproved = await project.secretaryApprovals(requestId);
const committeeApproved = await project.committeeApprovals(requestId);
const financeApproved = await project.financeApprovals(requestId);
const additionalApprovers = await project.getAdditionalApprovers(requestId);
const directorApproved = await project.directorApprovals(requestId);
```

## Event Listening

```javascript
// Listen for new requests
project.on('RequestCreated', (requestId, requester, recipients, amounts, description) => {
  console.log('New request:', { requestId, requester, recipients, amounts, description });
});

// Listen for approvals
project.on('RequestApproved', (requestId, approver, level) => {
  console.log('Approval:', { requestId, approver, level });
});

// Listen for distributions
project.on('FundsDistributed', (requestId, recipients, amounts, totalAmount) => {
  console.log('Distributed:', { requestId, recipients, amounts, totalAmount });
});
```

## Common Queries

### Get User's Projects
```javascript
const userProjects = await projectFactory.getUserProjects(userAddress);
```

### Get Project Balance
```javascript
const omthb = new ethers.Contract(CONTRACTS.OMTHB_TOKEN, OMTHBABI, provider);
const balance = await omthb.balanceOf(projectAddress);
const formattedBalance = ethers.formatEther(balance);
```

### Check User Role
```javascript
const SECRETARY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SECRETARY_ROLE"));
const hasRole = await project.hasRole(SECRETARY_ROLE, userAddress);
```

## Error Handling

```javascript
try {
  await project.createRequestMultiple(recipients, amounts, description, documentHash);
} catch (error) {
  if (error.message.includes("InvalidRecipient")) {
    alert("One or more recipient addresses are invalid");
  } else if (error.message.includes("DuplicateRecipient")) {
    alert("Duplicate recipients not allowed");
  } else if (error.message.includes("ArrayLengthMismatch")) {
    alert("Recipients and amounts arrays must have same length");
  } else if (error.message.includes("TooManyRecipients")) {
    alert("Maximum 10 recipients allowed per request");
  } else if (error.message.includes("InsufficientBalance")) {
    alert("Project has insufficient funds");
  }
}
```

## TypeScript Types

```typescript
interface ReimbursementRequest {
  id: bigint;
  requester: string;
  recipients: string[];
  amounts: bigint[];
  totalAmount: bigint;
  description: string;
  documentHash: string;
  status: RequestStatus;
  createdAt: bigint;
  isDistributed: boolean;
}

enum RequestStatus {
  Created = 0,
  SecretaryApproved = 1,
  CommitteeApproved = 2,
  FinanceApproved = 3,
  DirectorApproved = 4,
  Distributed = 5,
  Rejected = 6,
  Cancelled = 7
}

interface ProjectConfig {
  commitDuration: number;
  revealDuration: number;
}
```

## Best Practices

1. **Always validate inputs before sending transactions**
   - Check recipient addresses are not zero address
   - Ensure amounts are positive
   - Verify arrays have matching lengths

2. **Handle meta-transaction failures gracefully**
   - Implement retry logic
   - Provide fallback to direct transactions
   - Monitor gas tank balance

3. **Cache frequently accessed data**
   - User roles
   - Project configurations
   - Token balances

4. **Use event logs for real-time updates**
   - Subscribe to relevant events
   - Update UI without polling

5. **Implement proper error messages**
   - Parse revert reasons
   - Provide user-friendly explanations
   - Suggest corrective actions

## Support & Resources

- **ABI Files**: `/artifacts/contracts/[contract-name]/[contract].json`
- **Network Status**: https://omscan.omplatform.com
- **Example DApp**: See `/test-dapp` folder
- **Test Tokens**: Contact admin for test OMTHB tokens