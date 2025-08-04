# OMChain Reimbursement System - Deployment Report

## Deployment Information

- **Network**: OMChain
- **Chain ID**: 1246
- **RPC URL**: https://rpc.omplatform.com
- **Deployment Date**: 2025-07-27T17:36:57.359Z
- **Deployer Address**: 0x42a7ca42C90448A7f70970C14c34D9cd4D3309A6
- **Owner Address**: 0xeB42B3bF49091377627610A691EA1Eaf32bc6254

## Deployed Contract Addresses

### 1. OMTHB Token (Upgradeable)
- **Proxy**: `0xb69c9a0998AC337fd7101D5eE710176030b186b1`
- **Implementation**: `0xc72A6698fD9AD11807BaA2976195fF3B36C6FEe0`
- **Details**:
  - Name: OM Thai Baht
  - Symbol: OMTHB
  - Decimals: 18
  - Current Supply: 0 OMTHB

### 2. MetaTxForwarder
- **Address**: `0x66aC00B6bE5F7992B86862405740266a49deca44`
- **Current Owner**: 0x42a7ca42C90448A7f70970C14c34D9cd4D3309A6
- **Features**: Gasless transactions support with rate limiting

### 3. ProjectReimbursement Implementation
- **Address**: `0xC6D7180063aC172A4Ea9ce4E487c5927A864cFD2`
- **Note**: This is the implementation contract used by ProjectFactory for minimal proxy deployments

### 4. ProjectFactory
- **Address**: `0xeF26c2c6E107f04c8137d1ee67177fA058a12C7F`
- **Configuration**:
  - Project Implementation: 0xC6D7180063aC172A4Ea9ce4E487c5927A864cFD2
  - OMTHB Token: 0xb69c9a0998AC337fd7101D5eE710176030b186b1
  - Meta Transaction Forwarder: 0x66aC00B6bE5F7992B86862405740266a49deca44

### 5. AuditAnchor
- **Address**: `0xAccacC43fC63C8be8B3408F9f4071fdA1D627199`
- **Current Owner**: 0x42a7ca42C90448A7f70970C14c34D9cd4D3309A6
- **Features**: Blockchain anchoring for audit logs with Merkle tree verification

## Required Post-Deployment Actions

### For the Owner (0xeB42B3bF49091377627610A691EA1Eaf32bc6254)

The following actions need to be completed by the owner address:

1. **OMTHB Token Configuration**:
   ```javascript
   // Grant MINTER_ROLE to ProjectFactory
   await omthbToken.grantRole(MINTER_ROLE, "0xeF26c2c6E107f04c8137d1ee67177fA058a12C7F")
   
   // Grant yourself necessary roles (if needed)
   await omthbToken.grantRole(MINTER_ROLE, "0xeB42B3bF49091377627610A691EA1Eaf32bc6254")
   ```

2. **ProjectFactory Configuration**:
   ```javascript
   // Grant yourself PROJECT_CREATOR_ROLE
   await projectFactory.grantRole(PROJECT_CREATOR_ROLE, "0xeB42B3bF49091377627610A691EA1Eaf32bc6254")
   
   // Add deputy addresses (minimum 2 required for project closure)
   await projectFactory.addDeputy("0xDEPUTY1_ADDRESS")
   await projectFactory.addDeputy("0xDEPUTY2_ADDRESS")
   ```

3. **AuditAnchor Configuration**:
   ```javascript
   // Authorize yourself as an anchor
   await auditAnchor.authorizeAnchor("0xeB42B3bF49091377627610A691EA1Eaf32bc6254", true)
   ```

4. **Ownership Transfers** (if deployer still owns contracts):
   - Request deployer to transfer MetaTxForwarder ownership
   - Request deployer to transfer AuditAnchor ownership
   - Request deployer to grant and transfer admin roles

## Interacting with the Contracts

### Using Hardhat Console

```bash
npx hardhat console --network omchain
```

Then load the contracts:

```javascript
// Load contracts
const omthb = await ethers.getContractAt("OMTHBToken", "0xb69c9a0998AC337fd7101D5eE710176030b186b1")
const factory = await ethers.getContractAt("ProjectFactory", "0xeF26c2c6E107f04c8137d1ee67177fA058a12C7F")
const audit = await ethers.getContractAt("AuditAnchor", "0xAccacC43fC63C8be8B3408F9f4071fdA1D627199")
const forwarder = await ethers.getContractAt("MetaTxForwarder", "0x66aC00B6bE5F7992B86862405740266a49deca44")
```

### Common Operations

1. **Mint OMTHB Tokens**:
   ```javascript
   await omthb.mint("0xRECIPIENT", ethers.parseEther("1000000"))
   ```

2. **Create a Project**:
   ```javascript
   await factory.createProject("PROJECT-001", ethers.parseEther("100000"), "0xPROJECT_ADMIN")
   ```

3. **Anchor Audit Batch**:
   ```javascript
   await audit.anchorAuditBatch("QmIPFSHASH", "0xMERKLE_ROOT", 100, "EXPENSE")
   ```

## Verification Status

- ✅ All contracts deployed successfully
- ⚠️ Permissions need to be configured by owner
- ⚠️ Deputies need to be added
- ⚠️ Initial token minting required

## Security Considerations

1. **Immediate Actions**:
   - Transfer all ownership from deployer to owner
   - Configure all necessary roles
   - Add at least 2 deputy addresses

2. **Before Production Use**:
   - Verify all contract source code on block explorer
   - Test all critical functions
   - Ensure multi-sig requirements are properly configured
   - Fund projects with appropriate OMTHB amounts

## Support Scripts

- **Verify Deployment**: `npx hardhat run scripts/verify-simple.js --network omchain`
- **Setup Permissions**: `npx hardhat run scripts/setup-permissions.js --network omchain`
- **Post-Deploy Setup**: `npx hardhat run scripts/post-deploy.js --network omchain`

## Next Steps

1. Owner should complete all permission configurations
2. Add deputy addresses for multi-sig functionality
3. Mint initial OMTHB tokens for testing
4. Create test projects to verify functionality
5. Set up monitoring for contract events

## Contract Deployment Files

- Latest deployment data: `deployments/omchain-latest.json`
- Deployment backup: `deployments/omchain-partial-1753637817359.json`

---

**Note**: This deployment is on OMChain mainnet. Ensure all security measures are in place before using in production.