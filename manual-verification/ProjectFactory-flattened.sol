// Sources flattened with hardhat v2.26.1 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.3.0) (proxy/utils/Initializable.sol)

pragma solidity ^0.8.20;

/**
 * @dev This is a base contract to aid in writing upgradeable contracts, or any kind of contract that will be deployed
 * behind a proxy. Since proxied contracts do not make use of a constructor, it's common to move constructor logic to an
 * external initializer function, usually called `initialize`. It then becomes necessary to protect this initializer
 * function so it can only be called once. The {initializer} modifier provided by this contract will have this effect.
 *
 * The initialization functions use a version number. Once a version number is used, it is consumed and cannot be
 * reused. This mechanism prevents re-execution of each "step" but allows the creation of new initialization steps in
 * case an upgrade adds a module that needs to be initialized.
 *
 * For example:
 *
 * [.hljs-theme-light.nopadding]
 * ```solidity
 * contract MyToken is ERC20Upgradeable {
 *     function initialize() initializer public {
 *         __ERC20_init("MyToken", "MTK");
 *     }
 * }
 *
 * contract MyTokenV2 is MyToken, ERC20PermitUpgradeable {
 *     function initializeV2() reinitializer(2) public {
 *         __ERC20Permit_init("MyToken");
 *     }
 * }
 * ```
 *
 * TIP: To avoid leaving the proxy in an uninitialized state, the initializer function should be called as early as
 * possible by providing the encoded function call as the `_data` argument to {ERC1967Proxy-constructor}.
 *
 * CAUTION: When used with inheritance, manual care must be taken to not invoke a parent initializer twice, or to ensure
 * that all initializers are idempotent. This is not verified automatically as constructors are by Solidity.
 *
 * [CAUTION]
 * ====
 * Avoid leaving a contract uninitialized.
 *
 * An uninitialized contract can be taken over by an attacker. This applies to both a proxy and its implementation
 * contract, which may impact the proxy. To prevent the implementation contract from being used, you should invoke
 * the {_disableInitializers} function in the constructor to automatically lock it when it is deployed:
 *
 * [.hljs-theme-light.nopadding]
 * ```
 * /// @custom:oz-upgrades-unsafe-allow constructor
 * constructor() {
 *     _disableInitializers();
 * }
 * ```
 * ====
 */
abstract contract Initializable {
    /**
     * @dev Storage of the initializable contract.
     *
     * It's implemented on a custom ERC-7201 namespace to reduce the risk of storage collisions
     * when using with upgradeable contracts.
     *
     * @custom:storage-location erc7201:openzeppelin.storage.Initializable
     */
    struct InitializableStorage {
        /**
         * @dev Indicates that the contract has been initialized.
         */
        uint64 _initialized;
        /**
         * @dev Indicates that the contract is in the process of being initialized.
         */
        bool _initializing;
    }

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.Initializable")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant INITIALIZABLE_STORAGE = 0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00;

    /**
     * @dev The contract is already initialized.
     */
    error InvalidInitialization();

    /**
     * @dev The contract is not initializing.
     */
    error NotInitializing();

    /**
     * @dev Triggered when the contract has been initialized or reinitialized.
     */
    event Initialized(uint64 version);

    /**
     * @dev A modifier that defines a protected initializer function that can be invoked at most once. In its scope,
     * `onlyInitializing` functions can be used to initialize parent contracts.
     *
     * Similar to `reinitializer(1)`, except that in the context of a constructor an `initializer` may be invoked any
     * number of times. This behavior in the constructor can be useful during testing and is not expected to be used in
     * production.
     *
     * Emits an {Initialized} event.
     */
    modifier initializer() {
        // solhint-disable-next-line var-name-mixedcase
        InitializableStorage storage $ = _getInitializableStorage();

        // Cache values to avoid duplicated sloads
        bool isTopLevelCall = !$._initializing;
        uint64 initialized = $._initialized;

        // Allowed calls:
        // - initialSetup: the contract is not in the initializing state and no previous version was
        //                 initialized
        // - construction: the contract is initialized at version 1 (no reinitialization) and the
        //                 current contract is just being deployed
        bool initialSetup = initialized == 0 && isTopLevelCall;
        bool construction = initialized == 1 && address(this).code.length == 0;

        if (!initialSetup && !construction) {
            revert InvalidInitialization();
        }
        $._initialized = 1;
        if (isTopLevelCall) {
            $._initializing = true;
        }
        _;
        if (isTopLevelCall) {
            $._initializing = false;
            emit Initialized(1);
        }
    }

    /**
     * @dev A modifier that defines a protected reinitializer function that can be invoked at most once, and only if the
     * contract hasn't been initialized to a greater version before. In its scope, `onlyInitializing` functions can be
     * used to initialize parent contracts.
     *
     * A reinitializer may be used after the original initialization step. This is essential to configure modules that
     * are added through upgrades and that require initialization.
     *
     * When `version` is 1, this modifier is similar to `initializer`, except that functions marked with `reinitializer`
     * cannot be nested. If one is invoked in the context of another, execution will revert.
     *
     * Note that versions can jump in increments greater than 1; this implies that if multiple reinitializers coexist in
     * a contract, executing them in the right order is up to the developer or operator.
     *
     * WARNING: Setting the version to 2**64 - 1 will prevent any future reinitialization.
     *
     * Emits an {Initialized} event.
     */
    modifier reinitializer(uint64 version) {
        // solhint-disable-next-line var-name-mixedcase
        InitializableStorage storage $ = _getInitializableStorage();

        if ($._initializing || $._initialized >= version) {
            revert InvalidInitialization();
        }
        $._initialized = version;
        $._initializing = true;
        _;
        $._initializing = false;
        emit Initialized(version);
    }

    /**
     * @dev Modifier to protect an initialization function so that it can only be invoked by functions with the
     * {initializer} and {reinitializer} modifiers, directly or indirectly.
     */
    modifier onlyInitializing() {
        _checkInitializing();
        _;
    }

    /**
     * @dev Reverts if the contract is not in an initializing state. See {onlyInitializing}.
     */
    function _checkInitializing() internal view virtual {
        if (!_isInitializing()) {
            revert NotInitializing();
        }
    }

    /**
     * @dev Locks the contract, preventing any future reinitialization. This cannot be part of an initializer call.
     * Calling this in the constructor of a contract will prevent that contract from being initialized or reinitialized
     * to any version. It is recommended to use this to lock implementation contracts that are designed to be called
     * through proxies.
     *
     * Emits an {Initialized} event the first time it is successfully executed.
     */
    function _disableInitializers() internal virtual {
        // solhint-disable-next-line var-name-mixedcase
        InitializableStorage storage $ = _getInitializableStorage();

        if ($._initializing) {
            revert InvalidInitialization();
        }
        if ($._initialized != type(uint64).max) {
            $._initialized = type(uint64).max;
            emit Initialized(type(uint64).max);
        }
    }

    /**
     * @dev Returns the highest version that has been initialized. See {reinitializer}.
     */
    function _getInitializedVersion() internal view returns (uint64) {
        return _getInitializableStorage()._initialized;
    }

    /**
     * @dev Returns `true` if the contract is currently initializing. See {onlyInitializing}.
     */
    function _isInitializing() internal view returns (bool) {
        return _getInitializableStorage()._initializing;
    }

    /**
     * @dev Pointer to storage slot. Allows integrators to override it with a custom storage location.
     *
     * NOTE: Consider following the ERC-7201 formula to derive storage locations.
     */
    function _initializableStorageSlot() internal pure virtual returns (bytes32) {
        return INITIALIZABLE_STORAGE;
    }

    /**
     * @dev Returns a pointer to the storage namespace.
     */
    // solhint-disable-next-line var-name-mixedcase
    function _getInitializableStorage() private pure returns (InitializableStorage storage $) {
        bytes32 slot = _initializableStorageSlot();
        assembly {
            $.slot := slot
        }
    }
}


// File @openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

pragma solidity ^0.8.20;

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract ContextUpgradeable is Initializable {
    function __Context_init() internal onlyInitializing {
    }

    function __Context_init_unchained() internal onlyInitializing {
    }
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}


// File @openzeppelin/contracts/utils/introspection/IERC165.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/IERC165.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}


// File @openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/ERC165.sol)

pragma solidity ^0.8.20;


/**
 * @dev Implementation of the {IERC165} interface.
 *
 * Contracts that want to implement ERC-165 should inherit from this contract and override {supportsInterface} to check
 * for the additional interface id that will be supported. For example:
 *
 * ```solidity
 * function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
 *     return interfaceId == type(MyInterface).interfaceId || super.supportsInterface(interfaceId);
 * }
 * ```
 */
abstract contract ERC165Upgradeable is Initializable, IERC165 {
    function __ERC165_init() internal onlyInitializing {
    }

    function __ERC165_init_unchained() internal onlyInitializing {
    }
    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual returns (bool) {
        return interfaceId == type(IERC165).interfaceId;
    }
}


// File @openzeppelin/contracts/access/IAccessControl.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (access/IAccessControl.sol)

pragma solidity >=0.8.4;

/**
 * @dev External interface of AccessControl declared to support ERC-165 detection.
 */
interface IAccessControl {
    /**
     * @dev The `account` is missing a role.
     */
    error AccessControlUnauthorizedAccount(address account, bytes32 neededRole);

    /**
     * @dev The caller of a function is not the expected one.
     *
     * NOTE: Don't confuse with {AccessControlUnauthorizedAccount}.
     */
    error AccessControlBadConfirmation();

    /**
     * @dev Emitted when `newAdminRole` is set as ``role``'s admin role, replacing `previousAdminRole`
     *
     * `DEFAULT_ADMIN_ROLE` is the starting admin for all roles, despite
     * {RoleAdminChanged} not being emitted to signal this.
     */
    event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole);

    /**
     * @dev Emitted when `account` is granted `role`.
     *
     * `sender` is the account that originated the contract call. This account bears the admin role (for the granted role).
     * Expected in cases where the role was granted using the internal {AccessControl-_grantRole}.
     */
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);

    /**
     * @dev Emitted when `account` is revoked `role`.
     *
     * `sender` is the account that originated the contract call:
     *   - if using `revokeRole`, it is the admin role bearer
     *   - if using `renounceRole`, it is the role bearer (i.e. `account`)
     */
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    /**
     * @dev Returns `true` if `account` has been granted `role`.
     */
    function hasRole(bytes32 role, address account) external view returns (bool);

    /**
     * @dev Returns the admin role that controls `role`. See {grantRole} and
     * {revokeRole}.
     *
     * To change a role's admin, use {AccessControl-_setRoleAdmin}.
     */
    function getRoleAdmin(bytes32 role) external view returns (bytes32);

    /**
     * @dev Grants `role` to `account`.
     *
     * If `account` had not been already granted `role`, emits a {RoleGranted}
     * event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     */
    function grantRole(bytes32 role, address account) external;

    /**
     * @dev Revokes `role` from `account`.
     *
     * If `account` had been granted `role`, emits a {RoleRevoked} event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     */
    function revokeRole(bytes32 role, address account) external;

    /**
     * @dev Revokes `role` from the calling account.
     *
     * Roles are often managed via {grantRole} and {revokeRole}: this function's
     * purpose is to provide a mechanism for accounts to lose their privileges
     * if they are compromised (such as when a trusted device is misplaced).
     *
     * If the calling account had been granted `role`, emits a {RoleRevoked}
     * event.
     *
     * Requirements:
     *
     * - the caller must be `callerConfirmation`.
     */
    function renounceRole(bytes32 role, address callerConfirmation) external;
}


// File @openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (access/AccessControl.sol)

pragma solidity ^0.8.20;





/**
 * @dev Contract module that allows children to implement role-based access
 * control mechanisms. This is a lightweight version that doesn't allow enumerating role
 * members except through off-chain means by accessing the contract event logs. Some
 * applications may benefit from on-chain enumerability, for those cases see
 * {AccessControlEnumerable}.
 *
 * Roles are referred to by their `bytes32` identifier. These should be exposed
 * in the external API and be unique. The best way to achieve this is by
 * using `public constant` hash digests:
 *
 * ```solidity
 * bytes32 public constant MY_ROLE = keccak256("MY_ROLE");
 * ```
 *
 * Roles can be used to represent a set of permissions. To restrict access to a
 * function call, use {hasRole}:
 *
 * ```solidity
 * function foo() public {
 *     require(hasRole(MY_ROLE, msg.sender));
 *     ...
 * }
 * ```
 *
 * Roles can be granted and revoked dynamically via the {grantRole} and
 * {revokeRole} functions. Each role has an associated admin role, and only
 * accounts that have a role's admin role can call {grantRole} and {revokeRole}.
 *
 * By default, the admin role for all roles is `DEFAULT_ADMIN_ROLE`, which means
 * that only accounts with this role will be able to grant or revoke other
 * roles. More complex role relationships can be created by using
 * {_setRoleAdmin}.
 *
 * WARNING: The `DEFAULT_ADMIN_ROLE` is also its own admin: it has permission to
 * grant and revoke this role. Extra precautions should be taken to secure
 * accounts that have been granted it. We recommend using {AccessControlDefaultAdminRules}
 * to enforce additional security measures for this role.
 */
