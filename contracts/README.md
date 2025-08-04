# OMChain Reimbursement Smart Contracts

A comprehensive smart contract system for managing project reimbursements on OMChain with multi-level approval workflows and gasless transaction support.

## Overview

This system consists of four main contracts:

1. **OMTHB Token** - ERC20 token with upgradeable features
2. **ProjectFactory** - Factory for deploying project contracts
3. **ProjectReimbursement** - Handles reimbursement requests and approvals
4. **MetaTxForwarder** - Enables gasless transactions

## Architecture

### Contract Structure
```
contracts/
├── upgradeable/
│   └── OMTHBToken.sol          # UUPS upgradeable ERC20 token
├── interfaces/
│   └── IOMTHB.sol              # Token interface
├── ProjectFactory.sol          # Factory with multi-sig closure
├── ProjectReimbursement.sol    # Reimbursement logic
└── MetaTxForwarder.sol         # ERC-2771 meta transactions
```

### Key Features

#### OMTHB Token
- ERC20 compliant with 18 decimals
- Mintable by authorized addresses
- Burnable by token holders
- Pausable for emergency stops
- Blacklist functionality
- UUPS upgradeable pattern

#### ProjectFactory
- Deploys minimal proxies (EIP-1167) for gas efficiency
- Multi-signature project closure (2/3 deputies + director)
- Tracks all projects and their status
- Role-based access control

#### ProjectReimbursement
- 5-level approval workflow:
  1. Secretary approval
  2. Committee approval
  3. Finance approval
  4. Additional Committee approval
  5. Director approval (auto-distributes funds)
- Isolated OMTHB treasury per project
- Request cancellation support
- Comprehensive event logging

#### MetaTxForwarder
- ERC-2771 compliant for gasless transactions
- Rate limiting per address
- Deadline validation
- Batch transaction support

## Deployment

### Prerequisites
```bash
npm install
```

### Environment Setup
Create a `.env` file:
```env
PRIVATE_KEY=your_private_key_here
OMCHAIN_RPC_URL=https://rpc.omplatform.com
OMCHAIN_CHAIN_ID=1246
OWNER_ADDRESS=0xeB42B3bF49091377627610A691EA1Eaf32bc6254
```

### Deploy to OMChain
```bash
npm run deploy
```

### Deploy to Local Network
```bash
npm run node          # In terminal 1
npm run deploy:local  # In terminal 2
```

## Testing

Run the test suite:
```bash
npm test
```

Generate gas report:
```bash
npm run gas-report
```

## Security Considerations

1. **Access Control**: All critical functions are protected by role-based permissions
2. **Reentrancy Protection**: ReentrancyGuard on fund distribution
3. **Pausability**: Emergency pause functionality on all contracts
4. **Upgrade Safety**: UUPS pattern with role-restricted upgrades
5. **Input Validation**: Comprehensive checks on all user inputs
6. **CEI Pattern**: Checks-Effects-Interactions pattern followed

## Gas Optimizations

1. **Minimal Proxies**: EIP-1167 for project deployments
2. **Storage Packing**: Efficient struct layouts
3. **Custom Errors**: Gas-efficient error handling
4. **Unchecked Blocks**: Where overflow is impossible
5. **Memory vs Storage**: Optimized data location usage

## Roles and Permissions

### OMTHB Token Roles
- `MINTER_ROLE`: Can mint new tokens
- `PAUSER_ROLE`: Can pause/unpause transfers
- `BLACKLISTER_ROLE`: Can blacklist addresses
- `UPGRADER_ROLE`: Can upgrade the contract

### ProjectFactory Roles
- `PROJECT_CREATOR_ROLE`: Can create new projects
- `DEPUTY_ROLE`: Can sign project closures
- `DIRECTOR_ROLE`: Can sign project closures

### ProjectReimbursement Roles
- `REQUESTER_ROLE`: Can create reimbursement requests
- `SECRETARY_ROLE`: Level 1 approver
- `COMMITTEE_ROLE`: Level 2 & 4 approver
- `FINANCE_ROLE`: Level 3 approver
- `DIRECTOR_ROLE`: Level 5 approver

## Usage Examples

### Creating a Project
```javascript
const tx = await projectFactory.createProject(
    "PROJECT-2024-001",
    ethers.utils.parseEther("100000"), // 100,000 OMTHB budget
    projectAdminAddress
);
```

### Creating a Reimbursement Request
```javascript
const tx = await projectReimbursement.createRequest(
    recipientAddress,
    ethers.utils.parseEther("1000"), // 1,000 OMTHB
    "Office supplies for Q1 2024",
    "QmXxx..." // IPFS document hash
);
```

### Approval Flow
```javascript
// Level 1: Secretary
await projectReimbursement.connect(secretary).approveBySecretary(requestId);

// Level 2: Committee
await projectReimbursement.connect(committee1).approveByCommittee(requestId);

// Level 3: Finance
await projectReimbursement.connect(finance).approveByFinance(requestId);

// Level 4: Additional Committee
await projectReimbursement.connect(committee2).approveByCommitteeAdditional(requestId);

// Level 5: Director (auto-distributes)
await projectReimbursement.connect(director).approveByDirector(requestId);
```

## Network Configuration

- **Network**: OMChain
- **Chain ID**: 1246
- **RPC URL**: https://rpc.omplatform.com
- **Owner**: 0xeB42B3bF49091377627610A691EA1Eaf32bc6254

## License

MIT