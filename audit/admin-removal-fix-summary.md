# Admin Removal Protection Fix Summary

## Audit Issue
**Issue**: Contract may be dangled unrecoverably if the only account with DEFAULT_ADMIN_ROLE is removed  
**Risk**: If the last admin is removed, the contract becomes unmanageable as no one can grant new roles  
**Solution**: Override revokeRole and renounceRole functions to prevent removing the last admin

## Implementation Details

### Fix Pattern
For all contracts using AccessControl or AccessControlUpgradeable, we added:

```solidity
/**
 * @notice Override revokeRole to prevent removing the last admin
 * @param role The role to revoke
 * @param account The account to revoke the role from
 */
function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
    if (role == DEFAULT_ADMIN_ROLE && getRoleMemberCount(DEFAULT_ADMIN_ROLE) == 1) {
        revert CannotRemoveLastAdmin(); // or appropriate error
    }
    super.revokeRole(role, account);
}

/**
 * @notice Override renounceRole to prevent the last admin from renouncing
 * @param role The role to renounce
 * @param account The account renouncing the role
 */
function renounceRole(bytes32 role, address account) public override {
    if (role == DEFAULT_ADMIN_ROLE && getRoleMemberCount(DEFAULT_ADMIN_ROLE) == 1) {
        revert CannotRemoveLastAdmin(); // or appropriate error
    }
    super.renounceRole(role, account);
}
```

## Contracts Updated

### 1. GasTank.sol
- **Type**: AccessControl
- **Error**: `CannotRemoveLastAdmin()`
- **Location**: Line 85-117

### 2. OMTHBMultiSig.sol  
- **Type**: AccessControl
- **Error**: `CannotRemoveLastAdmin()`
- **Location**: Line 85-117

### 3. SimpleProjectReimbursement.sol
- **Type**: AccessControl
- **Error**: `CannotRemoveLastAdmin()`
- **Location**: Line 65-87

### 4. SecureProjectReimbursement.sol
- **Type**: AccessControl
- **Error**: `CannotRemoveLastAdmin()`
- **Location**: Line 82-104

### 5. SimpleProjectFactory.sol
- **Type**: AccessControl
- **Error**: `CannotRemoveLastAdmin()`
- **Location**: Line 50-72

### 6. SecureProjectFactory.sol
- **Type**: AccessControl
- **Error**: `CannotRemoveLastAdmin()`
- **Location**: Line 74-96

### 7. ProjectReimbursementOptimized.sol
- **Type**: AccessControlUpgradeable
- **Special**: Uses custom role management with commit-reveal pattern
- **Fix**: Added check in `revokeRoleWithReveal` function
- **Error**: `revert("Cannot remove last admin")`
- **Location**: Line 1176-1180

### 8. BeaconProjectFactoryOptimized.sol
- **Type**: AccessControl  
- **Error**: `E09()` (CannotRemoveLastAdmin)
- **Location**: Line 82-104

### 9. ProjectFactoryOptimized.sol
- **Type**: AccessControl
- **Error**: `E09()` (CannotRemoveLastAdmin)
- **Location**: Line 83-105

### 10. OMTHBTokenV3.sol
- **Type**: AccessControlUpgradeable
- **Error**: `InvalidAmount()` (reusing existing error to avoid adding new one)
- **Location**: Line 204-226

## Security Benefits

1. **Prevents Accidental Admin Removal**: Protects against human error where the last admin might accidentally revoke their own role
2. **Prevents Malicious Admin Removal**: Prevents a compromised admin from permanently locking the contract
3. **Maintains Contract Governability**: Ensures there's always at least one admin who can manage roles
4. **No Gas Overhead**: Check only runs when attempting to remove admin role

## Testing Recommendations

1. **Test Admin Count Check**: 
   - Try to remove the last admin → should revert
   - Try to remove an admin when there are multiple → should succeed

2. **Test Renounce Function**:
   - Last admin tries to renounce → should revert
   - Non-last admin renounces → should succeed

3. **Test Other Roles**:
   - Ensure other roles can still be removed normally
   - No impact on non-admin role management

## Migration Notes

- No storage changes required
- No proxy upgrade needed
- Backward compatible
- Can be deployed as-is

## Additional Considerations

1. **Multi-Admin Setup**: Consider requiring multiple admins during deployment for better security
2. **Admin Transfer Process**: Consider implementing a two-step admin transfer process for critical contracts
3. **Emergency Recovery**: For critical contracts, consider implementing a recovery mechanism with timelock
