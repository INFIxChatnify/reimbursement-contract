# OM Chain Multi-Recipient Reimbursement System User Guide

## Overview

The Multi-Recipient Reimbursement System is deployed on OM Chain and allows organizations to manage project reimbursements with support for multiple recipients per request. This guide covers how to interact with the deployed contracts.

## Deployed Contract Addresses

- **OMTHB Token**: `0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161`
- **ProjectFactory**: `0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1`
- **MetaTxForwarder**: `0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347`
- **Gas Tank**: `0x25D70c51552CBBdd8AE70DF6E56b22BC964FdB9C`

## Getting Started

### 1. Creating a New Project

To create a new project, you need the PROJECT_CREATOR_ROLE in the ProjectFactory contract.

```javascript
// Connect to ProjectFactory
const projectFactory = await ethers.getContractAt(
  "ProjectFactory",
  "0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1"
);

// Create a new project
const tx = await projectFactory.createProject(
  "PROJECT-2025-001",           // Project ID
  ethers.parseEther("50000"),   // Budget in OMTHB (50,000)
  "0xYourManagerAddress"        // Project manager address
);

const receipt = await tx.wait();
// Extract project address from events
```

### 2. Funding Your Project

After creating a project, you need to fund it with OMTHB tokens:

```javascript
// Connect to OMTHB token
const omthbToken = await ethers.getContractAt(
  "OMTHBToken",
  "0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161"
);

// Mint tokens to project (requires MINTER_ROLE)
await omthbToken.mint(
  projectAddress,
  ethers.parseEther("50000")  // Amount to mint
);
```

### 3. Setting Up Project Roles

Each project needs the following roles configured:

```javascript
const project = await ethers.getContractAt(
  "ProjectReimbursementMultiRecipient",
  projectAddress
);

// Grant roles (requires DEFAULT_ADMIN_ROLE)
await project.grantRoleDirect(SECRETARY_ROLE, secretaryAddress);
await project.grantRoleDirect(COMMITTEE_ROLE, committeeAddress);
await project.grantRoleDirect(FINANCE_ROLE, financeAddress);
await project.grantRoleDirect(DIRECTOR_ROLE, directorAddress);
await project.grantRoleDirect(REQUESTER_ROLE, requesterAddress);
```

### 4. Creating a Multi-Recipient Reimbursement Request

```javascript
// Prepare recipients and amounts
const recipients = [
  "0xRecipient1Address",
  "0xRecipient2Address",
  "0xRecipient3Address"
];

const amounts = [
  ethers.parseEther("100"),  // 100 OMTHB for recipient 1
  ethers.parseEther("200"),  // 200 OMTHB for recipient 2
  ethers.parseEther("150")   // 150 OMTHB for recipient 3
];

// Create request
const tx = await project.createRequestMultiple(
  recipients,
  amounts,
  "Travel expenses for conference Q3 2025",
  "QmDocumentHashFromIPFS"  // IPFS hash of supporting documents
);

const receipt = await tx.wait();
// Request ID will be in the events
```

### 5. Approval Flow with Commit-Reveal

The approval process uses a commit-reveal pattern for enhanced security:

#### Phase 1: Commit (for each approver)

```javascript
// Generate commitment
const approval = true;  // or false for rejection
const nonce = ethers.randomBytes(32);
const commitment = ethers.keccak256(
  ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "bool", "bytes32"],
    [requestId, approval, nonce]
  )
);

// Submit commitment (each approver does this)
await project.connect(approverSigner).commitApproval(requestId, commitment);
```

#### Phase 2: Reveal (after all commits)

```javascript
// Reveal the approval (each approver does this)
await project.connect(approverSigner).revealApproval(
  requestId,
  approval,
  nonce
);
```

### 6. Enabling Gasless Transactions

To enable gasless transactions for a project:

```javascript
// Connect to MetaTxForwarder (requires owner)
const forwarder = await ethers.getContractAt(
  "MetaTxForwarder",
  "0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347"
);

// Whitelist the project
await forwarder.setTargetWhitelist(projectAddress, true);
```

### 7. Executing Gasless Transactions

Users can submit meta-transactions that will be paid for by the Gas Tank:

```javascript
// Prepare function call
const functionData = project.interface.encodeFunctionData(
  "createRequestMultiple",
  [recipients, amounts, description, documentHash]
);

// Create meta-transaction request
const request = {
  from: userAddress,
  to: projectAddress,
  value: 0,
  gas: 500000,
  nonce: await forwarder.getNonce(userAddress),
  data: functionData
};

// Sign the request
const signature = await signer.signTypedData(
  domain,
  types,
  request
);

// Submit via relayer (gas paid by Gas Tank)
await forwarder.execute(request, signature);
```

## Common Operations

### Check Project Balance

```javascript
const balance = await omthbToken.balanceOf(projectAddress);
console.log(`Project balance: ${ethers.formatEther(balance)} OMTHB`);
```

### View Request Details

```javascript
const request = await project.getRequest(requestId);
console.log(`Status: ${request.status}`);
console.log(`Total Amount: ${ethers.formatEther(request.totalAmount)}`);
console.log(`Recipients: ${request.recipients.length}`);
```

### Check Approval Status

```javascript
const status = await project.getRequestStatus(requestId);
const approvals = await project.getApprovalStatus(requestId);
console.log(`Secretary: ${approvals.secretaryApproved}`);
console.log(`Committee: ${approvals.committeeApproved}`);
console.log(`Finance: ${approvals.financeApproved}`);
console.log(`Director: ${approvals.directorApproved}`);
```

### Emergency Closure

In case of emergency, the project can be closed:

```javascript
// Initiate closure (requires appropriate role)
await project.initiateEmergencyClosure("Security breach detected");

// Get closure status
const closure = await project.emergencyClosure();
console.log(`Status: ${closure.status}`);
console.log(`Reason: ${closure.reason}`);
```

## Best Practices

1. **Security**
   - Always use commit-reveal for approvals
   - Store nonces securely
   - Verify recipient addresses before creating requests

2. **Gas Optimization**
   - Batch multiple reimbursements in one request
   - Use gasless transactions for better UX
   - Monitor Gas Tank balance

3. **Documentation**
   - Upload supporting documents to IPFS
   - Include clear descriptions in requests
   - Keep transaction hashes for audit trail

## Troubleshooting

### "Insufficient privileges"
- Ensure you have the required role
- Check if the project is paused
- Verify you're calling from the correct address

### "Request not found"
- Verify the request ID is correct
- Check if the request was cancelled
- Ensure you're querying the right project

### "Invalid commitment"
- Ensure the commitment hash is correct
- Check if you're in the commit phase
- Verify the nonce hasn't been used

## Support

For technical support:
- Contract Source: https://github.com/[your-repo]
- OM Chain Explorer: https://omscan.omplatform.com
- Documentation: [Project Documentation]

## Contract ABIs

The contract ABIs can be found in the `artifacts` directory of the project repository or extracted from the verified contracts on OMScan.