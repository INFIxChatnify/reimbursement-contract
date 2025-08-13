// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./base/AdminProtectedAccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title GasTank
 * @notice Manages gas credits and refunds for meta transactions
 * @dev Holds native tokens (OM) to pay for gas on behalf of users
 */
contract GasTank is AdminProtectedAccessControl, ReentrancyGuard, Pausable {
    /// @notice Role identifiers
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    
    /// @notice Gas credit structure per user/project
    struct GasCredit {
        uint256 totalDeposited;
        uint256 totalUsed;
        uint256 maxPerTransaction;
        uint256 dailyLimit;
        uint256 dailyUsed;
        uint256 lastResetTime;
        bool isActive;
    }
    
    /// @notice Gas usage tracking
    struct GasUsage {
        uint256 gasUsed;
        uint256 gasPrice;
        uint256 cost;
        uint256 timestamp;
        address relayer;
        bytes32 txHash;
    }
    
    /// @notice Relayer statistics
    struct RelayerStats {
        uint256 totalRefunded;
        uint256 pendingRefund;
        uint256 lastRefundTime;
        uint256 transactionCount;
    }
    
    /// @notice Gas credits per user/project
    mapping(address => GasCredit) public gasCredits;
    
    /// @notice Gas usage history
    mapping(address => GasUsage[]) public gasUsageHistory;
    
    /// @notice Relayer statistics
    mapping(address => RelayerStats) public relayerStats;
    
    /// @notice Global gas price limits
    uint256 public maxGasPrice = 500 gwei;
    uint256 public baseGasOverhead = 21000; // Base transaction cost
    uint256 public gasRefundBuffer = 10; // 10% buffer for gas estimation
    
    /// @notice Emergency withdrawal address
    address public emergencyWithdrawAddress;
    
    /// @notice Total gas tank balance tracking
    uint256 public totalDeposited;
    uint256 public totalRefunded;
    
    /// @notice Events
    event GasCreditDeposited(address indexed account, uint256 amount);
    event GasCreditWithdrawn(address indexed account, uint256 amount);
    event GasRefunded(address indexed relayer, address indexed user, uint256 amount, bytes32 txHash);
    event GasCreditUpdated(address indexed account, uint256 maxPerTx, uint256 dailyLimit);
    event GasUsageRecorded(address indexed user, uint256 gasUsed, uint256 cost);
    event EmergencyWithdrawal(address indexed to, uint256 amount);
    event MaxGasPriceUpdated(uint256 oldPrice, uint256 newPrice);
    
    /// @notice Custom errors
    error InsufficientGasCredit();
    error InvalidAmount();
    error InvalidAddress();
    error GasPriceTooHigh();
    error DailyLimitExceeded();
    error TransactionLimitExceeded();
    error UnauthorizedRelayer();
    error InvalidGasUsage();
    error RefundFailed();
    error CreditNotActive();
    
    constructor(address _admin, address _emergencyWithdrawAddress) {
        if (_admin == address(0) || _emergencyWithdrawAddress == address(0)) {
            revert InvalidAddress();
        }
        
        _initializeAdmin(_admin);
        _grantRole(OPERATOR_ROLE, _admin);
        emergencyWithdrawAddress = _emergencyWithdrawAddress;
    }
    
    
    /**
     * @notice Deposit gas credits for an account
     * @param account The account to deposit for
     */
    function depositGasCredit(address account) external payable nonReentrant {
        if (account == address(0)) revert InvalidAddress();
        if (msg.value == 0) revert InvalidAmount();
        
        GasCredit storage credit = gasCredits[account];
        credit.totalDeposited += msg.value;
        credit.isActive = true;
        
        // Set default limits if not set
        if (credit.maxPerTransaction == 0) {
            credit.maxPerTransaction = 0.1 ether; // 0.1 OM
        }
        if (credit.dailyLimit == 0) {
            credit.dailyLimit = 1 ether; // 1 OM
        }
        
        totalDeposited += msg.value;
        
        emit GasCreditDeposited(account, msg.value);
    }
    
    /**
     * @notice Update gas credit limits for an account
     * @param account The account to update
     * @param maxPerTx Maximum gas credit per transaction
     * @param dailyLimit Maximum gas credit per day
     */
    function updateGasCredit(
        address account,
        uint256 maxPerTx,
        uint256 dailyLimit
    ) external onlyRole(OPERATOR_ROLE) {
        if (account == address(0)) revert InvalidAddress();
        
        GasCredit storage credit = gasCredits[account];
        credit.maxPerTransaction = maxPerTx;
        credit.dailyLimit = dailyLimit;
        
        emit GasCreditUpdated(account, maxPerTx, dailyLimit);
    }
    
    /**
     * @notice Request gas refund for a meta transaction
     * @param user The user who initiated the meta transaction
     * @param gasUsed The amount of gas used
     * @param gasPrice The gas price used
     * @param txHash The transaction hash for verification
     */
    function requestGasRefund(
        address user,
        uint256 gasUsed,
        uint256 gasPrice,
        bytes32 txHash
    ) external nonReentrant onlyRole(RELAYER_ROLE) {
        if (user == address(0)) revert InvalidAddress();
        if (gasUsed == 0) revert InvalidGasUsage();
        if (gasPrice > maxGasPrice) revert GasPriceTooHigh();
        
        GasCredit storage credit = gasCredits[user];
        if (!credit.isActive) revert CreditNotActive();
        
        // Reset daily limit if needed
        if (block.timestamp >= credit.lastResetTime + 1 days) {
            credit.dailyUsed = 0;
            credit.lastResetTime = block.timestamp;
        }
        
        // Calculate refund amount with buffer
        uint256 totalGas = gasUsed + baseGasOverhead;
        uint256 refundAmount = (totalGas * gasPrice * (100 + gasRefundBuffer)) / 100;
        
        // Check limits
        if (refundAmount > credit.maxPerTransaction) revert TransactionLimitExceeded();
        if (credit.dailyUsed + refundAmount > credit.dailyLimit) revert DailyLimitExceeded();
        
        // Check available credit
        uint256 availableCredit = credit.totalDeposited - credit.totalUsed;
        if (refundAmount > availableCredit) revert InsufficientGasCredit();
        
        // Update credit usage
        credit.totalUsed += refundAmount;
        credit.dailyUsed += refundAmount;
        
        // Record gas usage
        gasUsageHistory[user].push(GasUsage({
            gasUsed: gasUsed,
            gasPrice: gasPrice,
            cost: refundAmount,
            timestamp: block.timestamp,
            relayer: msg.sender,
            txHash: txHash
        }));
        
        // Update relayer stats
        RelayerStats storage stats = relayerStats[msg.sender];
        stats.pendingRefund += refundAmount;
        stats.transactionCount++;
        
        totalRefunded += refundAmount;
        
        emit GasUsageRecorded(user, gasUsed, refundAmount);
        emit GasRefunded(msg.sender, user, refundAmount, txHash);
        
        // Process refund
        _processRefund(msg.sender, refundAmount);
    }
    
    /**
     * @notice Process batch gas refunds
     * @param users Array of users
     * @param gasUsages Array of gas used
     * @param gasPrices Array of gas prices
     * @param txHashes Array of transaction hashes
     */
    function batchRequestGasRefund(
        address[] calldata users,
        uint256[] calldata gasUsages,
        uint256[] calldata gasPrices,
        bytes32[] calldata txHashes
    ) external nonReentrant onlyRole(RELAYER_ROLE) {
        uint256 length = users.length;
        if (length != gasUsages.length || length != gasPrices.length || length != txHashes.length) {
            revert InvalidAmount();
        }
        
        uint256 totalRefund = 0;
        
        for (uint256 i = 0; i < length; i++) {
            // Process each refund
            address user = users[i];
            uint256 gasUsed = gasUsages[i];
            uint256 gasPrice = gasPrices[i];
            bytes32 txHash = txHashes[i];
            
            if (user == address(0) || gasUsed == 0) continue;
            if (gasPrice > maxGasPrice) continue;
            
            GasCredit storage credit = gasCredits[user];
            if (!credit.isActive) continue;
            
            // Reset daily limit if needed
            if (block.timestamp >= credit.lastResetTime + 1 days) {
                credit.dailyUsed = 0;
                credit.lastResetTime = block.timestamp;
            }
            
            // Calculate refund
            uint256 totalGas = gasUsed + baseGasOverhead;
            uint256 refundAmount = (totalGas * gasPrice * (100 + gasRefundBuffer)) / 100;
            
            // Check limits
            if (refundAmount > credit.maxPerTransaction) continue;
            if (credit.dailyUsed + refundAmount > credit.dailyLimit) continue;
            
            // Check available credit
            uint256 availableCredit = credit.totalDeposited - credit.totalUsed;
            if (refundAmount > availableCredit) continue;
            
            // Update credit usage
            credit.totalUsed += refundAmount;
            credit.dailyUsed += refundAmount;
            
            // Record usage
            gasUsageHistory[user].push(GasUsage({
                gasUsed: gasUsed,
                gasPrice: gasPrice,
                cost: refundAmount,
                timestamp: block.timestamp,
                relayer: msg.sender,
                txHash: txHash
            }));
            
            totalRefund += refundAmount;
            
            emit GasUsageRecorded(user, gasUsed, refundAmount);
            emit GasRefunded(msg.sender, user, refundAmount, txHash);
        }
        
        if (totalRefund > 0) {
            // Update relayer stats
            RelayerStats storage stats = relayerStats[msg.sender];
            stats.pendingRefund += totalRefund;
            stats.transactionCount += length;
            
            totalRefunded += totalRefund;
            
            // Process refund
            _processRefund(msg.sender, totalRefund);
        }
    }
    
    /**
     * @notice Withdraw unused gas credits
     * @param amount Amount to withdraw
     */
    function withdrawGasCredit(uint256 amount) external nonReentrant {
        GasCredit storage credit = gasCredits[msg.sender];
        uint256 availableCredit = credit.totalDeposited - credit.totalUsed;
        
        if (amount > availableCredit) revert InsufficientGasCredit();
        
        credit.totalDeposited -= amount;
        if (credit.totalDeposited == 0) {
            credit.isActive = false;
        }
        
        totalDeposited -= amount;
        
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert RefundFailed();
        
        emit GasCreditWithdrawn(msg.sender, amount);
    }
    
    /**
     * @notice Get available gas credit for an account
     * @param account The account to check
     * @return available The available gas credit
     */
    function getAvailableCredit(address account) external view returns (uint256) {
        GasCredit storage credit = gasCredits[account];
        return credit.totalDeposited - credit.totalUsed;
    }
    
    /**
     * @notice Get gas usage history for an account
     * @param account The account to check
     * @param limit Maximum number of records to return
     * @return usage Array of gas usage records
     */
    function getGasUsageHistory(
        address account,
        uint256 limit
    ) external view returns (GasUsage[] memory) {
        GasUsage[] storage history = gasUsageHistory[account];
        uint256 length = history.length;
        
        if (limit > length) {
            limit = length;
        }
        
        GasUsage[] memory usage = new GasUsage[](limit);
        uint256 startIndex = length > limit ? length - limit : 0;
        
        for (uint256 i = 0; i < limit; i++) {
            usage[i] = history[startIndex + i];
        }
        
        return usage;
    }
    
    /**
     * @notice Update maximum gas price
     * @param newMaxGasPrice New maximum gas price
     */
    function updateMaxGasPrice(uint256 newMaxGasPrice) external onlyRole(OPERATOR_ROLE) {
        uint256 oldPrice = maxGasPrice;
        maxGasPrice = newMaxGasPrice;
        emit MaxGasPriceUpdated(oldPrice, newMaxGasPrice);
    }
    
    /**
     * @notice Emergency withdrawal of funds
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (amount > address(this).balance) revert InvalidAmount();
        
        (bool success, ) = emergencyWithdrawAddress.call{value: amount}("");
        if (!success) revert RefundFailed();
        
        emit EmergencyWithdrawal(emergencyWithdrawAddress, amount);
    }
    
    /**
     * @notice Pause the contract
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @notice Internal function to process refund
     * @param relayer The relayer to refund
     * @param amount The amount to refund
     */
    function _processRefund(address relayer, uint256 amount) private {
        RelayerStats storage stats = relayerStats[relayer];
        
        // Send refund
        (bool success, ) = relayer.call{value: amount}("");
        if (!success) revert RefundFailed();
        
        // Update stats
        stats.totalRefunded += amount;
        stats.pendingRefund = 0;
        stats.lastRefundTime = block.timestamp;
    }
    
    /**
     * @notice Receive function to accept OM deposits
     */
    receive() external payable {
        // Accept OM deposits
    }
}
