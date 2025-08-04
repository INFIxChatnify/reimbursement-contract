# OM Platform Deployment Guide

## Current Status
- **Deployer Address**: `0x42a7ca42C90448A7f70970C14c34D9cd4D3309A6`
- **Current Balance**: 0.702 OM (Insufficient)
- **Required Balance**: ~10 OM (recommended for safe deployment)
- **Admin Address**: `0xeB42B3bF49091377627610A691EA1Eaf32bc6254`

## Pre-Deployment Checklist

### 1. Fund the Deployer Account
Transfer at least 10 OM tokens to: `0x42a7ca42C90448A7f70970C14c34D9cd4D3309A6`

### 2. Verify Configuration
- Private key is set in `.env` file
- Network configuration is correct in `hardhat.config.js`
- Admin address is set to: `0xeB42B3bF49091377627610A691EA1Eaf32bc6254`

## Deployment Steps

### Step 1: Check Balance
```bash
npx hardhat run scripts/check-balance.js --network omchain
```

### Step 2: Deploy All Contracts
```bash
npx hardhat run scripts/deploy-to-omchain.js --network omchain
```

This will deploy:
1. **OMTHBToken** (Upgradeable Proxy + Implementation)
2. **MetaTxForwarder**
3. **AuditAnchor**
4. **ProjectReimbursement** (Implementation)
5. **ProjectFactory**

### Step 3: Verify Contracts
```bash
npx hardhat run scripts/verify-contracts.js --network omchain
```

## Contract Architecture

### OMTHBToken (Upgradeable)
- ERC20 token with pause, burn, and mint capabilities
- UUPS upgradeable pattern
- Roles:
  - DEFAULT_ADMIN_ROLE → `0xeB42B3bF49091377627610A691EA1Eaf32bc6254`
  - MINTER_ROLE → `0xeB42B3bF49091377627610A691EA1Eaf32bc6254`
  - PAUSER_ROLE → `0xeB42B3bF49091377627610A691EA1Eaf32bc6254`
  - UPGRADER_ROLE → `0xeB42B3bF49091377627610A691EA1Eaf32bc6254`
  - FACTORY_ROLE → ProjectFactory contract

### ProjectFactory
- Creates new ProjectReimbursement contracts using Clone pattern
- Manages project lifecycle
- Roles:
  - DEFAULT_ADMIN_ROLE → `0xeB42B3bF49091377627610A691EA1Eaf32bc6254`
  - FACTORY_ADMIN_ROLE → `0xeB42B3bF49091377627610A691EA1Eaf32bc6254`

### ProjectReimbursement
- Handles expense submission and approval workflow
- Integrates with OMTHBToken for payments
- Uses AuditAnchor for permanent audit trails

### AuditAnchor
- Stores immutable audit data
- Records all critical actions
- Roles:
  - DEFAULT_ADMIN_ROLE → `0xeB42B3bF49091377627610A691EA1Eaf32bc6254`
  - AUDITOR_ROLE → `0xeB42B3bF49091377627610A691EA1Eaf32bc6254`

### MetaTxForwarder
- Enables meta-transactions
- Whitelist-based security
- Admin: `0xeB42B3bF49091377627610A691EA1Eaf32bc6254`

## Post-Deployment Actions

1. **Save Deployment Info**
   - Deployment info is automatically saved to `deployments/omchain-latest.json`
   - Keep this file for future reference

2. **Verify on OMScan**
   - All contracts will be verified automatically
   - Check verification status at: https://omscan.omplatform.com

3. **Test Contracts**
   - Create a test project using ProjectFactory
   - Submit and approve a test expense
   - Verify audit trail in AuditAnchor

## Security Considerations

1. **Admin Key Management**
   - Secure the admin private key (`0xeB42B3bF49091377627610A691EA1Eaf32bc6254`)
   - Consider using a multisig wallet for production

2. **Role Management**
   - Review all granted roles
   - Implement role separation if needed

3. **Upgrade Management**
   - OMTHBToken is upgradeable
   - Test upgrades on testnet first

## Troubleshooting

### Insufficient Funds Error
- Check balance: `npx hardhat run scripts/check-balance.js --network omchain`
- Fund the account with more OM tokens

### Verification Failed
- Ensure contracts are deployed successfully first
- Check if already verified on OMScan
- Manual verification commands are provided in deployment output

### Gas Price Issues
- OM Platform gas price: ~500 gwei
- Adjust gas settings in hardhat.config.js if needed

## Contract Addresses (To be filled after deployment)
- OMTHBToken Proxy: `[PENDING]`
- OMTHBToken Implementation: `[PENDING]`
- MetaTxForwarder: `[PENDING]`
- AuditAnchor: `[PENDING]`
- ProjectReimbursement Implementation: `[PENDING]`
- ProjectFactory: `[PENDING]`