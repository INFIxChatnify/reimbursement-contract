# Deployment Information - OM Chain

## Network Details

- **Network Name**: OM Chain
- **Chain ID**: 1246
- **RPC URL**: https://rpc.omchain.io
- **Block Explorer**: https://explorer.omchain.io
- **Currency**: OMTHB

## Deployed Contract Addresses

### Core Contracts

| Contract | Address | Description |
|----------|---------|-------------|
| **OMTHBToken (Proxy)** | `0xb69c9a0998AC337fd7101D5eE710176030b186b1` | OMTHB ERC20 token with enhanced security |
| **ProjectFactoryV3** | `0xeF26c2c6E107f04c8137d1ee67177fA058a12C7F` | Factory for deploying project contracts |
| **MetaTxForwarder** | `0x66aC00B6bE5F7992B86862405740266a49deca44` | Meta-transaction forwarder for gasless txs |

### Implementation Contracts

| Contract | Address | Description |
|----------|---------|-------------|
| **ProjectReimbursementV3 Implementation** | *(Deployed by factory)* | Base implementation for project contracts |
| **OMTHBTokenV3 Implementation** | *(Behind proxy)* | Token implementation logic |

## Contract Verification

All contracts are verified on OM Chain explorer. You can view the source code and interact with them at:

- OMTHBToken: https://explorer.omchain.io/address/0xb69c9a0998AC337fd7101D5eE710176030b186b1
- ProjectFactoryV3: https://explorer.omchain.io/address/0xeF26c2c6E107f04c8137d1ee67177fA058a12C7F
- MetaTxForwarder: https://explorer.omchain.io/address/0x66aC00B6bE5F7992B86862405740266a49deca44

## Project Contract Deployment

Project contracts are deployed dynamically via the ProjectFactoryV3. Each project gets its own contract address.

To get a project's contract address:

```javascript
// Using project ID
const projectInfo = await factory.projects("PROJECT_ID");
const projectAddress = projectInfo.projectContract;

// Or from creation event
const tx = await factory.createProject(projectId, projectAdmin);
const receipt = await tx.wait();
const event = receipt.logs.find(log => log.eventName === "ProjectCreated");
const projectAddress = event.args.projectContract;
```

## Gas Settings

Recommended gas settings for OM Chain:

```javascript
const gasPrice = await provider.getGasPrice();
const gasLimit = {
    // Token operations
    transfer: 65000,
    approve: 50000,
    mint: 100000,
    
    // Project operations
    createProject: 3000000,
    createRequest: 300000,
    approveRequest: 200000,
    
    // Emergency operations
    emergencyPause: 50000,
    initiateEmergencyClosure: 250000
};
```

## ABI Files

Contract ABIs can be found in the following locations:

- **ProjectReimbursementV3**: `artifacts/contracts/ProjectReimbursementV3.sol/ProjectReimbursementV3.json`
- **ProjectFactoryV3**: `artifacts/contracts/ProjectFactoryV3.sol/ProjectFactoryV3.json`
- **OMTHBTokenV3**: `artifacts/contracts/upgradeable/OMTHBTokenV3.sol/OMTHBTokenV3.json`

## Network Configuration

### Hardhat Configuration

```javascript
module.exports = {
    networks: {
        omchain: {
            url: "https://rpc.omchain.io",
            chainId: 1246,
            accounts: [process.env.PRIVATE_KEY]
        }
    }
};
```

### Ethers.js Configuration

```javascript
const provider = new ethers.JsonRpcProvider("https://rpc.omchain.io");
const wallet = new ethers.Wallet(privateKey, provider);
```

### Web3.js Configuration

```javascript
const web3 = new Web3("https://rpc.omchain.io");
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);
```

## Role Addresses

These addresses have been assigned roles in the deployed contracts:

### OMTHBToken Roles

- **DEFAULT_ADMIN_ROLE**: *(Set during deployment)*
- **MINTER_ROLE**: *(Assigned via timelock)*
- **PAUSER_ROLE**: *(Assigned by admin)*
- **BLACKLISTER_ROLE**: *(Assigned by admin)*
- **GUARDIAN_ROLE**: *(Emergency role)*
- **TIMELOCK_ADMIN_ROLE**: *(Manages timelock operations)*

### ProjectFactory Roles

- **DEFAULT_ADMIN_ROLE**: *(Set during deployment)*
- **PROJECT_CREATOR_ROLE**: *(Can create new projects)*
- **DEPUTY_ROLE**: *(Multi-sig for closures)*
- **DIRECTOR_ROLE**: *(Multi-sig for closures)*
- **PAUSER_ROLE**: *(Emergency pause)*

## Important Notes

1. **Project Contracts**: Each project has its own contract deployed via the factory. Project addresses are not fixed and must be queried from the factory.

2. **Token Approvals**: Before depositing OMTHB to a project, users must approve the project contract to spend their tokens.

3. **Gas Estimation**: Always estimate gas before sending transactions, especially for complex operations like project creation or multi-recipient distributions.

4. **Role Management**: Role assignments use a commit-reveal pattern with timelock for security. Plan role changes in advance.

5. **Emergency Contacts**: For emergency situations (pause, guardian actions), contact the system administrators immediately.

## Support

For technical support or questions:
- Documentation: https://docs.omchain.io
- Support Email: support@omchain.io
- Discord: https://discord.gg/omchain