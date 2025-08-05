# Production Contracts for Audit

## Core Contracts
1. **ProjectReimbursementOptimized.sol** - จัดการการเบิกจ่ายเงิน (สร้างคำขอ, อนุมัติ, จ่ายเงิน)
2. **ProjectReimbursementV3.sol** - เวอร์ชัน V3 ของ reimbursement contract
3. **ProjectFactory.sol** - สร้าง project reimbursement contracts ใหม่
4. **ProjectFactoryV3.sol** - Factory เวอร์ชัน V3
5. **ProjectFactoryOptimized.sol** - Factory แบบประหยัด gas
6. **BeaconProjectFactory.sol** - Factory ที่ใช้ beacon pattern
7. **BeaconProjectFactoryV3.sol** - Beacon factory เวอร์ชัน V3
8. **BeaconProjectFactoryOptimized.sol** - Beacon factory แบบประหยัด gas

## Infrastructure Contracts
9. **MetaTxForwarderV2.sol** - รับ meta transactions สำหรับ gasless
10. **GasTank.sol** - เก็บ gas สำหรับจ่ายแทนผู้ใช้
11. **AuditAnchor.sol** - เก็บ hash ของ audit reports

## Token Contract
12. **OMTHBTokenV3.sol** - ERC20 token ที่ใช้ในระบบ

## Governance & Security
13. **OMTHBMultiSig.sol** - Multi-signature wallet
14. **TimelockController.sol** - ทำ time-delayed operations
15. **CommitRevealRandomness.sol** - สร้างเลขสุ่มแบบ commit-reveal

## Context Contracts
16. **ERC2771Context.sol** - Context สำหรับ meta transactions
17. **ERC2771ContextUpgradeable.sol** - ERC2771 แบบ upgradeable

## Libraries
18. **ReimbursementLib** - Library สำหรับ reimbursement logic
19. **RoleManagementLib** - Library สำหรับจัดการ roles/permissions
20. **SecurityLib** - Library สำหรับ security functions
21. **ValidationLib** - Library สำหรับ validation checks
22. **ViewLib** - Library สำหรับ view functions
23. **EmergencyClosureLib** - Library สำหรับ emergency shutdown
24. **ArrayLib** - Library สำหรับ array operations

---

**Note**: Mock contracts in `contracts/mocks/` folder are excluded as they are only for testing purposes and not deployed to production.
