// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../MetaTxForwarderV2.sol";
import "../GasTank.sol";

/**
 * @title MockRelayer
 * @notice Mock relayer service for testing meta transactions
 * @dev Simulates a relayer that submits transactions on behalf of users
 */
contract MockRelayer {
    /// @notice The meta transaction forwarder
    MetaTxForwarderV2 public immutable forwarder;
    
    /// @notice The gas tank contract
    GasTank public immutable gasTank;
    
    /// @notice Relayer configuration
    struct RelayerConfig {
        uint256 minBalance;
        uint256 maxGasPrice;
        bool isActive;
    }
    
    /// @notice Relayer configuration
    RelayerConfig public config;
    
    /// @notice Transaction statistics
    struct Stats {
        uint256 totalTransactions;
        uint256 successfulTransactions;
        uint256 failedTransactions;
        uint256 totalGasUsed;
        uint256 totalGasRefunded;
    }
    
    /// @notice Relayer statistics
    Stats public stats;
    
    /// @notice Events
    event TransactionRelayed(
        address indexed from,
        address indexed to,
        bool success,
        uint256 gasUsed,
        bytes32 txHash
    );
    event RelayerConfigUpdated(uint256 minBalance, uint256 maxGasPrice, bool isActive);
    event EmergencyWithdrawal(address indexed to, uint256 amount);
    
    /// @notice Custom errors
    error RelayerNotActive();
    error InsufficientBalance();
    error GasPriceTooHigh();
    error InvalidForwarder();
    error TransferFailed();
    
    constructor(address _forwarder, address _gasTank) {
        if (_forwarder == address(0) || _gasTank == address(0)) {
            revert InvalidForwarder();
        }
        
        forwarder = MetaTxForwarderV2(_forwarder);
        gasTank = GasTank(payable(_gasTank));
        
        // Default configuration
        config = RelayerConfig({
            minBalance: 0.1 ether,
            maxGasPrice: 100 gwei,
            isActive: true
        });
    }
    
    /**
     * @notice Submit a meta transaction on behalf of a user
     * @param request The forward request
     * @param signature The user's signature
     * @return success Whether the transaction succeeded
     * @return returnData The return data from the transaction
     */
    function submitTransaction(
        MetaTxForwarderV2.ForwardRequest calldata request,
        bytes calldata signature
    ) external returns (bool success, bytes memory returnData) {
        // Check relayer is active
        if (!config.isActive) revert RelayerNotActive();
        
        // Check relayer balance
        if (address(this).balance < config.minBalance) revert InsufficientBalance();
        
        // Check gas price
        if (tx.gasprice > config.maxGasPrice) revert GasPriceTooHigh();
        
        // Record gas before
        uint256 gasStart = gasleft();
        
        // Submit transaction to forwarder
        try forwarder.execute(request, signature) returns (
            bool _success,
            bytes memory _returnData
        ) {
            success = _success;
            returnData = _returnData;
            
            // Calculate gas used
            uint256 gasUsed = gasStart - gasleft() + 50000; // Add overhead
            
            // Update statistics
            stats.totalTransactions++;
            if (success) {
                stats.successfulTransactions++;
            } else {
                stats.failedTransactions++;
            }
            stats.totalGasUsed += gasUsed;
            
            // Generate transaction hash
            bytes32 txHash = keccak256(
                abi.encodePacked(request.from, request.to, request.nonce, block.timestamp)
            );
            
            emit TransactionRelayed(request.from, request.to, success, gasUsed, txHash);
            
        } catch {
            // Transaction failed
            success = false;
            returnData = "";
            
            stats.totalTransactions++;
            stats.failedTransactions++;
            
            emit TransactionRelayed(request.from, request.to, false, 0, bytes32(0));
        }
    }
    
    /**
     * @notice Submit multiple meta transactions in batch
     * @param requests Array of forward requests
     * @param signatures Array of signatures
     * @return results Array of batch results
     */
    function submitBatchTransactions(
        MetaTxForwarderV2.ForwardRequest[] calldata requests,
        bytes[] calldata signatures
    ) external returns (MetaTxForwarderV2.BatchResult[] memory results) {
        // Check relayer is active
        if (!config.isActive) revert RelayerNotActive();
        
        // Check relayer balance
        if (address(this).balance < config.minBalance) revert InsufficientBalance();
        
        // Check gas price
        if (tx.gasprice > config.maxGasPrice) revert GasPriceTooHigh();
        
        // Submit batch to forwarder
        results = forwarder.batchExecute(requests, signatures);
        
        // Update statistics
        uint256 successCount = 0;
        uint256 totalGasUsed = 0;
        
        for (uint256 i = 0; i < results.length; i++) {
            if (results[i].success) {
                successCount++;
            }
            totalGasUsed += results[i].gasUsed;
        }
        
        stats.totalTransactions += requests.length;
        stats.successfulTransactions += successCount;
        stats.failedTransactions += (requests.length - successCount);
        stats.totalGasUsed += totalGasUsed;
    }
    
    /**
     * @notice Estimate gas for a meta transaction
     * @param request The forward request
     * @return estimatedGas The estimated gas needed
     */
    function estimateGas(
        MetaTxForwarderV2.ForwardRequest calldata request
    ) external view returns (uint256) {
        return forwarder.estimateGas(request);
    }
    
    /**
     * @notice Update relayer configuration
     * @param minBalance Minimum balance required
     * @param maxGasPrice Maximum gas price allowed
     * @param isActive Whether the relayer is active
     */
    function updateConfig(
        uint256 minBalance,
        uint256 maxGasPrice,
        bool isActive
    ) external {
        config = RelayerConfig({
            minBalance: minBalance,
            maxGasPrice: maxGasPrice,
            isActive: isActive
        });
        
        emit RelayerConfigUpdated(minBalance, maxGasPrice, isActive);
    }
    
    /**
     * @notice Claim gas refunds from gas tank
     */
    function claimRefunds() external {
        // In a real implementation, this would interact with the gas tank
        // to claim accumulated refunds
        (uint256 totalRefunded, , , ) = gasTank.relayerStats(address(this));
        stats.totalGasRefunded = totalRefunded;
    }
    
    /**
     * @notice Emergency withdrawal of funds
     * @param to The address to send funds to
     * @param amount The amount to withdraw
     */
    function emergencyWithdraw(address to, uint256 amount) external {
        if (amount > address(this).balance) {
            amount = address(this).balance;
        }
        
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();
        
        emit EmergencyWithdrawal(to, amount);
    }
    
    /**
     * @notice Get relayer statistics
     * @return The relayer statistics
     */
    function getStats() external view returns (Stats memory) {
        return stats;
    }
    
    /**
     * @notice Receive function to accept ETH
     */
    receive() external payable {}
}