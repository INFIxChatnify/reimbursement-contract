# OM Platform Deployment Instructions

This guide provides step-by-step instructions for deploying and verifying smart contracts on the OM Platform mainnet.

## Prerequisites

1. **Node.js and npm** installed (v16+ recommended)
2. **Private key** with sufficient OM tokens for deployment (at least 1 OM token)
3. **OMScan API key** (optional, for automated verification)

## Configuration

1. Create a `.env` file in the project root:
```bash
# Required
PRIVATE_KEY=your_private_key_here

# Optional (for automated verification)
OMCHAIN_API_KEY=your_omscan_api_key_here
```

2. Install dependencies:
```bash
npm install
```

## Deployment Process

### Step 1: Deploy Contracts

Run the deployment script:

```bash
npx hardhat run scripts/deploy-om-platform.js --network omchain
```

This script will:
- Deploy all smart contracts in the correct order
- Configure admin roles to `0xeB42B3bF49091377627610A691EA1Eaf32bc6254`
- Set up proper gas limits to avoid out-of-gas errors
- Save deployment addresses for future reference

Expected output:
```
==========================================
OM Platform Smart Contract Deployment
==========================================
Network: OM Platform Mainnet (Chain ID: 1246)
Admin Wallet: 0xeB42B3bF49091377627610A691EA1Eaf32bc6254
==========================================

1. Deploying OMTHBToken (Upgradeable)...
✅ OMTHBToken deployed to: 0x...

2. Deploying MetaTxForwarder...
✅ MetaTxForwarder deployed to: 0x...

[... continues for all contracts ...]
```

### Step 2: Verify Contracts

After deployment, verify the contracts on OMScan:

```bash
npx hardhat run scripts/verify-om-platform.js --network omchain
```

If automated verification fails, use manual verification:

```bash
npx hardhat run scripts/verify-om-platform.js --network omchain --manual
```

### Step 3: Post-Deployment Configuration

1. **Mint Initial OMTHB Tokens** (if needed):
```javascript
// Example: Mint 1 million OMTHB to treasury
const omthb = await ethers.getContractAt("OMTHBToken", OMTHB_ADDRESS);
await omthb.mint(TREASURY_ADDRESS, ethers.parseEther("1000000"));
```

2. **Configure Deputies in ProjectFactory**:
```javascript
const factory = await ethers.getContractAt("ProjectFactory", FACTORY_ADDRESS);
await factory.addDeputy(DEPUTY_ADDRESS_1);
await factory.addDeputy(DEPUTY_ADDRESS_2);
```

3. **Whitelist Project Contracts in MetaTxForwarder** (as they are created):
```javascript
const forwarder = await ethers.getContractAt("MetaTxForwarder", FORWARDER_ADDRESS);
await forwarder.setTargetWhitelist(PROJECT_ADDRESS, true);
```

## Contract Addresses

After deployment, contract addresses are saved in:
- `deployments/om-platform-latest.json` (latest deployment)
- `deployments/om-platform-{timestamp}.json` (timestamped backup)

## Gas Configuration

The deployment uses the following gas settings to prevent out-of-gas errors:
- Gas Limit: 10,000,000
- Gas Price: 20 Gwei (adjustable based on network conditions)
- Max Fee Per Gas: 30 Gwei
- Max Priority Fee: 2 Gwei

## Troubleshooting

### Out of Gas Errors
If you encounter out-of-gas errors:
1. Increase the `gasLimit` in `DEPLOYMENT_CONFIG` (scripts/deploy-om-platform.js)
2. Check current network gas prices on OMScan
3. Ensure your account has sufficient OM tokens

### Verification Failures
If verification fails:
1. Wait 5-10 minutes after deployment before verifying
2. Check if contracts are already verified on OMScan
3. Use manual verification with flattened source code
4. Ensure your OMCHAIN_API_KEY is correctly set

### Network Connection Issues
If you can't connect to OM Platform:
1. Check the RPC URL: `https://rpc.omplatform.com`
2. Verify chain ID is 1246
3. Ensure your internet connection is stable

## Manual Verification Steps

If automated verification fails:

1. Generate flattened source files:
```bash
mkdir -p flattened
npx hardhat flatten contracts/upgradeable/OMTHBToken.sol > flattened/OMTHBToken.sol
npx hardhat flatten contracts/MetaTxForwarder.sol > flattened/MetaTxForwarder.sol
npx hardhat flatten contracts/AuditAnchor.sol > flattened/AuditAnchor.sol
npx hardhat flatten contracts/ProjectReimbursement.sol > flattened/ProjectReimbursement.sol
npx hardhat flatten contracts/ProjectFactory.sol > flattened/ProjectFactory.sol
```

2. Go to https://omscan.omplatform.com/verifyContract

3. Enter contract details:
   - Contract Address: (from deployment output)
   - Contract Name: (e.g., "OMTHBToken")
   - Compiler Version: v0.8.20+commit.a1b79de6
   - Optimization: Enabled, 200 runs
   - Via IR: Yes
   - EVM Version: paris

4. Paste the flattened source code

5. For ProjectFactory, add constructor arguments:
   - Project Implementation address
   - OMTHB Token proxy address
   - MetaTxForwarder address
   - Admin wallet address

## Security Checklist

Before using contracts in production:

- [ ] Verify all contracts on OMScan
- [ ] Confirm admin wallet controls all contracts
- [ ] Test basic operations (mint, transfer, create project)
- [ ] Configure multi-sig wallets for critical operations
- [ ] Set up monitoring for contract events
- [ ] Document all admin addresses and roles
- [ ] Create emergency response procedures

## Support

For deployment issues or questions:
1. Check deployment logs in `deployments/` folder
2. Review error messages in console output
3. Verify network status on https://omscan.omplatform.com
4. Contact OM Platform support if needed