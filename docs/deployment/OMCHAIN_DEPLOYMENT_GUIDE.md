# OM Chain Multi-Recipient Reimbursement System Deployment Guide

## Overview

This guide covers the deployment, verification, and testing of the multi-recipient reimbursement system on OM Chain (chainId: 1246).

## System Architecture

The multi-recipient reimbursement system consists of five main contracts:

1. **OMTHB Token** - Upgradeable ERC20 token representing Thai Baht on OM Chain
2. **Gas Tank** - Manages gas credits for gasless transactions
3. **MetaTxForwarder** - ERC-2771 compliant forwarder for meta transactions
4. **ProjectFactory** - Factory for deploying project reimbursement contracts
5. **ProjectReimbursementMultiRecipient** - Implementation contract supporting multiple recipients per request

## Prerequisites

1. **Environment Setup**
   ```bash
   # Install dependencies
   npm install

   # Create .env file from example
   cp .env.example .env
   ```

2. **Configure .env**
   ```env
   PRIVATE_KEY=your_deployer_private_key
   OMCHAIN_RPC_URL=https://rpc.omplatform.com
   OMCHAIN_CHAIN_ID=1246
   OMCHAIN_API_KEY=your_omscan_api_key_if_available
   ```

3. **Ensure Sufficient OM Balance**
   - Deployer needs ~50 OM for deployment
   - Additional 10 OM for initial Gas Tank funding
   - Extra OM for testing transactions

## Deployment Steps

### 1. Compile Contracts

```bash
npm run compile
```

This compiles all contracts with optimization enabled for gas efficiency.

### 2. Deploy to OM Chain

```bash
npm run deploy:omchain
```

This script will:
- Deploy all five contracts in the correct order
- Configure initial roles and permissions
- Fund the Gas Tank with 10 OM
- Whitelist contracts in MetaTxForwarder
- Save deployment addresses to `deployments/omchain-deployment.json`

Expected output:
```
🚀 Starting multi-recipient reimbursement system deployment to OM Chain...
============================================================
📍 Network: OM Chain
⛓️  Chain ID: 1246
🔗 RPC URL: https://rpc.omplatform.com

📦 Starting contract deployments...
============================================================
1️⃣ Deploying OMTHB Token (Upgradeable)...
✅ OMTHB Token deployed to: 0x...

2️⃣ Deploying Gas Tank...
✅ Gas Tank deployed to: 0x...

3️⃣ Deploying MetaTxForwarder...
✅ MetaTxForwarder deployed to: 0x...

4️⃣ Deploying ProjectReimbursementMultiRecipient Implementation...
✅ ProjectReimbursementMultiRecipient Implementation deployed to: 0x...

5️⃣ Deploying ProjectFactory...
✅ ProjectFactory deployed to: 0x...
```

### 3. Verify Contracts on OMScan

```bash
npm run verify:omchain
```

This will verify all deployed contracts on OMScan, making their source code publicly available.

### 4. Test Deployment

```bash
npm run test:omchain
```

This script performs basic functionality tests:
- Creates a test project
- Mints OMTHB tokens
- Sets up roles
- Creates a multi-recipient reimbursement request
- Verifies gasless transaction configuration

## Contract Configuration

### Initial Roles

The deployment script sets up the following initial roles:

**OMTHB Token:**
- DEFAULT_ADMIN_ROLE: Deployer
- MINTER_ROLE: Deployer
- PAUSER_ROLE: Deployer
- BLACKLISTER_ROLE: Deployer
- UPGRADER_ROLE: Deployer

**Gas Tank:**
- DEFAULT_ADMIN_ROLE: Deployer
- OPERATOR_ROLE: Deployer
- RELAYER_ROLE: MetaTxForwarder

**ProjectFactory:**
- DEFAULT_ADMIN_ROLE: Deployer
- DIRECTOR_ROLE: Deployer
- PAUSER_ROLE: Deployer
- PROJECT_CREATOR_ROLE: Deployer

### Gas Tank Configuration

Default limits per account:
- Max per transaction: 0.1 OM
- Daily limit: 1 OM
- Initial funding: 10 OM

### MetaTxForwarder Configuration

- Rate limit: 100 transactions per hour per address
- Minimum gas requirement: 100,000 gas
- Max return data size: 10KB

## Creating a Project

After deployment, create a new project:

