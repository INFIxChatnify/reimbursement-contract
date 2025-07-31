// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../ERC2771ContextUpgradeable.sol";

/**
 * @title OMTHBTokenV2
 * @notice Enhanced OMTHB token with meta transaction support
 * @dev Supports gasless transactions through ERC-2771
 */
contract OMTHBTokenV2 is 
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ERC2771ContextUpgradeable
{
    /// @notice Role identifiers
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BLACKLISTER_ROLE = keccak256("BLACKLISTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @notice Blacklisted addresses
    mapping(address => bool) private _blacklisted;

    /// @notice Storage gap for future upgrades
    uint256[49] private __gap;

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
     * @param trustedForwarder The trusted forwarder for meta transactions
     */
    function initialize(address defaultAdmin, address trustedForwarder) public initializer {
        if (defaultAdmin == address(0)) revert InvalidAddress();
        if (trustedForwarder == address(0)) revert InvalidAddress();
        
        __ERC20_init("OM Thai Baht", "OMTHB");
        __ERC20Burnable_init();
        __ERC20Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ERC2771Context_init(trustedForwarder);

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
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
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
    function blacklist(address account) public onlyRole(BLACKLISTER_ROLE) {
        if (account == address(0)) revert InvalidAddress();
        
        _blacklisted[account] = true;
        emit Blacklisted(account);
    }

    /**
     * @notice Remove an address from the blacklist
     * @param account The address to remove from blacklist
     */
    function unBlacklist(address account) public onlyRole(BLACKLISTER_ROLE) {
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
     * @notice Override _update to add blacklist check
     * @dev Called by all transfer functions
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        if (_blacklisted[from]) revert AccountBlacklisted(from);
        if (_blacklisted[to]) revert AccountBlacklisted(to);
        
        super._update(from, to, value);
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

    /**
     * @notice Override _msgSender to support meta transactions
     */
    function _msgSender() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (address) {
        return ERC2771ContextUpgradeable._msgSender();
    }

    /**
     * @notice Override _msgData to support meta transactions
     */
    function _msgData() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    /**
     * @notice Transfer tokens with meta transaction support
     * @param to The recipient address
     * @param value The amount to transfer
     * @return success Whether the transfer succeeded
     */
    function transfer(address to, uint256 value) public override returns (bool) {
        address owner = _msgSender();
        _transfer(owner, to, value);
        return true;
    }

    /**
     * @notice Transfer from with meta transaction support
     * @param from The sender address
     * @param to The recipient address
     * @param value The amount to transfer
     * @return success Whether the transfer succeeded
     */
    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, value);
        _transfer(from, to, value);
        return true;
    }

    /**
     * @notice Approve with meta transaction support
     * @param spender The spender address
     * @param value The amount to approve
     * @return success Whether the approval succeeded
     */
    function approve(address spender, uint256 value) public override returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, value);
        return true;
    }

    /**
     * @notice Burn tokens with meta transaction support
     * @param value The amount to burn
     */
    function burn(uint256 value) public override {
        _burn(_msgSender(), value);
    }

    /**
     * @notice Burn from with meta transaction support
     * @param account The account to burn from
     * @param value The amount to burn
     */
    function burnFrom(address account, uint256 value) public override {
        _spendAllowance(account, _msgSender(), value);
        _burn(account, value);
    }
}