abstract contract AccessControlUpgradeable is Initializable, ContextUpgradeable, IAccessControl, ERC165Upgradeable {
    struct RoleData {
        mapping(address account => bool) hasRole;
        bytes32 adminRole;
    }

    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;


    /// @custom:storage-location erc7201:openzeppelin.storage.AccessControl
    struct AccessControlStorage {
        mapping(bytes32 role => RoleData) _roles;
    }

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.AccessControl")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant AccessControlStorageLocation = 0x02dd7bc7dec4dceedda775e58dd541e08a116c6c53815c0bd028192f7b626800;

    function _getAccessControlStorage() private pure returns (AccessControlStorage storage $) {
        assembly {
            $.slot := AccessControlStorageLocation
        }
    }

    /**
     * @dev Modifier that checks that an account has a specific role. Reverts
     * with an {AccessControlUnauthorizedAccount} error including the required role.
     */
    modifier onlyRole(bytes32 role) {
        _checkRole(role);
        _;
    }

    function __AccessControl_init() internal onlyInitializing {
    }

    function __AccessControl_init_unchained() internal onlyInitializing {
    }
    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IAccessControl).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev Returns `true` if `account` has been granted `role`.
     */
    function hasRole(bytes32 role, address account) public view virtual returns (bool) {
        AccessControlStorage storage $ = _getAccessControlStorage();
        return $._roles[role].hasRole[account];
    }

    /**
     * @dev Reverts with an {AccessControlUnauthorizedAccount} error if `_msgSender()`
     * is missing `role`. Overriding this function changes the behavior of the {onlyRole} modifier.
     */
    function _checkRole(bytes32 role) internal view virtual {
        _checkRole(role, _msgSender());
    }

    /**
     * @dev Reverts with an {AccessControlUnauthorizedAccount} error if `account`
     * is missing `role`.
     */
    function _checkRole(bytes32 role, address account) internal view virtual {
        if (!hasRole(role, account)) {
            revert AccessControlUnauthorizedAccount(account, role);
        }
    }

    /**
     * @dev Returns the admin role that controls `role`. See {grantRole} and
     * {revokeRole}.
     *
     * To change a role's admin, use {_setRoleAdmin}.
     */
    function getRoleAdmin(bytes32 role) public view virtual returns (bytes32) {
        AccessControlStorage storage $ = _getAccessControlStorage();
        return $._roles[role].adminRole;
    }

    /**
     * @dev Grants `role` to `account`.
     *
     * If `account` had not been already granted `role`, emits a {RoleGranted}
     * event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     *
     * May emit a {RoleGranted} event.
     */
    function grantRole(bytes32 role, address account) public virtual onlyRole(getRoleAdmin(role)) {
        _grantRole(role, account);
    }

    /**
     * @dev Revokes `role` from `account`.
     *
     * If `account` had been granted `role`, emits a {RoleRevoked} event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     *
     * May emit a {RoleRevoked} event.
     */
    function revokeRole(bytes32 role, address account) public virtual onlyRole(getRoleAdmin(role)) {
        _revokeRole(role, account);
    }

    /**
     * @dev Revokes `role` from the calling account.
     *
     * Roles are often managed via {grantRole} and {revokeRole}: this function's
     * purpose is to provide a mechanism for accounts to lose their privileges
     * if they are compromised (such as when a trusted device is misplaced).
     *
     * If the calling account had been revoked `role`, emits a {RoleRevoked}
     * event.
     *
     * Requirements:
     *
     * - the caller must be `callerConfirmation`.
     *
     * May emit a {RoleRevoked} event.
     */
    function renounceRole(bytes32 role, address callerConfirmation) public virtual {
        if (callerConfirmation != _msgSender()) {
            revert AccessControlBadConfirmation();
        }

        _revokeRole(role, callerConfirmation);
    }

    /**
     * @dev Sets `adminRole` as ``role``'s admin role.
     *
     * Emits a {RoleAdminChanged} event.
     */
    function _setRoleAdmin(bytes32 role, bytes32 adminRole) internal virtual {
        AccessControlStorage storage $ = _getAccessControlStorage();
        bytes32 previousAdminRole = getRoleAdmin(role);
        $._roles[role].adminRole = adminRole;
        emit RoleAdminChanged(role, previousAdminRole, adminRole);
    }

    /**
     * @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
     *
     * Internal function without access restriction.
     *
     * May emit a {RoleGranted} event.
     */
    function _grantRole(bytes32 role, address account) internal virtual returns (bool) {
        AccessControlStorage storage $ = _getAccessControlStorage();
        if (!hasRole(role, account)) {
            $._roles[role].hasRole[account] = true;
            emit RoleGranted(role, account, _msgSender());
            return true;
        } else {
            return false;
        }
    }

    /**
     * @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
     *
     * Internal function without access restriction.
     *
     * May emit a {RoleRevoked} event.
     */
    function _revokeRole(bytes32 role, address account) internal virtual returns (bool) {
        AccessControlStorage storage $ = _getAccessControlStorage();
        if (hasRole(role, account)) {
            $._roles[role].hasRole[account] = false;
            emit RoleRevoked(role, account, _msgSender());
            return true;
        } else {
            return false;
        }
    }
}


// File @openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.3.0) (utils/Pausable.sol)

pragma solidity ^0.8.20;


/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 *
 * This module is used through inheritance. It will make available the
 * modifiers `whenNotPaused` and `whenPaused`, which can be applied to
 * the functions of your contract. Note that they will not be pausable by
 * simply including this module, only once the modifiers are put in place.
 */
