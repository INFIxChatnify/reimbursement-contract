// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IOMTHBTokenV3
 * @notice Interface for OMTHB Token V3 with enhanced security features
 * @dev Includes timelock, emergency controls, and minting limits
 */
interface IOMTHBTokenV3 {
    /// @notice Timelock action types
    enum ActionType {
        ADD_MINTER,
        REMOVE_MINTER,
        ADD_PAUSER,
        REMOVE_PAUSER,
        SET_MINTING_LIMIT,
        SET_TIMELOCK_DELAY
    }

    /// @notice Timelock action structure
    struct TimelockAction {
        ActionType actionType;
        address target;
        uint256 value;
        uint256 executeTime;
        bool executed;
        bool cancelled;
    }

    /// @notice Minter information structure
    struct MinterInfo {
        bool isMinter;
        uint256 dailyLimit;
        uint256 dailyMinted;
        uint256 lastMintDay;
        uint256 totalMinted;
    }

    /// @notice Events
    event ActionScheduled(bytes32 indexed actionId, ActionType actionType, address target, uint256 value, uint256 executeTime);
    event ActionCancelled(bytes32 indexed actionId);
    event ActionExecuted(bytes32 indexed actionId);
    event EmergencyPause(address indexed guardian);
    event MinterRevoked(address indexed minter, address indexed guardian);
    event MintingLimitSet(address indexed minter, uint256 limit);
    event DailyLimitExceeded(address indexed minter, uint256 attempted, uint256 limit);
    event SuspiciousActivityDetected(address indexed minter, uint256 amount);
    event GuardianAdded(address indexed guardian);
    event GuardianRemoved(address indexed guardian);
    event TimelockDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event GlobalDailyLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event Minted(address indexed to, uint256 amount);
    event Blacklisted(address indexed account);
    event UnBlacklisted(address indexed account);
    event Whitelisted(address indexed account);
    event RemovedFromWhitelist(address indexed account);
    event WhitelistEnabledUpdated(bool enabled);
    event BatchWhitelisted(address[] accounts);

    /// @notice Custom errors
    error TimelockNotReady(bytes32 actionId, uint256 readyTime);
    error ActionAlreadyExecuted(bytes32 actionId);
    error ActionCancelledError(bytes32 actionId);
    error ActionNotFound(bytes32 actionId);
    error DailyLimitExceededError(address minter, uint256 requested, uint256 limit);
    error GlobalDailyLimitExceeded(uint256 requested, uint256 limit);
    error NotGuardian(address caller);
    error InvalidTimelockDelay();
    error InvalidMintingLimit();
    error MinterAlreadyExists(address minter);
    error MinterDoesNotExist(address minter);
    error SuspiciousAmount(uint256 amount);
    error ZeroAddress();
    error ZeroAmount();
    error InvalidAddress();
    error InvalidAmount();
    error AccountBlacklisted(address account);
    error AccountNotWhitelisted(address account);
    error WhitelistNotEnabled();

    /// @notice Guardian functions
    function addGuardian(address guardian) external;
    function removeGuardian(address guardian) external;
    function isGuardian(address account) external view returns (bool);
    function getGuardianCount() external view returns (uint256);
    function getGuardianAt(uint256 index) external view returns (address);
    function emergencyPause() external;
    function emergencyRevokeMinter(address minter) external;

    /// @notice Timelock functions
    function scheduleAddMinter(address minter, uint256 dailyLimit) external returns (bytes32);
    function scheduleRemoveMinter(address minter) external returns (bytes32);
    function scheduleSetMintingLimit(address minter, uint256 newLimit) external returns (bytes32);
    function scheduleSetTimelockDelay(uint256 newDelay) external returns (bytes32);
    function executeAction(bytes32 actionId) external;
    function cancelAction(bytes32 actionId) external;
    function getActionInfo(bytes32 actionId) external view returns (TimelockAction memory);
    function getTimeRemaining(bytes32 actionId) external view returns (uint256);
    function getPendingActions() external view returns (bytes32[] memory);

    /// @notice Minter management functions
    function getMinterInfo(address minter) external view returns (MinterInfo memory);
    function getMinterCount() external view returns (uint256);
    function getMinterAt(uint256 index) external view returns (address);
    function getAllMinters() external view returns (address[] memory);
    function setMinterDailyLimit(address minter, uint256 limit) external;
    
    /// @notice Minting limit functions
    function getGlobalDailyLimit() external view returns (uint256);
    function getGlobalDailyMinted() external view returns (uint256);
    function setGlobalDailyLimit(uint256 limit) external;
    function getRemainingDailyLimit(address minter) external view returns (uint256);
    function getRemainingGlobalDailyLimit() external view returns (uint256);

    /// @notice Configuration functions
    function getTimelockDelay() external view returns (uint256);
    function getSuspiciousAmountThreshold() external view returns (uint256);
    function setSuspiciousAmountThreshold(uint256 threshold) external;

    /// @notice Whitelist functions
    function whitelist(address account) external;
    function removeFromWhitelist(address account) external;
    function batchWhitelist(address[] calldata accounts) external;
    function isWhitelisted(address account) external view returns (bool);
    function getWhitelistTimestamp(address account) external view returns (uint256);
    function setWhitelistEnabled(bool enabled) external;
    function isWhitelistEnabled() external view returns (bool);
    
    /// @notice Blacklist functions  
    function blacklist(address account) external;
    function unBlacklist(address account) external;
    function isBlacklisted(address account) external view returns (bool);
}