```javascript
// Example using ethers.js
const projectFactory = await ethers.getContractAt("ProjectFactory", factoryAddress);

const tx = await projectFactory.createProject(
  "PROJECT-001",                    // Project ID
  ethers.parseEther("100000"),     // Budget: 100,000 OMTHB
  projectAdminAddress              // Project admin address
);

const receipt = await tx.wait();
// Extract project address from events
```

## Multi-Recipient Reimbursement Flow

1. **Create Request** (Requester)
   ```javascript
   const recipients = [addr1, addr2, addr3];
   const amounts = [amount1, amount2, amount3];
   
   await project.createRequestMultiple(
     recipients,
     amounts,
     "Multi-recipient expense",
     "QmDocumentHash"
   );
   ```

2. **Approval Flow** (with commit-reveal)
   - Secretary approval
   - Committee approval (Level 1)
   - Finance approval
   - Committee additional approvals (3 required)
   - Director approval (auto-distributes)

3. **Distribution**
   - Automatically distributes to all recipients after director approval
   - Each recipient receives their specified amount
   - Events emitted for tracking

## Security Features

1. **Commit-Reveal Pattern**: Prevents front-running attacks
2. **Rate Limiting**: Prevents spam and DoS attacks
3. **Gasless Transactions**: Users don't need OM for transactions
4. **Emergency Closure**: Multi-sig emergency shutdown mechanism
5. **Upgradeable Contracts**: OMTHB token can be upgraded for fixes

## Monitoring and Maintenance

### View on OMScan

After deployment, view your contracts:
- https://omscan.omplatform.com/address/[CONTRACT_ADDRESS]

### Monitor Gas Tank

```javascript
// Check gas tank balance
const balance = await ethers.provider.getBalance(gasTankAddress);
console.log(`Gas Tank Balance: ${ethers.formatEther(balance)} OM`);

// Check user credit
const credit = await gasTank.getAvailableCredit(userAddress);
console.log(`Available Credit: ${ethers.formatEther(credit)} OM`);
```

### Emergency Procedures

**Pause Operations:**
```javascript
// Requires PAUSER_ROLE
await projectFactory.pause();
await project.pause();
```

**Emergency Closure:**
```javascript
// Requires 3 committee members + director
await project.initiateEmergencyClosure(
  returnAddress,
  "Emergency closure reason"
);
```

## Troubleshooting

### Common Issues

1. **"Insufficient gas credit"**
   - Fund the Gas Tank with more OM
   - Check user's daily limit hasn't been exceeded

2. **"Target not whitelisted"**
   - Whitelist new project contracts in MetaTxForwarder
   ```javascript
   await forwarder.setTargetWhitelist(projectAddress, true);
   ```

3. **"Rate limit exceeded"**
   - Wait for rate limit window to reset (1 hour)
   - Or increase rate limit for testing

4. **Verification fails on OMScan**
   - Ensure OMCHAIN_API_KEY is set (if required)
   - Run `npx hardhat clean && npx hardhat compile`
   - Check constructor arguments match deployment

## Gas Optimization

The contracts are optimized for OM Chain:
- Minimal proxy pattern for project deployments
- Batch operations where possible
- Efficient storage packing
- Gas refunds through Gas Tank

## Support and Resources

- OM Chain RPC: https://rpc.omplatform.com
- OMScan Explorer: https://omscan.omplatform.com
- Chain ID: 1246

## Next Steps

1. **Production Setup**
   - Transfer admin roles to multi-sig wallets
   - Configure proper role assignments
   - Set up monitoring and alerts

2. **Frontend Integration**
   - Use ethers.js or web3.js to interact with contracts
   - Implement gasless transaction signing
   - Add OMScan links for transparency

3. **Testing**
   - Run comprehensive test suite
   - Test emergency procedures
   - Verify gas consumption patterns

## Contract Addresses (To be filled after deployment)

```json
{
  "network": "omchain",
  "chainId": 1246,
  "timestamp": "DEPLOYMENT_TIMESTAMP",
  "addresses": {
    "omthbToken": "0x...",
    "omthbTokenImplementation": "0x...",
    "gasTank": "0x...",
    "metaTxForwarder": "0x...",
    "projectFactory": "0x...",
    "projectReimbursementImplementation": "0x..."
  }
}
```

## Important Notes

- Always test on testnet first if available
- Keep private keys secure and never commit them
- Monitor gas prices on OM Chain for optimal transaction timing
- Regular audits recommended for production use