abstract contract PausableUpgradeable is Initializable, ContextUpgradeable {
    /// @custom:storage-location erc7201:openzeppelin.storage.Pausable
    struct PausableStorage {
        bool _paused;
    }

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.Pausable")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant PausableStorageLocation = 0xcd5ed15c6e187e77e9aee88184c21f4f2182ab5827cb3b7e07fbedcd63f03300;

    function _getPausableStorage() private pure returns (PausableStorage storage $) {
        assembly {
            $.slot := PausableStorageLocation
        }
    }

    /**
     * @dev Emitted when the pause is triggered by `account`.
     */
    event Paused(address account);

    /**
     * @dev Emitted when the pause is lifted by `account`.
     */
    event Unpaused(address account);

    /**
     * @dev The operation failed because the contract is paused.
     */
    error EnforcedPause();

    /**
     * @dev The operation failed because the contract is not paused.
     */
    error ExpectedPause();

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    modifier whenNotPaused() {
        _requireNotPaused();
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    modifier whenPaused() {
        _requirePaused();
        _;
    }

    function __Pausable_init() internal onlyInitializing {
    }

    function __Pausable_init_unchained() internal onlyInitializing {
    }
    /**
     * @dev Returns true if the contract is paused, and false otherwise.
     */
    function paused() public view virtual returns (bool) {
        PausableStorage storage $ = _getPausableStorage();
        return $._paused;
    }

    /**
     * @dev Throws if the contract is paused.
     */
    function _requireNotPaused() internal view virtual {
        if (paused()) {
            revert EnforcedPause();
        }
    }

    /**
     * @dev Throws if the contract is not paused.
     */
    function _requirePaused() internal view virtual {
        if (!paused()) {
            revert ExpectedPause();
        }
    }

    /**
     * @dev Triggers stopped state.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    function _pause() internal virtual whenNotPaused {
        PausableStorage storage $ = _getPausableStorage();
        $._paused = true;
        emit Paused(_msgSender());
    }

    /**
     * @dev Returns to normal state.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    function _unpause() internal virtual whenPaused {
        PausableStorage storage $ = _getPausableStorage();
        $._paused = false;
        emit Unpaused(_msgSender());
    }
}


// File @openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/ReentrancyGuard.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuardUpgradeable is Initializable {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    /// @custom:storage-location erc7201:openzeppelin.storage.ReentrancyGuard
    struct ReentrancyGuardStorage {
        uint256 _status;
    }

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.ReentrancyGuard")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant ReentrancyGuardStorageLocation = 0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00;

    function _getReentrancyGuardStorage() private pure returns (ReentrancyGuardStorage storage $) {
        assembly {
            $.slot := ReentrancyGuardStorageLocation
        }
    }

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    function __ReentrancyGuard_init() internal onlyInitializing {
        __ReentrancyGuard_init_unchained();
    }

    function __ReentrancyGuard_init_unchained() internal onlyInitializing {
        ReentrancyGuardStorage storage $ = _getReentrancyGuardStorage();
        $._status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        ReentrancyGuardStorage storage $ = _getReentrancyGuardStorage();
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if ($._status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        $._status = ENTERED;
    }

    function _nonReentrantAfter() private {
        ReentrancyGuardStorage storage $ = _getReentrancyGuardStorage();
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        $._status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        ReentrancyGuardStorage storage $ = _getReentrancyGuardStorage();
        return $._status == ENTERED;
    }
}


// File @openzeppelin/contracts/utils/Context.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

pragma solidity ^0.8.20;

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}


// File @openzeppelin/contracts/utils/introspection/ERC165.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/ERC165.sol)

pragma solidity ^0.8.20;

/**
 * @dev Implementation of the {IERC165} interface.
 *
 * Contracts that want to implement ERC-165 should inherit from this contract and override {supportsInterface} to check
 * for the additional interface id that will be supported. For example:
 *
 * ```solidity
 * function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
 *     return interfaceId == type(MyInterface).interfaceId || super.supportsInterface(interfaceId);
 * }
 * ```
 */
abstract contract ERC165 is IERC165 {
    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual returns (bool) {
        return interfaceId == type(IERC165).interfaceId;
    }
}


// File @openzeppelin/contracts/access/AccessControl.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (access/AccessControl.sol)

pragma solidity ^0.8.20;



/**
 * @dev Contract module that allows children to implement role-based access
 * control mechanisms. This is a lightweight version that doesn't allow enumerating role
 * members except through off-chain means by accessing the contract event logs. Some
 * applications may benefit from on-chain enumerability, for those cases see
 * {AccessControlEnumerable}.
 *
 * Roles are referred to by their `bytes32` identifier. These should be exposed
 * in the external API and be unique. The best way to achieve this is by
 * using `public constant` hash digests:
 *
 * ```solidity
 * bytes32 public constant MY_ROLE = keccak256("MY_ROLE");
 * ```
 *
 * Roles can be used to represent a set of permissions. To restrict access to a
 * function call, use {hasRole}:
 *
 * ```solidity
 * function foo() public {
 *     require(hasRole(MY_ROLE, msg.sender));
 *     ...
 * }
 * ```
 *
 * Roles can be granted and revoked dynamically via the {grantRole} and
 * {revokeRole} functions. Each role has an associated admin role, and only
 * accounts that have a role's admin role can call {grantRole} and {revokeRole}.
 *
 * By default, the admin role for all roles is `DEFAULT_ADMIN_ROLE`, which means
 * that only accounts with this role will be able to grant or revoke other
 * roles. More complex role relationships can be created by using
 * {_setRoleAdmin}.
 *
 * WARNING: The `DEFAULT_ADMIN_ROLE` is also its own admin: it has permission to
 * grant and revoke this role. Extra precautions should be taken to secure
 * accounts that have been granted it. We recommend using {AccessControlDefaultAdminRules}
 * to enforce additional security measures for this role.
 */
abstract contract AccessControl is Context, IAccessControl, ERC165 {
    struct RoleData {
        mapping(address account => bool) hasRole;
        bytes32 adminRole;
    }

    mapping(bytes32 role => RoleData) private _roles;

    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;

    /**
     * @dev Modifier that checks that an account has a specific role. Reverts
     * with an {AccessControlUnauthorizedAccount} error including the required role.
     */
    modifier onlyRole(bytes32 role) {
        _checkRole(role);
        _;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IAccessControl).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev Returns `true` if `account` has been granted `role`.
     */
    function hasRole(bytes32 role, address account) public view virtual returns (bool) {
        return _roles[role].hasRole[account];
    }

    /**
     * @dev Reverts with an {AccessControlUnauthorizedAccount} error if `_msgSender()`
     * is missing `role`. Overriding this function changes the behavior of the {onlyRole} modifier.
     */
    function _checkRole(bytes32 role) internal view virtual {
        _checkRole(role, _msgSender());
    }

    /**
     * @dev Reverts with an {AccessControlUnauthorizedAccount} error if `account`
     * is missing `role`.
     */
    function _checkRole(bytes32 role, address account) internal view virtual {
        if (!hasRole(role, account)) {
            revert AccessControlUnauthorizedAccount(account, role);
        }
    }

    /**
     * @dev Returns the admin role that controls `role`. See {grantRole} and
     * {revokeRole}.
     *
     * To change a role's admin, use {_setRoleAdmin}.
     */
    function getRoleAdmin(bytes32 role) public view virtual returns (bytes32) {
        return _roles[role].adminRole;
    }

    /**
     * @dev Grants `role` to `account`.
     *
     * If `account` had not been already granted `role`, emits a {RoleGranted}
     * event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     *
     * May emit a {RoleGranted} event.
     */
    function grantRole(bytes32 role, address account) public virtual onlyRole(getRoleAdmin(role)) {
        _grantRole(role, account);
    }

    /**
     * @dev Revokes `role` from `account`.
     *
     * If `account` had been granted `role`, emits a {RoleRevoked} event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     *
     * May emit a {RoleRevoked} event.
     */
    function revokeRole(bytes32 role, address account) public virtual onlyRole(getRoleAdmin(role)) {
        _revokeRole(role, account);
    }

    /**
     * @dev Revokes `role` from the calling account.
     *
     * Roles are often managed via {grantRole} and {revokeRole}: this function's
     * purpose is to provide a mechanism for accounts to lose their privileges
     * if they are compromised (such as when a trusted device is misplaced).
     *
     * If the calling account had been revoked `role`, emits a {RoleRevoked}
     * event.
     *
     * Requirements:
     *
     * - the caller must be `callerConfirmation`.
     *
     * May emit a {RoleRevoked} event.
     */
    function renounceRole(bytes32 role, address callerConfirmation) public virtual {
        if (callerConfirmation != _msgSender()) {
            revert AccessControlBadConfirmation();
        }

        _revokeRole(role, callerConfirmation);
    }

    /**
     * @dev Sets `adminRole` as ``role``'s admin role.
     *
     * Emits a {RoleAdminChanged} event.
     */
    function _setRoleAdmin(bytes32 role, bytes32 adminRole) internal virtual {
        bytes32 previousAdminRole = getRoleAdmin(role);
        _roles[role].adminRole = adminRole;
        emit RoleAdminChanged(role, previousAdminRole, adminRole);
    }

    /**
     * @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
     *
     * Internal function without access restriction.
     *
     * May emit a {RoleGranted} event.
     */
    function _grantRole(bytes32 role, address account) internal virtual returns (bool) {
        if (!hasRole(role, account)) {
            _roles[role].hasRole[account] = true;
            emit RoleGranted(role, account, _msgSender());
            return true;
        } else {
            return false;
        }
    }

    /**
     * @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
     *
     * Internal function without access restriction.
     *
     * May emit a {RoleRevoked} event.
     */
    function _revokeRole(bytes32 role, address account) internal virtual returns (bool) {
        if (hasRole(role, account)) {
            _roles[role].hasRole[account] = false;
            emit RoleRevoked(role, account, _msgSender());
            return true;
        } else {
            return false;
        }
    }
}


// File @openzeppelin/contracts/utils/Errors.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/Errors.sol)

pragma solidity ^0.8.20;

/**
 * @dev Collection of common custom errors used in multiple contracts
 *
 * IMPORTANT: Backwards compatibility is not guaranteed in future versions of the library.
 * It is recommended to avoid relying on the error API for critical functionality.
 *
 * _Available since v5.1._
 */
library Errors {
    /**
     * @dev The ETH balance of the account is not enough to perform the operation.
     */
    error InsufficientBalance(uint256 balance, uint256 needed);

    /**
     * @dev A call to an address target failed. The target may have reverted.
     */
    error FailedCall();

    /**
     * @dev The deployment failed.
     */
    error FailedDeployment();

    /**
     * @dev A necessary precompile is missing.
     */
    error MissingPrecompile(address);
}


// File @openzeppelin/contracts/utils/Create2.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/Create2.sol)

pragma solidity ^0.8.20;

/**
 * @dev Helper to make usage of the `CREATE2` EVM opcode easier and safer.
 * `CREATE2` can be used to compute in advance the address where a smart
 * contract will be deployed, which allows for interesting new mechanisms known
 * as 'counterfactual interactions'.
 *
 * See the https://eips.ethereum.org/EIPS/eip-1014#motivation[EIP] for more
 * information.
 */
library Create2 {
    /**
     * @dev There's no code to deploy.
     */
    error Create2EmptyBytecode();

    /**
     * @dev Deploys a contract using `CREATE2`. The address where the contract
     * will be deployed can be known in advance via {computeAddress}.
     *
     * The bytecode for a contract can be obtained from Solidity with
     * `type(contractName).creationCode`.
     *
     * Requirements:
     *
     * - `bytecode` must not be empty.
     * - `salt` must have not been used for `bytecode` already.
     * - the factory must have a balance of at least `amount`.
     * - if `amount` is non-zero, `bytecode` must have a `payable` constructor.
     */
    function deploy(uint256 amount, bytes32 salt, bytes memory bytecode) internal returns (address addr) {
        if (address(this).balance < amount) {
            revert Errors.InsufficientBalance(address(this).balance, amount);
        }
        if (bytecode.length == 0) {
            revert Create2EmptyBytecode();
        }
        assembly ("memory-safe") {
            addr := create2(amount, add(bytecode, 0x20), mload(bytecode), salt)
            // if no address was created, and returndata is not empty, bubble revert
            if and(iszero(addr), not(iszero(returndatasize()))) {
                let p := mload(0x40)
                returndatacopy(p, 0, returndatasize())
                revert(p, returndatasize())
            }
        }
        if (addr == address(0)) {
            revert Errors.FailedDeployment();
        }
    }

    /**
     * @dev Returns the address where a contract will be stored if deployed via {deploy}. Any change in the
     * `bytecodeHash` or `salt` will result in a new destination address.
     */
    function computeAddress(bytes32 salt, bytes32 bytecodeHash) internal view returns (address) {
        return computeAddress(salt, bytecodeHash, address(this));
    }

    /**
     * @dev Returns the address where a contract will be stored if deployed via {deploy} from a contract located at
     * `deployer`. If `deployer` is this contract's address, returns the same value as {computeAddress}.
     */
    function computeAddress(bytes32 salt, bytes32 bytecodeHash, address deployer) internal pure returns (address addr) {
        assembly ("memory-safe") {
            let ptr := mload(0x40) // Get free memory pointer

            // |                   | ↓ ptr ...  ↓ ptr + 0x0B (start) ...  ↓ ptr + 0x20 ...  ↓ ptr + 0x40 ...   |
            // |-------------------|---------------------------------------------------------------------------|
            // | bytecodeHash      |                                                        CCCCCCCCCCCCC...CC |
            // | salt              |                                      BBBBBBBBBBBBB...BB                   |
            // | deployer          | 000000...0000AAAAAAAAAAAAAAAAAAA...AA                                     |
            // | 0xFF              |            FF                                                             |
            // |-------------------|---------------------------------------------------------------------------|
            // | memory            | 000000...00FFAAAAAAAAAAAAAAAAAAA...AABBBBBBBBBBBBB...BBCCCCCCCCCCCCC...CC |
            // | keccak(start, 85) |            ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑ |

            mstore(add(ptr, 0x40), bytecodeHash)
            mstore(add(ptr, 0x20), salt)
            mstore(ptr, deployer) // Right-aligned with 12 preceding garbage bytes
            let start := add(ptr, 0x0b) // The hashed data starts at the final garbage byte which we will set to 0xff
            mstore8(start, 0xff)
            addr := and(keccak256(start, 85), 0xffffffffffffffffffffffffffffffffffffffff)
        }
    }
}


// File @openzeppelin/contracts/proxy/Clones.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (proxy/Clones.sol)

pragma solidity ^0.8.20;


/**
 * @dev https://eips.ethereum.org/EIPS/eip-1167[ERC-1167] is a standard for
 * deploying minimal proxy contracts, also known as "clones".
 *
 * > To simply and cheaply clone contract functionality in an immutable way, this standard specifies
 * > a minimal bytecode implementation that delegates all calls to a known, fixed address.
 *
 * The library includes functions to deploy a proxy using either `create` (traditional deployment) or `create2`
 * (salted deterministic deployment). It also includes functions to predict the addresses of clones deployed using the
 * deterministic method.
 */
library Clones {
    error CloneArgumentsTooLong();

    /**
     * @dev Deploys and returns the address of a clone that mimics the behavior of `implementation`.
     *
     * This function uses the create opcode, which should never revert.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     */
    function clone(address implementation) internal returns (address instance) {
        return clone(implementation, 0);
    }

    /**
     * @dev Same as {xref-Clones-clone-address-}[clone], but with a `value` parameter to send native currency
     * to the new contract.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     *
     * NOTE: Using a non-zero value at creation will require the contract using this function (e.g. a factory)
     * to always have enough balance for new deployments. Consider exposing this function under a payable method.
     */
    function clone(address implementation, uint256 value) internal returns (address instance) {
        if (address(this).balance < value) {
            revert Errors.InsufficientBalance(address(this).balance, value);
        }
        assembly ("memory-safe") {
            // Cleans the upper 96 bits of the `implementation` word, then packs the first 3 bytes
            // of the `implementation` address with the bytecode before the address.
            mstore(0x00, or(shr(0xe8, shl(0x60, implementation)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            // Packs the remaining 17 bytes of `implementation` with the bytecode after the address.
            mstore(0x20, or(shl(0x78, implementation), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create(value, 0x09, 0x37)
        }
        if (instance == address(0)) {
            revert Errors.FailedDeployment();
        }
    }

    /**
     * @dev Deploys and returns the address of a clone that mimics the behavior of `implementation`.
     *
     * This function uses the create2 opcode and a `salt` to deterministically deploy
     * the clone. Using the same `implementation` and `salt` multiple times will revert, since
     * the clones cannot be deployed twice at the same address.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     */
    function cloneDeterministic(address implementation, bytes32 salt) internal returns (address instance) {
        return cloneDeterministic(implementation, salt, 0);
    }

    /**
     * @dev Same as {xref-Clones-cloneDeterministic-address-bytes32-}[cloneDeterministic], but with
     * a `value` parameter to send native currency to the new contract.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     *
     * NOTE: Using a non-zero value at creation will require the contract using this function (e.g. a factory)
     * to always have enough balance for new deployments. Consider exposing this function under a payable method.
     */
    function cloneDeterministic(
        address implementation,
        bytes32 salt,
        uint256 value
    ) internal returns (address instance) {
        if (address(this).balance < value) {
            revert Errors.InsufficientBalance(address(this).balance, value);
        }
        assembly ("memory-safe") {
            // Cleans the upper 96 bits of the `implementation` word, then packs the first 3 bytes
            // of the `implementation` address with the bytecode before the address.
            mstore(0x00, or(shr(0xe8, shl(0x60, implementation)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            // Packs the remaining 17 bytes of `implementation` with the bytecode after the address.
            mstore(0x20, or(shl(0x78, implementation), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create2(value, 0x09, 0x37, salt)
        }
        if (instance == address(0)) {
            revert Errors.FailedDeployment();
        }
    }

    /**
     * @dev Computes the address of a clone deployed using {Clones-cloneDeterministic}.
     */
    function predictDeterministicAddress(
        address implementation,
        bytes32 salt,
        address deployer
    ) internal pure returns (address predicted) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(add(ptr, 0x38), deployer)
            mstore(add(ptr, 0x24), 0x5af43d82803e903d91602b57fd5bf3ff)
            mstore(add(ptr, 0x14), implementation)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73)
            mstore(add(ptr, 0x58), salt)
            mstore(add(ptr, 0x78), keccak256(add(ptr, 0x0c), 0x37))
            predicted := and(keccak256(add(ptr, 0x43), 0x55), 0xffffffffffffffffffffffffffffffffffffffff)
        }
    }

    /**
     * @dev Computes the address of a clone deployed using {Clones-cloneDeterministic}.
     */
    function predictDeterministicAddress(
        address implementation,
        bytes32 salt
    ) internal view returns (address predicted) {
        return predictDeterministicAddress(implementation, salt, address(this));
    }

    /**
     * @dev Deploys and returns the address of a clone that mimics the behavior of `implementation` with custom
     * immutable arguments. These are provided through `args` and cannot be changed after deployment. To
     * access the arguments within the implementation, use {fetchCloneArgs}.
     *
     * This function uses the create opcode, which should never revert.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     */
    function cloneWithImmutableArgs(address implementation, bytes memory args) internal returns (address instance) {
        return cloneWithImmutableArgs(implementation, args, 0);
    }

    /**
     * @dev Same as {xref-Clones-cloneWithImmutableArgs-address-bytes-}[cloneWithImmutableArgs], but with a `value`
     * parameter to send native currency to the new contract.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     *
     * NOTE: Using a non-zero value at creation will require the contract using this function (e.g. a factory)
     * to always have enough balance for new deployments. Consider exposing this function under a payable method.
     */
    function cloneWithImmutableArgs(
        address implementation,
        bytes memory args,
        uint256 value
    ) internal returns (address instance) {
        if (address(this).balance < value) {
            revert Errors.InsufficientBalance(address(this).balance, value);
        }
        bytes memory bytecode = _cloneCodeWithImmutableArgs(implementation, args);
        assembly ("memory-safe") {
            instance := create(value, add(bytecode, 0x20), mload(bytecode))
        }
        if (instance == address(0)) {
            revert Errors.FailedDeployment();
        }
    }

    /**
     * @dev Deploys and returns the address of a clone that mimics the behavior of `implementation` with custom
     * immutable arguments. These are provided through `args` and cannot be changed after deployment. To
     * access the arguments within the implementation, use {fetchCloneArgs}.
     *
     * This function uses the create2 opcode and a `salt` to deterministically deploy the clone. Using the same
     * `implementation`, `args` and `salt` multiple times will revert, since the clones cannot be deployed twice
     * at the same address.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     */
    function cloneDeterministicWithImmutableArgs(
        address implementation,
        bytes memory args,
        bytes32 salt
    ) internal returns (address instance) {
        return cloneDeterministicWithImmutableArgs(implementation, args, salt, 0);
    }

    /**
     * @dev Same as {xref-Clones-cloneDeterministicWithImmutableArgs-address-bytes-bytes32-}[cloneDeterministicWithImmutableArgs],
     * but with a `value` parameter to send native currency to the new contract.
     *
     * WARNING: This function does not check if `implementation` has code. A clone that points to an address
     * without code cannot be initialized. Initialization calls may appear to be successful when, in reality, they
     * have no effect and leave the clone uninitialized, allowing a third party to initialize it later.
     *
     * NOTE: Using a non-zero value at creation will require the contract using this function (e.g. a factory)
     * to always have enough balance for new deployments. Consider exposing this function under a payable method.
     */
    function cloneDeterministicWithImmutableArgs(
        address implementation,
        bytes memory args,
        bytes32 salt,
        uint256 value
    ) internal returns (address instance) {
        bytes memory bytecode = _cloneCodeWithImmutableArgs(implementation, args);
        return Create2.deploy(value, salt, bytecode);
    }

    /**
     * @dev Computes the address of a clone deployed using {Clones-cloneDeterministicWithImmutableArgs}.
     */
    function predictDeterministicAddressWithImmutableArgs(
        address implementation,
        bytes memory args,
        bytes32 salt,
        address deployer
    ) internal pure returns (address predicted) {
        bytes memory bytecode = _cloneCodeWithImmutableArgs(implementation, args);
        return Create2.computeAddress(salt, keccak256(bytecode), deployer);
    }

    /**
     * @dev Computes the address of a clone deployed using {Clones-cloneDeterministicWithImmutableArgs}.
     */
    function predictDeterministicAddressWithImmutableArgs(
        address implementation,
        bytes memory args,
        bytes32 salt
    ) internal view returns (address predicted) {
        return predictDeterministicAddressWithImmutableArgs(implementation, args, salt, address(this));
    }

    /**
     * @dev Get the immutable args attached to a clone.
     *
     * - If `instance` is a clone that was deployed using `clone` or `cloneDeterministic`, this
     *   function will return an empty array.
     * - If `instance` is a clone that was deployed using `cloneWithImmutableArgs` or
     *   `cloneDeterministicWithImmutableArgs`, this function will return the args array used at
     *   creation.
     * - If `instance` is NOT a clone deployed using this library, the behavior is undefined. This
     *   function should only be used to check addresses that are known to be clones.
     */
    function fetchCloneArgs(address instance) internal view returns (bytes memory) {
        bytes memory result = new bytes(instance.code.length - 45); // revert if length is too short
        assembly ("memory-safe") {
            extcodecopy(instance, add(result, 32), 45, mload(result))
        }
        return result;
    }

    /**
     * @dev Helper that prepares the initcode of the proxy with immutable args.
     *
     * An assembly variant of this function requires copying the `args` array, which can be efficiently done using
     * `mcopy`. Unfortunately, that opcode is not available before cancun. A pure solidity implementation using
     * abi.encodePacked is more expensive but also more portable and easier to review.
     *
     * NOTE: https://eips.ethereum.org/EIPS/eip-170[EIP-170] limits the length of the contract code to 24576 bytes.
     * With the proxy code taking 45 bytes, that limits the length of the immutable args to 24531 bytes.
     */
    function _cloneCodeWithImmutableArgs(
        address implementation,
        bytes memory args
    ) private pure returns (bytes memory) {
        if (args.length > 24531) revert CloneArgumentsTooLong();
        return
            abi.encodePacked(
                hex"61",
                uint16(args.length + 45),
                hex"3d81600a3d39f3363d3d373d3d3d363d73",
                implementation,
                hex"5af43d82803e903d91602b57fd5bf3",
                args
            );
    }
}


// File @openzeppelin/contracts/utils/Pausable.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.3.0) (utils/Pausable.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 *
 * This module is used through inheritance. It will make available the
 * modifiers `whenNotPaused` and `whenPaused`, which can be applied to
 * the functions of your contract. Note that they will not be pausable by
 * simply including this module, only once the modifiers are put in place.
 */
abstract contract Pausable is Context {
    bool private _paused;

    /**
     * @dev Emitted when the pause is triggered by `account`.
     */
    event Paused(address account);

    /**
     * @dev Emitted when the pause is lifted by `account`.
     */
    event Unpaused(address account);

    /**
     * @dev The operation failed because the contract is paused.
     */
    error EnforcedPause();

    /**
     * @dev The operation failed because the contract is not paused.
     */
    error ExpectedPause();

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    modifier whenNotPaused() {
        _requireNotPaused();
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    modifier whenPaused() {
        _requirePaused();
        _;
    }

    /**
     * @dev Returns true if the contract is paused, and false otherwise.
     */
    function paused() public view virtual returns (bool) {
        return _paused;
    }

    /**
     * @dev Throws if the contract is paused.
     */
    function _requireNotPaused() internal view virtual {
        if (paused()) {
            revert EnforcedPause();
        }
    }

    /**
     * @dev Throws if the contract is not paused.
     */
    function _requirePaused() internal view virtual {
        if (!paused()) {
            revert ExpectedPause();
        }
    }

    /**
     * @dev Triggers stopped state.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    function _pause() internal virtual whenNotPaused {
        _paused = true;
        emit Paused(_msgSender());
    }

    /**
     * @dev Returns to normal state.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    function _unpause() internal virtual whenPaused {
        _paused = false;
        emit Unpaused(_msgSender());
    }
}


// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}


// File contracts/interfaces/IOMTHB.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IOMTHB Interface
 * @notice Interface for OMTHB token with additional functions
 */
interface IOMTHB is IERC20 {
    function mint(address to, uint256 amount) external;
    function burn(uint256 amount) external;
    function burnFrom(address account, uint256 amount) external;
    function pause() external;
    function unpause() external;
    function blacklist(address account) external;
    function unBlacklist(address account) external;
    function isBlacklisted(address account) external view returns (bool);
}


// File @openzeppelin/contracts/utils/ReentrancyGuard.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/ReentrancyGuard.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}


// File contracts/libraries/SecurityLib.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SecurityLib
 * @notice Library providing additional security utilities
 * @dev Implements common security patterns and validations
 */
library SecurityLib {
    /// @notice Custom errors
    error InvalidPercentage();
    error ArrayLengthMismatch();
    error DuplicateEntry();
    error InvalidTimeWindow();
    
    /**
     * @notice Validate percentage value (0-10000 basis points)
     * @param percentage The percentage in basis points
     */
    function validatePercentage(uint256 percentage) internal pure {
        if (percentage > 10000) revert InvalidPercentage();
    }
    
    /**
     * @notice Check if arrays have matching lengths
     * @param length1 First array length
     * @param length2 Second array length
     */
    function validateArrayLengths(uint256 length1, uint256 length2) internal pure {
        if (length1 != length2) revert ArrayLengthMismatch();
    }
    
    /**
     * @notice Check for duplicate addresses in array
     * @param addresses Array of addresses to check
     * @return hasDuplicates True if duplicates found
     */
    function checkDuplicateAddresses(address[] memory addresses) internal pure returns (bool hasDuplicates) {
        uint256 length = addresses.length;
        for (uint256 i = 0; i < length - 1; i++) {
            for (uint256 j = i + 1; j < length; j++) {
                if (addresses[i] == addresses[j]) {
                    return true;
                }
            }
        }
        return false;
    }
    
    /**
     * @notice Validate time window parameters
     * @param startTime Start timestamp
     * @param endTime End timestamp
     * @param currentTime Current block timestamp
     */
    function validateTimeWindow(
        uint256 startTime,
        uint256 endTime,
        uint256 currentTime
    ) internal pure {
        if (startTime >= endTime) revert InvalidTimeWindow();
        if (endTime <= currentTime) revert InvalidTimeWindow();
    }
    
    /**
     * @notice Calculate percentage of a value safely
     * @param value The value to calculate percentage of
     * @param percentage The percentage in basis points (10000 = 100%)
     * @return result The calculated percentage
     */
    function calculatePercentage(uint256 value, uint256 percentage) internal pure returns (uint256 result) {
        validatePercentage(percentage);
        result = (value * percentage) / 10000;
    }
    
    /**
     * @notice Generate unique ID from parameters
     * @param sender Address initiating the action
     * @param nonce Unique nonce
     * @param data Additional data for uniqueness
     * @return Unique bytes32 identifier
     */
    function generateUniqueId(
        address sender,
        uint256 nonce,
        bytes memory data
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(sender, nonce, data));
    }
}


// File contracts/ProjectReimbursement.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.20;

// Using Solidity 0.8+ with built-in overflow protection





/**
 * @title ProjectReimbursementMultiRecipient
 * @notice Enhanced reimbursement contract supporting multiple recipients per request
 * @dev Maintains all existing features while adding multi-recipient capability
 */
contract ProjectReimbursement is 
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    /// @notice Approval roles
    bytes32 public constant SECRETARY_ROLE = keccak256("SECRETARY_ROLE");
    bytes32 public constant COMMITTEE_ROLE = keccak256("COMMITTEE_ROLE");
    bytes32 public constant FINANCE_ROLE = keccak256("FINANCE_ROLE");
    bytes32 public constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    bytes32 public constant REQUESTER_ROLE = keccak256("REQUESTER_ROLE");

    /// @notice Maximum recipients per request for gas efficiency
    uint256 public constant MAX_RECIPIENTS = 10;

    /// @notice Reimbursement status enum
    enum Status {
        Pending,
        SecretaryApproved,
        CommitteeApproved,
        FinanceApproved,
        DirectorApproved,
        Distributed,
        Cancelled
    }

    /// @notice Emergency closure status enum
    enum ClosureStatus {
        None,
        Initiated,
        PartiallyApproved,
        FullyApproved,
        Executed,
        Cancelled
    }

    /// @notice Reimbursement request structure with multi-recipient support
    struct ReimbursementRequest {
        uint256 id;
        address requester;
        address[] recipients;      // Array of recipient addresses
        uint256[] amounts;         // Array of amounts for each recipient
        uint256 totalAmount;       // Total amount across all recipients
        string description;
        string documentHash;       // IPFS hash or document reference
        Status status;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 paymentDeadline;   // Slippage protection: payment must execute before this time
        ApprovalInfo approvalInfo;
        address virtualPayer;      // NEW: Virtual payer address (for tracking purposes)
    }
    
    struct ApprovalInfo {
        address secretaryApprover;
        address committeeApprover;
        address financeApprover;
        address[] committeeAdditionalApprovers; // Array to store multiple committee approvers
        address directorApprover;
    }

    /// @notice Emergency closure request structure
    struct EmergencyClosureRequest {
        uint256 id;
        address initiator;
        address returnAddress; // Where to return remaining tokens
        string reason; // Reason for emergency closure
        ClosureStatus status;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 executionDeadline; // Deadline to execute after approval
        ClosureApprovalInfo closureApprovalInfo;
        uint256 remainingBalance; // Cached balance at approval time
    }
    
    struct ClosureApprovalInfo {
        address[] committeeApprovers; // Array of 3 unique committee approvers
        address directorApprover;
    }

    /// @notice Project information
    string public projectId;
    address public projectFactory;
    IOMTHB public omthbToken;
    uint256 public projectBudget;
    uint256 public totalDistributed;
    
    /// @notice Request counter
    uint256 private _requestIdCounter;
    
    /// @notice Reimbursement requests mapping
    mapping(uint256 => ReimbursementRequest) public requests;
    
    /// @notice Active request IDs
    uint256[] public activeRequestIds;
    
    /// @notice Mapping to track active requests per user for cleanup
    mapping(address => uint256[]) public activeRequestsPerUser;
    
    /// @notice Mapping to track index of request in activeRequestsPerUser array
    mapping(uint256 => uint256) private requestIndexInUserArray;
    
    /// @notice Emergency closure counter
    uint256 private _closureIdCounter;
    
    /// @notice Emergency closure requests mapping
    mapping(uint256 => EmergencyClosureRequest) public closureRequests;
    
    /// @notice Active closure request ID (only one allowed at a time)
    uint256 public activeClosureRequestId;
    
    /// @notice Virtual payer mapping (requestId => virtual payer address)
    mapping(uint256 => address) public virtualPayers;
    
    /// @notice Commit-reveal mechanism for front-running protection
    mapping(uint256 => mapping(address => bytes32)) public approvalCommitments;
    mapping(uint256 => mapping(address => uint256)) public commitTimestamps;
    uint256 public constant REVEAL_WINDOW = 30 minutes; // Minimum time before reveal
    
    /// @notice Commit-reveal for emergency closures
    mapping(uint256 => mapping(address => bytes32)) public closureCommitments;
    mapping(uint256 => mapping(address => uint256)) public closureCommitTimestamps;
    
    /// @notice Gas DoS Protection Constants
    uint256 public constant MAX_BATCH_SIZE = 100;
    uint256 public constant MAX_ARRAY_LENGTH = 50;
    
    /// @notice Slippage protection constant - 7 days payment deadline after final approval
    uint256 public constant PAYMENT_DEADLINE_DURATION = 7 days;
    
    /// @notice Timelock constants for critical admin functions
    uint256 public constant TIMELOCK_DURATION = 2 days;
    uint256 public constant MIN_TIMELOCK_DURATION = 1 days;
    
    /// @notice Pending admin for two-step ownership transfer
    address public pendingAdmin;
    uint256 public pendingAdminTimestamp;
    
    /// @notice Timelock queue for critical operations
    mapping(bytes32 => uint256) public timelockQueue;
    
    /// @notice Circuit breaker for emergency stops
    bool public emergencyStop;
    
    /// @notice Timelock controller for admin functions
    address public timelockController;
    
    /// @notice Minimum and maximum reimbursement amounts
    uint256 public constant MIN_REIMBURSEMENT_AMOUNT = 100 * 10**18; // 100 OMTHB
    uint256 public constant MAX_REIMBURSEMENT_AMOUNT = 1000000 * 10**18; // 1M OMTHB
    
    /// @notice Required number of additional committee approvers
    uint256 public constant REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS = 3;
    
    /// @notice Required number of committee approvers for emergency closure
    uint256 public constant REQUIRED_CLOSURE_COMMITTEE_APPROVERS = 3;
    
    /// @notice Role management commit-reveal mechanism
    mapping(bytes32 => mapping(address => bytes32)) public roleCommitments;
    mapping(bytes32 => mapping(address => uint256)) public roleCommitTimestamps;
    
    /// @notice Multi-sig requirement for critical functions
    uint256 public constant CRITICAL_OPERATION_THRESHOLD = 2;
    mapping(bytes32 => address[]) public criticalOperationApprovers;
    
    /// @notice Storage gap for upgrades
    uint256[28] private __gap;  // Reduced by 1 due to virtualPayers mapping

    /// @notice Events - Enhanced for multi-recipient support
    event RequestCreated(
        uint256 indexed requestId,
        address indexed requester,
        address[] recipients,
        uint256[] amounts,
        uint256 totalAmount,
        string description,
        address virtualPayer  // NEW: Include virtual payer in event
    );
    
    event RequestApproved(
        uint256 indexed requestId,
        Status indexed newStatus,
        address indexed approver
    );
    
    event RequestCancelled(uint256 indexed requestId, address indexed canceller);
    event FundsDistributed(uint256 indexed requestId, address[] recipients, uint256[] amounts, uint256 totalAmount, address virtualPayer);  // NEW: Include virtual payer
    event SingleDistribution(uint256 indexed requestId, address indexed recipient, uint256 amount);
    event TotalDistributedUpdated(uint256 oldTotal, uint256 newTotal);
    event BudgetUpdated(uint256 oldBudget, uint256 newBudget);
    event ApprovalCommitted(uint256 indexed requestId, address indexed approver, uint256 timestamp, uint256 chainId);
    event ApprovalRevealed(uint256 indexed requestId, address indexed approver, Status newStatus);
    // RoleGranted and RoleRevoked events are already defined in AccessControl
    event AdminTransferInitiated(address indexed currentAdmin, address indexed pendingAdmin, uint256 timestamp);
    event AdminTransferCompleted(address indexed previousAdmin, address indexed newAdmin);
    event TimelockOperationQueued(bytes32 indexed operationId, address indexed target, uint256 executeTime);
    event TimelockOperationExecuted(bytes32 indexed operationId, address indexed target);
    event TimelockOperationCancelled(bytes32 indexed operationId);
    event ArrayCleanupPerformed(address indexed user, uint256 requestsRemoved);
    event EmergencyPause(address indexed caller, uint256 timestamp);
    event EmergencyUnpause(address indexed caller, uint256 timestamp);
    event TimelockControllerUpdated(address indexed previousController, address indexed newController);
    event RoleCommitted(bytes32 indexed role, address indexed account, address indexed committer, uint256 timestamp);
    event RoleGrantedWithReveal(bytes32 indexed role, address indexed account, address indexed granter);
    event CriticalOperationApproved(bytes32 indexed operationId, address indexed approver, uint256 approverCount);
    
    // Emergency closure events
    event EmergencyClosureInitiated(
        uint256 indexed closureId,
        address indexed initiator,
        address indexed returnAddress,
        string reason
    );
    event EmergencyClosureApproved(
        uint256 indexed closureId,
        address indexed approver,
        uint256 approverCount
    );
    event EmergencyClosureCancelled(uint256 indexed closureId, address indexed canceller);
    event EmergencyClosureExecuted(
        uint256 indexed closureId,
        address indexed returnAddress,
        uint256 returnedAmount
    );
    event ClosureCommitted(uint256 indexed closureId, address indexed approver, uint256 timestamp);
    event ClosureApprovalRevealed(uint256 indexed closureId, address indexed approver);

    /// @notice Custom errors
    error InvalidAmount();
    error InvalidAddress();
    error InvalidStatus();
    error RequestNotFound();
    error InsufficientBudget();
    error AlreadyApproved();
    error UnauthorizedApprover();
    error TransferFailed();
    error TooManyActiveRequests();
    error InvalidCommitment();
    error RevealTooEarly();
    error PaymentDeadlineExpired();
    error ArrayLengthExceeded();
    error TimelockNotExpired();
    error OperationNotQueued();
    error PendingAdminOnly();
    error TransferNotInitiated();
    error EmergencyStopActive();
    error AmountTooLow();
    error AmountTooHigh();
    error InvalidDescription();
    error InvalidDocumentHash();
    error ZeroAddress();
    error ActiveClosureExists();
    error NoActiveClosureRequest();
    error InvalidClosureStatus();
    error InsufficientCommitteeApprovers();
    error DuplicateCommitteeApprover();
    error InvalidReturnAddress();
    error ClosureExecutionDeadlineExpired();
    error InsufficientBalance();
    error ContractNotPaused();
    error RoleCommitmentExists();
    error InvalidRoleCommitment();
    error ArrayLengthMismatch();
    error TooManyRecipients();
    error EmptyRecipientList();
    error InvalidTotalAmount();
    error RequestNotAbandoned();
    error InvalidVirtualPayer(); // SECURITY FIX MEDIUM-1: Added for virtual payer validation

    /// @notice Modifier to check if caller is factory
    modifier onlyFactory() {
        if (msg.sender != projectFactory) revert UnauthorizedApprover();
        _;
    }
    
    /// @notice Modifier to check emergency stop
    modifier notEmergencyStopped() {
        if (emergencyStop) revert EmergencyStopActive();
        _;
    }
    
    /// @notice Modifier for timelock-protected functions
    modifier onlyTimelockOrAdmin() {
        if (msg.sender != timelockController && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        _;
    }

    /**
     * @notice Initialize the project reimbursement contract
     * @param _projectId The project identifier
     * @param _omthbToken The OMTHB token address
     * @param _projectBudget The total project budget
     * @param _admin The admin address
     */
    function initialize(
        string memory _projectId,
        address _omthbToken,
        uint256 _projectBudget,
        address _admin
    ) external initializer {
        // Enhanced input validation
        if (_omthbToken == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        if (_projectBudget == 0) revert InvalidAmount();
        if (bytes(_projectId).length == 0) revert InvalidDescription();
        
        // Verify token contract
        if (_omthbToken.code.length == 0) revert InvalidAddress();
        
        // Additional token validation
        try IOMTHB(_omthbToken).totalSupply() returns (uint256) {
            // Token is valid ERC20
        } catch {
            revert InvalidAddress();
        }
        
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        
        projectId = _projectId;
        projectFactory = msg.sender;
        omthbToken = IOMTHB(_omthbToken);
        projectBudget = _projectBudget;
        emergencyStop = false;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    /**
     * @notice Create a new reimbursement request with multiple recipients
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts for each recipient
     * @param description The description of the expense
     * @param documentHash The document reference (IPFS hash)
     * @param virtualPayer Optional virtual payer address (use address(0) if not needed)
     * @return requestId The ID of the created request
     */
    function createRequestMultiple(
        address[] calldata recipients,
        uint256[] calldata amounts,
        string calldata description,
        string calldata documentHash,
        address virtualPayer
    ) external onlyRole(REQUESTER_ROLE) whenNotPaused notEmergencyStopped returns (uint256) {
        // Validate inputs
        _validateMultiRequestInputs(recipients, amounts, description, documentHash);
        
        // Calculate total amount
        uint256 totalAmount = _calculateTotalAmount(amounts);
        
        // Validate budget
        _validateBudget(totalAmount);
        
        uint256 requestId = _requestIdCounter++;
        
        // Create request
        _createMultiReimbursementRequest(requestId, recipients, amounts, totalAmount, description, documentHash);
        
        // SECURITY FIX MEDIUM-1: Validate virtual payer address
        if (virtualPayer != address(0)) {
            // Ensure virtual payer is not a system address or contract
            _validateVirtualPayer(virtualPayer);
            
            virtualPayers[requestId] = virtualPayer;
            requests[requestId].virtualPayer = virtualPayer;
        }
        
        // Track request
        _trackActiveRequest(requestId);
        
        emit RequestCreated(requestId, msg.sender, recipients, amounts, totalAmount, description, virtualPayer);
        
        return requestId;
    }

    /**
     * @notice Create a single recipient request (backward compatibility)
     * @param recipient The recipient of the reimbursement
     * @param amount The amount to reimburse
     * @param description The description of the expense
     * @param documentHash The document reference (IPFS hash)
     * @return requestId The ID of the created request
     */
    function createRequest(
        address recipient,
        uint256 amount,
        string calldata description,
        string calldata documentHash
    ) external onlyRole(REQUESTER_ROLE) whenNotPaused notEmergencyStopped returns (uint256) {
        // Convert to array format for internal processing
        address[] memory recipients = new address[](1);
        recipients[0] = recipient;
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        
        // Validate inputs
        _validateMultiRequestInputs(recipients, amounts, description, documentHash);
        
        // Validate budget
        _validateBudget(amount);
        
        uint256 requestId = _requestIdCounter++;
        
        // Create request
        _createMultiReimbursementRequest(requestId, recipients, amounts, amount, description, documentHash);
        
        // No virtual payer for backward compatibility
        
        // Track request
        _trackActiveRequest(requestId);
        
        emit RequestCreated(requestId, msg.sender, recipients, amounts, amount, description, address(0));
        
        return requestId;
    }
    
    function _validateMultiRequestInputs(
        address[] memory recipients,
        uint256[] memory amounts,
        string calldata description,
        string calldata documentHash
    ) private pure {
        // Validate arrays
        if (recipients.length == 0) revert EmptyRecipientList();
        if (recipients.length != amounts.length) revert ArrayLengthMismatch();
        if (recipients.length > MAX_RECIPIENTS) revert TooManyRecipients();
        
        // Validate each recipient and amount
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert InvalidAmount();
            if (amounts[i] < MIN_REIMBURSEMENT_AMOUNT) revert AmountTooLow();
            if (amounts[i] > MAX_REIMBURSEMENT_AMOUNT) revert AmountTooHigh();
            
            // Check for duplicate recipients
            for (uint256 j = 0; j < i; j++) {
                if (recipients[i] == recipients[j]) revert InvalidAddress();
            }
            
            totalAmount += amounts[i];
            if (totalAmount < amounts[i]) revert InvalidAmount(); // Overflow check
        }
        
        // Validate total amount
        if (totalAmount > MAX_REIMBURSEMENT_AMOUNT) revert AmountTooHigh();
        
        // Validate description and document hash
        if (bytes(description).length == 0) revert InvalidDescription();
        if (bytes(description).length > 1000) revert InvalidDescription();
        if (bytes(documentHash).length == 0) revert InvalidDocumentHash();
        if (bytes(documentHash).length > 100) revert InvalidDocumentHash();
    }
    
    function _calculateTotalAmount(uint256[] memory amounts) private pure returns (uint256) {
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
            if (totalAmount < amounts[i]) revert InvalidAmount(); // Overflow check
        }
        return totalAmount;
    }
    
    function _validateBudget(uint256 amount) private view {
        uint256 newTotalDistributed = totalDistributed + amount;
        if (newTotalDistributed > projectBudget) revert InsufficientBudget();
        if (newTotalDistributed < totalDistributed) revert InvalidAmount(); // Overflow check
        if (projectBudget > type(uint256).max / 2) revert InvalidAmount();
    }
    
    function _createMultiReimbursementRequest(
        uint256 requestId,
        address[] memory recipients,
        uint256[] memory amounts,
        uint256 totalAmount,
        string calldata description,
        string calldata documentHash
    ) private {
        // First create the request with basic fields
        ReimbursementRequest storage request = requests[requestId];
        request.id = requestId;
        request.requester = msg.sender;
        request.recipients = recipients;
        request.amounts = amounts;
        request.totalAmount = totalAmount;
        request.description = description;
        request.documentHash = documentHash;
        request.status = Status.Pending;
        request.createdAt = block.timestamp;
        request.updatedAt = block.timestamp;
        request.paymentDeadline = 0;
        
        // Then set approval info fields
        request.approvalInfo.secretaryApprover = address(0);
        request.approvalInfo.committeeApprover = address(0);
        request.approvalInfo.financeApprover = address(0);
        request.approvalInfo.directorApprover = address(0);
        // committeeAdditionalApprovers is already initialized as empty array
        request.virtualPayer = address(0); // Initialize virtual payer
    }
    
    function _trackActiveRequest(uint256 requestId) private {
        if (activeRequestIds.length >= MAX_BATCH_SIZE) revert TooManyActiveRequests();
        activeRequestIds.push(requestId);
        
        activeRequestsPerUser[msg.sender].push(requestId);
        requestIndexInUserArray[requestId] = activeRequestsPerUser[msg.sender].length - 1;
        
        if (activeRequestsPerUser[msg.sender].length > MAX_ARRAY_LENGTH) {
            _cleanupUserRequests(msg.sender);
        }
    }

    /**
     * @notice Commit an approval for a request (Step 1 of commit-reveal)
     * @param requestId The request ID to commit approval for
     * @param commitment Hash of approver address, requestId, and nonce
     * @dev Prevents front-running by requiring commitment before approval
     */
    function commitApproval(uint256 requestId, bytes32 commitment) external whenNotPaused notEmergencyStopped nonReentrant {
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        if (request.status == Status.Distributed) revert InvalidStatus();
        
        // Verify approver has appropriate role for current status
        if (request.status == Status.Pending && !hasRole(SECRETARY_ROLE, msg.sender)) revert UnauthorizedApprover();
        if (request.status == Status.SecretaryApproved && !hasRole(COMMITTEE_ROLE, msg.sender)) revert UnauthorizedApprover();
        if (request.status == Status.CommitteeApproved && !hasRole(FINANCE_ROLE, msg.sender)) revert UnauthorizedApprover();
        if (request.status == Status.FinanceApproved) {
            if (request.approvalInfo.committeeAdditionalApprovers.length < REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS) {
                if (!hasRole(COMMITTEE_ROLE, msg.sender)) revert UnauthorizedApprover();
            } else {
                if (!hasRole(DIRECTOR_ROLE, msg.sender)) revert UnauthorizedApprover();
            }
        }
        
        approvalCommitments[requestId][msg.sender] = commitment;
        commitTimestamps[requestId][msg.sender] = block.timestamp;
        
        emit ApprovalCommitted(requestId, msg.sender, block.timestamp, block.chainid);
    }

    /**
     * @notice Secretary approval with reveal (Level 1)
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Part of commit-reveal pattern to prevent front-running
     */
    function approveBySecretary(uint256 requestId, uint256 nonce) 
        external 
        onlyRole(SECRETARY_ROLE) 
        whenNotPaused 
        notEmergencyStopped
        nonReentrant
    {
        // Verify commitment exists and reveal window has passed
        bytes32 commitment = approvalCommitments[requestId][msg.sender];
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (block.timestamp < commitTimestamps[requestId][msg.sender] + REVEAL_WINDOW) {
            revert RevealTooEarly();
        }
        
        // Verify the reveal matches the commitment with chain ID
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, requestId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        if (request.status != Status.Pending) revert InvalidStatus();
        if (request.approvalInfo.secretaryApprover != address(0)) revert AlreadyApproved();
        
        request.approvalInfo.secretaryApprover = msg.sender;
        request.status = Status.SecretaryApproved;
        request.updatedAt = block.timestamp;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
        emit RequestApproved(requestId, Status.SecretaryApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.SecretaryApproved);
    }

    /**
     * @notice Committee approval with reveal (Level 2)
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Part of commit-reveal pattern to prevent front-running
     */
    function approveByCommittee(uint256 requestId, uint256 nonce) 
        external 
        onlyRole(COMMITTEE_ROLE) 
        whenNotPaused 
        notEmergencyStopped
        nonReentrant
    {
        // Verify commitment exists and reveal window has passed
        bytes32 commitment = approvalCommitments[requestId][msg.sender];
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (block.timestamp < commitTimestamps[requestId][msg.sender] + REVEAL_WINDOW) {
            revert RevealTooEarly();
        }
        
        // Verify the reveal matches the commitment with chain ID
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, requestId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        if (request.status != Status.SecretaryApproved) revert InvalidStatus();
        if (request.approvalInfo.committeeApprover != address(0)) revert AlreadyApproved();
        
        request.approvalInfo.committeeApprover = msg.sender;
        request.status = Status.CommitteeApproved;
        request.updatedAt = block.timestamp;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
        emit RequestApproved(requestId, Status.CommitteeApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.CommitteeApproved);
    }

    /**
     * @notice Finance approval with reveal (Level 3)
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Part of commit-reveal pattern to prevent front-running
     */
    function approveByFinance(uint256 requestId, uint256 nonce) 
        external 
        onlyRole(FINANCE_ROLE) 
        whenNotPaused 
        notEmergencyStopped
        nonReentrant
    {
        // Verify commitment exists and reveal window has passed
        bytes32 commitment = approvalCommitments[requestId][msg.sender];
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (block.timestamp < commitTimestamps[requestId][msg.sender] + REVEAL_WINDOW) {
            revert RevealTooEarly();
        }
        
        // Verify the reveal matches the commitment with chain ID
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, requestId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        if (request.status != Status.CommitteeApproved) revert InvalidStatus();
        if (request.approvalInfo.financeApprover != address(0)) revert AlreadyApproved();
        
        request.approvalInfo.financeApprover = msg.sender;
        request.status = Status.FinanceApproved;
        request.updatedAt = block.timestamp;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
        emit RequestApproved(requestId, Status.FinanceApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.FinanceApproved);
    }

    /**
     * @notice Additional Committee approval with reveal (Level 4)
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Part of commit-reveal pattern to prevent front-running
     */
    function approveByCommitteeAdditional(uint256 requestId, uint256 nonce) 
        external 
        onlyRole(COMMITTEE_ROLE) 
        whenNotPaused 
        notEmergencyStopped
        nonReentrant
    {
        // Verify commitment exists and reveal window has passed
        bytes32 commitment = approvalCommitments[requestId][msg.sender];
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (block.timestamp < commitTimestamps[requestId][msg.sender] + REVEAL_WINDOW) {
            revert RevealTooEarly();
        }
        
        // Verify the reveal matches the commitment with chain ID
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, requestId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        if (request.status != Status.FinanceApproved) revert InvalidStatus();
        if (request.approvalInfo.committeeAdditionalApprovers.length >= REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS) revert AlreadyApproved();
        
        // Ensure different committee member from Level 2 approver
        if (request.approvalInfo.committeeApprover == msg.sender) revert UnauthorizedApprover();
        
        // Check if this committee member has already approved in additional level
        for (uint256 i = 0; i < request.approvalInfo.committeeAdditionalApprovers.length; i++) {
            if (request.approvalInfo.committeeAdditionalApprovers[i] == msg.sender) revert AlreadyApproved();
        }
        
        // Add to additional approvers array
        request.approvalInfo.committeeAdditionalApprovers.push(msg.sender);
        request.updatedAt = block.timestamp;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
        emit RequestApproved(requestId, Status.FinanceApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.FinanceApproved);
    }

    /**
     * @notice Director approval with reveal and auto-distribution (Level 5)
     * @param requestId The request ID to approve
     * @param nonce The nonce used in the commitment
     * @dev Part of commit-reveal pattern to prevent front-running
     */
    function approveByDirector(uint256 requestId, uint256 nonce) 
        external 
        onlyRole(DIRECTOR_ROLE) 
        whenNotPaused 
        notEmergencyStopped
        nonReentrant
    {
        // Verify commitment exists and reveal window has passed
        bytes32 commitment = approvalCommitments[requestId][msg.sender];
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (block.timestamp < commitTimestamps[requestId][msg.sender] + REVEAL_WINDOW) {
            revert RevealTooEarly();
        }
        
        // Verify the reveal matches the commitment with chain ID
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, requestId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId || request.status == Status.Cancelled) revert RequestNotFound();
        if (request.status != Status.FinanceApproved) revert InvalidStatus();
        if (request.approvalInfo.committeeAdditionalApprovers.length < REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS) revert InvalidStatus();
        if (request.approvalInfo.directorApprover != address(0)) revert AlreadyApproved();
        
        request.approvalInfo.directorApprover = msg.sender;
        request.status = Status.DirectorApproved;
        request.updatedAt = block.timestamp;
        request.paymentDeadline = block.timestamp + PAYMENT_DEADLINE_DURATION;
        
        // Clear the commitment after use
        delete approvalCommitments[requestId][msg.sender];
        delete commitTimestamps[requestId][msg.sender];
        
        emit RequestApproved(requestId, Status.DirectorApproved, msg.sender);
        emit ApprovalRevealed(requestId, msg.sender, Status.DirectorApproved);
        
        // Auto-distribute funds to all recipients
        _distributeMultipleFunds(requestId);
    }

    /**
     * @notice Cancel a reimbursement request
     * @param requestId The request ID to cancel
     */
    function cancelRequest(uint256 requestId) external whenNotPaused notEmergencyStopped nonReentrant {
        ReimbursementRequest storage request = requests[requestId];
        if (request.id != requestId) revert RequestNotFound();
        
        // Only requester or admin can cancel
        if (msg.sender != request.requester && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        
        // Cannot cancel if already distributed
        if (request.status == Status.Distributed) revert InvalidStatus();
        
        request.status = Status.Cancelled;
        request.updatedAt = block.timestamp;
        
        // Remove from active arrays
        _removeFromActiveRequests(requestId);
        
        emit RequestCancelled(requestId, msg.sender);
    }

    /**
     * @notice Update project budget (requires timelock)
     * @param newBudget The new budget amount
     */
    function updateBudget(uint256 newBudget) external onlyTimelockOrAdmin nonReentrant {
        if (newBudget < totalDistributed) revert InvalidAmount();
        if (newBudget == 0) revert InvalidAmount();
        if (newBudget > type(uint256).max / 2) revert InvalidAmount(); // Prevent manipulation
        
        uint256 oldBudget = projectBudget;
        projectBudget = newBudget;
        
        emit BudgetUpdated(oldBudget, newBudget);
    }

    /**
     * @notice Pause the contract (requires multi-sig)
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 operationId = keccak256(abi.encodePacked("pause", block.timestamp));
        
        // Check if already approved by this admin
        address[] storage approvers = criticalOperationApprovers[operationId];
        for (uint256 i = 0; i < approvers.length; i++) {
            if (approvers[i] == msg.sender) revert AlreadyApproved();
        }
        
        // Add approval
        approvers.push(msg.sender);
        emit CriticalOperationApproved(operationId, msg.sender, approvers.length);
        
        // Execute if threshold reached
        if (approvers.length >= CRITICAL_OPERATION_THRESHOLD) {
            _pause();
            emit EmergencyPause(msg.sender, block.timestamp);
            
            // Clean up
            delete criticalOperationApprovers[operationId];
        }
    }

    /**
     * @notice Unpause the contract (requires timelock)
     */
    function unpause() external onlyTimelockOrAdmin {
        _unpause();
        emit EmergencyUnpause(msg.sender, block.timestamp);
    }
    
    /**
     * @notice Activate emergency stop (requires multi-sig)
     */
    function activateEmergencyStop() external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 operationId = keccak256(abi.encodePacked("emergencyStop", block.timestamp));
        
        // Check if already approved by this admin
        address[] storage approvers = criticalOperationApprovers[operationId];
        for (uint256 i = 0; i < approvers.length; i++) {
            if (approvers[i] == msg.sender) revert AlreadyApproved();
        }
        
        // Add approval
        approvers.push(msg.sender);
        emit CriticalOperationApproved(operationId, msg.sender, approvers.length);
        
        // Execute if threshold reached
        if (approvers.length >= CRITICAL_OPERATION_THRESHOLD) {
            emergencyStop = true;
            _pause();
            emit EmergencyPause(msg.sender, block.timestamp);
            
            // Clean up
            delete criticalOperationApprovers[operationId];
        }
    }
    
    /**
     * @notice Deactivate emergency stop (requires timelock)
     */
    function deactivateEmergencyStop() external onlyTimelockOrAdmin {
        emergencyStop = false;
        _unpause();
        emit EmergencyUnpause(msg.sender, block.timestamp);
    }
    
    /**
     * @notice Set timelock controller address
     * @param _timelockController The timelock controller address
     */
    function setTimelockController(address _timelockController) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (_timelockController == address(0)) revert ZeroAddress();
        // Validate that the address is a contract, not an EOA
        if (_timelockController.code.length == 0) revert InvalidAddress();
        
        // Additional validation - basic sanity check for contract size
        if (_timelockController.code.length < 100) revert InvalidAddress();
        
        address previousController = timelockController;
        timelockController = _timelockController;
        
        emit TimelockControllerUpdated(previousController, _timelockController);
    }

    /**
     * @notice Get active requests
     * @return Array of active request IDs
     */
    function getActiveRequests() external view returns (uint256[] memory) {
        return activeRequestIds;
    }

    /**
     * @notice Get request details
     * @param requestId The request ID
     * @return The reimbursement request details
     */
    function getRequest(uint256 requestId) external view returns (ReimbursementRequest memory) {
        return requests[requestId];
    }
    
    /**
     * @notice Get request recipients
     * @param requestId The request ID
     * @return Array of recipient addresses
     */
    function getRequestRecipients(uint256 requestId) external view returns (address[] memory) {
        return requests[requestId].recipients;
    }
    
    /**
     * @notice Get request amounts
     * @param requestId The request ID
     * @return Array of amounts for each recipient
     */
    function getRequestAmounts(uint256 requestId) external view returns (uint256[] memory) {
        return requests[requestId].amounts;
    }
    
    /**
     * @notice Get active requests for a specific user
     * @param user The user address
     * @return Array of active request IDs for the user
     */
    function getUserActiveRequests(address user) external view returns (uint256[] memory) {
        return activeRequestsPerUser[user];
    }
    
    /**
     * @notice Get committee additional approvers for a request
     * @param requestId The request ID
     * @return Array of committee additional approver addresses
     */
    function getCommitteeAdditionalApprovers(uint256 requestId) external view returns (address[] memory) {
        return requests[requestId].approvalInfo.committeeAdditionalApprovers;
    }
    
    /**
     * @notice Check if request has enough committee additional approvers
     * @param requestId The request ID
     * @return True if request has enough approvers for director approval
     */
    function hasEnoughCommitteeApprovers(uint256 requestId) external view returns (bool) {
        return requests[requestId].approvalInfo.committeeAdditionalApprovers.length >= REQUIRED_COMMITTEE_ADDITIONAL_APPROVERS;
    }
    
    /**
     * @notice Get total approval count for a request
     * @param requestId The request ID
     * @return count Total number of approvals
     */
    function getApprovalCount(uint256 requestId) external view returns (uint256 count) {
        ReimbursementRequest storage request = requests[requestId];
        
        if (request.approvalInfo.secretaryApprover != address(0)) count++;
        if (request.approvalInfo.committeeApprover != address(0)) count++;
        if (request.approvalInfo.financeApprover != address(0)) count++;
        count += request.approvalInfo.committeeAdditionalApprovers.length;
        if (request.approvalInfo.directorApprover != address(0)) count++;
        
        return count;
    }
    
    /**
     * @notice Get virtual payer for a request
     * @param requestId The request ID
     * @return Virtual payer address (address(0) if not set)
     */
    function getVirtualPayer(uint256 requestId) external view returns (address) {
        return requests[requestId].virtualPayer;
    }
    
    /**
     * @notice SECURITY FIX MEDIUM-1: Validate virtual payer address
     * @param virtualPayer The virtual payer address to validate
     * @dev Ensures virtual payer is not a critical system address
     */
    function _validateVirtualPayer(address virtualPayer) private view {
        // Prevent using this contract as virtual payer
        if (virtualPayer == address(this)) revert InvalidVirtualPayer();
        
        // Prevent using the token contract as virtual payer
        if (virtualPayer == address(omthbToken)) revert InvalidVirtualPayer();
        
        // Prevent using the factory contract as virtual payer
        if (virtualPayer == projectFactory) revert InvalidVirtualPayer();
        
        // Prevent using common system addresses
        if (virtualPayer == address(0x0)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0xdEaD)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x1)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x2)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x3)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x4)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x5)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x6)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x7)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x8)) revert InvalidVirtualPayer();
        if (virtualPayer == address(0x9)) revert InvalidVirtualPayer();
        
        // Prevent using precompiled contracts (addresses 0x1 to 0x9 are already checked above)
        // Additional check for other known precompiles
        if (uint160(virtualPayer) <= 0xff) revert InvalidVirtualPayer();
        
        // Optional: Check if address is a contract (commented out as virtual payers might be contracts)
        // if (virtualPayer.code.length > 0) revert InvalidVirtualPayer();
    }

    /**
     * @notice Internal function to distribute funds to multiple recipients
     * @param requestId The request ID
     * @dev Follows Checks-Effects-Interactions pattern to prevent reentrancy
     */
    function _distributeMultipleFunds(uint256 requestId) private {
        ReimbursementRequest storage request = requests[requestId];
        
        // Slippage protection: check payment deadline
        if (request.paymentDeadline != 0 && block.timestamp > request.paymentDeadline) revert PaymentDeadlineExpired();
        
        // CRITICAL FIX: Cache values to prevent reentrancy
        uint256 totalAmount = request.totalAmount;
        address[] memory recipients = request.recipients;
        uint256[] memory amounts = request.amounts;
        
        // CRITICAL FIX: Update state BEFORE external calls (CEI pattern)
        request.status = Status.Distributed;
        request.updatedAt = block.timestamp;
        uint256 oldTotal = totalDistributed;
        totalDistributed += totalAmount;
        emit TotalDistributedUpdated(oldTotal, totalDistributed);
        
        // Emit event before external calls
        emit FundsDistributed(requestId, recipients, amounts, totalAmount, request.virtualPayer);
        
        // CRITICAL FIX: External calls LAST with additional safety
        // Check token balance before transfers
        uint256 contractBalance = omthbToken.balanceOf(address(this));
        if (contractBalance < totalAmount) revert InsufficientBalance();
        
        // Distribute to each recipient
        for (uint256 i = 0; i < recipients.length; i++) {
            bool success = omthbToken.transfer(recipients[i], amounts[i]);
            if (!success) revert TransferFailed();
            
            emit SingleDistribution(requestId, recipients[i], amounts[i]);
        }
        
        // Verify total transfer was successful
        uint256 newBalance = omthbToken.balanceOf(address(this));
        if (contractBalance - newBalance != totalAmount) revert TransferFailed();
        
        // Remove from active arrays after successful distribution
        _removeFromActiveRequests(requestId);
    }
    
    /**
     * @notice Internal function to cleanup user's completed/cancelled requests
     * @param user The user address to cleanup requests for
     */
    function _cleanupUserRequests(address user) private {
        uint256[] storage userRequests = activeRequestsPerUser[user];
        uint256 removed = 0;
        uint256 length = userRequests.length;
        
        // Return early if array is empty
        if (length == 0) return;
        
        // Iterate backwards to avoid index shifting issues
        // Start from length - 1 and go down to 0
        uint256 i = length;
        while (i > 0) {
            i--; // Decrement first to get valid index
            uint256 requestId = userRequests[i];
            ReimbursementRequest storage request = requests[requestId];
            
            // Remove if distributed or cancelled
            if (request.status == Status.Distributed || request.status == Status.Cancelled) {
                // Swap with last element and pop
                uint256 lastIndex = userRequests.length - 1;
                if (i != lastIndex) {
                    userRequests[i] = userRequests[lastIndex];
                    requestIndexInUserArray[userRequests[i]] = i;
                }
                userRequests.pop();
                removed++;
                
                // Limit removals per transaction to prevent gas issues
                if (removed >= 10) break;
            }
        }
        
        if (removed > 0) {
            emit ArrayCleanupPerformed(user, removed);
        }
    }
    
    /**
     * @notice Remove request from active arrays
     * @param requestId The request ID to remove
     */
    function _removeFromActiveRequests(uint256 requestId) private {
        ReimbursementRequest storage request = requests[requestId];
        
        // Remove from user's active requests
        uint256[] storage userRequests = activeRequestsPerUser[request.requester];
        uint256 index = requestIndexInUserArray[requestId];
        
        if (index < userRequests.length && userRequests[index] == requestId) {
            uint256 lastIndex = userRequests.length - 1;
            if (index != lastIndex) {
                userRequests[index] = userRequests[lastIndex];
                requestIndexInUserArray[userRequests[index]] = index;
            }
            userRequests.pop();
            delete requestIndexInUserArray[requestId];
        }
        
        // Remove from global active requests with gas limit
        uint256 length = activeRequestIds.length;
        if (length > MAX_BATCH_SIZE) {
            length = MAX_BATCH_SIZE;
        }
        
        for (uint256 i = 0; i < length; i++) {
            if (activeRequestIds[i] == requestId) {
                uint256 lastIndex = activeRequestIds.length - 1;
                if (i != lastIndex) {
                    activeRequestIds[i] = activeRequestIds[lastIndex];
                }
                activeRequestIds.pop();
                break;
            }
        }
    }
    
    /**
     * @notice Initiate admin transfer (Step 1 of two-step transfer)
     * @param newAdmin The address of the new admin
     */
    function initiateAdminTransfer(address newAdmin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newAdmin == address(0)) revert InvalidAddress();
        
        pendingAdmin = newAdmin;
        pendingAdminTimestamp = block.timestamp;
        
        emit AdminTransferInitiated(msg.sender, newAdmin, block.timestamp);
    }
    
    /**
     * @notice Complete admin transfer (Step 2 of two-step transfer)
     * @dev Can only be called by pending admin after timelock
     */
    function acceptAdminTransfer() external {
        if (msg.sender != pendingAdmin) revert PendingAdminOnly();
        if (pendingAdminTimestamp == 0) revert TransferNotInitiated();
        if (block.timestamp < pendingAdminTimestamp + TIMELOCK_DURATION) revert TimelockNotExpired();
        
        // Store previous admin before granting new role
        // In a production scenario, track current admin separately
        address previousAdmin = address(0);
        
        // Grant admin role to new admin
        _grantRole(DEFAULT_ADMIN_ROLE, pendingAdmin);
        
        // Note: The previous admin should manually revoke their role
        // This is safer than automatic revocation
        
        emit AdminTransferCompleted(previousAdmin, pendingAdmin);
        
        // Reset pending admin
        pendingAdmin = address(0);
        pendingAdminTimestamp = 0;
    }
    
    /**
     * @notice Queue a timelock operation
     * @param target The target address for the operation
     * @param data The encoded function call
     * @return operationId The unique operation identifier
     */
    function queueTimelockOperation(address target, bytes calldata data) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
        returns (bytes32) 
    {
        // Input validation
        if (target == address(0)) revert ZeroAddress();
        if (data.length == 0) revert InvalidDescription();
        if (data.length > 10000) revert InvalidDescription(); // Prevent gas griefing
        
        bytes32 operationId = keccak256(abi.encode(target, data, block.timestamp));
        uint256 executeTime = block.timestamp + TIMELOCK_DURATION;
        
        timelockQueue[operationId] = executeTime;
        
        emit TimelockOperationQueued(operationId, target, executeTime);
        
        return operationId;
    }
    
    /**
     * @notice Execute a queued timelock operation
     * @param operationId The operation identifier
     * @param target The target address
     * @param data The encoded function call
     */
    function executeTimelockOperation(
        bytes32 operationId,
        address target,
        bytes calldata data
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 executeTime = timelockQueue[operationId];
        if (executeTime == 0) revert OperationNotQueued();
        if (block.timestamp < executeTime) revert TimelockNotExpired();
        
        // Verify operation matches
        bytes32 expectedId = keccak256(abi.encode(target, data, executeTime - TIMELOCK_DURATION));
        if (expectedId != operationId) revert InvalidCommitment();
        
        // Execute operation
        delete timelockQueue[operationId];
        
        (bool success, ) = target.call(data);
        if (!success) revert TransferFailed();
        
        emit TimelockOperationExecuted(operationId, target);
    }
    
    /**
     * @notice Cancel a queued timelock operation
     * @param operationId The operation identifier
     */
    function cancelTimelockOperation(bytes32 operationId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (timelockQueue[operationId] == 0) revert OperationNotQueued();
        
        delete timelockQueue[operationId];
        
        emit TimelockOperationCancelled(operationId);
    }
    
    /**
     * @notice Commit to grant a role (Step 1 of commit-reveal)
     * @param role The role to grant
     * @param commitment Hash of role, account, granter, and nonce
     */
    function commitRoleGrant(bytes32 role, bytes32 commitment) external onlyRole(getRoleAdmin(role)) {
        if (roleCommitments[role][msg.sender] != bytes32(0)) revert RoleCommitmentExists();
        
        roleCommitments[role][msg.sender] = commitment;
        roleCommitTimestamps[role][msg.sender] = block.timestamp;
        
        emit RoleCommitted(role, address(0), msg.sender, block.timestamp);
    }
    
    /**
     * @notice Grant role with reveal (Step 2 of commit-reveal)
     * @param role The role to grant
     * @param account The account to grant the role to
     * @param nonce The nonce used in commitment
     */
    function grantRoleWithReveal(bytes32 role, address account, uint256 nonce) external onlyRole(getRoleAdmin(role)) {
        if (account == address(0)) revert ZeroAddress();
        
        // Verify commitment
        bytes32 commitment = roleCommitments[role][msg.sender];
        if (commitment == bytes32(0)) revert InvalidRoleCommitment();
        if (block.timestamp < roleCommitTimestamps[role][msg.sender] + REVEAL_WINDOW) {
            revert RevealTooEarly();
        }
        
        // Verify reveal matches commitment
        bytes32 revealHash = keccak256(abi.encodePacked(role, account, msg.sender, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidRoleCommitment();
        
        // Clear commitment
        delete roleCommitments[role][msg.sender];
        delete roleCommitTimestamps[role][msg.sender];
        
        // Grant role
        _grantRole(role, account);
        
        emit RoleGrantedWithReveal(role, account, msg.sender);
    }
    
    /**
     * @notice Direct role grant for initial setup only
     * @dev Only callable by factory during initialization or admin for emergency
     * @param role The role to grant
     * @param account The account to grant the role to
     */
    function grantRoleDirect(bytes32 role, address account) external {
        // CRITICAL FIX: Allow factory to set initial roles
        if (msg.sender != projectFactory && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        if (account == address(0)) revert ZeroAddress();
        
        _grantRole(role, account);
    }
    
    /**
     * @notice Override grantRole to use commit-reveal pattern
     * @dev This function is deprecated in favor of grantRoleWithReveal
     */
    function grantRole(bytes32 role, address account) public pure override {
        revert("Use grantRoleWithReveal or grantRoleDirect for initial setup");
    }
    
    /**
     * @notice Override revokeRole to use commit-reveal pattern
     * @dev This function is deprecated in favor of revokeRoleWithReveal
     */
    function revokeRole(bytes32 role, address account) public pure override {
        revert("Use revokeRoleWithReveal instead");
    }
    
    /**
     * @notice Revoke role with commit-reveal pattern
     * @param role The role to revoke
     * @param account The account to revoke the role from
     * @param nonce The nonce used in commitment
     */
    function revokeRoleWithReveal(bytes32 role, address account, uint256 nonce) external onlyRole(getRoleAdmin(role)) {
        if (account == address(0)) revert ZeroAddress();
        
        // Verify commitment
        bytes32 commitment = roleCommitments[role][msg.sender];
        if (commitment == bytes32(0)) revert InvalidRoleCommitment();
        if (block.timestamp < roleCommitTimestamps[role][msg.sender] + REVEAL_WINDOW) {
            revert RevealTooEarly();
        }
        
        // Verify reveal matches commitment
        bytes32 revealHash = keccak256(abi.encodePacked(role, account, msg.sender, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidRoleCommitment();
        
        // Clear commitment
        delete roleCommitments[role][msg.sender];
        delete roleCommitTimestamps[role][msg.sender];
        
        // Revoke role
        _revokeRole(role, account);
        
        emit RoleRevoked(role, account, msg.sender);
    }

    // ============================================
    // EMERGENCY CLOSURE FUNCTIONS
    // ============================================

    /**
     * @notice Initiate an emergency closure request
     * @param returnAddress The address where remaining tokens should be sent
     * @param reason The reason for emergency closure
     * @return closureId The ID of the created closure request
     */
    function initiateEmergencyClosure(
        address returnAddress,
        string calldata reason
    ) external whenNotPaused notEmergencyStopped returns (uint256) {
        // Only committee members or director can initiate
        if (!hasRole(COMMITTEE_ROLE, msg.sender) && !hasRole(DIRECTOR_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        
        // Validate inputs
        if (returnAddress == address(0)) revert InvalidReturnAddress();
        if (bytes(reason).length == 0) revert InvalidDescription();
        if (bytes(reason).length > 1000) revert InvalidDescription();
        
        // Check if there's already an active closure request
        if (activeClosureRequestId != 0) {
            EmergencyClosureRequest storage activeRequest = closureRequests[activeClosureRequestId];
            if (activeRequest.status == ClosureStatus.Initiated || 
                activeRequest.status == ClosureStatus.PartiallyApproved ||
                activeRequest.status == ClosureStatus.FullyApproved) {
                revert ActiveClosureExists();
            }
        }
        
        uint256 closureId = _closureIdCounter++;
        
        // Create closure request step by step to avoid stack too deep
        EmergencyClosureRequest storage closureRequest = closureRequests[closureId];
        closureRequest.id = closureId;
        closureRequest.initiator = msg.sender;
        closureRequest.returnAddress = returnAddress;
        closureRequest.reason = reason;
        closureRequest.status = ClosureStatus.Initiated;
        closureRequest.createdAt = block.timestamp;
        closureRequest.updatedAt = block.timestamp;
        closureRequest.executionDeadline = 0; // Set when fully approved
        closureRequest.remainingBalance = 0; // Set when executed
        
        // Initialize approval info
        closureRequest.closureApprovalInfo.directorApprover = address(0);
        // committeeApprovers is already initialized as empty array
        
        activeClosureRequestId = closureId;
        
        emit EmergencyClosureInitiated(closureId, msg.sender, returnAddress, reason);
        
        return closureId;
    }

    /**
     * @notice Commit an approval for emergency closure (Step 1 of commit-reveal)
     * @param closureId The closure request ID
     * @param commitment Hash of approver address, closureId, and nonce
     */
    function commitClosureApproval(uint256 closureId, bytes32 commitment) 
        external 
        whenNotPaused 
        notEmergencyStopped 
        nonReentrant 
    {
        EmergencyClosureRequest storage request = closureRequests[closureId];
        if (request.id != closureId || request.status == ClosureStatus.None) {
            revert NoActiveClosureRequest();
        }
        if (request.status == ClosureStatus.Executed || request.status == ClosureStatus.Cancelled) {
            revert InvalidClosureStatus();
        }
        
        // Verify approver has appropriate role
        bool isCommittee = hasRole(COMMITTEE_ROLE, msg.sender);
        bool isDirector = hasRole(DIRECTOR_ROLE, msg.sender);
        
        if (!isCommittee && !isDirector) revert UnauthorizedApprover();
        
        // If director, check that we have enough committee approvers
        if (isDirector && request.closureApprovalInfo.committeeApprovers.length < REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
            revert InsufficientCommitteeApprovers();
        }
        
        closureCommitments[closureId][msg.sender] = commitment;
        closureCommitTimestamps[closureId][msg.sender] = block.timestamp;
        
        emit ClosureCommitted(closureId, msg.sender, block.timestamp);
    }

    /**
     * @notice Approve emergency closure with reveal
     * @param closureId The closure request ID
     * @param nonce The nonce used in the commitment
     */
    function approveEmergencyClosure(uint256 closureId, uint256 nonce) 
        external 
        whenNotPaused 
        notEmergencyStopped
        nonReentrant
    {
        // Verify commitment exists and reveal window has passed
        bytes32 commitment = closureCommitments[closureId][msg.sender];
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (block.timestamp < closureCommitTimestamps[closureId][msg.sender] + REVEAL_WINDOW) {
            revert RevealTooEarly();
        }
        
        // Verify the reveal matches the commitment
        bytes32 revealHash = keccak256(abi.encodePacked(msg.sender, closureId, block.chainid, nonce));
        if (revealHash != commitment) revert InvalidCommitment();
        
        EmergencyClosureRequest storage request = closureRequests[closureId];
        if (request.id != closureId || request.status == ClosureStatus.None) {
            revert NoActiveClosureRequest();
        }
        if (request.status == ClosureStatus.Executed || request.status == ClosureStatus.Cancelled) {
            revert InvalidClosureStatus();
        }
        
        bool isCommittee = hasRole(COMMITTEE_ROLE, msg.sender);
        bool isDirector = hasRole(DIRECTOR_ROLE, msg.sender);
        
        if (!isCommittee && !isDirector) revert UnauthorizedApprover();
        
        // Handle committee approval
        if (isCommittee && request.closureApprovalInfo.committeeApprovers.length < REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
            // Check for duplicates
            for (uint256 i = 0; i < request.closureApprovalInfo.committeeApprovers.length; i++) {
                if (request.closureApprovalInfo.committeeApprovers[i] == msg.sender) {
                    revert DuplicateCommitteeApprover();
                }
            }
            
            // Add committee approver
            request.closureApprovalInfo.committeeApprovers.push(msg.sender);
            request.updatedAt = block.timestamp;
            
            if (request.closureApprovalInfo.committeeApprovers.length < REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
                request.status = ClosureStatus.PartiallyApproved;
            } else {
                request.status = ClosureStatus.FullyApproved;
            }
            
            emit EmergencyClosureApproved(closureId, msg.sender, request.closureApprovalInfo.committeeApprovers.length);
        }
        // Handle director approval
        else if (isDirector && request.closureApprovalInfo.committeeApprovers.length >= REQUIRED_CLOSURE_COMMITTEE_APPROVERS) {
            if (request.closureApprovalInfo.directorApprover != address(0)) revert AlreadyApproved();
            
            request.closureApprovalInfo.directorApprover = msg.sender;
            request.status = ClosureStatus.FullyApproved;
            request.updatedAt = block.timestamp;
            request.executionDeadline = block.timestamp + PAYMENT_DEADLINE_DURATION;
            
            emit EmergencyClosureApproved(closureId, msg.sender, request.closureApprovalInfo.committeeApprovers.length);
            
            // Auto-execute the closure
            _executeEmergencyClosure(closureId);
        } else {
            revert InvalidClosureStatus();
        }
        
        // Clear the commitment after use
        delete closureCommitments[closureId][msg.sender];
        delete closureCommitTimestamps[closureId][msg.sender];
        
        emit ClosureApprovalRevealed(closureId, msg.sender);
    }

    /**
     * @notice Cancel an emergency closure request
     * @param closureId The closure request ID to cancel
     */
    function cancelEmergencyClosure(uint256 closureId) external whenNotPaused nonReentrant {
        EmergencyClosureRequest storage request = closureRequests[closureId];
        if (request.id != closureId || request.status == ClosureStatus.None) {
            revert NoActiveClosureRequest();
        }
        
        // Only initiator or admin can cancel
        if (msg.sender != request.initiator && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedApprover();
        }
        
        // Cannot cancel if already executed
        if (request.status == ClosureStatus.Executed) revert InvalidClosureStatus();
        
        request.status = ClosureStatus.Cancelled;
        request.updatedAt = block.timestamp;
        
        // Clear active closure request if this was it
        if (activeClosureRequestId == closureId) {
            activeClosureRequestId = 0;
        }
        
        emit EmergencyClosureCancelled(closureId, msg.sender);
    }

    /**
     * @notice Get emergency closure request details
     * @param closureId The closure request ID
     * @return The emergency closure request details
     */
    function getClosureRequest(uint256 closureId) external view returns (EmergencyClosureRequest memory) {
        return closureRequests[closureId];
    }

    /**
     * @notice Get committee approvers for a closure request
     * @param closureId The closure request ID
     * @return Array of committee approver addresses
     */
    function getClosureCommitteeApprovers(uint256 closureId) external view returns (address[] memory) {
        return closureRequests[closureId].closureApprovalInfo.committeeApprovers;
    }

    /**
     * @notice Check if closure request has enough committee approvers
     * @param closureId The closure request ID
     * @return True if request has enough approvers for director approval
     */
    function hasEnoughClosureCommitteeApprovers(uint256 closureId) external view returns (bool) {
        return closureRequests[closureId].closureApprovalInfo.committeeApprovers.length >= REQUIRED_CLOSURE_COMMITTEE_APPROVERS;
    }

    /**
     * @notice Internal function to execute emergency closure
     * @param closureId The closure request ID
     */
    function _executeEmergencyClosure(uint256 closureId) private {
        EmergencyClosureRequest storage request = closureRequests[closureId];
        
        // Verify deadline hasn't expired
        if (request.executionDeadline != 0 && block.timestamp > request.executionDeadline) {
            revert ClosureExecutionDeadlineExpired();
        }
        
        // Get current balance
        uint256 currentBalance = omthbToken.balanceOf(address(this));
        
        // Cache values to prevent reentrancy
        address returnAddress = request.returnAddress;
        
        // Update state BEFORE external calls (CEI pattern)
        request.status = ClosureStatus.Executed;
        request.updatedAt = block.timestamp;
        request.remainingBalance = currentBalance;
        
        // Clear active closure request
        activeClosureRequestId = 0;
        
        // Pause the contract permanently
        if (!paused()) {
            _pause();
        }
        
        // Emit event before external call
        emit EmergencyClosureExecuted(closureId, returnAddress, currentBalance);
        
        // Transfer all remaining tokens to the return address
        if (currentBalance > 0) {
            // Additional balance check to prevent issues
            uint256 actualBalance = omthbToken.balanceOf(address(this));
            if (actualBalance < currentBalance) {
                currentBalance = actualBalance;
            }
            
            bool success = omthbToken.transfer(returnAddress, currentBalance);
            if (!success) revert TransferFailed();
        }
    }
    
    /**
     * @notice Get closure approval count
     * @param closureId The closure request ID  
     * @return committeeCount Number of committee approvers
     * @return hasDirectorApproval Whether director has approved
     */
    function getClosureApprovalStatus(uint256 closureId) external view returns (uint256 committeeCount, bool hasDirectorApproval) {
        EmergencyClosureRequest storage request = closureRequests[closureId];
        committeeCount = request.closureApprovalInfo.committeeApprovers.length;
        hasDirectorApproval = request.closureApprovalInfo.directorApprover != address(0);
    }
    
    /**
     * @notice Check if the project is closed
     * @return True if an emergency closure has been executed
     */
    function isProjectClosed() external view returns (bool) {
        if (activeClosureRequestId != 0) {
            EmergencyClosureRequest storage request = closureRequests[activeClosureRequestId];
            return request.status == ClosureStatus.Executed;
        }
        // Also check all closure requests for executed status
        for (uint256 i = 0; i < _closureIdCounter; i++) {
            if (closureRequests[i].status == ClosureStatus.Executed) {
                return true;
            }
        }
        return false;
    }
    
    // ============================================
    // NEW VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get remaining budget (budget minus distributed)
     * @return The remaining budget available for distribution
     */
    function getRemainingBudget() external view returns (uint256) {
        if (projectBudget >= totalDistributed) {
            return projectBudget - totalDistributed;
        }
        return 0;
    }
    
    /**
     * @notice Get current contract balance of OMTHB tokens
     * @return The current OMTHB token balance
     */
    function getContractBalance() external view returns (uint256) {
        return omthbToken.balanceOf(address(this));
    }
    
    /**
     * @notice Check if a request is abandoned (15+ days since last update without distribution)
     * @param requestId The request ID to check
     * @return True if the request is abandoned
     */
    function isRequestAbandoned(uint256 requestId) external view returns (bool) {
        ReimbursementRequest storage request = requests[requestId];
        
        // Request must exist
        if (request.id != requestId) return false;
        
        // Request must not be distributed or cancelled
        if (request.status == Status.Distributed || request.status == Status.Cancelled) return false;
        
        // Check if 15 days have passed since last update
        uint256 abandonmentPeriod = 15 days;
        return block.timestamp >= request.updatedAt + abandonmentPeriod;
    }
    
    /**
     * @notice Cancel an abandoned request (15+ days since last update)
     * @param requestId The request ID to cancel
     * @dev Can be called by anyone if request is abandoned
     */
    function cancelAbandonedRequest(uint256 requestId) external whenNotPaused nonReentrant {
        ReimbursementRequest storage request = requests[requestId];
        
        // Request must exist
        if (request.id != requestId) revert RequestNotFound();
        
        // Request must not be distributed or already cancelled
        if (request.status == Status.Distributed || request.status == Status.Cancelled) revert InvalidStatus();
        
        // Check if request is abandoned (15 days since last update)
        uint256 abandonmentPeriod = 15 days;
        if (block.timestamp < request.updatedAt + abandonmentPeriod) revert RequestNotAbandoned();
        
        // Mark as cancelled
        request.status = Status.Cancelled;
        request.updatedAt = block.timestamp;
        
        // Remove from active arrays
        _removeFromActiveRequests(requestId);
        
        emit RequestCancelled(requestId, msg.sender);
    }
}


// File contracts/ProjectFactory.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.20;

// Using Solidity 0.8+ with built-in overflow protection







/**
 * @title ProjectFactory
 * @notice Factory for deploying project reimbursement contracts with multi-sig closure
 * @dev Uses minimal proxy pattern (EIP-1167) for gas-efficient deployments
 */
contract ProjectFactory is AccessControl, ReentrancyGuard, Pausable {
    using SecurityLib for uint256;
    using SecurityLib for address[];
    using Clones for address;

    /// @notice Roles
    bytes32 public constant PROJECT_CREATOR_ROLE = keccak256("PROJECT_CREATOR_ROLE");
    bytes32 public constant DEPUTY_ROLE = keccak256("DEPUTY_ROLE");
    bytes32 public constant DIRECTOR_ROLE = keccak256("DIRECTOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    /// @notice Gas optimization constants
    uint256 public constant MAX_DEPUTIES = 10;
    uint256 public constant MAX_SIGNERS = 20;

    /// @notice Project closure request structure
    struct ClosureRequest {
        uint256 timestamp;
        address initiator;
        address[] signers;
        bool executed;
        mapping(address => bool) hasSigned;
    }

    /// @notice Project information
    struct ProjectInfo {
        string projectId;
        address projectContract;
        uint256 createdAt;
        bool isActive;
        address creator;
    }

    /// @notice State variables
    address public immutable projectImplementation;
    IOMTHB public immutable omthbToken;
    address public immutable metaTxForwarder;
    
    /// @notice Project tracking
    mapping(string => ProjectInfo) public projects;
    mapping(address => string[]) public projectsByCreator;
    string[] public allProjectIds;
    
    /// @notice Closure requests
    mapping(string => ClosureRequest) public closureRequests;
    
    /// @notice Deputy addresses (for multi-sig)
    address[] public deputies;
    mapping(address => bool) public isDeputy;
    
    /// @notice Configuration
    uint256 public constant CLOSURE_SIGNATURES_REQUIRED = 3; // 2 deputies + director
    uint256 public constant CLOSURE_TIMEOUT = 7 days;

    /// @notice Events
    event ProjectCreated(
        string indexed projectId,
        address indexed projectContract,
        address indexed creator,
        uint256 budget
    );
    
    event ClosureInitiated(string indexed projectId, address indexed initiator);
    event ClosureSigned(string indexed projectId, address indexed signer);
    event ProjectClosed(string indexed projectId, uint256 remainingBalance);
    event DeputyAdded(address indexed deputy);
    event DeputyRemoved(address indexed deputy);

    /// @notice Custom errors
    error ProjectExists();
    error ProjectNotFound();
    error InvalidAddress();
    error InvalidBudget();
    error AlreadySigned();
    error InsufficientSignatures();
    error ClosureTimeout();
    error NotActive();
    error UnauthorizedSigner();
    error TooManyDeputies();
    error InvalidProjectId();
    error ZeroAddress();
    error InsufficientAllowance();
    error InsufficientBalance();
    error TokenTransferFailed();

    /**
     * @notice Constructor
     * @param _projectImplementation Address of the ProjectReimbursement implementation
     * @param _omthbToken Address of the OMTHB token
     * @param _metaTxForwarder Address of the meta transaction forwarder
     * @param _admin Admin address
     */
    constructor(
        address _projectImplementation,
        address _omthbToken,
        address _metaTxForwarder,
        address _admin
    ) {
        if (_projectImplementation == address(0)) revert ZeroAddress();
        if (_omthbToken == address(0)) revert ZeroAddress();
        if (_metaTxForwarder == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        
        // Verify contracts exist
        if (_projectImplementation.code.length == 0) revert InvalidAddress();
        if (_omthbToken.code.length == 0) revert InvalidAddress();
        if (_metaTxForwarder.code.length == 0) revert InvalidAddress();
            
        projectImplementation = _projectImplementation;
        omthbToken = IOMTHB(_omthbToken);
        metaTxForwarder = _metaTxForwarder;
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(DIRECTOR_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
    }

    /**
     * @notice Create a new project with OMTHB token locking
     * @param projectId Unique project identifier
     * @param budget Initial project budget
     * @param projectAdmin Admin address for the project
     * @return projectAddress The deployed project contract address
     * @dev Project creator must approve Factory for exact budget amount before calling
     */
    function createProject(
        string calldata projectId,
        uint256 budget,
        address projectAdmin
    ) external onlyRole(PROJECT_CREATOR_ROLE) nonReentrant whenNotPaused returns (address) {
        // Enhanced validation
        if (bytes(projectId).length == 0) revert InvalidProjectId();
        if (bytes(projectId).length > 100) revert InvalidProjectId();
        if (projects[projectId].projectContract != address(0)) revert ProjectExists();
        if (projectAdmin == address(0)) revert ZeroAddress();
        if (budget == 0) revert InvalidBudget();
        if (budget > 10**9 * 10**18) revert InvalidBudget(); // Max 1 billion tokens
        
        // NEW: Check token allowance from creator
        uint256 allowance = omthbToken.allowance(msg.sender, address(this));
        if (allowance < budget) revert InsufficientAllowance();
        
        // NEW: Check creator's balance
        uint256 creatorBalance = omthbToken.balanceOf(msg.sender);
        if (creatorBalance < budget) revert InsufficientBalance();
        
        // Deploy minimal proxy
        address clone = projectImplementation.clone();
        
        // Initialize the project contract
        try ProjectReimbursement(clone).initialize(
            projectId,
            address(omthbToken),
            budget,
            projectAdmin
        ) {} catch Error(string memory reason) {
            revert(string(abi.encodePacked("Failed to initialize project: ", reason)));
        } catch (bytes memory) {
            revert("Failed to initialize project: Unknown error");
        }
        
        // CRITICAL FIX: Grant initial roles directly
        // The factory needs to set up initial roles for the project to function
        try ProjectReimbursement(clone).grantRoleDirect(
            keccak256("REQUESTER_ROLE"),
            projectAdmin
        ) {} catch {
            // Role might already be granted or function might not exist in older versions
        }
        
        // SECURITY FIX CRITICAL-1: Transfer OMTHB tokens with gas limit to prevent griefing
        // Using transferFrom with gas limit and comprehensive error handling
        bool transferSuccess = false;
        
        // Gas limit for token transfer to prevent griefing attacks
        // Standard ERC20 transfers should not use more than 100k gas
        uint256 gasLimit = 100000;
        
        // Attempt transfer with gas limit
        try omthbToken.transferFrom{gas: gasLimit}(msg.sender, clone, budget) returns (bool success) {
            transferSuccess = success;
        } catch Error(string memory reason) {
            // Provide detailed error information
            revert(string(abi.encodePacked("Token transfer failed: ", reason)));
        } catch (bytes memory lowLevelData) {
            // Handle low-level errors
            if (lowLevelData.length > 0) {
                // Bubble up the revert reason if available
                assembly {
                    let returndata_size := mload(lowLevelData)
                    revert(add(32, lowLevelData), returndata_size)
                }
            } else {
                revert TokenTransferFailed();
            }
        }
        
        if (!transferSuccess) {
            revert TokenTransferFailed();
        }
        
        // NEW: Verify the transfer was successful
        uint256 projectBalance = omthbToken.balanceOf(clone);
        if (projectBalance < budget) {
            revert TokenTransferFailed();
        }
        
        // Store project info
        projects[projectId] = ProjectInfo({
            projectId: projectId,
            projectContract: clone,
            createdAt: block.timestamp,
            isActive: true,
            creator: msg.sender
        });
        
        projectsByCreator[msg.sender].push(projectId);
        allProjectIds.push(projectId);
        
        emit ProjectCreated(projectId, clone, msg.sender, budget);
        
        return clone;
    }

    /**
     * @notice Initiate project closure (requires multi-sig)
     * @param projectId The project to close
     */
    function initiateProjectClosure(string calldata projectId) external {
        ProjectInfo storage project = projects[projectId];
        if (project.projectContract == address(0)) revert ProjectNotFound();
        if (!project.isActive) revert NotActive();
        
        // Only deputies or director can initiate
        if (!isDeputy[msg.sender] && !hasRole(DIRECTOR_ROLE, msg.sender)) {
            revert UnauthorizedSigner();
        }
        
        ClosureRequest storage request = closureRequests[projectId];
        request.timestamp = block.timestamp;
        request.initiator = msg.sender;
        request.executed = false;
        delete request.signers;
        
        // Add initiator as first signer
        request.signers.push(msg.sender);
        request.hasSigned[msg.sender] = true;
        
        emit ClosureInitiated(projectId, msg.sender);
    }

    /**
     * @notice Sign a closure request
     * @param projectId The project to sign closure for
     */
    function signClosureRequest(string calldata projectId) external {
        ProjectInfo storage project = projects[projectId];
        if (project.projectContract == address(0)) revert ProjectNotFound();
        if (!project.isActive) revert NotActive();
        
        // Only deputies or director can sign
        if (!isDeputy[msg.sender] && !hasRole(DIRECTOR_ROLE, msg.sender)) {
            revert UnauthorizedSigner();
        }
        
        ClosureRequest storage request = closureRequests[projectId];
        if (request.timestamp == 0) revert ProjectNotFound();
        if (request.executed) revert NotActive();
        if (request.hasSigned[msg.sender]) revert AlreadySigned();
        if (block.timestamp > request.timestamp + CLOSURE_TIMEOUT) revert ClosureTimeout();
        
        // Add signature
        require(request.signers.length < MAX_SIGNERS, "Max signers reached");
        request.signers.push(msg.sender);
        request.hasSigned[msg.sender] = true;
        
        emit ClosureSigned(projectId, msg.sender);
        
        // Check if we have enough signatures
        if (_hasRequiredSignatures(request)) {
            _executeProjectClosure(projectId);
        }
    }

    /**
     * @notice Add a deputy
     * @param deputy Address to add as deputy
     */
    function addDeputy(address deputy) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (deputy == address(0)) revert InvalidAddress();
        if (isDeputy[deputy]) return;
        require(deputies.length < MAX_DEPUTIES, "Max deputies reached");
        
        deputies.push(deputy);
        isDeputy[deputy] = true;
        _grantRole(DEPUTY_ROLE, deputy);
        
        emit DeputyAdded(deputy);
    }

    /**
     * @notice Remove a deputy
     * @param deputy Address to remove as deputy
     */
    function removeDeputy(address deputy) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!isDeputy[deputy]) return;
        
        isDeputy[deputy] = false;
        _revokeRole(DEPUTY_ROLE, deputy);
        
        // Remove from array
        for (uint256 i = 0; i < deputies.length; i++) {
            if (deputies[i] == deputy) {
                deputies[i] = deputies[deputies.length - 1];
                deputies.pop();
                break;
            }
        }
        
        emit DeputyRemoved(deputy);
    }

    /**
     * @notice Get all projects
     * @return Array of all project IDs
     */
    function getAllProjects() external view returns (string[] memory) {
        return allProjectIds;
    }

    /**
     * @notice Get projects by creator
     * @param creator The creator address
     * @return Array of project IDs
     */
    function getProjectsByCreator(address creator) external view returns (string[] memory) {
        return projectsByCreator[creator];
    }

    /**
     * @notice Get closure request signers
     * @param projectId The project ID
     * @return Array of signer addresses
     */
    function getClosureSigners(string calldata projectId) external view returns (address[] memory) {
        return closureRequests[projectId].signers;
    }

    /**
     * @notice Get all deputies
     * @return Array of deputy addresses
     */
    function getDeputies() external view returns (address[] memory) {
        return deputies;
    }

    /**
     * @notice Pause factory operations
     * @dev Only PAUSER_ROLE can pause
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause factory operations
     * @dev Only PAUSER_ROLE can unpause
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Check if closure has required signatures
     * @param request The closure request
     * @return bool Whether requirements are met
     */
    function _hasRequiredSignatures(ClosureRequest storage request) private view returns (bool) {
        uint256 deputyCount = 0;
        bool hasDirector = false;
        
        for (uint256 i = 0; i < request.signers.length; i++) {
            if (isDeputy[request.signers[i]]) {
                deputyCount++;
            }
            if (hasRole(DIRECTOR_ROLE, request.signers[i])) {
                hasDirector = true;
            }
        }
        
        // Need at least 2 deputies + director
        return deputyCount >= 2 && hasDirector;
    }

    /**
     * @notice Execute project closure
     * @param projectId The project to close
     * @dev Implements proper error handling for external calls
     */
    function _executeProjectClosure(string memory projectId) private {
        ProjectInfo storage project = projects[projectId];
        ClosureRequest storage request = closureRequests[projectId];
        
        // Get remaining balance from project contract
        ProjectReimbursement projectContract = ProjectReimbursement(project.projectContract);
        uint256 remainingBalance = omthbToken.balanceOf(address(projectContract));
        
        // CRITICAL FIX: Mark as closed FIRST (state changes before external calls)
        project.isActive = false;
        request.executed = true;
        
        // SECURITY FIX CRITICAL-1: Pause with gas limit to prevent griefing
        // Gas limit for pause operation to prevent malicious contracts from consuming all gas
        uint256 pauseGasLimit = 50000;
        
        // Attempt to pause with gas limit and comprehensive error handling
        try projectContract.pause{gas: pauseGasLimit}() {
            emit ProjectClosed(projectId, remainingBalance);
        } catch Error(string memory reason) {
            // Revert state changes on failure
            project.isActive = true;
            request.executed = false;
            revert(string(abi.encodePacked("Failed to pause project: ", reason)));
        } catch (bytes memory lowLevelData) {
            // Revert state changes on failure
            project.isActive = true;
            request.executed = false;
            
            // Handle low-level errors with proper error propagation
            if (lowLevelData.length > 0) {
                // Bubble up the revert reason if available
                assembly {
                    let returndata_size := mload(lowLevelData)
                    revert(add(32, lowLevelData), returndata_size)
                }
            } else {
                revert("Failed to pause project: Unknown error");
            }
        }
    }
}
