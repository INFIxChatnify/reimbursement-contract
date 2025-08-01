# V3 Contracts Deployment Status

## ✅ Completed Tasks

1. **Contract Preparation**:
   - ✅ Created ProjectReimbursementV3.sol
   - ✅ Created ProjectFactoryV3.sol
   - ✅ Created BeaconProjectFactoryV3.sol
   - ✅ OMTHBTokenV3.sol already exists

2. **Deployment Scripts**:
   - ✅ Created deploy-v3-contracts.js
   - ✅ Created verify-v3-contracts.js
   - ✅ Created check-deployment-config.js

3. **Compilation**:
   - ✅ All contracts compiled successfully
   - ⚠️  Warning: ProjectReimbursementV3 size exceeds 24KB (optimizer already enabled)

## 🔴 Pending: Private Key Required

To deploy the contracts to OMChain, you need to:

1. **Create .env file** in project root:
   ```bash
   cp .env.example .env
   ```

2. **Add your private key** (without 0x prefix):
   ```
   PRIVATE_KEY=your_private_key_here
   OMCHAIN_API_KEY=optional_api_key_for_verification
   ```

3. **Ensure your account has OM tokens** for gas fees

## 📋 Contracts Ready to Deploy

Once you provide the private key, these contracts will be deployed:

1. **OMTHBTokenV3**
   - Upgradeable proxy pattern
   - Features: Multi-minter, timelock, emergency pause
   - Timelock: 2 days
   - Global daily limit: 10M OMTHB
   - Suspicious threshold: 1M OMTHB

2. **ProjectReimbursementV3**
   - Enhanced with all security features
   - Min deposit: 10 OMTHB
   - Max locked funds: 80%
   - Stale request timeout: 30 days

3. **MetaTxForwarderV3**
   - For gasless transactions

4. **ProjectFactoryV3**
   - Creates projects with zero initial balance
   - Integrated with V3 contracts

5. **BeaconProjectFactoryV3**
   - Upgradeable project creation
   - Uses beacon proxy pattern

## 🚀 Deployment Commands

Once .env is configured:

```bash
# Deploy all V3 contracts
npx hardhat run scripts/deploy-v3-contracts.js --network omchain

# Verify on OMScan
npx hardhat run scripts/verify-v3-contracts.js --network omchain
```

## 📁 Output Files

After deployment:
- `deployments/omchain-v3-deployments.json` - Contains all deployed addresses
- Verification will provide OMScan links for each contract

## ⚠️ Important Notes

1. **Security**: Never commit your .env file
2. **Gas**: Ensure sufficient OM tokens for deployment
3. **Roles**: After deployment, assign appropriate roles
4. **Testing**: Test on testnet first if available