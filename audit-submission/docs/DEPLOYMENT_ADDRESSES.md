# Deployment Addresses from Latest Simulation

## 📍 Contract Addresses (Localhost)

### Core Contracts
- **OMTHB Token**: `0x59b670e9fA9D0A427751Af201D676719a970857b`
- **AuditAnchor**: `0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44`

### Test Accounts Used
- **Admin**: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **Researcher**: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- **Auditor**: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
- **Recipient**: `0x90F79bf6EB2c4f870365E785982E1f101E93b906`

## 📊 Transaction Summary

### Token Operations
1. **OMTHB Token Deployment**
   - Transaction: Token deployed as upgradeable proxy
   - Initial Supply: 0 OMTHB

2. **Token Minting**
   - Amount: 1,000,000 OMTHB
   - Minted to: Admin address
   
3. **Token Transfer (Reimbursement)**
   - Amount: 1,000 OMTHB
   - From: Admin
   - To: Recipient

### Audit Operations
1. **Audit Batch Creation**
   - Batch ID: 0
   - IPFS Hash: QmTest123456789
   - Entry Count: 10
   - Type: TEST_BATCH

## 💰 Final Balances

- **Admin**: 999,000 OMTHB (started with 1,000,000, sent 1,000)
- **Recipient**: 1,000 OMTHB (received from admin)
- **AuditAnchor**: 0 OMTHB (no tokens held)

## 🚨 Emergency Closure Feature

The emergency closure feature is implemented in the ProjectReimbursement contract (not deployed in this simulation) with the following specifications:

### Requirements
- 3 unique committee member approvals
- 1 director approval
- Uses commit-reveal pattern (30-minute delay)

### Process
1. Committee member initiates emergency closure
2. Specifies return address for remaining funds
3. 3 committee members approve (with commit-reveal)
4. Director provides final approval
5. All remaining tokens automatically transferred
6. Contract permanently paused

### Functions
- `initiateEmergencyClosure(returnAddress, reason)`
- `commitClosureApproval(commitHash)`
- `approveEmergencyClosure(nonce)`
- `cancelEmergencyClosure()`

## 📝 Notes

- These addresses are from a local Hardhat node deployment
- For production deployment, new addresses will be generated
- The ProjectReimbursement contract with emergency closure was not deployed in this simplified simulation
- Full system deployment would include ProjectFactory, TimelockController, and MetaTxForwarder