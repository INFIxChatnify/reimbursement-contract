# OMChain Reimbursement System Deployment Guide

## Prerequisites

1. **Node.js & NPM**: Ensure you have Node.js (v16+) and npm installed
2. **Dependencies**: Install project dependencies
   ```bash
   npm install
   ```

3. **Environment Configuration**: Ensure your `.env` file contains:
   ```
   PRIVATE_KEY=your_deployer_private_key
   OMCHAIN_RPC_URL=https://rpc.omplatform.com
   OMCHAIN_CHAIN_ID=1246
   OWNER_ADDRESS=0xeB42B3bF49091377627610A691EA1Eaf32bc6254
   
   # Optional
   OMCHAIN_API_KEY=your_api_key_if_available
   DEPUTIES=0xDeputy1,0xDeputy2,0xDeputy3  # Comma-separated addresses
   ```

4. **Fund Deployer**: Ensure the deployer account has sufficient OMTHB tokens for gas fees

## Deployment Steps

### 1. Deploy All Contracts

Run the main deployment script:

```bash
npx hardhat run scripts/deploy-all.js --network omchain
```

This script will:
- Deploy OMTHB Token (upgradeable)
- Deploy MetaTxForwarder
- Deploy ProjectReimbursement implementation
- Deploy ProjectFactory
- Deploy AuditAnchor
- Configure all necessary roles and permissions
- Transfer ownership to the configured owner address
- Save deployment information to `deployments/omchain-latest.json`

### 2. Verify Deployment

After deployment, verify everything is working correctly:

```bash
npx hardhat run scripts/verify-deployment.js --network omchain
```

This will check:
- All contracts are deployed correctly
- Roles and permissions are set up properly
- Cross-contract integrations are configured
- Basic functionality is working

### 3. Post-Deployment Setup (Optional)

For initial setup or testing:

```bash
# Set environment variables for post-deployment actions
export MINT_INITIAL_TOKENS=true
export INITIAL_MINT_AMOUNT=1000000
export CREATE_TEST_PROJECT=true
export TEST_PROJECT_ID=TEST-001
export TEST_PROJECT_BUDGET=100000
export FUND_TEST_PROJECT=true

# Run post-deployment setup
npx hardhat run scripts/post-deploy.js --network omchain
```

## Contract Addresses

After deployment, your contract addresses will be saved in:
- `deployments/omchain-latest.json` - Latest deployment
- `deployments/omchain-deployment-{timestamp}.json` - Timestamped backup

## Manual Deployment (Alternative)

If you prefer to deploy contracts individually:

### 1. Deploy OMTHB Token
```bash
npx hardhat console --network omchain
> const OMTHBToken = await ethers.getContractFactory("OMTHBToken")
> const omthb = await upgrades.deployProxy(OMTHBToken, ["0xOWNER_ADDRESS"], {kind: 'uups'})
> await omthb.waitForDeployment()
> console.log("OMTHB Token:", await omthb.getAddress())
```

### 2. Deploy MetaTxForwarder
```bash
> const MetaTxForwarder = await ethers.getContractFactory("MetaTxForwarder")
> const forwarder = await MetaTxForwarder.deploy()
> await forwarder.waitForDeployment()
> console.log("MetaTxForwarder:", await forwarder.getAddress())
```

### 3. Deploy ProjectReimbursement Implementation
```bash
> const ProjectReimbursement = await ethers.getContractFactory("ProjectReimbursement")
> const impl = await ProjectReimbursement.deploy()
> await impl.waitForDeployment()
> console.log("Implementation:", await impl.getAddress())
```

### 4. Deploy ProjectFactory
```bash
> const ProjectFactory = await ethers.getContractFactory("ProjectFactory")
> const factory = await ProjectFactory.deploy(
    "0xIMPL_ADDRESS",
    "0xOMTHB_ADDRESS", 
    "0xFORWARDER_ADDRESS",
    "0xOWNER_ADDRESS"
  )
> await factory.waitForDeployment()
> console.log("ProjectFactory:", await factory.getAddress())
```

### 5. Deploy AuditAnchor
```bash
> const AuditAnchor = await ethers.getContractFactory("AuditAnchor")
> const audit = await AuditAnchor.deploy()
> await audit.waitForDeployment()
> console.log("AuditAnchor:", await audit.getAddress())
```

## Post-Deployment Configuration

### 1. Grant Roles
```javascript
// Grant PROJECT_CREATOR_ROLE
const PROJECT_CREATOR_ROLE = await factory.PROJECT_CREATOR_ROLE()
await factory.grantRole(PROJECT_CREATOR_ROLE, ownerAddress)

// Grant MINTER_ROLE to ProjectFactory
const MINTER_ROLE = await omthb.MINTER_ROLE()
await omthb.grantRole(MINTER_ROLE, factoryAddress)
```

### 2. Add Deputies
```javascript
await factory.addDeputy("0xDEPUTY1_ADDRESS")
await factory.addDeputy("0xDEPUTY2_ADDRESS")
await factory.addDeputy("0xDEPUTY3_ADDRESS")
```

### 3. Authorize Audit Anchors
```javascript
await audit.authorizeAnchor("0xANCHOR_ADDRESS", true)
```

## Interacting with Deployed Contracts

### Create a Project
```javascript
const projectId = "PROJ-001"
const budget = ethers.parseEther("100000")
const projectAdmin = "0xADMIN_ADDRESS"

await factory.createProject(projectId, budget, projectAdmin)
```

### Mint OMTHB Tokens
```javascript
const amount = ethers.parseEther("1000000")
await omthb.mint("0xRECIPIENT", amount)
```

### Anchor Audit Batch
```javascript
await audit.anchorAuditBatch(
    "QmIPFSHASH",
    "0xMERKLE_ROOT",
    100, // entry count
    "EXPENSE" // batch type
)
```

## Troubleshooting

### Deployment Fails
- Check deployer has sufficient gas funds
- Verify RPC URL is correct
- Ensure private key is valid

### Verification Fails
- Contract verification might fail if explorer API is unavailable
- You can verify contracts manually later using:
  ```bash
  npx hardhat verify --network omchain CONTRACT_ADDRESS "constructor" "args"
  ```

### Role Configuration Issues
- Ensure you're using the owner account to configure roles
- Check deployment report for correct addresses

## Security Checklist

- [ ] Owner address is correct and secure
- [ ] All admin roles transferred from deployer
- [ ] Deputies are configured (minimum 2)
- [ ] Contract verification completed
- [ ] Initial token minting completed
- [ ] Test transactions successful

## Support

For issues or questions:
1. Check deployment logs in `deployments/` directory
2. Run verification script for diagnostics
3. Review contract source code and tests