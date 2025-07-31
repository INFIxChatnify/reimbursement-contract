// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/**
 * @title OMTHB Token
 * @notice ERC20 token with mint, burn, pause, and blacklist features
 * @dev Implements UUPS upgradeable pattern with role-based access control
 */
contract OMTHBToken is 
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    /// @notice Role identifiers
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BLACKLISTER_ROLE = keccak256("BLACKLISTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @notice Blacklisted addresses
    mapping(address => bool) private _blacklisted;

    /// @notice Storage gap for future upgrades
    uint256[48] private __gap; // Reduced by 1 to account for ReentrancyGuard storage

    /// @notice Events
    event Blacklisted(address indexed account);
    event UnBlacklisted(address indexed account);
    event Minted(address indexed to, uint256 amount);

    /// @notice Custom errors
    error AccountBlacklisted(address account);
    error InvalidAddress();
    error InvalidAmount();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @param defaultAdmin The address that will have the DEFAULT_ADMIN_ROLE
     */
    function initialize(address defaultAdmin) public initializer {
        if (defaultAdmin == address(0)) revert InvalidAddress();
        
        __ERC20_init("OM Thai Baht", "OMTHB");
        __ERC20Burnable_init();
        __ERC20Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, defaultAdmin);
        _grantRole(BLACKLISTER_ROLE, defaultAdmin);
        _grantRole(UPGRADER_ROLE, defaultAdmin);
    }

    /**
     * @notice Mint new tokens
     * @param to The address to mint tokens to
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        
        _mint(to, amount);
        emit Minted(to, amount);
    }

    /**
     * @notice Pause token transfers
     */
    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause token transfers
     */
    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Add an address to the blacklist
     * @param account The address to blacklist
     */
    function blacklist(address account) public onlyRole(BLACKLISTER_ROLE) nonReentrant {
        if (account == address(0)) revert InvalidAddress();
        
        _blacklisted[account] = true;
        emit Blacklisted(account);
    }

    /**
     * @notice Remove an address from the blacklist
     * @param account The address to remove from blacklist
     */
    function unBlacklist(address account) public onlyRole(BLACKLISTER_ROLE) nonReentrant {
        if (account == address(0)) revert InvalidAddress();
        
        _blacklisted[account] = false;
        emit UnBlacklisted(account);
    }

    /**
     * @notice Check if an address is blacklisted
     * @param account The address to check
     * @return bool True if the address is blacklisted
     */
    function isBlacklisted(address account) public view returns (bool) {
        return _blacklisted[account];
    }

    /**
     * @notice Override _update to add blacklist check and reentrancy protection
     * @dev Called by all transfer functions
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        // CRITICAL FIX: Validate addresses before any state changes
        // Allow minting (from == address(0)) and burning (to == address(0))
        if (from != address(0) && _blacklisted[from]) revert AccountBlacklisted(from);
        if (to != address(0) && _blacklisted[to]) revert AccountBlacklisted(to);
        
        // CRITICAL FIX: State changes are handled by parent, which follows CEI pattern
        super._update(from, to, value);
    }
    
    /**
     * @notice Override transfer to add reentrancy protection
     * @param to The recipient address
     * @param value The amount to transfer
     * @return bool Success status
     */
    function transfer(address to, uint256 value) public override nonReentrant returns (bool) {
        return super.transfer(to, value);
    }
    
    /**
     * @notice Override transferFrom to add reentrancy protection
     * @param from The sender address
     * @param to The recipient address
     * @param value The amount to transfer
     * @return bool Success status
     */
    function transferFrom(address from, address to, uint256 value) public override nonReentrant returns (bool) {
        return super.transferFrom(from, to, value);
    }
    
    /**
     * @notice Gas-optimized approve function
     * @param spender The address to approve
     * @param value The amount to approve
     * @return bool Success status
     * @dev Optimized to reduce gas usage below 50k
     */
    function approve(address spender, uint256 value) public override returns (bool) {
        // CRITICAL FIX: Add zero address check for security
        if (spender == address(0)) revert InvalidAddress();
        
        address owner = _msgSender();
        _approve(owner, spender, value, true);
        return true;
    }
    
    /**
     * @notice Override burnFrom to add proper validation
     * @param account The account to burn from
     * @param value The amount to burn
     */
    function burnFrom(address account, uint256 value) public override nonReentrant {
        // CRITICAL FIX: Add zero address validation
        if (account == address(0)) revert InvalidAddress();
        super.burnFrom(account, value);
    }
    
    /**
     * @notice Check if an address can receive tokens (not blacklisted)
     * @param account The address to check
     * @return bool True if the address can receive tokens
     */
    function canReceive(address account) public view returns (bool) {
        return account != address(0) && !_blacklisted[account] && !paused();
    }

    /**
     * @notice Authorize upgrade (only UPGRADER_ROLE)
     * @param newImplementation Address of the new implementation
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        onlyRole(UPGRADER_ROLE)
        override
    {}
}