// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title AdminProtectedAccessControl
 * @notice Abstract contract that extends AccessControl with admin protection
 * @dev Prevents removal of the last admin and tracks admin count using EnumerableSet
 */
abstract contract AdminProtectedAccessControl is AccessControl {
    using EnumerableSet for EnumerableSet.AddressSet;
    
    // Set to track all admins
    EnumerableSet.AddressSet private _admins;
    
    // Custom error for better gas efficiency
    error CannotRemoveLastAdmin();
    
    /**
     * @dev Override grantRole to track admin additions
     * @param role The role to grant
     * @param account The account to grant the role to
     */
    function grantRole(bytes32 role, address account) public virtual override onlyRole(getRoleAdmin(role)) {
        super.grantRole(role, account);
        
        // If granting DEFAULT_ADMIN_ROLE, add to admin set
        if (role == DEFAULT_ADMIN_ROLE) {
            _admins.add(account);
        }
    }
    
    /**
     * @dev Override revokeRole to prevent removing the last admin
     * @param role The role to revoke
     * @param account The account to revoke the role from
     */
    function revokeRole(bytes32 role, address account) public virtual override onlyRole(getRoleAdmin(role)) {
        // If revoking DEFAULT_ADMIN_ROLE, check if it's the last admin
        if (role == DEFAULT_ADMIN_ROLE) {
            if (_admins.length() <= 1) {
                revert CannotRemoveLastAdmin();
            }
            _admins.remove(account);
        }
        
        super.revokeRole(role, account);
    }
    
    /**
     * @dev Override renounceRole to prevent the last admin from renouncing
     * @param role The role to renounce
     * @param account The account renouncing the role
     */
    function renounceRole(bytes32 role, address account) public virtual override {
        // If renouncing DEFAULT_ADMIN_ROLE, check if it's the last admin
        if (role == DEFAULT_ADMIN_ROLE) {
            if (_admins.length() <= 1) {
                revert CannotRemoveLastAdmin();
            }
            _admins.remove(account);
        }
        
        super.renounceRole(role, account);
    }
    
    /**
     * @dev Internal function to initialize the first admin
     * @param admin The initial admin address
     */
    function _initializeAdmin(address admin) internal virtual {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _admins.add(admin);
    }
    
    /**
     * @dev Get the current admin count
     * @return The number of admins
     */
    function getAdminCount() public view returns (uint256) {
        return _admins.length();
    }
    
    /**
     * @dev Check if an address is an admin
     * @param account The address to check
     * @return True if the address is an admin
     */
    function isAdmin(address account) public view returns (bool) {
        return _admins.contains(account);
    }
    
    /**
     * @dev Get admin at a specific index
     * @param index The index to query
     * @return The admin address at the given index
     */
    function getAdminAt(uint256 index) public view returns (address) {
        return _admins.at(index);
    }
}
