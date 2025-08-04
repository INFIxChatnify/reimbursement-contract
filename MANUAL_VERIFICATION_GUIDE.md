# Manual Contract Verification Guide for OMScan

## Contracts to Verify

### 1. Gas Tank Contract
- **Address:** `0xA01b775F6ebA700e29bD1579abE4f1DC53bA6f8d`
- **Contract:** `contracts/GasTank.sol:GasTank`
- **Constructor Arguments:**
  - admin: `0x42a7ca42C90448A7f70970C14c34D9cd4D3309A6`
  - emergencyWithdrawAddress: `0x42a7ca42C90448A7f70970C14c34D9cd4D3309A6`
- **Encoded Constructor:** `00000000000000000000000042a7ca42c90448a7f70970c14c34d9cd4d3309a600000000000000000000000042a7ca42c90448a7f70970c14c34d9cd4d3309a6`

### 2. MetaTxForwarder Contract ✅ (Already Verified)
- **Address:** `0x36e030Be3955aCF97AA725bE99A0D7Fc64238292`
- **Status:** Successfully verified
- **Link:** https://omscan.omplatform.com/address/0x36e030Be3955aCF97AA725bE99A0D7Fc64238292#code

### 3. ProjectFactory Contract
- **Address:** `0x6495152B17f9d7418e64ef1277935EE70d73Aeed`
- **Contract:** `contracts/ProjectFactory.sol:ProjectFactory`
- **Constructor Arguments:**
  - projectImplementation: `0x2E363b97d9da9cA243BcC782d7DdffC18E6F54cC`
  - omthbToken: `0x05db2AE2eAb7A47395DB8cDbf5f3E84A78989091`
  - metaTxForwarder: `0x36e030Be3955aCF97AA725bE99A0D7Fc64238292`
  - admin: `0x42a7ca42C90448A7f70970C14c34D9cd4D3309A6`
- **Encoded Constructor:** `0000000000000000000000002e363b97d9da9ca243bcc782d7ddffc18e6f54cc00000000000000000000000005db2ae2eab7a47395db8cdbf5f3e84a7898909100000000000000000000000036e030be3955acf97aa725be99a0d7fc6423829200000000000000000000000042a7ca42c90448a7f70970c14c34d9cd4d3309a6`

## Manual Verification Steps

1. **Go to OMScan Verify Page**
   - Navigate to: https://omscan.omplatform.com/verifyContract

2. **Enter Contract Information**
   - Contract Address: (from above)
   - Compiler Type: `Solidity (Single file)`
   - Compiler Version: `v0.8.20+commit.a1b79de6`
   - Open Source License Type: `MIT`

3. **Optimization Settings**
   - Optimization: `Yes`
   - Runs: `1`
   - EVM Version: `paris`

4. **Contract Source Code**
   - Use the flattened versions from the `manual-verification/` folder
   - Or run: `npx hardhat flatten contracts/[CONTRACT_PATH] > flattened.sol`

5. **Constructor Arguments**
   - Use the encoded constructor arguments provided above
   - Remove the "0x" prefix if present

6. **Submit Verification**
   - Click "Verify and Publish"

## Verification Status Summary

| Contract | Address | Status |
|----------|---------|--------|
| ProjectReimbursementOptimized | `0x2E363b97d9da9cA243BcC782d7DdffC18E6F54cC` | ✅ Verified |
| OMTHBToken Implementation | `0xC051053E9C6Cb7BccEc4F22F801B5106EA476D6d` | ✅ Verified |
| OMTHBToken Proxy | `0x05db2AE2eAb7A47395DB8cDbf5f3E84A78989091` | ✅ Verified |
| MetaTxForwarder | `0x36e030Be3955aCF97AA725bE99A0D7Fc64238292` | ✅ Verified |
| Gas Tank | `0xA01b775F6ebA700e29bD1579abE4f1DC53bA6f8d` | ⏳ Pending |
| ProjectFactory | `0x6495152B17f9d7418e64ef1277935EE70d73Aeed` | ⏳ Pending |

## Troubleshooting

- If verification fails with "Unknown UID", wait a few minutes and try again
- Make sure to use exact compiler settings (v0.8.20, optimization runs = 1)
- For library linking issues, check the flattened file includes all dependencies
- If automated verification continues to fail, use the manual web interface