# Reimbursement Smart Contract System

A comprehensive smart contract system for managing project reimbursements with multi-recipient support, built on OM Chain.

## Overview

This repository contains the complete smart contract infrastructure for a decentralized reimbursement system with the following features:

- **Multi-recipient payments** with configurable allocations
- **Virtual payer support** for gasless transactions
- **Emergency closure mechanism** for risk management
- **Token locking** with vesting schedules
- **View count tracking** for analytics
- **Comprehensive security measures** including reentrancy protection

## Deployed Contracts on OM Chain

### Main Contracts
- **GasTank**: `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D`
- **OMTHBToken**: `0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984`
- **ProjectFactory**: `0x42D5E5D4dd87BD7Dc72FB628b90d8CcE0Fe80aB6`

### Libraries
- **ArrayLib**: `0x19F3a18B3B4c012f0cA3Ec88d4e2C6a5D4A84d07`
- **ValidationLib**: `0x2BaA188Ae24C87fE0b0f90C6aCF1b44d604f0502`
- **ViewLib**: `0x8Eb9Bd2B58f96C1eD7F8c1821d088dFFE7A890ba`
- **EmergencyClosureLib**: `0x5cc017C5DC0F8f63A946ad44516EE10bFf96c0A6`

## Architecture

```
contracts/
├── ProjectFactory.sol              # Factory for creating new projects
├── ProjectReimbursementOptimized.sol # Main reimbursement contract
├── upgradeable/
│   ├── OMTHBToken.sol             # OMTHB ERC20 token
│   └── OMTHBTokenV2.sol           # Upgraded token with locking
├── libraries/
│   ├── ArrayLib.sol               # Array manipulation utilities
│   ├── ValidationLib.sol          # Input validation logic
│   ├── ViewLib.sol                # View tracking functionality
│   └── EmergencyClosureLib.sol    # Emergency closure logic
├── GasTank.sol                    # Gas fee management
└── interfaces/                    # Contract interfaces
```

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`
2. Configure your environment variables:
   ```
   PRIVATE_KEY=your_private_key
   OMCHAIN_RPC_URL=https://mainnet-rpc.omchain.io
   ETHERSCAN_API_KEY=your_api_key
   ```

## Deployment

Deploy all contracts:
```bash
npx hardhat run scripts/deploy-omchain-multirecipient.js --network omchain
```

Deploy with token locking:
```bash
npx hardhat run scripts/DeployWithTokenLocking.sol --network omchain
```

## Verification

Verify contracts on OM Chain Explorer:
```bash
npx hardhat run scripts/verify-omchain-contracts.js --network omchain
```

## Testing

Run the complete test suite:
```bash
npm test
```

Run specific tests:
```bash
# Security tests
npx hardhat test test/SecurityTests.sol

# Edge case tests  
npx hardhat test test/EdgeCaseTests.sol

# New features tests
npx hardhat test test/TestNewFeatures.sol
```

## Security

This system has undergone comprehensive security auditing with the following measures:

- **Reentrancy Protection**: ReentrancyGuard on all state-changing functions
- **Access Control**: Role-based permissions for critical operations
- **Emergency Pause**: Circuit breaker for risk mitigation
- **Input Validation**: Comprehensive parameter checking
- **Safe Math**: Overflow/underflow protection
- **Audit Trail**: Event logging for all operations

See [SECURITY_AUDIT_REPORT.md](SECURITY_AUDIT_REPORT.md) for detailed security analysis.

## Documentation

- [Frontend Integration Guide](FRONTEND_INTEGRATION_GUIDE.md)
- [API Documentation](OM_CHAIN_SMART_CONTRACT_API_DOCUMENTATION.md)
- [Deployment Guide](OMCHAIN_DEPLOYMENT_GUIDE.md)
- [Security Checklist](DEPLOYMENT_SECURITY_CHECKLIST.md)
- [Manual Verification Guide](MANUAL_VERIFICATION_GUIDE.md)

## License

MIT