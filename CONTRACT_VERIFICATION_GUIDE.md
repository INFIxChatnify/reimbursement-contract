# Contract Verification Guide for OM Platform

## Overview

This guide provides comprehensive instructions for verifying the smart contracts deployed on OM Platform (Chain ID: 1246). Two contracts require verification:

1. **ProjectFactory** - `0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1`
2. **ProjectReimbursementMultiRecipient** - `0x1100ED4175BB828958396a708278D46146e1748b`

## Why Verification Failed

The automatic verification likely failed due to:

1. **API Timeout**: OMScan API may have rate limits or timeout issues
2. **Library Linking**: ProjectFactory uses SecurityLib which needs proper linking
3. **Compiler Settings**: Via IR optimization can cause bytecode mismatches
4. **Constructor Arguments**: Complex constructor args need exact encoding

## Verification Methods

### Method 1: Automated Scripts with Retry

```bash
# Install dependencies if needed
npm install

# Run verification with retry mechanism
npx hardhat run scripts/verify-with-retry.js --network omchain
```

This script will:
- Attempt verification up to 5 times with exponential backoff
- Generate fallback scripts if verification fails
- Create detailed reports in `verification-reports/`

### Method 2: Specific Contract Verification

```bash
# Run targeted verification
npx hardhat run scripts/verify-specific-contracts.js --network omchain
```

This script will:
- Try multiple verification approaches
- Generate manual verification data if automatic fails
- Save verification data in `verification-data/`

### Method 3: Manual Verification Preparation

```bash
# Generate manual verification packages
npx hardhat run scripts/prepare-manual-verification.js --network omchain
```

This will create:
- Flattened source files
- Encoded constructor arguments
- Detailed instructions for each contract
- All files saved in `manual-verification/`

## Manual Web Verification Steps

### For ProjectFactory

1. Visit: https://omscan.omplatform.com/verifyContract
2. Enter details:
   - **Contract Address**: `0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1`
   - **Contract Name**: `ProjectFactory`
   - **Compiler**: `v0.8.20+commit.a1b79de6`
   - **Optimization**: Yes (200 runs)
   - **EVM Version**: Paris
   - **Via IR**: Enabled

3. Constructor Arguments (ABI-encoded):
   ```
   0x0000000000000000000000001100ed4175bb828958396a708278d46146e1748b0000000000000000000000003a7acdc2568d3839e1ab3faea48e21c03fed2161000000000000000000000000e46b8d73aa3435da5fcee93741bd61ca71b3d347000000000000000000000000eb42b3bf49091377627610a691ea1eaf32bc6254
   ```

4. If using libraries:
   - Add SecurityLib address (check deployment files)

### For ProjectReimbursement

1. Visit: https://omscan.omplatform.com/verifyContract
2. Enter details:
   - **Contract Address**: `0x1100ED4175BB828958396a708278D46146e1748b`
   - **Contract Name**: `ProjectReimbursement`
   - **Compiler**: `v0.8.20+commit.a1b79de6`
   - **Optimization**: Yes (200 runs)
   - **EVM Version**: Paris
   - **Via IR**: Enabled

3. No constructor arguments (implementation contract)

## Compiler Settings (Critical)

Ensure these exact settings in hardhat.config.js:

```javascript
solidity: {
  version: "0.8.20",
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
    viaIR: true,
    evmVersion: "paris"
  }
}
```

## Using Foundry Cast

If you have Foundry installed:

```bash
# ProjectFactory
cast verify-contract \
  0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1 \
  contracts/ProjectFactory.sol:ProjectFactory \
  --chain 1246 \
  --rpc-url https://rpc.omplatform.com \
  --etherscan-api-url https://omscan.omplatform.com/api \
  --compiler-version "v0.8.20+commit.a1b79de6" \
  --num-of-optimizations 200 \
  --constructor-args \
  0x1100ED4175BB828958396a708278D46146e1748b \
  0x3A7ACDc2568D3839E1aB3fAEa48e21c03FEd2161 \
  0xe46b8D73Aa3435dA5FceE93741Bd61Ca71B3d347 \
  0xeB42B3bF49091377627610A691EA1Eaf32bc6254

# ProjectReimbursement
cast verify-contract \
  0x1100ED4175BB828958396a708278D46146e1748b \
  contracts/ProjectReimbursement.sol:ProjectReimbursement \
  --chain 1246 \
  --rpc-url https://rpc.omplatform.com \
  --etherscan-api-url https://omscan.omplatform.com/api \
  --compiler-version "v0.8.20+commit.a1b79de6" \
  --num-of-optimizations 200
```

## Troubleshooting

### Issue: "Already Verified"
- Check: https://omscan.omplatform.com/address/[CONTRACT_ADDRESS]#code
- The contract might already be verified

### Issue: "Bytecode does not match"
1. Ensure exact compiler settings
2. Check if libraries are properly linked
3. Verify constructor arguments encoding
4. Try without Via IR if persistent issues

### Issue: "API Timeout"
1. Wait and retry later
2. Use manual web interface
3. Try during off-peak hours
4. Use VPN if region-blocked

### Issue: "Library not found"
1. Deploy SecurityLib separately if needed
2. Link library addresses in verification
3. Check deployment files for library addresses

## Verification Checklist

- [ ] Correct compiler version (0.8.20)
- [ ] Optimization enabled (200 runs)
- [ ] Via IR enabled
- [ ] EVM version set to Paris
- [ ] Constructor args properly encoded
- [ ] Libraries linked (if applicable)
- [ ] Source code flattened correctly
- [ ] No duplicate pragma/license statements

## File Structure

After running scripts, check these directories:

```
/verification-data/          # Automated verification data
/verification-reports/       # Verification attempt reports  
/verification-fallback/      # Fallback shell scripts
/manual-verification/        # Complete manual verification packages
  ├── ProjectFactory/
  │   ├── README.md
  │   ├── verification-data.json
  │   ├── ProjectFactory-flattened.sol
  │   ├── ProjectFactory-original.sol
  │   └── constructor-args.txt
  └── ProjectReimbursement/
      ├── README.md
      ├── verification-data.json
      ├── ProjectReimbursement-flattened.sol
      └── ProjectReimbursement-original.sol
```

## Quick Commands

```bash
# Check if contracts are verified
curl "https://omscan.omplatform.com/api?module=contract&action=getabi&address=0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1"

# Run all verification scripts
npm run verify:retry
npm run verify:specific
npm run verify:prepare
```

## Contact & Support

If verification continues to fail:
1. Check OMScan status page
2. Contact OM Platform support
3. Try verification during different times
4. Consider using proxy verification services

## Verification Status Links

- ProjectFactory: https://omscan.omplatform.com/address/0x8db0344555a502b546E8ea0725c8F75cAeeFfCe1#code
- ProjectReimbursement: https://omscan.omplatform.com/address/0x1100ED4175BB828958396a708278D46146e1748b#code