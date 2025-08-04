# V3 Contracts Deployment Instructions

## Prerequisites

1. **Setup Environment Variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add:
   - `PRIVATE_KEY`: Your deployment wallet private key (without 0x prefix)
   - `OMCHAIN_API_KEY`: Optional, for contract verification

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Compile Contracts**
   ```bash
   npx hardhat compile
   ```

## Deploy V3 Contracts

1. **Deploy to OMChain**
   ```bash
   npx hardhat run scripts/deploy-v3-contracts.js --network omchain
   ```

   This will deploy:
   - OMTHBTokenV3 (upgradeable proxy)
   - ProjectReimbursementV3
   - ProjectFactoryV3
   - BeaconProjectFactoryV3
   - MetaTxForwarderV3

2. **Verify Contracts on OMScan**
   ```bash
   npx hardhat run scripts/verify-v3-contracts.js --network omchain
   ```

## Deployment Summary

The deployment script will:
1. Deploy all V3 contracts with proper naming
2. Initialize OMTHBTokenV3 with timelock and security features
3. Save deployment addresses to `deployments/omchain-v3-deployments.json`
4. Display all deployed contract addresses

The verification script will:
1. Read deployment addresses from the JSON file
2. Verify each contract on OMScan
3. Provide direct links to view contracts on OMScan

## Contract Addresses

After deployment, you'll find all addresses in:
- `deployments/omchain-v3-deployments.json`

## OMScan Links

After verification, view your contracts at:
- https://omscan.omplatform.com/address/{contract_address}

## Security Notes

1. **Private Key Security**: Never commit your `.env` file
2. **Deployment Account**: Ensure your deployment account has sufficient OM tokens
3. **Role Management**: After deployment, properly assign roles to appropriate addresses
4. **Timelock**: OMTHBTokenV3 has a 2-day timelock for critical operations

## Post-Deployment Steps

1. **Assign Roles**: Set up proper roles for each contract
2. **Transfer Ownership**: Transfer admin roles to multi-sig wallets
3. **Test Contracts**: Verify all functionality works as expected
4. **Monitor**: Set up monitoring for contract events