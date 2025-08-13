// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "../base/AdminProtectedAccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../ERC2771ContextUpgradeable.sol";
import "../interfaces/IOMTHBTokenV3.sol";

/**
 * @title OMTHBTokenV3
 * @notice Enhanced OMTHB token with advanced security features
 * @dev Includes timelock, emergency controls, minting limits, and comprehensive security
 * @custom:security-contact security@omthb.com
 * @custom:oz-upgrades-unsafe-allow constructor
 */
contract OMTHBTokenV3 is 
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PausableUpgradeable,
    AdminProtectedAccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    ERC2771ContextUpgradeable,
    IOMTHBTokenV3
{
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /// @notice Role identifiers
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BLACKLISTER_ROLE = keccak256("BLACKLISTER_ROLE");
    bytes32 public constant WHITELISTER_ROLE = keccak256("WHITELISTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant TIMELOCK_ADMIN_ROLE = keccak256("TIMELOCK_ADMIN_ROLE");

    /// @notice Constants
    uint256 private constant MIN_TIMELOCK_DELAY = 1 days;
    uint256 private constant MAX_TIMELOCK_DELAY = 7 days;
    uint256 private constant SUSPICIOUS_AMOUNT_MULTIPLIER = 10;

    /// @notice Blacklisted addresses
    mapping(address => bool) private _blacklisted;

    /// @notice Whitelisted addresses
    mapping(address => bool) private _whitelisted;
    
    /// @notice Whitelist mode enabled flag
    bool private _whitelistEnabled;
    
    /// @notice Track whitelist status with timestamp
    mapping(address => uint256) private _whitelistTimestamp;

    /// @notice Minter information
    mapping(address => MinterInfo) private _minterInfo;
    EnumerableSet.AddressSet private _minters;

    /// @notice Guardian addresses
    EnumerableSet.AddressSet private _guardians;

    /// @notice Timelock configuration
    uint256 private _timelockDelay;
    mapping(bytes32 => TimelockAction) private _timelockActions;
    EnumerableSet.Bytes32Set private _pendingActions;

    /// @notice Global minting limits
    uint256 private _globalDailyLimit;
    uint256 private _globalDailyMinted;
    uint256 private _lastGlobalMintDay;

    /// @notice Suspicious activity threshold
    uint256 private _suspiciousAmountThreshold;

    /// @notice Action counter for unique IDs
    uint256 private _actionCounter;

    /// @notice Storage gap for future upgrades (reduced to accommodate new variables)
    uint256[32] private __gap;

    /// @notice Modifiers
    modifier onlyGuardian() {
        if (!hasRole(GUARDIAN_ROLE, _msgSender())) revert NotGuardian(_msgSender());
        _;
    }

    modifier notBlacklisted(address account) {
        if (_blacklisted[account]) revert AccountBlacklisted(account);
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract V3
     * @dev This function should be called when upgrading from V2 to V3
     * @param timelockDelay Initial timelock delay (must be between MIN and MAX)
     * @param globalDailyLimit Initial global daily minting limit
     * @param suspiciousThreshold Initial suspicious amount threshold
     * @custom:oz-upgrades-validate-as-initializer
     */
    function initializeV3(
        uint256 timelockDelay,
        uint256 globalDailyLimit,
        uint256 suspiciousThreshold
    ) public reinitializer(3) {
        if (timelockDelay < MIN_TIMELOCK_DELAY || timelockDelay > MAX_TIMELOCK_DELAY) {
            revert InvalidTimelockDelay();
        }
        if (globalDailyLimit == 0) revert InvalidMintingLimit();
        if (suspiciousThreshold == 0) revert SuspiciousAmount(0);

        __ERC20_init("OMTHB Token", "OMTHB");
        __ReentrancyGuard_init();
        __ERC2771Context_init(address(0));

        _timelockDelay = timelockDelay;
        _globalDailyLimit = globalDailyLimit;
        _suspiciousAmountThreshold = suspiciousThreshold;

        // Set up role admin relationships
        _setRoleAdmin(GUARDIAN_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(TIMELOCK_ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
    }

    /**
     * @notice Initialize whitelist feature V4
     * @dev This function should be called when upgrading to add whitelist functionality
     * @param enableWhitelist Whether to enable whitelist mode initially
     * @custom:oz-upgrades-validate-as-initializer
     */
    function initializeWhitelist(bool enableWhitelist) public reinitializer(4) {
        _whitelistEnabled = enableWhitelist;
        
        // Set up role admin for whitelister
        _setRoleAdmin(WHITELISTER_ROLE, DEFAULT_ADMIN_ROLE);
        
        emit WhitelistEnabledUpdated(enableWhitelist);
    }

    // ========== MINTING FUNCTIONS ==========

    /**
     * @notice Mint new tokens with enhanced security checks
     * @param to The address to mint tokens to
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) public nonReentrant onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        
        address minter = _msgSender();
        
        // Check suspicious amount
        if (amount > _suspiciousAmountThreshold) {
            emit SuspiciousActivityDetected(minter, amount);
            _pause(); // Auto-pause on suspicious activity
            revert SuspiciousAmount(amount);
        }

        // Update and check daily limits
        _updateDailyLimits(minter, amount);

        _mint(to, amount);
        emit Minted(to, amount);
    }

    /**
     * @notice Update and check daily minting limits
     * @param minter The minter address
     * @param amount The amount to mint
     */
    function _updateDailyLimits(address minter, uint256 amount) private {
        uint256 currentDay = block.timestamp / 1 days;
        MinterInfo storage info = _minterInfo[minter];

        // Reset daily counters if new day
        if (currentDay > info.lastMintDay) {
            info.dailyMinted = 0;
            info.lastMintDay = currentDay;
        }

        if (currentDay > _lastGlobalMintDay) {
            _globalDailyMinted = 0;
            _lastGlobalMintDay = currentDay;
        }

        // Check minter daily limit
        if (info.dailyLimit > 0) {
            if (info.dailyMinted + amount > info.dailyLimit) {
                emit DailyLimitExceeded(minter, info.dailyMinted + amount, info.dailyLimit);
                revert DailyLimitExceededError(minter, info.dailyMinted + amount, info.dailyLimit);
            }
        }

        // Check global daily limit
        if (_globalDailyMinted + amount > _globalDailyLimit) {
            revert GlobalDailyLimitExceeded(_globalDailyMinted + amount, _globalDailyLimit);
        }

        // Update counters
        info.dailyMinted += amount;
        info.totalMinted += amount;
        _globalDailyMinted += amount;
    }

    // ========== GUARDIAN FUNCTIONS ==========

    /**
     * @notice Emergency pause by guardian
     * @dev Can be called immediately without timelock
     */
    function emergencyPause() external onlyGuardian {
        _pause();
        emit EmergencyPause(_msgSender());
    }

    /**
     * @notice Emergency revoke minter by guardian
     * @param minter The minter to revoke
     * @dev Can be called immediately without timelock
     */
    function emergencyRevokeMinter(address minter) external onlyGuardian {
        if (!hasRole(MINTER_ROLE, minter)) revert MinterDoesNotExist(minter);
        
        _revokeRole(MINTER_ROLE, minter);
        _minters.remove(minter);
        delete _minterInfo[minter];
        
        emit MinterRevoked(minter, _msgSender());
    }


    /**
     * @notice Add a guardian
     * @param guardian The address to add as guardian
     */
    function addGuardian(address guardian) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (guardian == address(0)) revert ZeroAddress();
        
        _grantRole(GUARDIAN_ROLE, guardian);
        _guardians.add(guardian);
        emit GuardianAdded(guardian);
    }

    /**
     * @notice Remove a guardian
     * @param guardian The guardian to remove
     */
    function removeGuardian(address guardian) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(GUARDIAN_ROLE, guardian);
        _guardians.remove(guardian);
        emit GuardianRemoved(guardian);
    }

    // ========== TIMELOCK FUNCTIONS ==========

    /**
     * @notice Schedule adding a new minter
     * @param minter The address to add as minter
     * @param dailyLimit The daily minting limit for this minter
     * @return actionId The unique action identifier
     */
    function scheduleAddMinter(address minter, uint256 dailyLimit) 
        external 
        onlyRole(TIMELOCK_ADMIN_ROLE) 
        returns (bytes32) 
    {
        if (minter == address(0)) revert ZeroAddress();
        if (hasRole(MINTER_ROLE, minter)) revert MinterAlreadyExists(minter);
        
        bytes32 actionId = _scheduleAction(ActionType.ADD_MINTER, minter, dailyLimit);
        return actionId;
    }

    /**
     * @notice Schedule removing a minter
     * @param minter The minter to remove
     * @return actionId The unique action identifier
     */
    function scheduleRemoveMinter(address minter) 
        external 
        onlyRole(TIMELOCK_ADMIN_ROLE) 
        returns (bytes32) 
    {
        if (!hasRole(MINTER_ROLE, minter)) revert MinterDoesNotExist(minter);
        
        bytes32 actionId = _scheduleAction(ActionType.REMOVE_MINTER, minter, 0);
        return actionId;
    }

    /**
     * @notice Schedule setting minting limit
     * @param minter The minter address
     * @param newLimit The new daily limit
     * @return actionId The unique action identifier
     */
    function scheduleSetMintingLimit(address minter, uint256 newLimit) 
        external 
        onlyRole(TIMELOCK_ADMIN_ROLE) 
        returns (bytes32) 
    {
        if (!hasRole(MINTER_ROLE, minter)) revert MinterDoesNotExist(minter);
        
        bytes32 actionId = _scheduleAction(ActionType.SET_MINTING_LIMIT, minter, newLimit);
        return actionId;
    }

    /**
     * @notice Schedule setting timelock delay
     * @param newDelay The new timelock delay
     * @return actionId The unique action identifier
     */
    function scheduleSetTimelockDelay(uint256 newDelay) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
        returns (bytes32) 
    {
        if (newDelay < MIN_TIMELOCK_DELAY || newDelay > MAX_TIMELOCK_DELAY) {
            revert InvalidTimelockDelay();
        }
        
        bytes32 actionId = _scheduleAction(ActionType.SET_TIMELOCK_DELAY, address(0), newDelay);
        return actionId;
    }

    /**
     * @notice Internal function to schedule an action
     * @param actionType The type of action
     * @param target The target address
     * @param value The value associated with the action
     * @return actionId The unique action identifier
     */
    function _scheduleAction(ActionType actionType, address target, uint256 value) 
        private 
        returns (bytes32) 
    {
        _actionCounter++;
        bytes32 actionId = keccak256(abi.encode(actionType, target, value, _actionCounter));
        
        uint256 executeTime = block.timestamp + _timelockDelay;
        
        _timelockActions[actionId] = TimelockAction({
            actionType: actionType,
            target: target,
            value: value,
            executeTime: executeTime,
            executed: false,
            cancelled: false
        });
        
        _pendingActions.add(actionId);
        
        emit ActionScheduled(actionId, actionType, target, value, executeTime);
        return actionId;
    }

    /**
     * @notice Execute a scheduled action
     * @param actionId The action to execute
     */
    function executeAction(bytes32 actionId) external nonReentrant {
        TimelockAction storage action = _timelockActions[actionId];
        
        if (action.executeTime == 0) revert ActionNotFound(actionId);
        if (action.executed) revert ActionAlreadyExecuted(actionId);
        if (action.cancelled) revert ActionCancelledError(actionId);
        if (block.timestamp < action.executeTime) {
            revert TimelockNotReady(actionId, action.executeTime);
        }

        action.executed = true;
        _pendingActions.remove(actionId);

        // Execute based on action type
        if (action.actionType == ActionType.ADD_MINTER) {
            _grantRole(MINTER_ROLE, action.target);
            _minters.add(action.target);
            _minterInfo[action.target] = MinterInfo({
                isMinter: true,
                dailyLimit: action.value,
                dailyMinted: 0,
                lastMintDay: 0,
                totalMinted: 0
            });
            emit MintingLimitSet(action.target, action.value);
        } else if (action.actionType == ActionType.REMOVE_MINTER) {
            _revokeRole(MINTER_ROLE, action.target);
            _minters.remove(action.target);
            delete _minterInfo[action.target];
        } else if (action.actionType == ActionType.SET_MINTING_LIMIT) {
            _minterInfo[action.target].dailyLimit = action.value;
            emit MintingLimitSet(action.target, action.value);
        } else if (action.actionType == ActionType.SET_TIMELOCK_DELAY) {
            uint256 oldDelay = _timelockDelay;
            _timelockDelay = action.value;
            emit TimelockDelayUpdated(oldDelay, action.value);
        }

        emit ActionExecuted(actionId);
    }

    /**
     * @notice Cancel a scheduled action
     * @param actionId The action to cancel
     */
    function cancelAction(bytes32 actionId) external onlyRole(TIMELOCK_ADMIN_ROLE) {
        TimelockAction storage action = _timelockActions[actionId];
        
        if (action.executeTime == 0) revert ActionNotFound(actionId);
        if (action.executed) revert ActionAlreadyExecuted(actionId);
        if (action.cancelled) revert ActionCancelledError(actionId);

        action.cancelled = true;
        _pendingActions.remove(actionId);

        emit ActionCancelled(actionId);
    }

    // ========== VIEW FUNCTIONS ==========

    /**
     * @notice Get minter information
     * @param minter The minter address
     * @return MinterInfo structure
     */
    function getMinterInfo(address minter) external view returns (MinterInfo memory) {
        return _minterInfo[minter];
    }

    /**
     * @notice Get total number of minters
     * @return The number of minters
     */
    function getMinterCount() external view returns (uint256) {
        return _minters.length();
    }

    /**
     * @notice Get minter at specific index
     * @param index The index
     * @return The minter address
     */
    function getMinterAt(uint256 index) external view returns (address) {
        return _minters.at(index);
    }

    /**
     * @notice Get all minters
     * @return Array of minter addresses
     */
    function getAllMinters() external view returns (address[] memory) {
        return _minters.values();
    }

    /**
     * @notice Check if address is guardian
     * @param account The address to check
     * @return True if guardian
     */
    function isGuardian(address account) external view returns (bool) {
        return hasRole(GUARDIAN_ROLE, account);
    }

    /**
     * @notice Get guardian count
     * @return The number of guardians
     */
    function getGuardianCount() external view returns (uint256) {
        return _guardians.length();
    }

    /**
     * @notice Get guardian at index
     * @param index The index
     * @return The guardian address
     */
    function getGuardianAt(uint256 index) external view returns (address) {
        return _guardians.at(index);
    }

    /**
     * @notice Get action information
     * @param actionId The action identifier
     * @return The timelock action
     */
    function getActionInfo(bytes32 actionId) external view returns (TimelockAction memory) {
        return _timelockActions[actionId];
    }

    /**
     * @notice Get time remaining for action
     * @param actionId The action identifier
     * @return Time in seconds until action can be executed
     */
    function getTimeRemaining(bytes32 actionId) external view returns (uint256) {
        TimelockAction storage action = _timelockActions[actionId];
        if (action.executeTime == 0 || action.executed || action.cancelled) return 0;
        if (block.timestamp >= action.executeTime) return 0;
        return action.executeTime - block.timestamp;
    }

    /**
     * @notice Get all pending actions
     * @return Array of action IDs
     */
    function getPendingActions() external view returns (bytes32[] memory) {
        return _pendingActions.values();
    }

    /**
     * @notice Get timelock delay
     * @return The current timelock delay
     */
    function getTimelockDelay() external view returns (uint256) {
        return _timelockDelay;
    }

    /**
     * @notice Get global daily limit
     * @return The global daily minting limit
     */
    function getGlobalDailyLimit() external view returns (uint256) {
        return _globalDailyLimit;
    }

    /**
     * @notice Get global daily minted amount
     * @return The amount minted globally today
     */
    function getGlobalDailyMinted() external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay > _lastGlobalMintDay) {
            return 0;
        }
        return _globalDailyMinted;
    }

    /**
     * @notice Get suspicious amount threshold
     * @return The threshold amount
     */
    function getSuspiciousAmountThreshold() external view returns (uint256) {
        return _suspiciousAmountThreshold;
    }

    /**
     * @notice Get remaining daily limit for minter
     * @param minter The minter address
     * @return The remaining amount
     */
    function getRemainingDailyLimit(address minter) external view returns (uint256) {
        MinterInfo storage info = _minterInfo[minter];
        if (info.dailyLimit == 0) return type(uint256).max;
        
        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay > info.lastMintDay) {
            return info.dailyLimit;
        }
        
        if (info.dailyMinted >= info.dailyLimit) return 0;
        return info.dailyLimit - info.dailyMinted;
    }

    /**
     * @notice Get remaining global daily limit
     * @return The remaining amount
     */
    function getRemainingGlobalDailyLimit() external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay > _lastGlobalMintDay) {
            return _globalDailyLimit;
        }
        
        if (_globalDailyMinted >= _globalDailyLimit) return 0;
        return _globalDailyLimit - _globalDailyMinted;
    }

    // ========== ADMIN FUNCTIONS ==========

    /**
     * @notice Set minter daily limit (immediate, admin only)
     * @param minter The minter address
     * @param limit The new limit
     */
    function setMinterDailyLimit(address minter, uint256 limit) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        if (!hasRole(MINTER_ROLE, minter)) revert MinterDoesNotExist(minter);
        
        _minterInfo[minter].dailyLimit = limit;
        emit MintingLimitSet(minter, limit);
    }

    /**
     * @notice Set global daily limit
     * @param limit The new global limit
     */
    function setGlobalDailyLimit(uint256 limit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (limit == 0) revert InvalidMintingLimit();
        
        uint256 oldLimit = _globalDailyLimit;
        _globalDailyLimit = limit;
        emit GlobalDailyLimitUpdated(oldLimit, limit);
    }

    /**
     * @notice Set suspicious amount threshold
     * @param threshold The new threshold
     */
    function setSuspiciousAmountThreshold(uint256 threshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (threshold == 0) revert SuspiciousAmount(0);
        _suspiciousAmountThreshold = threshold;
    }

    // ========== EXISTING V2 FUNCTIONS ==========

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

    // ========== WHITELIST FUNCTIONS ==========

    /**
     * @notice Add an address to the whitelist
     * @param account The address to whitelist
     */
    function whitelist(address account) public onlyRole(WHITELISTER_ROLE) {
        if (account == address(0)) revert InvalidAddress();
        
        _whitelisted[account] = true;
        _whitelistTimestamp[account] = block.timestamp;
        emit Whitelisted(account);
    }

    /**
     * @notice Remove an address from the whitelist
     * @param account The address to remove from whitelist
     */
    function removeFromWhitelist(address account) public onlyRole(WHITELISTER_ROLE) {
        if (account == address(0)) revert InvalidAddress();
        
        _whitelisted[account] = false;
        delete _whitelistTimestamp[account];
        emit RemovedFromWhitelist(account);
    }

    /**
     * @notice Batch whitelist multiple addresses
     * @param accounts Array of addresses to whitelist
     */
    function batchWhitelist(address[] calldata accounts) public onlyRole(WHITELISTER_ROLE) {
        uint256 length = accounts.length;
        for (uint256 i = 0; i < length; ) {
            address account = accounts[i];
            if (account != address(0)) {
                _whitelisted[account] = true;
                _whitelistTimestamp[account] = block.timestamp;
            }
            unchecked { ++i; }
        }
        emit BatchWhitelisted(accounts);
    }

    /**
     * @notice Check if an address is whitelisted
     * @param account The address to check
     * @return bool True if the address is whitelisted
     */
    function isWhitelisted(address account) public view returns (bool) {
        return _whitelisted[account];
    }

    /**
     * @notice Get whitelist timestamp for an address
     * @param account The address to check
     * @return timestamp When the address was whitelisted (0 if not whitelisted)
     */
    function getWhitelistTimestamp(address account) public view returns (uint256) {
        return _whitelistTimestamp[account];
    }

    /**
     * @notice Enable or disable whitelist mode
     * @param enabled Whether to enable whitelist mode
     */
    function setWhitelistEnabled(bool enabled) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _whitelistEnabled = enabled;
        emit WhitelistEnabledUpdated(enabled);
    }

    /**
     * @notice Check if whitelist mode is enabled
     * @return bool True if whitelist mode is enabled
     */
    function isWhitelistEnabled() public view returns (bool) {
        return _whitelistEnabled;
    }

    /**
     * @notice Override _update to add blacklist and whitelist checks
     * @dev Called by all transfer functions
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        // Check blacklist
        if (_blacklisted[from]) revert AccountBlacklisted(from);
        if (_blacklisted[to]) revert AccountBlacklisted(to);
        
        // Check whitelist if enabled
        if (_whitelistEnabled) {
            // Minting: Only check 'to' address
            if (from == address(0)) {
                if (!_whitelisted[to]) revert AccountNotWhitelisted(to);
            }
            // Burning: Only check 'from' address
            else if (to == address(0)) {
                if (!_whitelisted[from]) revert AccountNotWhitelisted(from);
            }
            // Regular transfer: Check both addresses
            else {
                if (!_whitelisted[from]) revert AccountNotWhitelisted(from);
                if (!_whitelisted[to]) revert AccountNotWhitelisted(to);
            }
        }
        
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
